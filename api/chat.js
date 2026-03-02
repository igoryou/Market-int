import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Supabase (optional – set env vars to enable persistence)
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
    : null;

// ── PUBLIC API HELPERS ────────────────────────────────────────────────────────

async function fetchIBGE() {
    try {
        // PIB por estado (último disponível) + população estimada Brasil
        const [pibRes, popRes] = await Promise.all([
            fetch('https://servicodados.ibge.gov.br/api/v3/agregados/5938/periodos/2021/variaveis/37?localidades=N3[all]'),
            fetch('https://servicodados.ibge.gov.br/api/v1/localidades/regioes')
        ]);
        const pib = pibRes.ok ? await pibRes.json() : null;
        const regioes = popRes.ok ? await popRes.json() : null;
        return { pib, regioes };
    } catch { return null; }
}

async function fetchBCB() {
    try {
        // SELIC meta, IPCA e PTAX (câmbio) em tempo real
        const [selicRes, ipcaRes, ptaxRes] = await Promise.all([
            fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json'),   // SELIC
            fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/1?formato=json'),   // IPCA mensal
            fetch('https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao=%27${today()}%27&$format=json&$top=1')
        ]);
        const selic = selicRes.ok ? await selicRes.json() : null;
        const ipca = ipcaRes.ok ? await ipcaRes.json() : null;
        const ptax = ptaxRes.ok ? await ptaxRes.json() : null;
        return {
            selic: selic?.[0]?.valor ?? null,
            ipca: ipca?.[0]?.valor ?? null,
            ptax: ptax?.value?.[0]?.cotacaoVenda ?? null
        };
    } catch { return null; }
}

function today() {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;
}

function buildContextBlock(ibge, bcb) {
    const lines = ['## CONTEXTO MACROECONÔMICO BRASIL (tempo real)'];
    if (bcb) {
        if (bcb.selic) lines.push(`- SELIC meta: ${bcb.selic}% a.a.`);
        if (bcb.ipca) lines.push(`- IPCA (último mês): ${bcb.ipca}%`);
        if (bcb.ptax) lines.push(`- Dólar PTAX: R$ ${Number(bcb.ptax).toFixed(2)}`);
    }
    if (ibge?.regioes) lines.push(`- Regiões IBGE disponíveis: ${ibge.regioes.map(r => r.nome).join(', ')}`);
    lines.push('Use estes dados reais para enriquecer a análise de risco, investimento e mercado.');
    return lines.join('\n');
}

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────

const BASE_SYSTEM = `Você é Nexus, um analista sênior de inteligência de mercado e estratégia de negócios. Sua missão é fornecer análises profundas, acionáveis e contextualizadas para empreendedores, investidores e gestores brasileiros.

## COMPORTAMENTO GERAL
- Raciocine em profundidade antes de responder
- Use dados reais, tendências verificáveis e benchmarks do mercado brasileiro
- Seja direto, sofisticado e sem rodeios — o usuário é inteligente
- Adapte o tipo de resposta ao tipo de pergunta
- Quando usar web_search, cite os dados encontrados nas análises

## TIPOS DE RESPOSTA
Você deve identificar o tipo de pergunta e responder com o JSON adequado:

### TIPO 1 — "market_analysis" (análise de mercado, oportunidade de negócio, nicho, setor)
Retorne:
{
  "type": "market_analysis",
  "resumo": "análise geral em 3-4 frases inteligentes e diretas",
  "insight": "um insight estratégico não óbvio sobre este mercado",
  "viabilidade": {
    "score": 72,
    "breakdown": {
      "mercado": 80,
      "competicao": 60,
      "execucao": 70,
      "financeiro": 75,
      "timing": 75
    }
  },
  "mercado": {
    "potencial": "ex: Alto — R$ 12 bi/ano no Brasil",
    "tam": "ex: R$ 8,4 bilhões (mercado endereçável)",
    "crescimento": "ex: +18% a.a. projetado até 2027",
    "risco": "ex: Médio — regulatório e competitivo",
    "investimento": "ex: R$ 50k–200k para MVP viável",
    "prazo": "ex: 6–12 meses para primeiras receitas"
  },
  "publico": {
    "perfil": "descrição clara do cliente ideal",
    "idade": "ex: 28–45 anos",
    "renda": "ex: Classe B/C, renda familiar R$ 4k–12k",
    "necessidades": ["necessidade 1", "necessidade 2", "necessidade 3", "necessidade 4"]
  },
  "tendencias": ["tendência 1 com contexto", "tendência 2", "tendência 3", "tendência 4"],
  "oportunidades": ["oportunidade específica 1", "oportunidade 2", "oportunidade 3"],
  "concorrentes": [
    { "nome": "Empresa A", "forca": 85, "fraqueza": "fraqueza principal" },
    { "nome": "Empresa B", "forca": 60, "fraqueza": "fraqueza principal" },
    { "nome": "Empresa C", "forca": 40, "fraqueza": "fraqueza principal" }
  ],
  "diferenciais": ["diferencial competitivo 1", "diferencial 2", "diferencial 3"],
  "recomendacoes": [
    "recomendação estratégica detalhada 1",
    "recomendação 2",
    "recomendação 3",
    "recomendação 4"
  ],
  "alertas": ["risco ou alerta importante 1", "alerta 2"]
}

### TIPO 2 — "comparison" (comparar modelos, estratégias, ferramentas, mercados)
Retorne:
{
  "type": "comparison",
  "resumo": "contexto da comparação em 2-3 frases",
  "insight": "qual deles vence e por quê, de forma direta",
  "itens": [
    {
      "nome": "Opção A",
      "score": 78,
      "pros": ["pro 1", "pro 2", "pro 3"],
      "contras": ["contra 1", "contra 2"],
      "ideal_para": "para quem é ideal"
    },
    {
      "nome": "Opção B",
      "score": 65,
      "pros": ["pro 1", "pro 2"],
      "contras": ["contra 1", "contra 2"],
      "ideal_para": "para quem é ideal"
    }
  ],
  "veredicto": "conclusão clara e acionável",
  "recomendacoes": ["recomendação 1", "recomendação 2"]
}

### TIPO 3 — "strategy" (estratégia de negócio, marketing, crescimento, precificação, expansão)
Retorne:
{
  "type": "strategy",
  "resumo": "diagnóstico direto da situação em 2-3 frases",
  "insight": "o principal ponto de alavancagem que a maioria ignora",
  "fases": [
    { "fase": "Fase 1 — Nome", "prazo": "0–3 meses", "acoes": ["ação 1", "ação 2", "ação 3"], "meta": "meta mensurável" },
    { "fase": "Fase 2 — Nome", "prazo": "3–6 meses", "acoes": ["ação 1", "ação 2"], "meta": "meta mensurável" },
    { "fase": "Fase 3 — Nome", "prazo": "6–12 meses", "acoes": ["ação 1", "ação 2"], "meta": "meta mensurável" }
  ],
  "kpis": ["KPI 1 com meta", "KPI 2", "KPI 3"],
  "alertas": ["alerta estratégico 1", "alerta 2"],
  "recomendacoes": ["recomendação final 1", "recomendação 2"]
}

### TIPO 4 — "insight" (perguntas conceituais, explicações, follow-ups, dúvidas gerais)
Retorne:
{
  "type": "insight",
  "resumo": "resposta principal clara e direta",
  "pontos": [
    { "titulo": "Ponto 1", "texto": "explicação detalhada" },
    { "titulo": "Ponto 2", "texto": "explicação detalhada" },
    { "titulo": "Ponto 3", "texto": "explicação detalhada" }
  ],
  "exemplos": ["exemplo concreto 1", "exemplo 2"],
  "conclusao": "conclusão acionável",
  "proximos_passos": ["próximo passo 1", "próximo passo 2"]
}

### TIPO 5 — "canvas" (Business Model Canvas, modelo de negócio)
Retorne:
{
  "type": "canvas",
  "resumo": "síntese do modelo em 2-3 frases",
  "insight": "o ponto crítico de diferenciação deste modelo",
  "segmentos": ["segmento de cliente 1", "segmento 2"],
  "proposta": "proposta de valor central clara e específica",
  "canais": ["canal 1", "canal 2", "canal 3"],
  "relacionamento": ["tipo de relacionamento com cliente 1", "tipo 2"],
  "receitas": ["fonte de receita 1 com modelo (ex: assinatura, comissão)", "fonte 2"],
  "recursos": ["recurso-chave 1", "recurso 2", "recurso 3"],
  "atividades": ["atividade-chave 1", "atividade 2", "atividade 3"],
  "parceiros": ["parceiro estratégico 1", "parceiro 2"],
  "custos": ["estrutura de custo 1", "custo 2", "custo 3"],
  "viabilidade": { "score": 70, "breakdown": { "mercado": 75, "competicao": 65, "execucao": 70, "financeiro": 68, "timing": 72 } },
  "recomendacoes": ["recomendação 1", "recomendação 2"]
}

### TIPO 6 — "arena" (Modo Arena — comparar dois mercados/negócios em disputa direta)
Use quando o usuário pede comparação entre dois negócios/mercados como adversários diretos.
Retorne:
{
  "type": "arena",
  "resumo": "contexto do confronto",
  "insight": "o fator decisivo que separa os dois",
  "lado_a": {
    "nome": "Negócio/Mercado A",
    "score": 74,
    "vantagens": ["vantagem 1", "vantagem 2", "vantagem 3"],
    "vulnerabilidades": ["vulnerabilidade 1", "vulnerabilidade 2"],
    "estrategia": "estratégia recomendada para este lado vencer"
  },
  "lado_b": {
    "nome": "Negócio/Mercado B",
    "score": 68,
    "vantagens": ["vantagem 1", "vantagem 2"],
    "vulnerabilidades": ["vulnerabilidade 1", "vulnerabilidade 2"],
    "estrategia": "estratégia recomendada"
  },
  "vencedor": "A ou B",
  "justificativa": "por que este vence em 2-3 frases diretas",
  "recomendacoes": ["recomendação 1", "recomendação 2"]
}

## REGRAS ABSOLUTAS
1. Retorne SOMENTE JSON válido — sem markdown, sem texto fora do JSON
2. Sempre escolha o tipo mais adequado para a pergunta
3. Seja específico com números, percentuais e contexto Brasil
4. "insight" deve ser sempre não-óbvio e surpreendente
5. Recomendações devem ser acionáveis, não genéricas
6. Se não tiver certeza de um dado específico, use estimativas razoáveis sinalizadas como "estimado"
7. Para "canvas" use quando o usuário pede Business Model Canvas ou modelo de negócio
8. Para "arena" use quando o usuário quer comparar dois lados como rivais diretos`;

// Groq web_search tool definition
const WEB_SEARCH_TOOL = {
    type: 'function',
    function: {
        name: 'web_search',
        description: 'Search the web for current market data, news, trends, competitors, and Brazilian economic data to enrich analyses.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query in Portuguese or English'
                }
            },
            required: ['query']
        }
    }
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { messages, sessionId } = req.body;
    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid messages' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        // ── 1. Fetch real-time economic context ──────────────────────────────
        const [ibge, bcb] = await Promise.all([fetchIBGE(), fetchBCB()]);
        const contextBlock = buildContextBlock(ibge, bcb);
        const systemPrompt = `${BASE_SYSTEM}\n\n${contextBlock}`;

        // ── 2. Save user message to Supabase ────────────────────────────────
        if (supabase && sessionId) {
            const userMsg = messages[messages.length - 1];
            await supabase.from('messages').insert({
                session_id: sessionId,
                role: userMsg.role,
                content: userMsg.content,
                created_at: new Date().toISOString()
            }).then(() => { });
        }

        // ── 3. First call — may trigger web_search tool ──────────────────────
        const firstCall = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages
            ],
            tools: [WEB_SEARCH_TOOL],
            tool_choice: 'auto',
            max_tokens: 512,
            temperature: 0.3,
        });

        const firstMsg = firstCall.choices[0]?.message;
        let enrichedMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
        ];

        // ── 4. Execute tool calls if any ─────────────────────────────────────
        if (firstMsg?.tool_calls?.length > 0) {
            enrichedMessages.push({ role: 'assistant', content: firstMsg.content || '', tool_calls: firstMsg.tool_calls });

            for (const tc of firstMsg.tool_calls) {
                if (tc.function.name === 'web_search') {
                    let searchResult = '';
                    try {
                        const args = JSON.parse(tc.function.arguments);
                        // Groq's native web search via Brave (when available) or fallback DuckDuckGo
                        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json&no_html=1&skip_disambig=1`;
                        const ddgRes = await fetch(ddgUrl);
                        if (ddgRes.ok) {
                            const ddgData = await ddgRes.json();
                            const abstract = ddgData.AbstractText || '';
                            const related = (ddgData.RelatedTopics || []).slice(0, 5).map(t => t.Text || '').filter(Boolean).join(' | ');
                            searchResult = [abstract, related].filter(Boolean).join('\n') || 'Sem resultados diretos.';
                        }
                    } catch (e) {
                        searchResult = 'Pesquisa não disponível no momento.';
                    }

                    enrichedMessages.push({
                        role: 'tool',
                        tool_call_id: tc.id,
                        content: searchResult
                    });
                }
            }
        }

        // ── 5. Final streaming call with enriched context ────────────────────
        const stream = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: enrichedMessages,
            response_format: { type: 'json_object' },
            stream: true,
            max_tokens: 3000,
            temperature: 0.65,
            top_p: 0.9,
        });

        let fullResponse = '';

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || '';
            if (delta) {
                fullResponse += delta;
                res.write(`data: ${JSON.stringify({ delta })}\n\n`);
            }
        }

        // ── 6. Save AI response to Supabase ──────────────────────────────────
        if (supabase && sessionId) {
            await supabase.from('messages').insert({
                session_id: sessionId,
                role: 'assistant',
                content: fullResponse,
                created_at: new Date().toISOString()
            }).then(() => { });
        }

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (err) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
    }
}
