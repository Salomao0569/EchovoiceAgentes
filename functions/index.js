const { onRequest } = require("firebase-functions/v2/https");
const OpenAI = require("openai");
const admin = require("firebase-admin");

// Initialize Firebase Admin (uses default credentials in Cloud Functions)
if (!admin.apps.length) {
    admin.initializeApp();
}

// Verify Firebase Auth token
// Note: Firebase Hosting "run" rewrites can overwrite the Authorization header
// with its own OIDC token, so we use a custom header X-Firebase-Auth-Token
async function verifyAuth(req, res) {
    const token = req.headers['x-firebase-auth-token'];
    if (!token) {
        // Fallback to Authorization header for direct calls
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.error("Auth failed: no token in x-firebase-auth-token or Authorization header");
            res.status(401).json({ error: "Não autorizado" });
            return null;
        }
        var extractedToken = authHeader.split('Bearer ')[1];
    } else {
        var extractedToken = token;
    }
    try {
        const decodedToken = await admin.auth().verifyIdToken(extractedToken);
        return decodedToken;
    } catch (error) {
        console.error("Token inválido:", error.message);
        res.status(401).json({ error: "Token inválido ou expirado" });
        return null;
    }
}

// =============================================================================
// RAG Integration — Jarvis (ChromaDB + LlamaIndex on VPS)
// =============================================================================

const RAG_URL = process.env.RAG_API_URL || 'http://187.77.52.133:8000';
const RAG_PASSWORD = process.env.RAG_API_PASSWORD || 'biocardio2026';

/**
 * Consulta a RAG de cardiologia (Jarvis) para buscar evidências reais das diretrizes.
 * Retorna null silenciosamente se a RAG estiver indisponível (fallback para GPT puro).
 */
async function queryRAG(pergunta) {
    try {
        // 1. Login para obter cookie de sessão
        const loginRes = await fetch(`${RAG_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senha: RAG_PASSWORD }),
            signal: AbortSignal.timeout(5000)
        });

        if (!loginRes.ok) {
            console.warn('RAG login falhou:', loginRes.status);
            return null;
        }

        // Extrair cookie de sessão
        const setCookie = loginRes.headers.get('set-cookie') || '';

        // 2. Consultar RAG com o cookie
        const ragRes = await fetch(`${RAG_URL}/api/perguntar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': setCookie.split(';')[0]
            },
            body: JSON.stringify({ pergunta }),
            signal: AbortSignal.timeout(15000)
        });

        if (!ragRes.ok) {
            console.warn('RAG query falhou:', ragRes.status);
            return null;
        }

        const data = await ragRes.json();

        if (!data.resposta) return null;

        // Formatar resposta com fontes (arquivo + página)
        let resultado = data.resposta;
        if (data.fontes && data.fontes.length > 0) {
            const fontesFormatadas = data.fontes
                .map(f => `- ${f.arquivo}, p. ${f.pagina}`)
                .join('\n');
            resultado += `\n\nFONTES:\n${fontesFormatadas}`;
        }

        return resultado;
    } catch (error) {
        console.warn('RAG indisponível, continuando sem evidências:', error.message);
        return null;
    }
}

// =============================================================================
// SYSTEM PROMPTS (identical to Netlify versions)
// =============================================================================

const SYSTEM_PROMPT = `# ROLE
Você é um Assistente Sênior em Cardiologia Clínica, atuando como braço direito do Dr. Salomão Alcolumbre na clínica Biocardio. Sua função é otimizar o tempo de consulta, garantindo precisão técnica, adesão às diretrizes (SBC, ESC, AHA) e excelência na documentação médica.

# OBJECTIVE
Processar dados brutos ou anotações rápidas fornecidas pelo médico e gerar outputs estruturados, prontos para serem colados no prontuário eletrônico (ProDoctor).

# CAPABILITIES & TASKS

## 1. FORMALIZAÇÃO DE EVOLUÇÃO (EDITOR)
- Transforme anotações em tópicos ou ditados rápidos em texto médico formal e culto.
- Organize o texto nas seções padrão: Anamnese (HDA), Exame Físico, Impressão Diagnóstica e Conduta.
- Corrija erros gramaticais e expanda abreviações médicas não padronizadas, mantendo as consagradas (ex: HAS, DM, DAC).

## 2. SUPORTE À DECISÃO CLÍNICA
- Com base nos sintomas e sinais vitais, sugira hipóteses diagnósticas e diagnósticos diferenciais relevantes.
- Identifique "Red Flags" que exijam intervenção imediata ou encaminhamento de urgência.

## 3. TERAPÊUTICA E GUIDELINES
- Sugira ajustes medicamentosos baseados nas diretrizes atuais (SBC/ESC/AHA).
- Ao sugerir medicamentos, forneça o nome do princípio ativo, dose padrão e posologia usual.
- Lembre de contraindicações relativas a comorbidades citadas (ex: Betabloqueador em Asma grave).

# TONE & STYLE
- Linguagem: Português (BR) Técnico e Formal.
- Postura: Objetivo, eficiente e seguro.
- Formatação: Limpa, sem uso de tabelas complexas ou Markdown excessivo que quebre a formatação do ProDoctor. Use CAIXA ALTA para títulos de seções.

# SAFETY
- Você é um assistente de IA. Nunca invente dados do paciente.
- Se a conduta sugerida for baseada em uma diretriz específica, cite a fonte brevemente (ex: "Conforme Diretriz SBC de Hipertensão 2020").

# OUTPUT FORMAT
Retorne APENAS o texto formatado, pronto para ser copiado no prontuário. Não adicione explicações ou comentários extras fora da evolução médica.`;

// =============================================================================
// 1. processMedicalNotes — Evolution + Analysis (2 GPT-4o calls)
// =============================================================================

exports.processMedicalNotes = onRequest({
    cors: ['https://echovoice-agentes.web.app', 'http://localhost:8888'],
    region: "southamerica-east1",
    timeoutSeconds: 120,
    memory: "256MiB"
}, async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Método não permitido" }); return; }

    // Verify authentication
    const user = await verifyAuth(req, res);
    if (!user) return;

    try {
        const { notes } = req.body;

        if (!notes || notes.trim().length === 0) {
            res.status(400).json({ error: "Anotações não fornecidas" });
            return;
        }

        if (notes.length > 10000) {
            res.status(413).json({ error: "Texto muito longo. Máximo 10.000 caracteres." });
            return;
        }

        if (!process.env.OPENAI_API_KEY) {
            console.error("OPENAI_API_KEY não configurada");
            res.status(500).json({ error: "Configuração da API não encontrada" });
            return;
        }

        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        // 1. Gerar EVOLUÇÃO para ProDoctor
        const evolutionCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: SYSTEM_PROMPT
                },
                {
                    role: "user",
                    content: `Processe as seguintes anotações médicas e retorne uma evolução formatada para prontuário:\n\n${notes}`
                }
            ],
            max_tokens: 1500,
            temperature: 0.3
        });

        const evolution = evolutionCompletion.choices[0].message.content;

        // 2. Consultar RAG para evidências reais (em paralelo não bloqueia)
        const ragEvidencias = await queryRAG(
            `Diretrizes e recomendações relevantes para o seguinte caso cardiológico: ${notes}`
        );

        const ragSection = ragEvidencias
            ? `\n\n📋 EVIDÊNCIAS DAS DIRETRIZES (fonte: banco vetorial ChromaDB com diretrizes SBC reais):\n${ragEvidencias}\n\nIMPORTANTE: Use as evidências acima como base PRINCIPAL para sua análise. Cite as diretrizes e páginas específicas quando disponíveis.`
            : `\n\nNota: RAG de diretrizes indisponível. Baseie-se no seu conhecimento de diretrizes SBC/ESC/AHA.`;

        // 3. Gerar ANÁLISE CLÍNICA EXPERT (agora com evidências da RAG)
        const analysisPrompt = `Você é um cardiologista doutorado e experiente. Analise o seguinte caso clínico de forma CRÍTICA e OBJETIVA:

CASO:
${notes}

EVOLUÇÃO GERADA:
${evolution}
${ragSection}

IMPORTANTE: Seja CRÍTICO e HONESTO. Se houver problemas, erros ou pontos questionáveis, APONTE claramente. Não concorde apenas por concordar. Quando citar uma diretriz, cite a fonte REAL com página se disponível nas evidências acima.

Forneça uma análise estruturada com:

### 🎯 IMPRESSÃO DIAGNÓSTICA
- Hipótese(s) principal(is)
- Diagnósticos diferenciais relevantes
- Classificação de risco se aplicável

### 💭 OPINIÃO CLÍNICA
Analise criticamente a conduta proposta:
- O que está correto/adequado
- O que está ERRADO ou questionável (seja específico)
- O que está FALTANDO (exames, medicações, orientações)
- Ajustes necessários (seja direto)

### 📚 REFERÊNCIAS
- Diretrizes relevantes (cite as fontes REAIS das evidências fornecidas acima)
- Estudos importantes se aplicável

Seja DIRETO, CRÍTICO e PRÁTICO. Máximo 350 palavras.

NO FINAL, adicione em uma linha separada:
STATUS: [ADEQUADO] se a conduta está correta OU [ATENÇÃO] se há problemas/discordâncias`;

        const analysisCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "Você é um cardiologista doutorado experiente e CRÍTICO. Não tenha medo de discordar ou apontar erros. Seja honesto e baseado em evidências. Se algo está errado, diga claramente."
                },
                {
                    role: "user",
                    content: analysisPrompt
                }
            ],
            max_tokens: 1200,
            temperature: 0.5
        });

        const analysisResponse = analysisCompletion.choices[0].message.content;

        // Extrair status da análise
        const statusMatch = analysisResponse.match(/STATUS:\s*\[(ADEQUADO|ATENÇÃO)\]/i);
        const status = statusMatch ? statusMatch[1].toUpperCase() : "ATENÇÃO";

        // Remover linha de status do texto
        const analysis = analysisResponse.replace(/STATUS:\s*\[(ADEQUADO|ATENÇÃO)\]/i, "").trim();

        res.status(200).json({
            evolution,
            analysis,
            analysisStatus: status,
            ragUsed: !!ragEvidencias,
            usage: {
                evolutionTokens: evolutionCompletion.usage.total_tokens,
                analysisTokens: analysisCompletion.usage.total_tokens,
                totalTokens: evolutionCompletion.usage.total_tokens + analysisCompletion.usage.total_tokens
            }
        });

    } catch (error) {
        console.error("Erro ao processar:", error);
        res.status(500).json({
            error: "Erro ao processar anotações"
        });
    }
});

// =============================================================================
// 2. chatCase — Multi-turn case discussion
// =============================================================================

exports.chatCase = onRequest({
    cors: ['https://echovoice-agentes.web.app', 'http://localhost:8888'],
    region: "southamerica-east1",
    timeoutSeconds: 60,
    memory: "256MiB"
}, async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Método não permitido" }); return; }

    // Verify authentication
    const user = await verifyAuth(req, res);
    if (!user) return;

    try {
        const { caseContext, chatHistory } = req.body;

        if (!caseContext || !chatHistory) {
            res.status(400).json({ error: "Dados incompletos" });
            return;
        }

        if (chatHistory.length > 50) {
            res.status(413).json({ error: "Histórico muito longo. Máximo 50 mensagens." });
            return;
        }

        if (!process.env.OPENAI_API_KEY) {
            console.error("OPENAI_API_KEY não configurada");
            res.status(500).json({ error: "Configuração da API não encontrada" });
            return;
        }

        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        // Buscar evidências da RAG para a última pergunta do usuário
        const lastUserMsg = [...chatHistory].reverse().find(m => m.role === 'user');
        const ragEvidencias = lastUserMsg
            ? await queryRAG(`${lastUserMsg.content} — contexto: ${caseContext.notes}`)
            : null;

        const ragContext = ragEvidencias
            ? `\n\nEVIDÊNCIAS DAS DIRETRIZES (ChromaDB — diretrizes SBC reais):\n${ragEvidencias}\nUse estas evidências para fundamentar sua resposta. Cite diretriz e página quando disponível.`
            : '';

        // Construir contexto do caso para o chat
        const systemPrompt = `Você é um cardiologista doutorado experiente ajudando um colega médico a discutir um caso clínico específico.

CONTEXTO DO CASO:
- Anotações originais: ${caseContext.notes}
- Evolução gerada: ${caseContext.evolution}
- Análise clínica: ${caseContext.analysis}
${ragContext}

Responda de forma SUCINTA, PRÁTICA e OBJETIVA (estilo conversa entre colegas médicos experientes):
- Seja direto ao ponto
- Use linguagem técnica apropriada
- Cite evidências/diretrizes REAIS quando disponíveis nas evidências acima
- Máximo 150 palavras por resposta
- Se discordar de algo, explique o motivo com base em evidências

Você está discutindo APENAS este caso específico. Mantenha o foco no caso apresentado.`;

        // Construir mensagens do chat
        const messages = [
            {
                role: "system",
                content: systemPrompt
            },
            ...chatHistory.map(msg => ({
                role: msg.role,
                content: msg.content
            }))
        ];

        // Chamar API do OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            max_tokens: 500,
            temperature: 0.5
        });

        const response = completion.choices[0].message.content;

        res.status(200).json({
            response,
            usage: {
                inputTokens: completion.usage.prompt_tokens,
                outputTokens: completion.usage.completion_tokens,
                totalTokens: completion.usage.total_tokens
            }
        });

    } catch (error) {
        console.error("Erro ao processar chat:", error);
        res.status(500).json({
            error: "Erro ao processar mensagem"
        });
    }
});

// =============================================================================
// 3. transcribeAudio — Voice-to-text via Whisper
// =============================================================================

exports.transcribeAudio = onRequest({
    cors: ['https://echovoice-agentes.web.app', 'http://localhost:8888'],
    region: "southamerica-east1",
    timeoutSeconds: 60,
    memory: "256MiB"
}, async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Método não permitido" }); return; }

    // Verify authentication
    const user = await verifyAuth(req, res);
    if (!user) return;

    try {
        if (!process.env.OPENAI_API_KEY) {
            res.status(500).json({ error: "API key não configurada" });
            return;
        }

        // Parse do body - esperamos base64 do áudio
        const { audio, mimeType } = req.body;

        if (!audio) {
            res.status(400).json({ error: "Áudio não fornecido" });
            return;
        }

        // Limit audio size (5MB in base64 ≈ 6.67MB string)
        if (audio.length > 7000000) {
            res.status(413).json({ error: "Áudio muito grande. Máximo 5MB." });
            return;
        }

        // Converter base64 para buffer
        const audioBuffer = Buffer.from(audio, "base64");

        // Criar File object para a API
        const audioFile = new File([audioBuffer], "audio.webm", {
            type: mimeType || "audio/webm"
        });

        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        // Transcrever com Whisper
        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-1",
            language: "pt",
            response_format: "text",
            prompt: "Transcrição de anotações médicas de cardiologia. Termos comuns: hipertensão, diabetes, fibrilação atrial, insuficiência cardíaca, angina, infarto, ECG, ecocardiograma, PA, FC, mmHg, bpm."
        });

        res.status(200).json({ text: transcription });

    } catch (error) {
        console.error("Erro na transcrição:", error);
        res.status(500).json({
            error: "Erro ao transcrever áudio"
        });
    }
});
