const fs = require("fs");
const path = require("path");
const express = require("express");
const common = require("oci-common");
const generativeaiinference = require("oci-generativeaiinference");

const PORT = parseInt(process.env.PORT || "8080", 10);
const COMPARTMENT_ID = process.env.OCI_COMPARTMENT_ID;
const MODEL_ID = process.env.MODEL_ID || "cohere.command-r-08-2024";
const TOOL_API_URL = process.env.TOOL_API_URL || "https://tdc-oci-ai-agents-lab.onrender.com";

const ragDocuments = require("./rag-documents.json");

const DEFAULT_SYSTEM_PROMPT = `Voce e o Assistente TDC Floripa, um agente para orientar participantes sobre o TDC Floripa 2026.
Responda em portugues brasileiro, de forma clara, objetiva e educada.
Use os documentos de contexto para perguntas gerais sobre o evento, jornadas, formato, FAQ, regras e links oficiais.
Use obrigatoriamente a tool consulta_programacao_tdc quando a pergunta pedir agenda, programacao, trilhas por dia, horarios, palestras, sessoes, speakers, nomes de pessoas ou busca por termo.
Nao invente horarios, speakers, valores ou regras que nao estejam no contexto ou na resposta da tool.`;

// O system prompt vem de um arquivo em vez de variavel de ambiente porque
// e multi-linha - Environment= do systemd nao suporta isso de forma segura.
const SYSTEM_PROMPT_PATH = process.env.AGENT_INSTRUCTION_PATH || path.join(__dirname, "system-prompt.txt");
const SYSTEM_PROMPT = fs.existsSync(SYSTEM_PROMPT_PATH)
  ? fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8")
  : DEFAULT_SYSTEM_PROMPT;

const tools = [
  {
    name: "consulta_programacao_tdc",
    description:
      "Busca sessoes, palestras, horarios, trilhas e speakers da programacao real do TDC Floripa 2026. Use sempre que a pergunta for sobre agenda, programacao, horarios, palestras, trilhas especificas, speakers, nomes de pessoas ou busca por termo na programacao.",
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

async function runToolCall(call) {
  if (call.name === "consulta_programacao_tdc") {
    return callProgramacaoTool(call.parameters);
  }
  return { error: `Tool desconhecida: ${call.name}` };
}

async function askAssistant(userMessage) {
  const client = await getClient();

  let chatHistory;
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
      tools,
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
        const outputs = await runToolCall(call);
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

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/chat", async (req, res) => {
  const userMessage = (req.body && req.body.message || "").trim();
  if (!userMessage) {
    res.status(400).json({ error: "Envie { message: '...' } no corpo da requisicao." });
    return;
  }

  try {
    const result = await askAssistant(userMessage);
    res.json(result);
  } catch (err) {
    console.error("Erro ao chamar o OCI Generative AI:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Assistente TDC Floripa ouvindo na porta ${PORT}`);
});
