import type { Timestamp } from 'firebase/firestore';

export type NavTab =
  | 'bardo'
  | 'diario'
  | 'npcs'
  | 'locations'
  | 'quests'
  | 'loot'
  | 'timeline'
  | 'party'
  | 'gallery';

export type WikiCategory = 'npcs' | 'locations' | 'quests' | 'loot' | 'timeline' | 'party';

export const FIELD_LIMITS = {
  campaignNameMax: 120,
  systemMax: 60,
  diaryTextMax: 800000,
  driveFileNameMax: 200,
  inviteCodeMin: 6,
  inviteCodeMax: 24,
  entryNameMax: 140,
  entryRoleMax: 140,
  entryStatusMax: 60,
  entryDescMax: 8000,
  entryImageMax: 250000,
  galleryTitleMax: 140,
  galleryDataUrlMax: 450000,
  idRegex: /^[a-zA-Z0-9_-]+$/,
  inviteCodeRegex: /^[A-Z0-9-]+$/,
} as const;

export interface Campaign {
  id: string;
  name: string;
  system: string;
  diaryText: string;
  driveFileId?: string | null;
  driveFileName?: string | null;
  driveSyncedAt?: Timestamp | null;
  ownerId: string;
  inviteCode: string;
  memberUids: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface UserMembership {
  campaignId: string;
  campaignName: string;
  role: 'gm' | 'player';
  joinedAt?: Timestamp;
}

export interface CampaignMember {
  uid: string;
  displayName: string;
  role: 'gm' | 'player';
  inviteCode: string;
  campaignOwnerId: string;
  joinedAt?: Timestamp;
}

export interface WikiEntry {
  id: string;
  category: WikiCategory;
  name: string;
  role: string;
  status: string;
  desc: string;
  order?: number | null;
  image?: string | null;
  createdBy: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface GalleryImage {
  id: string;
  title: string;
  dataUrl: string;
  createdBy: string;
  createdAt?: Timestamp;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface CategoryMeta {
  title: string;
  singular: string;
  subtitle: string;
  f1: string;
  f2: string;
  f3Label: string | null;
  f3Opts: string[];
  emptyText: string;
  newLabel: string;
}

export const CATEGORY_CONFIG: Record<WikiCategory, CategoryMeta> = {
  npcs: {
    title: 'PNG & Fazioni',
    singular: 'Scheda PNG / Fazione',
    subtitle: 'Tutti i volti incontrati lungo il cammino. Clicca su una scheda per modificarla.',
    f1: 'Nome PNG o Fazione',
    f2: 'Ruolo / Titolo / Stirpe',
    f3Label: 'Disposizione',
    f3Opts: ['Alleato', 'Neutrale', 'Sospetto', 'Nemico', 'Sconosciuto'],
    emptyText: 'Nessun PNG registrato in questa campagna. Sincronizza il diario o aggiungine uno.',
    newLabel: 'Nuovo PNG',
  },
  locations: {
    title: 'Atlante dei Luoghi',
    singular: 'Scheda Luogo',
    subtitle: 'Città, rovine, taverne e regioni esplorate su Golarion.',
    f1: 'Nome Luogo',
    f2: 'Regione / Tipologia (es. Città, Rovine)',
    f3Label: 'Stato',
    f3Opts: ['Esplorato', 'Sicuro', 'Pericoloso', 'Da esplorare'],
    emptyText: 'Nessun luogo registrato. Estrai dal diario o crea una nuova scheda.',
    newLabel: 'Nuovo Luogo',
  },
  quests: {
    title: 'Diario delle Missioni',
    singular: 'Scheda Missione',
    subtitle: 'Incarichi attivi, obiettivi principali e missioni completate.',
    f1: 'Titolo Missione',
    f2: 'Mandante / Ricompensa',
    f3Label: 'Stato Missione',
    f3Opts: ['Attiva', 'In corso', 'Completata', 'Fallita'],
    emptyText: 'Nessuna missione attiva al momento.',
    newLabel: 'Nuova Missione',
  },
  loot: {
    title: 'Tesori & Oggetti',
    singular: 'Scheda Tesoro / Oggetto',
    subtitle: 'Equipaggiamento notevole, rune, artefatti e indizi rinvenuti.',
    f1: 'Nome Oggetto / Indizio',
    f2: 'Tipo / Livello PF2E / Possessore',
    f3Label: 'Stato',
    f3Opts: ['In possesso', 'Identificato', 'Da identificare', 'Venduto/Usato'],
    emptyText: 'Nessun oggetto o indizio catalogato.',
    newLabel: 'Nuovo Oggetto',
  },
  timeline: {
    title: 'Timeline',
    singular: 'Evento Timeline',
    subtitle: 'Gli eventi della campagna in ordine cronologico.',
    f1: 'Titolo Evento',
    f2: 'Data / Sessione',
    f3Label: null,
    f3Opts: [],
    emptyText: 'Nessun evento nella timeline.',
    newLabel: 'Nuovo Evento',
  },
  party: {
    title: 'Gruppo',
    singular: 'Nota Gruppo',
    subtitle: 'Cassa comune, debiti, favori promessi e relazioni del party.',
    f1: 'Voce (es. Cassa Comune, Debito...)',
    f2: 'Categoria / Valore',
    f3Label: 'Stato',
    f3Opts: ['Attivo', 'Risolto', 'In sospeso'],
    emptyText: 'Nessuna nota di gruppo registrata.',
    newLabel: 'Nuova Nota',
  },
};
