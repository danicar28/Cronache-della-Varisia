export interface ParsedSession {
  title: string;
  body: string;
}

export function parseSessions(text: string): ParsedSession[] {
  if (!text || !text.trim()) return [];
  const lines = text.split(/\r?\n/);

  interface CandidateSession {
    title: string;
    sessionNum: number | null;
    isTocFormat: boolean;
    lines: string[];
  }

  const introLines: string[] = [];
  const candidates: CandidateSession[] = [];
  let current: CandidateSession | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(
      /^(?:#+\s*|\*{1,2}\s*)?(sessione\s+(\d+)(?:[\s:\-–—.,|()].*)?)$/i
    );
    const wordCount = trimmed.split(/\s+/).length;
    const looksLikeProseSentence =
      trimmed.length > 130 || (trimmed.endsWith('.') && wordCount > 10);

    if (match && !looksLikeProseSentence) {
      if (current) {
        candidates.push(current);
      }
      const rawTitle = match[1].replace(/\*{1,2}$/, '').trim();
      const sessionNum = Number.parseInt(match[2], 10);
      const isTocFormat =
        /\t+\d+\s*$/.test(trimmed) ||
        /\.{2,}\s*\d+\s*$/.test(trimmed) ||
        /\s{2,}\d+\s*$/.test(trimmed);

      current = {
        title: rawTitle.replace(/\t+\d+\s*$/, '').replace(/\.{2,}\s*\d+\s*$/, '').trim(),
        sessionNum: Number.isFinite(sessionNum) ? sessionNum : null,
        isTocFormat,
        lines: [],
      };
    } else if (current) {
      current.lines.push(line);
    } else {
      introLines.push(line);
    }
  }

  if (current) {
    candidates.push(current);
  }

  // Compute bodies and detect Table of Contents (Indice) entries
  const withBody = candidates.map((c) => ({
    ...c,
    body: c.lines.join('\n').trim(),
  }));

  const maxBodyLenByNum = new Map<number, number>();
  for (const c of withBody) {
    if (c.sessionNum !== null) {
      const prev = maxBodyLenByNum.get(c.sessionNum) ?? 0;
      if (c.body.length > prev) {
        maxBodyLenByNum.set(c.sessionNum, c.body.length);
      }
    }
  }

  const filteredCandidates = withBody.filter((c, idx) => {
    const prevEmpty = idx > 0 && withBody[idx - 1].body.length === 0;
    const nextEmpty = idx < withBody.length - 1 && withBody[idx + 1].body.length === 0;
    const maxForNum = c.sessionNum !== null ? maxBodyLenByNum.get(c.sessionNum) ?? 0 : 0;

    if (c.body.length === 0) {
      if (c.isTocFormat) return false;
      if (maxForNum > 0) return false;
      if (prevEmpty || nextEmpty) return false;
    }

    if (c.isTocFormat && maxForNum > Math.max(150, c.body.length * 3)) {
      return false;
    }

    return true;
  });

  const sessions: ParsedSession[] = [];
  const introBody = introLines
    .filter((l) => !/^(?:indice|sommario)$/i.test(l.trim()))
    .join('\n')
    .trim();

  if (introBody.length > 0) {
    sessions.push({ title: 'Prologo / Note Generali', body: introBody });
  }

  for (const c of filteredCandidates) {
    sessions.push({ title: c.title, body: c.body });
  }

  return sessions;
}

export function splitTextIntoChunks(text: string, maxChunkSize = 45000): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChunkSize) return [trimmed];

  const chunks: string[] = [];
  const paragraphs = trimmed.split(/\n{2,}/);
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
  return normalized.slice(0, 18);
}

export function compressDataUrl(
  dataUrl: string,
  maxWidth = 960,
  quality = 0.78,
  maxBytesLength = 400000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let scale = Math.min(1, maxWidth / (img.width || maxWidth));
      let currentQuality = quality;
      let output = '';

      for (let attempt = 0; attempt < 7; attempt++) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Impossibile elaborare l’immagine.'));
          return;
        }
        ctx.fillStyle = '#12100e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        output = canvas.toDataURL('image/jpeg', currentQuality);
        if (output.length <= maxBytesLength) {
          resolve(output);
          return;
        }
        scale *= 0.72;
        currentQuality = Math.max(0.32, currentQuality - 0.1);
      }
      if (output.length <= maxBytesLength) {
        resolve(output);
      } else {
        reject(new Error('Immagine troppo grande dopo la compressione.'));
      }
    };
    img.onerror = () => reject(new Error('Immagine non valida o non leggibile.'));
    img.src = dataUrl;
  });
}

export function compressImageFile(
  file: File,
  maxWidth = 960,
  quality = 0.78,
  maxBytesLength = 400000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const result = ev.target?.result;
      if (typeof result !== 'string') {
        reject(new Error('Errore lettura file immagine.'));
        return;
      }
      try {
        const compressed = await compressDataUrl(result, maxWidth, quality, maxBytesLength);
        resolve(compressed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Errore lettura file immagine.'));
    reader.readAsDataURL(file);
  });
}

export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const DEMO_DIARY_TEXT = `Sessione 1 - L'arrivo a Otari
Il gruppo si incontra alla taverna Il Pesce Spada gestita da Magiloy. Wrin Sivinxi, l'astrologa elfa proprietaria delle Meraviglie di Wrin, chiede aiuto per indagare su strane luci azzurre provenienti dal Faro di Gauntlight nelle paludi nebbiose.
Il sindaco Oseph Menhef promette 50 mo ciascuno se la minaccia verrà chiarita.

Sessione 2 - I sotterranei del Faro
Esplorando le rovine di Gauntlight, gli eroi affrontano un gruppo di mitflit guidati da Boss Skrawng e trovano una chiave d'argento incisa con il simbolo di Belcorra Haruvex, l'antica stregona costruttrice del faro.`;

export const DEMO_ENTRIES = [
  {
    category: 'npcs' as const,
    name: 'Wrin Sivinxi',
    role: 'Astrologa Mezza-Elfa · Meraviglie di Wrin',
    status: 'Alleato',
    desc: 'Proprietaria dell’emporio esoterico di Otari. Ha notato il sinistro bagliore azzurro proveniente da Gauntlight e ha ingaggiato il gruppo.',
  },
  {
    category: 'npcs' as const,
    name: 'Belcorra Haruvex',
    role: 'Stregona Fantasma · Costruttrice di Gauntlight',
    status: 'Nemico',
    desc: 'Antica necromante scomparsa secoli fa. Il suo sigillo compare sugli artefatti rinvenuti nei livelli superiori delle rovine.',
  },
  {
    category: 'locations' as const,
    name: 'Otari',
    role: 'Cittadina Costiera · Isola di Kortos',
    status: 'Sicuro',
    desc: 'Fiorente cittadina famosa per il legname e la pesca. Base operativa del gruppo con taverne, fabbri e mercanti.',
  },
  {
    category: 'locations' as const,
    name: 'Faro di Gauntlight',
    role: 'Rovine e Dungeon · Palude Nebbiosa',
    status: 'Pericoloso',
    desc: 'Antico faro in rovina immerso nella palude a nord di Otari. Sotto la torre si estendono vasti sotterranei.',
  },
  {
    category: 'quests' as const,
    name: 'Il Mistero di Gauntlight',
    role: 'Mandante: Wrin Sivinxi · 50 mo a testa',
    status: 'Attiva',
    desc: 'Scoprire perché il faro emette una sinistra luce azzurra e neutralizzare eventuali pericoli per Otari.',
  },
  {
    category: 'loot' as const,
    name: 'Chiave d’Argento di Haruvex',
    role: 'Oggetto Chiave · Portata dal gruppo',
    status: 'In possesso',
    desc: 'Chiave finemente cesellata recuperata nei sotterranei del faro, reca l’emblema della casata Haruvex.',
  },
  {
    category: 'timeline' as const,
    name: 'Incontro al Pesce Spada',
    role: 'Sessione 1',
    status: '',
    order: 1,
    desc: 'Gli avventurieri rispondono all’appello di Wrin Sivinxi a Otari.',
  },
  {
    category: 'timeline' as const,
    name: 'Sconfitta di Boss Skrawng',
    role: 'Sessione 2',
    status: '',
    order: 2,
    desc: 'Primo ingresso nelle rovine di Gauntlight e recupero della chiave d’argento.',
  },
  {
    category: 'party' as const,
    name: 'Ricompensa promessa dal Sindaco',
    role: 'Accordo · 50 mo per eroe',
    status: 'In sospeso',
    desc: 'Oseph Menhef pagherà il gruppo al ritorno con prove concrete sulla situazione al faro.',
  },
];
