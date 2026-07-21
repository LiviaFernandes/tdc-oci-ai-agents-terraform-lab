const fs = require("fs");
const path = require("path");
const express = require("express");
const common = require("oci-common");
const generativeaiinference = require("oci-generativeaiinference");

const PORT = parseInt(process.env.PORT || "8080", 10);
const COMPARTMENT_ID = process.env.OCI_COMPARTMENT_ID;
const MODEL_ID = process.env.MODEL_ID || "meta.llama-3.3-70b-instruct";
const TOOL_API_URL = process.env.TOOL_API_URL || "https://tdc-oci-ai-agents-lab.onrender.com";

// Modelos Cohere usam o formato de chat "COHERE" (documents/tools nativos).
// Todo o resto (Llama, Grok, Gemini, GPT-OSS...) usa o formato "GENERIC",
// no estilo mensagens da OpenAI. O catalogo de modelos por regiao varia,
// entao o app suporta os dois formatos e escolhe pelo prefixo do model_id.
const IS_COHERE_MODEL = MODEL_ID.toLowerCase().startsWith("cohere.");

const ragDocuments = require("./rag-documents.json");
const RAG_CONTEXT_TEXT = ragDocuments.map((doc) => `## ${doc.title}\n${doc.snippet}`).join("\n\n");

const DEFAULT_SYSTEM_PROMPT = `Voce e o Assistente TDC Floripa, um agente simpatico e prestativo para orientar participantes sobre o TDC Floripa 2026.
Responda em portugues brasileiro, de forma clara, objetiva e educada.
Cumprimentos e conversa informal (oi, ola, bom dia, tudo bem, obrigado) devem receber uma resposta natural e simpatica, contando brevemente com o que voce pode ajudar. Nunca diga que precisa chamar uma funcao ou tool para responder isso, e nunca recuse uma mensagem so porque ela nao pede uma acao especifica.
Use os documentos de contexto para perguntas gerais sobre o evento, jornadas, formato, FAQ, regras e links oficiais.
Use obrigatoriamente a tool consulta_programacao_tdc quando a pergunta pedir agenda, programacao, trilhas por dia, horarios, palestras, sessoes, speakers, nomes de pessoas ou busca por termo - inclusive quando a pergunta for uma continuacao curta como "que dia" ou "que horas", usando o historico da conversa para entender a quem ou a qual sessao ela se refere.
Nao invente horarios, speakers, valores ou regras que nao estejam no contexto ou na resposta da tool.`;

// O system prompt vem de um arquivo em vez de variavel de ambiente porque
// e multi-linha - Environment= do systemd nao suporta isso de forma segura.
const SYSTEM_PROMPT_PATH = process.env.AGENT_INSTRUCTION_PATH || path.join(__dirname, "system-prompt.txt");
const SYSTEM_PROMPT = fs.existsSync(SYSTEM_PROMPT_PATH)
  ? fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8")
  : DEFAULT_SYSTEM_PROMPT;

const TOOL_NAME = "consulta_programacao_tdc";
const TOOL_DESCRIPTION =
  "Busca sessoes, palestras, horarios, trilhas e speakers da programacao real do TDC Floripa 2026. Use sempre que a pergunta for sobre agenda, programacao, horarios, palestras, trilhas especificas, speakers, nomes de pessoas ou busca por termo na programacao.";

// Definicao da tool no formato Cohere (parameterDefinitions).
const cohereTools = [
  {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameterDefinitions: {
      q: {
        description: "Termo de busca geral, como agentes, IA, arquitetura, Java, titulo ou nome de uma pessoa.",
        type: "str",
        isRequired: false
      },
      speaker: {
        description: "Nome do speaker ou parte do nome, por exemplo Ana Lindiner ou Livia Rodrigues.",
        type: "str",
        isRequired: false
      },
      day: {
        description: "Dia da programacao, por exemplo 22/jul, 23/jul ou 24/jul.",
        type: "str",
        isRequired: false
      },
      track: {
        description: "Nome ou parte do nome da trilha.",
        type: "str",
        isRequired: false
      },
      limit: {
        description: "Quantidade maxima de resultados.",
        type: "int",
        isRequired: false
      }
    }
  }
];

// Definicao da tool no formato Generic da OCI: name/description/parameters
// ficam direto no objeto do tool, sem aninhar num sub-objeto "function"
// como no formato cru da OpenAI. Confirmado no exemplo oficial do SDK
// (FunctionDefinition estende ToolDefinition com esses campos direto).
const genericTools = [
  {
    type: "FUNCTION",
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        q: { type: "string", description: "Termo de busca geral, como agentes, IA, arquitetura, Java, titulo ou nome de uma pessoa." },
        speaker: { type: "string", description: "Nome do speaker ou parte do nome, por exemplo Ana Lindiner ou Livia Rodrigues." },
        day: { type: "string", description: "Dia da programacao, por exemplo 22/jul, 23/jul ou 24/jul." },
        track: { type: "string", description: "Nome ou parte do nome da trilha." },
        limit: { type: "integer", description: "Quantidade maxima de resultados." }
      },
      required: []
    }
  }
];

let clientPromise = null;

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const provider = await new common.InstancePrincipalsAuthenticationDetailsProviderBuilder().build();
      return new generativeaiinference.GenerativeAiInferenceClient({
        authenticationDetailsProvider: provider
      });
    })();
  }
  return clientPromise;
}

async function callProgramacaoTool(parameters) {
  try {
    const response = await fetch(`${TOOL_API_URL}/sessions/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parameters || {})
    });
    return await response.json();
  } catch (err) {
    return { error: `Falha ao chamar a API de programacao: ${err.message}` };
  }
}

async function runToolCall(name, parameters) {
  if (name === TOOL_NAME) {
    return callProgramacaoTool(parameters);
  }
  return { error: `Tool desconhecida: ${name}` };
}

function cohereHistoryFromTurns(history) {
  return (history || []).map((turn) => ({
    role: turn.role === "assistant" ? "CHATBOT" : "USER",
    message: turn.text
  }));
}

function genericMessagesFromTurns(history) {
  return (history || []).map((turn) => ({
    role: turn.role === "assistant" ? "ASSISTANT" : "USER",
    content: [{ type: "TEXT", text: turn.text }]
  }));
}

async function askAssistantCohere(userMessage, history) {
  const client = await getClient();

  // Historico da conversa (perguntas e respostas anteriores) entra antes da
  // mensagem nova, para o modelo entender continuacoes curtas tipo "que dia".
  let chatHistory = cohereHistoryFromTurns(history);
  let toolResults;
  let finalText = "";
  let citations = [];

  for (let step = 0; step < 4; step++) {
    const chatRequest = {
      apiFormat: "COHERE",
      message: step === 0 ? userMessage : "",
      chatHistory,
      documents: ragDocuments,
      preambleOverride: SYSTEM_PROMPT,
      tools: cohereTools,
      toolResults,
      isForceSingleStep: false,
      maxTokens: 700
    };

    const response = await client.chat({
      chatDetails: {
        compartmentId: COMPARTMENT_ID,
        servingMode: { servingType: "ON_DEMAND", modelId: MODEL_ID },
        chatRequest
      }
    });

    const chatResponse = response.chatResult.chatResponse;

    if (chatResponse.toolCalls && chatResponse.toolCalls.length > 0) {
      chatHistory = chatResponse.chatHistory;
      toolResults = [];
      for (const call of chatResponse.toolCalls) {
        const outputs = await runToolCall(call.name, call.parameters);
        toolResults.push({ call, outputs: [outputs] });
      }
      continue;
    }

    finalText = chatResponse.text;
    citations = chatResponse.citations || [];
    break;
  }

  return {
    text: finalText || "Nao consegui gerar uma resposta a tempo. Tente reformular a pergunta.",
    citations
  };
}

async function askAssistantGeneric(userMessage, history) {
  const client = await getClient();

  const messages = [
    {
      role: "SYSTEM",
      content: [{ type: "TEXT", text: `${SYSTEM_PROMPT}\n\nContexto:\n\n${RAG_CONTEXT_TEXT}` }]
    },
    // Historico da conversa (perguntas e respostas anteriores) entra antes da
    // mensagem nova, para o modelo entender continuacoes curtas tipo "que dia".
    ...genericMessagesFromTurns(history),
    {
      role: "USER",
      content: [{ type: "TEXT", text: userMessage }]
    }
  ];

  let finalText = "";

  for (let step = 0; step < 4; step++) {
    const response = await client.chat({
      chatDetails: {
        compartmentId: COMPARTMENT_ID,
        servingMode: { servingType: "ON_DEMAND", modelId: MODEL_ID },
        chatRequest: {
          apiFormat: "GENERIC",
          messages,
          tools: genericTools,
          maxTokens: 700
        }
      }
    });

    const choice = response.chatResult.chatResponse.choices[0];
    const message = choice.message;
    const toolCalls = message.toolCalls || [];

    if (toolCalls.length > 0) {
      messages.push({ role: "ASSISTANT", content: null, toolCalls });

      for (const call of toolCalls) {
        let args = {};
        try {
          args = JSON.parse(call.arguments || "{}");
        } catch (err) {
          args = {};
        }
        const outputs = await runToolCall(call.name, args);
        messages.push({
          role: "TOOL",
          toolCallId: call.id,
          content: [{ type: "TEXT", text: JSON.stringify(outputs) }]
        });
      }
      continue;
    }

    finalText = (message.content || []).map((c) => c.text || "").join("");
    break;
  }

  return {
    text: finalText || "Nao consegui gerar uma resposta a tempo. Tente reformular a pergunta.",
    citations: []
  };
}

async function askAssistant(userMessage, history) {
  return IS_COHERE_MODEL
    ? askAssistantCohere(userMessage, history)
    : askAssistantGeneric(userMessage, history);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", model: MODEL_ID });
});

app.post("/chat", async (req, res) => {
  const userMessage = (req.body && req.body.message || "").trim();
  if (!userMessage) {
    res.status(400).json({ error: "Envie { message: '...' } no corpo da requisicao." });
    return;
  }

  const rawHistory = Array.isArray(req.body && req.body.history) ? req.body.history : [];
  const history = rawHistory
    .filter((turn) => turn && typeof turn.text === "string" && turn.text.trim())
    .map((turn) => ({ role: turn.role === "assistant" ? "assistant" : "user", text: turn.text }))
    .slice(-12);

  try {
    const result = await askAssistant(userMessage, history);
    res.json(result);
  } catch (err) {
    console.error("Erro ao chamar o OCI Generative AI:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Assistente TDC Floripa ouvindo na porta ${PORT} (modelo ${MODEL_ID})`);
});
