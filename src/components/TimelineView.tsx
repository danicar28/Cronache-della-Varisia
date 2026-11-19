import React, { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { WikiEntry } from '../types';

interface TimelineViewProps {
  entries: WikiEntry[];
  onCreate: () => void;
  onEdit: (entry: WikiEntry) => void;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ entries, onCreate, onEdit }) => {
  const [search, setSearch] = useState('');

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...entries]
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      .filter((item) => {
        if (!q) return true;
        return `${item.name} ${item.role} ${item.desc}`.toLowerCase().includes(q);
      });
  }, [entries, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-[#d4af37]">Timeline</h2>
          <p className="text-xs text-[#a59b8e]">
            Gli eventi della campagna in ordine cronologico in base al numero progressivo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 text-[#7c7266] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca nella timeline..."
              className="w-full bg-[#1b1815] border border-[#342e27] rounded-lg pl-9 pr-3.5 py-2 text-sm text-[#ede8e0] placeholder-[#736a5e] focus:outline-none focus:border-[#d4af37]"
            />
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="px-4 py-2 bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] font-semibold text-sm rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nuovo Evento</span>
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="bg-[#1b1815] border border-dashed border-[#342e27] rounded-xl p-10 text-center space-y-3">
          <p className="text-sm text-[#a59b8e]">
            {entries.length === 0
              ? 'Nessun evento cronologico registrato finora.'
              : 'Nessun evento corrisponde alla ricerca.'}
          </p>
          {entries.length === 0 && (
            <button
              type="button"
              onClick={onCreate}
              className="px-4 py-2 bg-[#26211c] hover:bg-[#312b25] border border-[#3a332b] text-sm font-semibold text-[#ede8e0] rounded-lg transition-colors cursor-pointer"
            >
              Aggiungi il primo evento
            </button>
          )}
        </div>
      ) : (
        <div className="max-w-3xl space-y-4">
          {sorted.map((item, idx) => (
            <div key={item.id} className="flex gap-4 items-stretch">
              <div className="flex flex-col items-center shrink-0 pt-1">
                <div className="w-8 h-8 rounded-full bg-[#221d17] border border-[#d4af37]/60 text-[#d4af37] font-mono tabular-nums text-xs font-semibold flex items-center justify-center">
                  {item.order ?? idx + 1}
                </div>
                {idx < sorted.length - 1 && (
                  <div className="w-px flex-1 bg-[#2f2923] mt-2" aria-hidden="true" />
                )}
              </div>

              <button
                type="button"
                onClick={() => onEdit(item)}
                className="flex-1 text-left bg-[#1b1815] hover:bg-[#221e1a] border border-[#2f2923] hover:border-[#d4af37]/45 rounded-xl p-4 transition-colors cursor-pointer space-y-1.5"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#c5b699]">
                  {item.role && <span>{item.role}</span>}
                </div>
                <h3 className="font-display font-bold text-base text-[#f3eee4]">
                  {item.name}
                </h3>
                <p className="text-xs text-[#b9afa2] leading-relaxed whitespace-pre-line">
                  {item.desc}
                </p>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
