import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Chiave Gemini API non configurata sul server. Controlla il pannello Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRawErrorDetails(err: unknown): { code?: number; status?: string; message: string } {
  const rawMessage = err instanceof Error ? err.message : String(err || '');
  const trimmed = rawMessage.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: { code?: number; status?: string; message?: string };
      };
      if (parsed?.error) {
        return {
          code: parsed.error.code,
          status: parsed.error.status,
          message: parsed.error.message || trimmed,
        };
      }
    } catch {
      // ignore non-JSON
    }
  }
  const errObj = err as { status?: number; code?: number } | undefined;
  return {
    code: typeof errObj?.status === 'number' ? errObj.status : errObj?.code,
    message: rawMessage,
  };
}

function isTransientGeminiError(err: unknown): boolean {
  const details = extractRawErrorDetails(err);
  const msg = `${details.status || ''} ${details.message}`.toLowerCase();
  return (
    details.code === 503 ||
    details.code === 429 ||
    details.code === 500 ||
    details.code === 502 ||
    details.code === 504 ||
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('resource_exhausted') ||
    msg.includes('429') ||
    msg.includes('temporarily') ||
    msg.includes('etimedout') ||
    msg.includes('econnreset') ||
    msg.includes('fetch failed')
  );
}

function formatGeminiError(err: unknown): { httpStatus: number; message: string } {
  const details = extractRawErrorDetails(err);
  const msg = `${details.status || ''} ${details.message}`.toLowerCase();

  if (
    details.code === 503 ||
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded')
  ) {
    return {
      httpStatus: 503,
      message:
        'I server del Bardo AI (Gemini) stanno ricevendo troppe richieste in questo momento. Il diario è comunque salvato: riprova tra qualche istante.',
    };
  }
  if (details.code === 429 || msg.includes('429') || msg.includes('resource_exhausted')) {
    return {
      httpStatus: 429,
      message:
        'Limite temporaneo di richieste AI raggiunto per un documento così grande. Attendi qualche secondo e riprova.',
    };
  }
  if (
    details.code === 401 ||
    details.code === 403 ||
    msg.includes('permission_denied') ||
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid')
  ) {
    return {
      httpStatus: details.code === 403 ? 403 : 400,
      message:
        'Chiave API Gemini non valida o non autorizzata. Verifica Settings > Secrets nel pannello AI Studio.',
    };
  }
  if (msg.includes('non configurata')) {
    return { httpStatus: 500, message: details.message };
  }
  return {
    httpStatus: 500,
    message: details.message || 'Errore imprevisto durante la chiamata al Bardo AI.',
  };
}

async function generateWithResilience(
  ai: GoogleGenAI,
  params: {
    contents: string;
    systemInstruction: string;
    thinkingLevel?: ThinkingLevel;
    responseMimeType?: string;
    responseSchema?: unknown;
  }
) {
  const attemptsPlan: Array<{ model: string; retries: number; useThinking: boolean }> = [
    { model: PRIMARY_MODEL, retries: 3, useThinking: true },
    { model: FALLBACK_MODEL, retries: 2, useThinking: false },
  ];

  let lastError: unknown;

  for (const plan of attemptsPlan) {
    for (let attempt = 0; attempt < plan.retries; attempt++) {
      try {
        const config: Record<string, unknown> = {
          systemInstruction: params.systemInstruction,
        };
        if (plan.useThinking && params.thinkingLevel) {
          config.thinkingConfig = { thinkingLevel: params.thinkingLevel };
        }
        if (params.responseMimeType) {
          config.responseMimeType = params.responseMimeType;
        }
        if (params.responseSchema) {
          config.responseSchema = params.responseSchema;
        }

        return await ai.models.generateContent({
          model: plan.model,
          contents: params.contents,
          config,
        });
      } catch (err) {
        lastError = err;
        if (!isTransientGeminiError(err)) {
          throw err;
        }
        const isLastTryForModel = attempt === plan.retries - 1;
        const backoffMs = isLastTryForModel
          ? 700
          : 1200 * Math.pow(2, attempt) + Math.floor(Math.random() * 400);
        await sleep(backoffMs);
      }
    }
  }

  throw lastError;
}

function splitTextIntoChunks(text: string, maxChunkSize = 50000): string[] {
  if (text.length <= maxChunkSize) return [text];
  const chunks: string[] = [];
  const paragraphs = text.split(/\n{2,}/);
  let current = '';

  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > maxChunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }

  // Fallback if a single paragraph exceeds maxChunkSize
  const normalized: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxChunkSize) {
      normalized.push(chunk);
    } else {
      for (let i = 0; i < chunk.length; i += maxChunkSize) {
        normalized.push(chunk.slice(i, i + maxChunkSize));
      }
    }
  }
  return normalized.slice(0, 16);
}

const extractionSchema = {
  type: Type.OBJECT,
  properties: {
    npcs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Nome del PNG o della fazione' },
          role: { type: Type.STRING, description: 'Ruolo, titolo, stirpe o affiliazione' },
          status: {
            type: Type.STRING,
            description: 'Uno tra: Alleato, Neutrale, Sospetto, Nemico, Sconosciuto',
          },
          desc: { type: Type.STRING, description: 'Sintesi chiara di chi è e cosa ha fatto' },
        },
        required: ['name', 'role', 'status', 'desc'],
      },
    },
    locations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Nome del luogo' },
          role: { type: Type.STRING, description: 'Regione, città o tipologia (es. Taverna, Dungeon)' },
          status: {
            type: Type.STRING,
            description: 'Uno tra: Esplorato, Sicuro, Pericoloso, Da esplorare',
          },
          desc: { type: Type.STRING, description: 'Descrizione e dettagli chiave emersi nel diario' },
        },
        required: ['name', 'role', 'status', 'desc'],
      },
    },
    quests: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Titolo della missione o filone narrativo' },
          role: { type: Type.STRING, description: 'Mandante o ricompensa promessa' },
          status: {
            type: Type.STRING,
            description: 'Uno tra: Attiva, In corso, Completata, Fallita',
          },
          desc: { type: Type.STRING, description: 'Obiettivo e stato attuale' },
        },
        required: ['name', 'role', 'status', 'desc'],
      },
    },
    loot: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Nome oggetto, artefatto o indizio' },
          role: { type: Type.STRING, description: 'Tipo, livello PF2E o possessore attuale' },
          status: {
            type: Type.STRING,
            description: 'Uno tra: In possesso, Identificato, Da identificare, Venduto/Usato',
          },
          desc: { type: Type.STRING, description: 'Effetti, provenienza o significato' },
        },
        required: ['name', 'role', 'status', 'desc'],
      },
    },
    timeline: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Titolo sintetico dell’evento' },
          role: { type: Type.STRING, description: 'Numero sessione o data in gioco' },
          order: { type: Type.INTEGER, description: 'Indice progressivo cronologico (1, 2, 3...)' },
          desc: { type: Type.STRING, description: 'Cosa è accaduto' },
        },
        required: ['name', 'role', 'order', 'desc'],
      },
    },
    party: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: 'Voce di gruppo (es. Cassa comune, Debito, Favore)' },
          role: { type: Type.STRING, description: 'Categoria o valore stimato' },
          status: {
            type: Type.STRING,
            description: 'Uno tra: Attivo, Risolto, In sospeso',
          },
          desc: { type: Type.STRING, description: 'Dettagli su relazioni, debiti o accordi del gruppo' },
        },
        required: ['name', 'role', 'status', 'desc'],
      },
    },
  },
  required: ['npcs', 'locations', 'quests', 'loot', 'timeline', 'party'],
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/bardo/chat', async (req, res) => {
    try {
      const { question, diaryText, history, campaignName } = req.body as {
        question?: string;
        diaryText?: string;
        history?: Array<{ role: string; content: string }>;
        campaignName?: string;
      };

      if (!question || !question.trim()) {
        res.status(400).json({ error: 'Inserisci una domanda per il Bardo.' });
        return;
      }

      const ai = createGeminiClient();
      const trimmedDiary = (diaryText || '').slice(0, 750000);
      const historyBlock = Array.isArray(history) && history.length > 0
        ? history
            .slice(-6)
            .map((m) => `${m.role === 'user' ? 'Giocatore' : 'Bardo'}: ${m.content}`)
            .join('\n')
        : '';

      const prompt = [
        `Campagna: ${campaignName || 'Pathfinder 2E'}`,
        '',
        'DIARIO DELLA CAMPAGNA:',
        trimmedDiary || '(Nessun diario caricato finora)',
        '',
        historyBlock ? `CONVERSAZIONE RECENTE:\n${historyBlock}\n` : '',
        `DOMANDA DEL GRUPPO:\n${question.trim()}`,
      ].join('\n');

      const response = await generateWithResilience(ai, {
        contents: prompt,
        systemInstruction:
          'Sei il Bardo archivista di un gruppo di Pathfinder 2E. Rispondi sempre in italiano chiaro, ben strutturato e fedele ai fatti scritti nel diario della campagna. Se un dettaglio non compare nel diario, dichiaralo onestamente invece di inventarlo. Usa formattazione Markdown pulita (**grassetto** per nomi di PNG, luoghi e oggetti chiave, *corsivo* per titoli o citazioni, __sottolineato__ per avvisi o dettagli critici, ed elenchi puntati leggibili).',
        thinkingLevel: trimmedDiary.length > 150000 ? ThinkingLevel.LOW : ThinkingLevel.MEDIUM,
      });

      res.json({ answer: response.text || 'Non ho trovato appunti pertinenti nelle pergamene.' });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.httpStatus).json({ error: formatted.message });
    }
  });

  app.post('/api/bardo/speak', async (req, res) => {
    try {
      const { text, voiceName } = req.body as {
        text?: string;
        voiceName?: string;
      };

      if (!text || !text.trim()) {
        res.status(400).json({ error: 'Nessun testo da leggere.' });
        return;
      }

      const allowedVoices = new Set(['Charon', 'Fenrir', 'Puck']);
      const selectedVoice = voiceName && allowedVoices.has(voiceName) ? voiceName : 'Charon';

      const cleanText = text
        .replace(/<\/?u>/gi, '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*•]\s+/gm, '')
        .replace(/^\s*>\s+/gm, '')
        .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/\*([^*\n]+)\*/g, '$1')
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/\n{2,}/g, '. ')
        .replace(/\n/g, ', ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 7500);

      if (!cleanText) {
        res.status(400).json({ error: 'Testo non leggibile.' });
        return;
      }

      // Split into sentence-aligned chunks up to ~2600 chars each (max 3 clips)
      const speechChunks: string[] = [];
      let remaining = cleanText;
      while (remaining.length > 0 && speechChunks.length < 3) {
        if (remaining.length <= 2600) {
          speechChunks.push(remaining);
          break;
        }
        const slice = remaining.slice(0, 2600);
        const lastBreak = Math.max(
          slice.lastIndexOf('. '),
          slice.lastIndexOf('! '),
          slice.lastIndexOf('? '),
          slice.lastIndexOf('; ')
        );
        const cutIdx = lastBreak > 800 ? lastBreak + 1 : 2600;
        speechChunks.push(remaining.slice(0, cutIdx).trim());
        remaining = remaining.slice(cutIdx).trim();
      }

      const ai = createGeminiClient();
      const wavBuffers: Buffer[] = [];

      for (const chunk of speechChunks) {
        let chunkResponse;
        let lastErr: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            chunkResponse = await ai.models.generateContent({
              model: 'gemini-3.8-flash-lite-tts',
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: chunk,
                      speechMetadata: {
                        style:
                          'Warm, expressive Italian male fantasy bard narrator, clear Italian pronunciation, calm epic storytelling cadence',
                      },
                    },
                  ],
                },
              ],
              config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: selectedVoice },
                  },
                },
              },
            });
            break;
          } catch (err) {
            lastErr = err;
            if (!isTransientGeminiError(err) || attempt === 2) {
              throw err;
            }
            await sleep(900 * Math.pow(2, attempt));
          }
        }
        if (!chunkResponse) {
          throw lastErr || new Error('Impossibile generare l’audio.');
        }

        const base64Audio =
          chunkResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          wavBuffers.push(Buffer.from(base64Audio, 'base64'));
        }
      }

      if (wavBuffers.length === 0) {
        throw new Error('Nessun flusso audio generato dal modello TTS.');
      }

      let combinedWav: Buffer;
      if (wavBuffers.length === 1) {
        combinedWav = wavBuffers[0];
      } else {
        const header = Buffer.from(wavBuffers[0].subarray(0, 44));
        const pcmParts = wavBuffers.map((buf) => (buf.length > 44 ? buf.subarray(44) : buf));
        const totalPcmLen = pcmParts.reduce((acc, b) => acc + b.length, 0);
        header.writeUInt32LE(36 + totalPcmLen, 4);
        header.writeUInt32LE(totalPcmLen, 40);
        combinedWav = Buffer.concat([header, ...pcmParts]);
      }

      res.json({
        audioBase64: combinedWav.toString('base64'),
        mimeType: 'audio/wav',
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.httpStatus).json({ error: formatted.message });
    }
  });

  app.post('/api/bardo/extract', async (req, res) => {
    try {
      const { diaryText, chunkText, chunkIndex, totalChunks, existingNames } = req.body as {
        diaryText?: string;
        chunkText?: string;
        chunkIndex?: number;
        totalChunks?: number;
        existingNames?: string[];
      };

      const sourceText = chunkText ?? diaryText;
      if (!sourceText || !sourceText.trim()) {
        res.status(400).json({ error: 'Il diario è vuoto. Collega un file da Drive o incolla gli appunti.' });
        return;
      }

      const ai = createGeminiClient();
      const isSingleChunk = typeof chunkText === 'string' && chunkText.trim().length > 0;
      const chunks = isSingleChunk
        ? [chunkText.slice(0, 60000)]
        : splitTextIntoChunks(sourceText.slice(0, 780000), 45000);
      const effectiveTotal = isSingleChunk && typeof totalChunks === 'number' && totalChunks > 0
        ? totalChunks
        : chunks.length;
      const startIndex = isSingleChunk && typeof chunkIndex === 'number' && chunkIndex >= 0
        ? chunkIndex
        : 0;

      const existingSet = new Set(
        Array.isArray(existingNames) ? existingNames.map((n) => n.trim().toLowerCase()) : []
      );

      const merged = {
        npcs: [] as Array<{ name: string; role: string; status: string; desc: string }>,
        locations: [] as Array<{ name: string; role: string; status: string; desc: string }>,
        quests: [] as Array<{ name: string; role: string; status: string; desc: string }>,
        loot: [] as Array<{ name: string; role: string; status: string; desc: string }>,
        timeline: [] as Array<{ name: string; role: string; order: number; desc: string }>,
        party: [] as Array<{ name: string; role: string; status: string; desc: string }>,
      };

      const seenPerCat: Record<string, Set<string>> = {
        npcs: new Set(existingSet),
        locations: new Set(existingSet),
        quests: new Set(existingSet),
        loot: new Set(existingSet),
        timeline: new Set(existingSet),
        party: new Set(existingSet),
      };

      let timelineOffset = 1;
      let completedChunks = 0;
      let partialWarning: string | null = null;

      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) {
          await sleep(300);
        }

        const displayIndex = isSingleChunk ? startIndex + 1 : i + 1;
        const chunkPrompt = [
          `Analizza la sezione ${displayIndex} di ${effectiveTotal} del seguente diario di campagna Pathfinder 2E.`,
          existingNames && existingNames.length > 0
            ? `Elementi già presenti in archivio (evita duplicati identici): ${existingNames.slice(0, 150).join(', ')}`
            : '',
          'Estrai tutti i PNG/fazioni, luoghi, missioni, tesori/indizi rilevanti, eventi cronologici (timeline) ed eventuali note di gruppo (debiti, favori, cassa comune).',
          '',
          'TESTO:',
          chunks[i],
        ].join('\n');

        let response;
        try {
          response = await generateWithResilience(ai, {
            contents: chunkPrompt,
            systemInstruction:
              'Sei un archivista preciso di Pathfinder 2E. Estrai entità concrete e fedeli al testo in italiano, senza duplicare voci già esistenti.',
            thinkingLevel: ThinkingLevel.LOW,
            responseMimeType: 'application/json',
            responseSchema: extractionSchema,
          });
        } catch (chunkErr) {
          if (completedChunks > 0 && isTransientGeminiError(chunkErr)) {
            partialWarning = `Elaborate ${completedChunks} sezioni su ${chunks.length}: i server AI sono temporaneamente occupati per le restanti parti.`;
            break;
          }
          throw chunkErr;
        }

        let parsed: Partial<typeof merged> = {};
        try {
          const cleaned = (response.text ?? '{}')
            .trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```$/i, '')
            .trim();
          parsed = JSON.parse(cleaned) as Partial<typeof merged>;
        } catch {
          parsed = {};
        }

        for (const key of ['npcs', 'locations', 'quests', 'loot', 'party'] as const) {
          const list = Array.isArray(parsed[key]) ? parsed[key] : [];
          for (const item of list) {
            const norm = (item.name || '').trim().toLowerCase();
            if (norm && !seenPerCat[key].has(norm)) {
              seenPerCat[key].add(norm);
              merged[key].push({
                name: String(item.name || '').slice(0, 140),
                role: String(item.role || '').slice(0, 140),
                status: String(item.status || '').slice(0, 60),
                desc: String(item.desc || '').slice(0, 8000),
              });
            }
          }
        }

        const timelineList = Array.isArray(parsed.timeline) ? parsed.timeline : [];
        for (const ev of timelineList) {
          const norm = (ev.name || '').trim().toLowerCase();
          if (norm && !seenPerCat.timeline.has(norm)) {
            seenPerCat.timeline.add(norm);
            merged.timeline.push({
              name: String(ev.name || '').slice(0, 140),
              role: String(ev.role || '').slice(0, 140),
              order: timelineOffset++,
              desc: String(ev.desc || '').slice(0, 8000),
            });
          }
        }
        completedChunks++;
      }

      res.json({
        extracted: merged,
        chunksProcessed: completedChunks,
        totalChunks: chunks.length,
        partialWarning,
      });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      res.status(formatted.httpStatus).json({ error: formatted.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    decline() {},
    on() {},
    off() {},
    send() {},
    data: {},
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== '.' && url[0] !== '/') return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return \`\${pathname}?\${queryToInject}\${search ? '&' + search.slice(1) : ''}\${hash || ''}\`;
}
export class ErrorOverlay {}
`);
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output non trovato.');
      }
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server attivo su http://0.0.0.0:${PORT}`);
  });
  server.requestTimeout = 300000;
}

startServer().catch((err) => {
  console.error('Errore avvio server:', err);
  process.exit(1);
});
