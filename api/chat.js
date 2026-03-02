import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM = `Você é Nexus, um especialista em inteligência de mercado. 
Sempre responda APENAS com um JSON válido (sem markdown, sem texto extra) seguindo exatamente esta estrutura:
{
  "resumo": "string — visão geral do mercado em 2-3 frases",
  "mercado": {
    "potencial": "string",
    "tam": "string",
    "crescimento": "string",
    "risco": "string",
    "investimento": "string",
    "prazo": "string"
  },
  "publico": {
    "perfil": "string",
    "idade": "string",
    "renda": "string",
    "necessidades": ["string", "string", "string"]
  },
  "tendencias": ["string", "string", "string"],
  "oportunidades": ["string", "string", "string"],
  "concorrentes": [
    { "nome": "string", "forca": number },
    { "nome": "string", "forca": number },
    { "nome": "string", "forca": number }
  ],
  "recomendacoes": ["string", "string", "string"]
}`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid messages' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const stream = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
                { role: 'system', content: SYSTEM },
                ...messages,
            ],
            stream: true,
            temperature: 0.7,
            max_tokens: 1024,
        });

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || '';
            if (delta) {
                res.write(`data: ${JSON.stringify({ delta })}\n\n`);
            }
        }

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (err) {
        console.error(err);
        res.write(`data: ${JSON.stringify({ delta: `Erro: ${err.message}` })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    }
}
