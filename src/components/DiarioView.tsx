import React, { useMemo, useState } from 'react';
import { ChevronDown, PenLine, RefreshCw, Search } from 'lucide-react';
import type { Campaign, NavTab, WikiEntry } from '../types';
import { CATEGORY_CONFIG } from '../types';
import { parseSessions } from '../utils/campaignUtils';

interface DiarioViewProps {
  campaign: Campaign;
  entries: WikiEntry[];
  onOpenEditDiary: () => void;
  onOpenImport: () => void;
  onSyncDrive: () => Promise<void>;
  isSyncingDrive: boolean;
  onSelectEntry: (entry: WikiEntry) => void;
  onNavigateTab: (tab: NavTab) => void;
}

export const DiarioView: React.FC<DiarioViewProps> = ({
  campaign,
  entries,
  onOpenEditDiary,
  onOpenImport,
  onSyncDrive,
  isSyncingDrive,
  onSelectEntry,
}) => {
  const [query, setQuery] = useState('');
  const [openIndices, setOpenIndices] = useState<Record<number, boolean>>({});
  const [defaultAllOpen, setDefaultAllOpen] = useState<boolean | null>(null);

  const sessions = useMemo(() => parseSessions(campaign.diaryText), [campaign.diaryText]);
  const q = query.trim().toLowerCase();

  const matchingEntries = useMemo(() => {
    if (!q) return [];
    return entries.filter((item) => {
      const hay = `${item.name} ${item.role} ${item.desc}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, q]);

  const filteredSessions = useMemo(() => {
    if (!q) return sessions;
    return sessions.filter(
      (s) => s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)
    );
  }, [sessions, q]);

  const isIndexOpen = (idx: number, total: number) => {
    if (q) return true;
    if (openIndices[idx] !== undefined) return openIndices[idx];
    if (defaultAllOpen !== null) return defaultAllOpen;
    return total <= 10 || idx >= total - 2;
  };

  const toggleSession = (idx: number, total: number) => {
    const currentlyOpen = isIndexOpen(idx, total);
    setOpenIndices((prev) => ({
      ...prev,
      [idx]: !currentlyOpen,
    }));
  };

  const handleToggleAll = () => {
    const anyCollapsed = filteredSessions.some((_, i) => !isIndexOpen(i, filteredSessions.length));
    setOpenIndices({});
    setDefaultAllOpen(anyCollapsed);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-[#d4af37]">
            Diario delle Sessioni
          </h2>
          <p className="text-xs text-[#a59b8e]">
            {sessions.length > 0 ? (
              <>
                <span className="font-mono tabular-nums text-[#ede8e0]">{sessions.length}</span>{' '}
                {sessions.length === 1 ? 'sessione rilevata' : 'sessioni rilevate'} · suddivise dai titoli «Sessione N».
              </>
            ) : (
              'Suddiviso automaticamente dai titoli «Sessione N» presenti nel documento importato.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-[#7c7266] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca nel diario e nelle schede..."
              className="w-full bg-[#1b1815] border border-[#342e27] rounded-lg pl-9 pr-3.5 py-2 text-sm text-[#ede8e0] placeholder-[#736a5e] focus:outline-none focus:border-[#d4af37]"
            />
          </div>

          {filteredSessions.length > 1 && !q && (
            <button
              type="button"
              onClick={handleToggleAll}
              className="px-3 py-2 bg-[#26211c] hover:bg-[#312b25] border border-[#3a332b] text-xs font-medium text-[#d6cec2] rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {filteredSessions.some((_, i) => !isIndexOpen(i, filteredSessions.length))
                ? 'Espandi tutte'
                : 'Comprimi tutte'}
            </button>
          )}

          {campaign.driveFileId && (
            <button
              type="button"
              onClick={onSyncDrive}
              disabled={isSyncingDrive}
              className="px-3.5 py-2 bg-[#26211c] hover:bg-[#312b25] border border-[#3a332b] text-xs font-semibold text-[#ede8e0] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#d4af37] ${isSyncingDrive ? 'animate-spin' : ''}`} />
              <span>Sincronizza Drive</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenEditDiary}
            className="px-4 py-2 bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] font-semibold text-sm rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <PenLine className="w-4 h-4" />
            <span>Modifica testo</span>
          </button>
        </div>
      </div>

      {q && matchingEntries.length > 0 && (
        <div className="bg-[#1b1815] border border-[#d4af37]/30 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-[#d4af37]">
            Schede Wiki corrispondenti (<span className="font-mono tabular-nums">{matchingEntries.length}</span>)
          </p>
          <div className="flex flex-wrap gap-2">
            {matchingEntries.slice(0, 18).map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelectEntry(entry)}
                className="px-3 py-1.5 rounded-md bg-[#24201c] hover:bg-[#2f2924] border border-[#3a332b] text-xs text-[#ede8e0] transition-colors cursor-pointer"
              >
                {entry.name}{' '}
                <span className="text-[#9c9285]">· {CATEGORY_CONFIG[entry.category].title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {filteredSessions.length === 0 ? (
        <div className="bg-[#1b1815] border border-dashed border-[#342e27] rounded-xl p-10 text-center space-y-3">
          <p className="text-sm text-[#a59b8e]">
            {sessions.length === 0
              ? 'Nessuna sessione caricata finora. Collega il tuo file Google Drive o incolla il testo del diario.'
              : 'Nessuna sessione corrisponde alla ricerca.'}
          </p>
          {sessions.length === 0 && (
            <button
              type="button"
              onClick={onOpenImport}
              className="px-4 py-2 bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] font-semibold text-sm rounded-lg transition-colors cursor-pointer"
            >
              Importa o collega Google Drive
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSessions.map((session, idx) => {
            const isOpen = isIndexOpen(idx, filteredSessions.length);
            return (
              <div
                key={`${session.title}-${idx}`}
                className="bg-[#1b1815] border border-[#2f2923] rounded-xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleSession(idx, filteredSessions.length)}
                  className="w-full px-5 py-3.5 bg-[#221e1a] hover:bg-[#27221d] flex items-center justify-between gap-4 text-left cursor-pointer transition-colors"
                >
                  <span className="font-display font-bold text-base text-[#d4af37]">
                    {session.title}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-[#a59b8e] transition-transform shrink-0 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="p-5 border-t border-[#2b251f] text-sm text-[#dcd4c8] whitespace-pre-line leading-relaxed max-w-4xl">
                    {session.body || '(Nessuna nota testuale in questa sezione)'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
