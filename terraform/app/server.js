const fs = require("fs");
const path = require("path");
const express = require("express");
const common = require("oci-common");
const generativeaiinference = require("oci-generativeaiinference");

const PORT = parseInt(process.env.PORT || "8080", 10);
const COMPARTMENT_ID = process.env.OCI_COMPARTMENT_ID;
const MODEL_ID = process.env.MODEL_ID || "google.gemini-2.5-flash";
// Por padrao, a tool consulta o endpoint local servido pela propria VM. Uma
// URL externa continua opcional para quem quiser substituir o dataset local.
const TOOL_API_URL = process.env.TOOL_API_URL || `http://127.0.0.1:${PORT}`;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// Modelos Cohere usam o formato de chat "COHERE" (documents/tools nativos).
// Todo o resto (Llama, Grok, Gemini, GPT-OSS...) usa o formato "GENERIC",
// no estilo mensagens da OpenAI. O catalogo de modelos por regiao varia,
// entao o app suporta os dois formatos e escolhe pelo prefixo do model_id.
const IS_COHERE_MODEL = MODEL_ID.toLowerCase().startsWith("cohere.");

const ragDocuments = require("./rag-documents.json");
const RAG_CONTEXT_TEXT = ragDocuments.map((doc) => `## ${doc.title}\n${doc.snippet}`).join("\n\n");
const OFFICIAL_AGENDA_URL = "https://thedevconf.com/tdc/2026/sao-paulo/agenda";

const DEFAULT_SYSTEM_PROMPT = `Voce e o Assistente TDC Sao Paulo, um agente simpatico e prestativo para orientar participantes sobre o TDC Sao Paulo 2026.
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
  "Busca sessoes, palestras, horarios, trilhas e speakers da programacao do TDC Sao Paulo 2026. Use sempre que a pergunta for sobre agenda, programacao, horarios, palestras, trilhas especificas, speakers, nomes de pessoas ou busca por termo na programacao.";

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
        description: "Nome do speaker ou parte do nome.",
        type: "str",
        isRequired: false
      },
      day: {
        description: "Dia da programacao, por exemplo 23/set, 24/set ou 25/set.",
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
        speaker: { type: "string", description: "Nome do speaker ou parte do nome." },
        day: { type: "string", description: "Dia da programacao, por exemplo 23/set, 24/set ou 25/set." },
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
    const result = await response.json();
    if (!response.ok) {
      return { error: result.error || `API de programacao retornou HTTP ${response.status}` };
    }
    return result;
  } catch (err) {
    return { error: `Falha ao chamar a API de programacao: ${err.message}` };
  }
}

function decodeHtml(value) {
  const entities = {
    amp: "&", quot: "\"", apos: "'", lt: "<", gt: ">",
    aacute: "á", agrave: "à", atilde: "ã", acirc: "â", ccedil: "ç",
    eacute: "é", ecirc: "ê", iacute: "í", oacute: "ó", ocirc: "ô",
    otilde: "õ", uacute: "ú"
  };
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity) => {
    if (entity.startsWith("#")) {
      const radix = entity[1].toLowerCase() === "x" ? 16 : 10;
      return String.fromCodePoint(parseInt(entity.slice(radix === 16 ? 2 : 1), radix));
    }
    const decoded = entities[entity.toLowerCase()];
    return decoded ? (entity[0] === entity[0].toUpperCase() ? decoded.toUpperCase() : decoded) : match;
  }).replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function dateFromToolDay(day) {
  const match = String(day || "").match(/(?:^|\D)(23|24|25)(?:\D|$)/);
  return match ? `2026/09/${match[1]}` : null;
}

let sessionsPromise;

async function getSessions() {
  if (!sessionsPromise) {
    sessionsPromise = (async () => {
      const response = await fetch(OFFICIAL_AGENDA_URL);
      if (!response.ok) throw new Error(`agenda oficial retornou HTTP ${response.status}`);
      const html = await response.text();
      const match = html.match(/<textarea[^>]*id="jack"[^>]*>([\s\S]*?)<\/textarea>/);
      if (!match) throw new Error("dataset da agenda nao encontrado na pagina oficial");
      return JSON.parse(match[1].trim()).map((event) => ({
        title: decodeHtml(event.titulo),
        track: decodeHtml(event.trilha),
        type: decodeHtml(event.tipo),
        date: event.data,
        start: event.horarioInicio,
        end: event.horarioTermino,
        room: decodeHtml(event.sala),
        speakers: (event.palestrantes || []).map((speaker) => decodeHtml(speaker.nome)).filter(Boolean)
      }));
    })().catch((err) => {
      sessionsPromise = null;
      throw err;
    });
  }
  return sessionsPromise;
}

async function searchSessions(parameters = {}) {
  const q = normalizeSearchText(parameters.q);
  const speaker = normalizeSearchText(parameters.speaker);
  const track = normalizeSearchText(parameters.track);
  const date = dateFromToolDay(parameters.day);
  const limit = Math.min(Math.max(Number.parseInt(parameters.limit, 10) || 20, 1), 50);

  const results = (await getSessions())
    .filter((session) => {
      const searchable = normalizeSearchText([
        session.title,
        session.track,
        session.type,
        session.room,
        ...session.speakers
      ].join(" "));
      return (!q || searchable.includes(q)) &&
        (!speaker || normalizeSearchText(session.speakers.join(" ")).includes(speaker)) &&
        (!track || normalizeSearchText(session.track).includes(track)) &&
        (!date || session.date === date);
    })
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));

  return {
    filters: { q: parameters.q || null, speaker: parameters.speaker || null, day: parameters.day || null, track: parameters.track || null, limit },
    count: results.length,
    results: results.slice(0, limit).map((session) => ({
      title: session.title,
      date: `${session.date.slice(8)}/set`,
      time: `${session.start} às ${session.end}`,
      track: session.track,
      speakers: session.speakers,
      type: session.type,
      room: session.room,
      source_url: "https://thedevconf.com/tdc/2026/sao-paulo/agenda"
    }))
  };
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

app.post("/sessions/search", async (req, res) => {
  try {
    res.json(await searchSessions(req.body || {}));
  } catch (err) {
    console.error("Erro ao carregar agenda oficial:", err.message);
    res.status(502).json({ error: `Falha ao consultar a agenda oficial: ${err.message}` });
  }
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
  console.log(`Assistente TDC Sao Paulo ouvindo na porta ${PORT} (modelo ${MODEL_ID})`);
});

// Telegram e opcional: so liga se TELEGRAM_BOT_TOKEN estiver configurado.
// Usa long polling (getUpdates), sem precisar de webhook publico. Cada chat
// do Telegram tem seu proprio historico, igual a interface web.
if (TELEGRAM_BOT_TOKEN) {
  const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
  const telegramHistories = new Map();

  async function telegramSendMessage(chatId, text) {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  }

  async function telegramHandleMessage(message) {
    const chatId = message.chat.id;
    const text = (message.text || "").trim();
    if (!text) return;

    const history = telegramHistories.get(chatId) || [];
    try {
      const result = await askAssistant(text, history);
      history.push({ role: "user", text });
      history.push({ role: "assistant", text: result.text });
      telegramHistories.set(chatId, history.slice(-12));
      await telegramSendMessage(chatId, result.text);
    } catch (err) {
      console.error("Erro ao responder no Telegram:", err);
      await telegramSendMessage(chatId, "Desculpa, tive um erro ao responder agora. Tenta de novo em instantes.");
    }
  }

  async function telegramPollLoop() {
    let offset = 0;
    for (;;) {
      try {
        const res = await fetch(`${TELEGRAM_API}/getUpdates?timeout=30&offset=${offset}`);
        const data = await res.json();
        if (data.ok) {
          for (const update of data.result) {
            offset = update.update_id + 1;
            if (update.message) {
              await telegramHandleMessage(update.message);
            }
          }
        }
      } catch (err) {
        console.error("Erro no polling do Telegram:", err);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  telegramPollLoop();
  console.log("Bot do Telegram iniciado.");
}
