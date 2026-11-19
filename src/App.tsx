import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  BookOpen,
  ChevronsUpDown,
  Clock,
  Coins,
  FolderSync,
  Images,
  LogOut,
  MapPin,
  Menu,
  ScrollText,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { BardoView } from './components/BardoView';
import { CampaignModal } from './components/CampaignModal';
import { DiarioView } from './components/DiarioView';
import { EditDiaryModal } from './components/EditDiaryModal';
import { EntryModal } from './components/EntryModal';
import { GalleryView } from './components/GalleryView';
import { ImportModal } from './components/ImportModal';
import { LoginScreen } from './components/LoginScreen';
import { TimelineView } from './components/TimelineView';
import { WikiSectionView } from './components/WikiSectionView';
import {
  getAccessToken,
  googleSignIn,
  logout,
  subscribeToAuth,
  testConnection,
} from './firebase';
import {
  addGalleryImage,
  batchAddGalleryImages,
  batchAddWikiEntries,
  createCampaign,
  deleteCampaign,
  deleteGalleryImage,
  deleteWikiEntry,
  disconnectCampaignDrive,
  joinCampaignByInviteCode,
  leaveCampaign,
  loadDemoIntoCampaign,
  saveWikiEntry,
  subscribeCampaign,
  subscribeEntries,
  subscribeGallery,
  subscribeUserMemberships,
  updateCampaignDiary,
} from './services/campaignService';
import { DriveAuthExpiredError, fetchDriveDocumentContent } from './services/driveService';
import {
  CATEGORY_CONFIG,
  type Campaign,
  type ChatMessage,
  type GalleryImage,
  type NavTab,
  type UserMembership,
  type WikiCategory,
  type WikiEntry,
} from './types';
import { compressImageFile, parseSessions, splitTextIntoChunks } from './utils/campaignUtils';

interface ToastState {
  message: string;
  tone: 'info' | 'success' | 'error';
}

async function safeReadJsonResponse<T>(res: Response): Promise<T> {
  const raw = await res.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    if (res.status === 504 || res.status === 502 || res.status === 503) {
      throw new Error(
        `Il server AI ha impiegato troppo tempo o è momentaneamente sovraccarico (HTTP ${res.status}). Riprova tra qualche istante.`
      );
    }
    throw new Error(
      raw && raw.length < 200 && !raw.trim().startsWith('<')
        ? raw
        : `Risposta non valida dal server (HTTP ${res.status}). Riprova tra qualche istante.`
    );
  }
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('join')?.trim().toUpperCase() || null;
  });

  const [memberships, setMemberships] = useState<UserMembership[]>([]);
  const [membershipsLoaded, setMembershipsLoaded] = useState(false);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(() =>
    localStorage.getItem('pf2e_active_campaign')
  );
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);

  const [activeTab, setActiveTab] = useState<NavTab>('bardo');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState<{
    current: number;
    total: number;
    added: number;
  } | null>(null);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [isUploadingGallery, setIsUploadingGallery] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [editDiaryOpen, setEditDiaryOpen] = useState(false);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [entryModalState, setEntryModalState] = useState<{
    open: boolean;
    category: WikiCategory;
    entry: WikiEntry | null;
  }>({ open: false, category: 'npcs', entry: null });

  const autoCreatedRef = useRef(false);

  const showToast = (message: string, tone: ToastState['tone'] = 'info') => {
    setToast({ message, tone });
  };

  useEffect(() => {
    testConnection();
    const unsub = subscribeToAuth((nextUser, hasToken) => {
      setUser(nextUser);
      setAccessToken(hasToken ? getAccessToken() : null);
      setAuthReady(true);
      if (!nextUser) {
        setMemberships([]);
        setMembershipsLoaded(false);
        setCampaign(null);
        setEntries([]);
        setGallery([]);
        autoCreatedRef.current = false;
      }
    });
    return unsub;
  }, []);

  // Subscribe to user's campaigns
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeUserMemberships(user.uid, (list) => {
      setMemberships(list);
      setMembershipsLoaded(true);
    });
    return unsub;
  }, [user]);

  // Handle pending invite code or auto-create initial campaign
  useEffect(() => {
    if (!user || !membershipsLoaded) return;

    const handleMembershipFlow = async () => {
      if (pendingInviteCode) {
        const code = pendingInviteCode;
        setPendingInviteCode(null);
        try {
          const joinedId = await joinCampaignByInviteCode(user, code);
          setActiveCampaignId(joinedId);
          localStorage.setItem('pf2e_active_campaign', joinedId);
          window.history.replaceState({}, '', window.location.pathname);
          showToast('Sei entrato nella campagna del gruppo.', 'success');
        } catch (err) {
          showToast(
            err instanceof Error ? err.message : 'Codice invito non valido.',
            'error'
          );
        }
        return;
      }

      if (memberships.length === 0 && !autoCreatedRef.current) {
        autoCreatedRef.current = true;
        try {
          const newId = await createCampaign(user, 'Cronache di Golarion', 'Pathfinder 2E');
          setActiveCampaignId(newId);
          localStorage.setItem('pf2e_active_campaign', newId);
        } catch (err) {
          autoCreatedRef.current = false;
          showToast(
            err instanceof Error ? err.message : 'Impossibile creare la campagna iniziale.',
            'error'
          );
        }
        return;
      }

      if (memberships.length > 0) {
        autoCreatedRef.current = true;
        const valid = memberships.some((m) => m.campaignId === activeCampaignId);
        if (!valid) {
          const firstId = memberships[0].campaignId;
          setActiveCampaignId(firstId);
          localStorage.setItem('pf2e_active_campaign', firstId);
        }
      }
    };

    handleMembershipFlow();
  }, [user, membershipsLoaded, memberships, activeCampaignId, pendingInviteCode]);

  // Subscribe to active campaign, entries, and gallery only after verified membership
  useEffect(() => {
    if (!user || !membershipsLoaded || !activeCampaignId) return;
    const isMember = memberships.some((m) => m.campaignId === activeCampaignId);
    if (!isMember) return;

    const unsubCamp = subscribeCampaign(activeCampaignId, setCampaign);
    const unsubEntries = subscribeEntries(activeCampaignId, setEntries);
    const unsubGallery = subscribeGallery(activeCampaignId, setGallery);
    return () => {
      unsubCamp();
      unsubEntries();
      unsubGallery();
    };
  }, [user, membershipsLoaded, memberships, activeCampaignId]);

  const entriesByCat = useMemo(() => {
    const grouped: Record<WikiCategory, WikiEntry[]> = {
      npcs: [],
      locations: [],
      quests: [],
      loot: [],
      timeline: [],
      party: [],
    };
    for (const item of entries) {
      if (grouped[item.category]) {
        grouped[item.category].push(item);
      }
    }
    return grouped;
  }, [entries]);

  const sessionsCount = useMemo(
    () => (campaign ? parseSessions(campaign.diaryText).length : 0),
    [campaign]
  );

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setLoginError(null);
    try {
      const res = await googleSignIn();
      setUser(res.user);
      setAccessToken(res.accessToken);
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : 'Accesso con Google non completato.'
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleReauthorizeDrive = async (): Promise<string | null> => {
    const res = await googleSignIn();
    setUser(res.user);
    setAccessToken(res.accessToken);
    return res.accessToken;
  };

  const handleSendMessage = async (question: string) => {
    if (!campaign) return;
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: question,
    };
    const nextHistory = [...chatMessages, userMsg];
    setChatMessages(nextHistory);
    setIsAsking(true);

    try {
      const res = await fetch('/api/bardo/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          diaryText: campaign.diaryText,
          campaignName: campaign.name,
          history: nextHistory.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await safeReadJsonResponse<{ answer?: string; error?: string }>(res);
      if (!res.ok) {
        throw new Error(data.error || 'Il Bardo non è riuscito a rispondere.');
      }
      setChatMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          content: data.answer || 'Nessuna risposta generata.',
        },
      ]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Errore chiamata Bardo AI.', 'error');
    } finally {
      setIsAsking(false);
    }
  };

  const handleExtractWiki = async (overrideDiary?: string) => {
    if (!campaign || !user) return;
    const textToAnalyze = overrideDiary ?? campaign.diaryText;
    if (!textToAnalyze.trim()) {
      showToast('Carica o collega prima il testo del diario.', 'error');
      return;
    }

    const chunks = splitTextIntoChunks(textToAnalyze.slice(0, 780000), 45000);
    if (chunks.length === 0) {
      showToast('Il diario non contiene testo sufficiente da analizzare.', 'error');
      return;
    }

    setIsExtracting(true);
    setExtractProgress({ current: 1, total: chunks.length, added: 0 });

    const existingSet = new Set(entries.map((e) => e.name.trim().toLowerCase()));
    const knownNames = entries.map((e) => e.name);
    let totalAdded = 0;
    let nextTimelineOrder = entriesByCat.timeline.reduce(
      (max, item) => Math.max(max, item.order ?? 0),
      0
    ) + 1;
    let completedChunks = 0;
    let partialErrorMsg: string | null = null;

    try {
      for (let i = 0; i < chunks.length; i++) {
        setExtractProgress({ current: i + 1, total: chunks.length, added: totalAdded });

        try {
          const res = await fetch('/api/bardo/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chunkText: chunks[i],
              chunkIndex: i,
              totalChunks: chunks.length,
              existingNames: knownNames.slice(-150),
            }),
          });

          const data = await safeReadJsonResponse<{
            extracted?: Record<
              WikiCategory,
              Array<{ name: string; role: string; status: string; desc: string; order?: number }>
            >;
            error?: string;
          }>(res);

          if (!res.ok || !data.extracted) {
            throw new Error(data.error || 'Errore durante l’estrazione Wiki AI.');
          }

          const toInsert: Array<{
            category: WikiCategory;
            name: string;
            role: string;
            status: string;
            desc: string;
            order?: number | null;
          }> = [];

          (['npcs', 'locations', 'quests', 'loot', 'timeline', 'party'] as WikiCategory[]).forEach(
            (cat) => {
              const list = Array.isArray(data.extracted?.[cat]) ? data.extracted[cat] : [];
              for (const item of list) {
                const norm = (item.name || '').trim().toLowerCase();
                if (norm && !existingSet.has(norm)) {
                  existingSet.add(norm);
                  knownNames.push(item.name);
                  toInsert.push({
                    category: cat,
                    name: item.name,
                    role: item.role || '',
                    status: item.status || '',
                    desc: item.desc || '',
                    order: cat === 'timeline' ? nextTimelineOrder++ : null,
                  });
                }
              }
            }
          );

          if (toInsert.length > 0) {
            const added = await batchAddWikiEntries(campaign.id, user.uid, toInsert);
            totalAdded += added;
          }
          completedChunks++;
          setExtractProgress({ current: i + 1, total: chunks.length, added: totalAdded });
        } catch (chunkErr) {
          const msg = chunkErr instanceof Error ? chunkErr.message : 'Errore estrazione AI.';
          if (completedChunks > 0) {
            partialErrorMsg = msg;
            break;
          }
          throw chunkErr;
        }
      }

      if (partialErrorMsg) {
        showToast(
          `Analisi parziale: elaborate ${completedChunks} sezioni su ${chunks.length} (${totalAdded} schede aggiunte). ${partialErrorMsg}`,
          'info'
        );
      } else {
        showToast(
          totalAdded > 0
            ? `Wiki aggiornata: aggiunte ${totalAdded} nuove schede da ${chunks.length} sezioni.`
            : 'Analisi completata: nessuna nuova voce rispetto alle schede già presenti.',
          'success'
        );
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Errore estrazione AI.', 'error');
    } finally {
      setIsExtracting(false);
      setExtractProgress(null);
    }
  };

  const handleSaveImportedDiary = async (
    text: string,
    stagedImages: Array<{ title: string; dataUrl: string }>,
    runAi: boolean,
    driveMeta?: { fileId: string; fileName: string } | null
  ) => {
    if (!campaign || !user) return;
    await updateCampaignDiary(campaign.id, text, driveMeta);

    const existingUrls = new Set(gallery.map((g) => g.dataUrl));
    const uniqueNewImages = stagedImages.filter((img) => {
      if (existingUrls.has(img.dataUrl)) return false;
      existingUrls.add(img.dataUrl);
      return true;
    });
    const addedImagesCount = await batchAddGalleryImages(
      campaign.id,
      user.uid,
      uniqueNewImages
    );

    const imageSuffix =
      addedImagesCount > 0 ? ` (+${addedImagesCount} immagini salvate in Galleria)` : '';
    showToast(
      driveMeta
        ? `Documento «${driveMeta.fileName}» collegato e sincronizzato${imageSuffix}.`
        : `Diario importato con successo${imageSuffix}.`,
      'success'
    );
    if (runAi) {
      await handleExtractWiki(text);
    }
  };

  const handleSyncDrive = async () => {
    if (!campaign?.driveFileId || !user) {
      setImportOpen(true);
      return;
    }
    setIsSyncingDrive(true);
    try {
      let token = accessToken || getAccessToken();
      if (!token) {
        token = await handleReauthorizeDrive();
      }
      if (!token) return;

      let result;
      try {
        result = await fetchDriveDocumentContent(token, campaign.driveFileId);
      } catch (err) {
        if (err instanceof DriveAuthExpiredError) {
          token = await handleReauthorizeDrive();
          if (!token) return;
          result = await fetchDriveDocumentContent(token, campaign.driveFileId);
        } else {
          throw err;
        }
      }

      await updateCampaignDiary(campaign.id, result.text, {
        fileId: result.id,
        fileName: result.name,
      });

      const existingUrls = new Set(gallery.map((g) => g.dataUrl));
      const newImages = result.images.filter((img) => {
        if (existingUrls.has(img.dataUrl)) return false;
        existingUrls.add(img.dataUrl);
        return true;
      });
      const addedImagesCount = await batchAddGalleryImages(campaign.id, user.uid, newImages);
      const imageSuffix =
        addedImagesCount > 0 ? ` (+${addedImagesCount} nuove immagini in Galleria)` : '';

      showToast(
        result.wasTruncated
          ? `Sincronizzato «${result.name}» (testo tagliato al limite archivio di 800.000 caratteri)${imageSuffix}.`
          : `Diario aggiornato da «${result.name}»${imageSuffix}.`,
        'success'
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Errore durante la sincronizzazione Drive.',
        'error'
      );
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const handleUploadGalleryFiles = async (files: FileList) => {
    if (!campaign || !user) return;
    setIsUploadingGallery(true);
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await compressImageFile(file, 1024, 0.78, 420000);
        await addGalleryImage(campaign.id, user.uid, file.name, dataUrl);
      }
      showToast('Immagini salvate nella galleria del party.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Errore caricamento immagine.', 'error');
    } finally {
      setIsUploadingGallery(false);
    }
  };

  const navItems: Array<{
    id: NavTab;
    label: string;
    count?: number;
    Icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'bardo', label: 'Bardo AI', Icon: Sparkles },
    { id: 'diario', label: 'Diario', count: sessionsCount, Icon: BookOpen },
    { id: 'npcs', label: 'PNG & Fazioni', count: entriesByCat.npcs.length, Icon: Users },
    { id: 'locations', label: 'Luoghi', count: entriesByCat.locations.length, Icon: MapPin },
    { id: 'quests', label: 'Missioni', count: entriesByCat.quests.length, Icon: ScrollText },
    { id: 'loot', label: 'Tesori', count: entriesByCat.loot.length, Icon: Coins },
    { id: 'timeline', label: 'Timeline', count: entriesByCat.timeline.length, Icon: Clock },
    { id: 'party', label: 'Gruppo', count: entriesByCat.party.length, Icon: Wallet },
    { id: 'gallery', label: 'Galleria', count: gallery.length, Icon: Images },
  ];

  const activeNavLabel = navItems.find((n) => n.id === activeTab)?.label || 'Bardo AI';

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#12100e] text-[#b9afa2] flex items-center justify-center text-sm">
        Caricamento archivio...
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        onSignIn={handleGoogleSignIn}
        isSigningIn={isSigningIn}
        error={loginError}
        pendingInviteCode={pendingInviteCode}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#12100e] text-[#ede8e0] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-[#161310] border-r border-[#2b251f] sticky top-0 h-screen">
        <div className="px-5 h-14 flex items-center border-b border-[#2b251f]">
          <span className="font-display font-bold text-base text-[#d4af37] whitespace-nowrap truncate">
            Cronache di Golarion
          </span>
        </div>

        <div className="p-3 border-b border-[#2b251f]">
          <button
            type="button"
            onClick={() => setCampaignModalOpen(true)}
            className="w-full px-3 py-2 rounded-lg bg-[#1e1a16] hover:bg-[#26211c] border border-[#322b24] flex items-center justify-between gap-2 text-left cursor-pointer transition-colors"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#ede8e0] truncate">
                {campaign?.name || 'Seleziona campagna'}
              </p>
              <p className="text-[11px] text-[#8f8578] truncate">
                {campaign?.system || 'Pathfinder 2E'}
              </p>
            </div>
            <ChevronsUpDown className="w-4 h-4 text-[#8f8578] shrink-0" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ id, label, count, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`w-full px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#262019] text-[#d4af37]'
                    : 'text-[#b2a89b] hover:text-[#ede8e0] hover:bg-[#1d1915]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </span>
                {typeof count === 'number' && (
                  <span className="text-xs font-mono tabular-nums text-[#8f8578] shrink-0">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[#2b251f] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#ede8e0] truncate">
              {user.displayName || user.email}
            </p>
            <p className="text-[11px] text-[#8f8578] truncate">
              {accessToken ? 'Drive collegato' : 'Account Google'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            title="Esci"
            className="p-2 rounded-lg text-[#8f8578] hover:text-[#ede8e0] hover:bg-[#231f1b] transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-[#161310] border-r border-[#2b251f] flex flex-col h-full z-10">
            <div className="px-4 h-14 flex items-center justify-between border-b border-[#2b251f]">
              <span className="font-display font-bold text-base text-[#d4af37]">
                Cronache di Golarion
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-[#9c9285] hover:text-[#ede8e0] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 border-b border-[#2b251f]">
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  setCampaignModalOpen(true);
                }}
                className="w-full px-3 py-2 rounded-lg bg-[#1e1a16] border border-[#322b24] flex items-center justify-between gap-2 text-left cursor-pointer"
              >
                <span className="text-xs font-semibold text-[#ede8e0] truncate">
                  {campaign?.name || 'Campagne'}
                </span>
                <ChevronsUpDown className="w-4 h-4 text-[#8f8578] shrink-0" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map(({ id, label, count, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveTab(id);
                    setMobileNavOpen(false);
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg text-sm font-medium flex items-center justify-between gap-2 cursor-pointer ${
                    activeTab === id
                      ? 'bg-[#262019] text-[#d4af37]'
                      : 'text-[#b2a89b] hover:text-[#ede8e0]'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                  </span>
                  {typeof count === 'number' && (
                    <span className="text-xs font-mono tabular-nums text-[#8f8578]">{count}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="p-3 border-t border-[#2b251f] flex items-center justify-between">
              <span className="text-xs text-[#b9afa2] truncate">
                {user.displayName || user.email}
              </span>
              <button
                type="button"
                onClick={() => logout()}
                className="text-xs text-[#9c9285] hover:text-[#ede8e0] px-2 py-1 cursor-pointer"
              >
                Esci
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar (Clean 3-zone / contextual breadcrumb + primary CTA) */}
        <header className="h-14 px-4 sm:px-6 border-b border-[#2b251f] bg-[#141210]/95 backdrop-blur-xs sticky top-0 z-30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 text-[#b9afa2] hover:text-[#ede8e0] cursor-pointer"
              aria-label="Apri menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-[#8f8578] truncate hidden sm:inline">
                {campaign?.name || 'Campagna'}
              </span>
              <span className="text-[#5d544a] hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-[#ede8e0] truncate">{activeNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setCampaignModalOpen(true)}
              className="px-3 py-2 bg-[#1e1a16] hover:bg-[#26211c] border border-[#342e27] text-[#ede8e0] font-medium text-xs sm:text-sm rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Users className="w-4 h-4 text-[#d4af37] shrink-0" />
              <span className="hidden sm:inline">Invita Party</span>
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="px-4 py-2 bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] font-semibold text-xs sm:text-sm rounded-lg transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <FolderSync className="w-4 h-4 shrink-0" />
              <span>Collega Drive / Diario</span>
            </button>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
          {toast && (
            <div
              className={`px-4 py-3 rounded-lg border flex items-center justify-between gap-4 text-sm ${
                toast.tone === 'error'
                  ? 'bg-[#2c1517] border-[#74282e] text-[#f3b6ba]'
                  : toast.tone === 'success'
                  ? 'bg-[#15241b] border-[#28543a] text-emerald-300'
                  : 'bg-[#1b1815] border-[#d4af37]/40 text-[#ede8e0]'
              }`}
            >
              <span>{toast.message}</span>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="text-current opacity-70 hover:opacity-100 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {!campaign ? (
            membershipsLoaded && memberships.length === 0 ? (
              <div className="bg-[#1b1815] border border-[#2f2923] rounded-xl p-10 text-center space-y-4">
                <p className="font-display text-lg font-bold text-[#d4af37]">
                  Nessuna campagna attiva
                </p>
                <p className="text-sm text-[#a59b8e] max-w-md mx-auto">
                  Crea una nuova campagna per iniziare il compendio oppure unisciti a quella del
                  tuo gruppo tramite codice invito.
                </p>
                <button
                  type="button"
                  onClick={() => setCampaignModalOpen(true)}
                  className="px-4 py-2.5 bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Gestisci o crea campagna
                </button>
              </div>
            ) : (
              <div className="bg-[#1b1815] border border-[#2f2923] rounded-xl p-10 text-center text-sm text-[#a59b8e]">
                Caricamento campagna in corso...
              </div>
            )
          ) : (
            <>
              {activeTab === 'bardo' && (
                <BardoView
                  campaign={campaign}
                  entriesCount={entries.length}
                  imagesCount={gallery.length}
                  messages={chatMessages}
                  onSendMessage={handleSendMessage}
                  onClearChat={() => setChatMessages([])}
                  onExtractWiki={() => handleExtractWiki()}
                  isAsking={isAsking}
                  isExtracting={isExtracting}
                  extractProgress={extractProgress}
                  onOpenImport={() => setImportOpen(true)}
                  onSyncDrive={handleSyncDrive}
                  isSyncingDrive={isSyncingDrive}
                  onOpenEditDiary={() => setEditDiaryOpen(true)}
                  onLoadDemo={async () => {
                    await loadDemoIntoCampaign(campaign.id, user.uid, entries);
                    showToast('Campagna di esempio PF2E (Otari & Gauntlight) caricata.', 'success');
                  }}
                  onSpeechError={(message) => showToast(message, 'error')}
                />
              )}

              {activeTab === 'diario' && (
                <DiarioView
                  campaign={campaign}
                  entries={entries}
                  onOpenEditDiary={() => setEditDiaryOpen(true)}
                  onOpenImport={() => setImportOpen(true)}
                  onSyncDrive={handleSyncDrive}
                  isSyncingDrive={isSyncingDrive}
                  onSelectEntry={(entry) =>
                    setEntryModalState({ open: true, category: entry.category, entry })
                  }
                  onNavigateTab={setActiveTab}
                />
              )}

              {(activeTab === 'npcs' ||
                activeTab === 'locations' ||
                activeTab === 'quests' ||
                activeTab === 'loot' ||
                activeTab === 'party') && (
                <WikiSectionView
                  category={activeTab}
                  entries={entriesByCat[activeTab]}
                  onCreate={() =>
                    setEntryModalState({ open: true, category: activeTab, entry: null })
                  }
                  onEdit={(entry) =>
                    setEntryModalState({ open: true, category: entry.category, entry })
                  }
                />
              )}

              {activeTab === 'timeline' && (
                <TimelineView
                  entries={entriesByCat.timeline}
                  onCreate={() =>
                    setEntryModalState({ open: true, category: 'timeline', entry: null })
                  }
                  onEdit={(entry) =>
                    setEntryModalState({ open: true, category: 'timeline', entry })
                  }
                />
              )}

              {activeTab === 'gallery' && (
                <GalleryView
                  images={gallery}
                  onUploadFiles={handleUploadGalleryFiles}
                  onDeleteImage={(id) => deleteGalleryImage(campaign.id, id)}
                  isUploading={isUploadingGallery}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      {campaign && (
        <>
          <ImportModal
            isOpen={importOpen}
            onClose={() => setImportOpen(false)}
            campaign={campaign}
            accessToken={accessToken}
            onReauthorizeDrive={handleReauthorizeDrive}
            onSaveImportedDiary={handleSaveImportedDiary}
            onDisconnectDrive={async () => {
              await disconnectCampaignDrive(campaign.id);
              showToast('Documento Google Drive scollegato.', 'info');
            }}
          />

          <EditDiaryModal
            isOpen={editDiaryOpen}
            initialText={campaign.diaryText}
            onClose={() => setEditDiaryOpen(false)}
            onSave={async (newText) => {
              await updateCampaignDiary(campaign.id, newText);
              showToast('Testo del diario aggiornato.', 'success');
            }}
          />

          <EntryModal
            isOpen={entryModalState.open}
            category={entryModalState.category}
            entry={entryModalState.entry}
            defaultOrder={entriesByCat.timeline.length + 1}
            onClose={() => setEntryModalState((prev) => ({ ...prev, open: false }))}
            onSave={async (payload, entryId) => {
              await saveWikiEntry(campaign.id, user.uid, payload, entryId);
              showToast('Scheda salvata.', 'success');
            }}
            onDelete={async (entryId) => {
              await deleteWikiEntry(campaign.id, entryId);
              showToast(CATEGORY_CONFIG[entryModalState.category].singular + ' eliminata.', 'info');
            }}
          />
        </>
      )}

      <CampaignModal
        isOpen={campaignModalOpen}
        onClose={() => setCampaignModalOpen(false)}
        memberships={memberships}
        activeCampaign={campaign}
        onSelectCampaign={(id) => {
          setActiveCampaignId(id);
          setChatMessages([]);
          localStorage.setItem('pf2e_active_campaign', id);
        }}
        onCreateCampaign={async (name, system) => {
          const newId = await createCampaign(user, name, system);
          setActiveCampaignId(newId);
          setChatMessages([]);
          localStorage.setItem('pf2e_active_campaign', newId);
          showToast(`Campagna «${name}» creata.`, 'success');
        }}
        onJoinCampaign={async (code) => {
          const joinedId = await joinCampaignByInviteCode(user, code);
          setActiveCampaignId(joinedId);
          setChatMessages([]);
          localStorage.setItem('pf2e_active_campaign', joinedId);
          showToast('Sei entrato nella campagna condivisa.', 'success');
        }}
        onDeleteCampaign={async (campaignId, campaignName) => {
          autoCreatedRef.current = true;
          await deleteCampaign(user, campaignId);
          if (activeCampaignId === campaignId) {
            const next = memberships.find((m) => m.campaignId !== campaignId)?.campaignId || null;
            setActiveCampaignId(next);
            setCampaign(null);
            setEntries([]);
            setGallery([]);
            setChatMessages([]);
            if (next) {
              localStorage.setItem('pf2e_active_campaign', next);
            } else {
              localStorage.removeItem('pf2e_active_campaign');
            }
          }
          showToast(`Campagna «${campaignName}» eliminata.`, 'info');
        }}
        onLeaveCampaign={async (campaignId, campaignName) => {
          autoCreatedRef.current = true;
          await leaveCampaign(user, campaignId);
          if (activeCampaignId === campaignId) {
            const next = memberships.find((m) => m.campaignId !== campaignId)?.campaignId || null;
            setActiveCampaignId(next);
            setCampaign(null);
            setEntries([]);
            setGallery([]);
            setChatMessages([]);
            if (next) {
              localStorage.setItem('pf2e_active_campaign', next);
            } else {
              localStorage.removeItem('pf2e_active_campaign');
            }
          }
          showToast(`Hai abbandonato la campagna «${campaignName}».`, 'info');
        }}
      />
    </div>
  );
}
