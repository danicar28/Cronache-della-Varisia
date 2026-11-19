import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  FolderSync,
  Loader2,
  PenLine,
  RefreshCw,
  RotateCcw,
  Send,
  Square,
  Volume2,
  Wand2,
} from 'lucide-react';
import type { Campaign, ChatMessage } from '../types';
import { parseSessions } from '../utils/campaignUtils';
import { FormattedMessage } from './FormattedMessage';

type BardVoice = 'Charon' | 'Fenrir' | 'Puck';

const VOICE_OPTIONS: Array<{ id: BardVoice; label: string }> = [
  { id: 'Charon', label: 'Voce: Profonda (Charon)' },
  { id: 'Fenrir', label: 'Voce: Epica (Fenrir)' },
  { id: 'Puck', label: 'Voce: Vivace (Puck)' },
];

interface BardoViewProps {
  campaign: Campaign;
  entriesCount: number;
  imagesCount: number;
  messages: ChatMessage[];
  onSendMessage: (question: string) => Promise<void>;
  onClearChat: () => void;
  onExtractWiki: () => Promise<void>;
  isAsking: boolean;
  isExtracting: boolean;
  extractProgress: { current: number; total: number; added: number } | null;
  onOpenImport: () => void;
  onSyncDrive: () => Promise<void>;
  isSyncingDrive: boolean;
  onOpenEditDiary: () => void;
  onLoadDemo: () => Promise<void>;
  onSpeechError?: (message: string) => void;
}

const QUICK_PROMPTS = [
  {
    label: 'Recap ultima sessione',
    prompt:
      "Fai un recap chiaro e avvincente in stile 'Nelle puntate precedenti' basato sull'ultima sessione presente nel diario.",
  },
  {
    label: 'Indizi irrisolti',
    prompt: 'Quali sono i misteri, le piste o gli indizi ancora irrisolti emersi finora nel diario?',
  },
  {
    label: 'Antagonisti e minacce',
    prompt: 'Chi sono i principali nemici, fazioni ostili o minacce attive incontrate finora?',
  },
];

export const BardoView: React.FC<BardoViewProps> = ({
  campaign,
  entriesCount,
  imagesCount,
  messages,
  onSendMessage,
  onClearChat,
  onExtractWiki,
  isAsking,
  isExtracting,
  extractProgress,
  onOpenImport,
  onSyncDrive,
  isSyncingDrive,
  onOpenEditDiary,
  onLoadDemo,
  onSpeechError,
}) => {
  const [input, setInput] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<BardVoice>('Charon');
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setPlayingAudioId(null);
  };

  useEffect(() => {
    const cache = audioCacheRef.current;
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      for (const url of cache.values()) {
        URL.revokeObjectURL(url);
      }
      cache.clear();
    };
  }, []);

  const handleToggleSpeak = async (msg: ChatMessage) => {
    if (playingAudioId === msg.id) {
      stopAudio();
      return;
    }
    if (loadingAudioId) return;

    stopAudio();

    const cacheKey = `${msg.id}:${selectedVoice}`;
    let audioUrl = audioCacheRef.current.get(cacheKey);

    if (!audioUrl) {
      setLoadingAudioId(msg.id);
      try {
        const res = await fetch('/api/bardo/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: msg.content,
            voiceName: selectedVoice,
          }),
        });
        const raw = await res.text();
        let data: { audioBase64?: string; mimeType?: string; error?: string } = {};
        try {
          data = JSON.parse(raw) as typeof data;
        } catch {
          throw new Error(`Risposta audio non valida (HTTP ${res.status}).`);
        }

        if (!res.ok || !data.audioBase64) {
          throw new Error(data.error || 'Impossibile generare la voce del Bardo.');
        }

        const binaryStr = atob(data.audioBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: data.mimeType || 'audio/wav' });
        audioUrl = URL.createObjectURL(blob);
        audioCacheRef.current.set(cacheKey, audioUrl);
      } catch (err) {
        onSpeechError?.(
          err instanceof Error ? err.message : 'Errore durante la sintesi vocale.'
        );
        setLoadingAudioId(null);
        return;
      } finally {
        setLoadingAudioId(null);
      }
    }

    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    setPlayingAudioId(msg.id);
    audio.onended = () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
        setPlayingAudioId(null);
      }
    };
    audio.onerror = () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
        setPlayingAudioId(null);
      }
      onSpeechError?.('Impossibile riprodurre il file audio nel browser.');
    };
    try {
      await audio.play();
    } catch {
      stopAudio();
      onSpeechError?.('Riproduzione bloccata dal browser. Riprova a cliccare Ascolta.');
    }
  };

  const wordCount = campaign.diaryText.trim()
    ? campaign.diaryText.trim().split(/\s+/).length
    : 0;
  const sessionCount = parseSessions(campaign.diaryText).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || isAsking) return;
    setInput('');
    await onSendMessage(q);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  const handleQuickPrompt = async (q: string) => {
    if (isAsking) return;
    await onSendMessage(q);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Main Chat Panel */}
      <div className="lg:col-span-8 bg-[#1b1815] border border-[#2f2923] rounded-xl flex flex-col min-h-[560px] max-h-[75vh]">
        <div className="px-5 py-3 border-b border-[#2b251f] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookOpen className="w-4 h-4 text-[#d4af37] shrink-0" />
            <h2 className="font-display text-base font-bold text-[#f3eee4] truncate">
              Interroga le Cronache
            </h2>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <select
              aria-label="Seleziona voce del Bardo"
              value={selectedVoice}
              onChange={(e) => {
                stopAudio();
                setSelectedVoice(e.target.value as BardVoice);
              }}
              className="bg-[#12100e] border border-[#342e27] rounded-md px-2.5 py-1 text-xs text-[#d6cec2] focus:outline-none focus:border-[#d4af37] cursor-pointer"
            >
              {VOICE_OPTIONS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                stopAudio();
                onClearChat();
              }}
              className="text-xs text-[#a59b8e] hover:text-[#ede8e0] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Pulisci chat</span>
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 p-5 overflow-y-auto space-y-4">
          {messages.length === 0 ? (
            <div className="bg-[#231f1b] border border-[#342e27] rounded-lg p-5 space-y-2 max-w-2xl">
              <p className="text-sm font-semibold text-[#d4af37]">
                Salute, avventuriero!
              </p>
              <p className="text-sm text-[#cbc2b6] leading-relaxed">
                Collega il tuo documento su Google Drive o incolla gli appunti con{' '}
                <strong className="text-[#ede8e0]">Collega Drive / Diario</strong>. Una volta
                caricato il riassunto della campagna, posso rispondere a domande su PNG, luoghi,
                oggetti dimenticati e generare la Wiki automaticamente.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isAssistant = msg.role === 'assistant';
              const isLoading = loadingAudioId === msg.id;
              const isPlaying = playingAudioId === msg.id;
              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={
                      msg.role === 'user'
                        ? 'max-w-xl bg-[#2a2319] border border-[#d4af37]/35 rounded-lg px-4 py-3 text-sm text-[#f3eee4]'
                        : 'max-w-2xl bg-[#221e1a] border border-[#342e27] rounded-lg px-4 py-3.5 text-sm text-[#dcd4c8] space-y-3'
                    }
                  >
                    <FormattedMessage content={msg.content} />
                    {isAssistant && (
                      <div className="pt-2 border-t border-[#2f2923] flex items-center justify-end">
                        <button
                          type="button"
                          disabled={Boolean(loadingAudioId) && !isLoading}
                          onClick={() => handleToggleSpeak(msg)}
                          className={`px-2.5 py-1 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                            isPlaying
                              ? 'bg-[#5e0b15] border-[#d4af37]/40 text-[#f3d67d]'
                              : 'bg-[#191613] hover:bg-[#2a241e] border-[#342e27] text-[#cfc5b7] hover:text-[#f3eee4]'
                          }`}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#d4af37]" />
                              <span>Preparo voce...</span>
                            </>
                          ) : isPlaying ? (
                            <>
                              <Square className="w-3 h-3 fill-current" />
                              <span>Ferma voce</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3.5 h-3.5 text-[#d4af37]" />
                              <span>Ascolta il Bardo</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {isAsking && (
            <div className="flex justify-start">
              <div className="bg-[#221e1a] border border-[#342e27] rounded-lg px-4 py-3 text-sm text-[#b9afa2]">
                Il Bardo sta consultando le pergamene...
              </div>
            </div>
          )}
        </div>

        {/* Quick Prompts */}
        <div className="px-4 py-2.5 border-t border-[#2b251f] bg-[#161411] flex items-center gap-2 overflow-x-auto">
          {QUICK_PROMPTS.map((qp) => (
            <button
              key={qp.label}
              type="button"
              disabled={isAsking}
              onClick={() => handleQuickPrompt(qp.prompt)}
              className="px-3 py-1.5 rounded-md bg-[#231f1b] hover:bg-[#2d2722] border border-[#38312a] text-xs font-medium text-[#d6cec2] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              {qp.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="p-3.5 border-t border-[#2b251f] flex gap-2.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Chiedi qualcosa sulla campagna (es. Chi ci ha dato la chiave d'argento?)..."
            className="flex-1 bg-[#12100e] border border-[#342e27] rounded-lg px-3.5 py-2.5 text-sm text-[#ede8e0] placeholder-[#736a5e] focus:outline-none focus:border-[#d4af37]"
          />
          <button
            type="submit"
            disabled={isAsking || !input.trim()}
            className="px-4 py-2.5 bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] font-semibold text-sm rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <span>Chiedi</span>
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Side Actions & Campaign Metrics */}
      <div className="lg:col-span-4 flex flex-col gap-5">
        {/* Drive Linkage Card */}
        <div className="bg-[#1b1815] border border-[#2f2923] rounded-xl p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-[#d4af37]">
              Collegamento Google Drive
            </h3>
            <FolderSync className="w-4 h-4 text-[#d4af37] shrink-0" />
          </div>

          {campaign.driveFileId ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-[#ede8e0] truncate">
                  {campaign.driveFileName || 'Documento collegato'}
                </p>
                <p className="text-xs text-[#9c9285] font-mono tabular-nums">
                  {campaign.driveSyncedAt
                    ? `Sincronizzato: ${campaign.driveSyncedAt.toDate().toLocaleString('it-IT')}`
                    : 'Documento pronto per la sincronizzazione'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSyncDrive}
                  disabled={isSyncingDrive}
                  className="flex-1 px-3.5 py-2 bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDrive ? 'animate-spin' : ''}`} />
                  <span>{isSyncingDrive ? 'Sincronizzazione...' : 'Sincronizza da Drive'}</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenImport}
                  className="px-3 py-2 bg-[#26211c] hover:bg-[#312b25] border border-[#3a332b] text-xs text-[#d6cec2] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  Cambia
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-[#a59b8e] leading-relaxed">
                Il tuo riassunto è su Google Drive? Collegalo qui per leggere anche documenti molto
                lunghi senza limiti di copia-incolla.
              </p>
              <button
                type="button"
                onClick={onOpenImport}
                className="w-full px-4 py-2.5 bg-[#26211c] hover:bg-[#312b25] border border-[#3f372f] text-sm font-semibold text-[#ede8e0] rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <FolderSync className="w-4 h-4 text-[#d4af37]" />
                <span>Collega file da Google Drive</span>
              </button>
            </div>
          )}
        </div>

        {/* AI Extraction Card */}
        <div className="bg-[#1b1815] border border-[#2f2923] rounded-xl p-5 space-y-3.5">
          <h3 className="font-display text-sm font-bold text-[#d4af37]">
            Estrazione Wiki AI
          </h3>
          <p className="text-xs text-[#a59b8e] leading-relaxed">
            Analizza l’intero testo del diario per estrarre e aggiungere automaticamente nuovi PNG,
            Luoghi, Missioni, Tesori, Timeline e Note di Gruppo.
          </p>
          <button
            type="button"
            onClick={onExtractWiki}
            disabled={isExtracting || !campaign.diaryText.trim()}
            className="w-full py-2.5 px-4 bg-[#5e0b15] hover:bg-[#73111d] border border-[#d4af37]/35 text-[#f3d67d] font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <Wand2 className="w-4 h-4 shrink-0" />
            <span>
              {isExtracting && extractProgress
                ? `Sezione ${extractProgress.current}/${extractProgress.total}...`
                : isExtracting
                ? 'Analisi in corso...'
                : 'Genera / Aggiorna Wiki'}
            </span>
          </button>
          {isExtracting && extractProgress && (
            <p className="text-[11px] text-[#cbb67a] font-mono tabular-nums text-center">
              Analisi sezione {extractProgress.current} di {extractProgress.total} ·{' '}
              {extractProgress.added} schede salvate
            </p>
          )}
        </div>

        {/* Campaign Stats */}
        <div className="bg-[#1b1815] border border-[#2f2923] rounded-xl p-5 space-y-4 flex-1 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="font-display text-sm font-bold text-[#ede8e0]">
              Stato dell’Archivio
            </h3>
            <dl className="divide-y divide-[#2a241e] text-xs">
              <div className="py-2 flex items-center justify-between">
                <dt className="text-[#a59b8e]">Parole nel diario</dt>
                <dd className="font-mono tabular-nums font-semibold text-[#ede8e0]">
                  {wordCount.toLocaleString('it-IT')}
                </dd>
              </div>
              <div className="py-2 flex items-center justify-between">
                <dt className="text-[#a59b8e]">Sessioni rilevate</dt>
                <dd className="font-mono tabular-nums font-semibold text-[#ede8e0]">
                  {sessionCount}
                </dd>
              </div>
              <div className="py-2 flex items-center justify-between">
                <dt className="text-[#a59b8e]">Schede catalogate</dt>
                <dd className="font-mono tabular-nums font-semibold text-[#ede8e0]">
                  {entriesCount}
                </dd>
              </div>
              <div className="py-2 flex items-center justify-between">
                <dt className="text-[#a59b8e]">Immagini e mappe</dt>
                <dd className="font-mono tabular-nums font-semibold text-[#ede8e0]">
                  {imagesCount}
                </dd>
              </div>
            </dl>
          </div>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={onOpenEditDiary}
              className="w-full py-2 px-3 bg-[#24201c] hover:bg-[#2e2924] border border-[#38312a] text-xs font-medium text-[#dcd4c8] rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <PenLine className="w-3.5 h-3.5" />
              <span>Modifica testo diario</span>
            </button>
            <button
              type="button"
              onClick={onLoadDemo}
              className="w-full py-2 px-3 bg-transparent hover:bg-[#231f1b] border border-[#2c2620] text-xs text-[#9c9285] rounded-lg transition-colors cursor-pointer"
            >
              Carica campagna di esempio (PF2E)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
