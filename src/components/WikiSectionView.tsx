import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import type { WikiCategory, WikiEntry } from '../types';
import { CATEGORY_CONFIG } from '../types';

interface WikiSectionViewProps {
  category: Exclude<WikiCategory, 'timeline'>;
  entries: WikiEntry[];
  onCreate: () => void;
  onEdit: (entry: WikiEntry) => void;
}

function getStatusTone(status: string): { colorClass: string; Icon: React.FC<{ className?: string }> } {
  const s = status.toLowerCase();
  if (s.includes('alleat') || s.includes('sicur') || s.includes('completat') || s.includes('possesso') || s.includes('identificato') || s.includes('risolto')) {
    return { colorClass: 'text-emerald-400', Icon: CheckCircle2 };
  }
  if (s.includes('nemic') || s.includes('pericol') || s.includes('fallit')) {
    return { colorClass: 'text-rose-400', Icon: ShieldAlert };
  }
  if (s.includes('sospett') || s.includes('sospeso') || s.includes('da esplorare') || s.includes('da identificare')) {
    return { colorClass: 'text-amber-400', Icon: AlertCircle };
  }
  if (s.includes('corso') || s.includes('attiva') || s.includes('attivo')) {
    return { colorClass: 'text-[#d4af37]', Icon: Clock };
  }
  return { colorClass: 'text-[#a59b8e]', Icon: UserCheck };
}

export const WikiSectionView: React.FC<WikiSectionViewProps> = ({
  category,
  entries,
  onCreate,
  onEdit,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const cfg = CATEGORY_CONFIG[category];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (!q) return true;
      return `${item.name} ${item.role} ${item.status} ${item.desc}`.toLowerCase().includes(q);
    });
  }, [entries, search, statusFilter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-[#d4af37]">{cfg.title}</h2>
          <p className="text-xs text-[#a59b8e]">{cfg.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 text-[#7c7266] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Cerca in ${cfg.title.toLowerCase()}...`}
              className="w-full bg-[#1b1815] border border-[#342e27] rounded-lg pl-9 pr-3.5 py-2 text-sm text-[#ede8e0] placeholder-[#736a5e] focus:outline-none focus:border-[#d4af37]"
            />
          </div>

          <button
            type="button"
            onClick={onCreate}
            className="px-4 py-2 bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] font-semibold text-sm rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{cfg.newLabel}</span>
          </button>
        </div>
      </div>

      {cfg.f3Opts.length > 0 && (
        <div className="flex items-center gap-1 p-1 bg-[#1b1815] border border-[#2f2923] rounded-lg w-fit max-w-full overflow-x-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-[#2c2620] text-[#f3eee4]'
                : 'text-[#9c9285] hover:text-[#ede8e0]'
            }`}
          >
            Tutti ({entries.length})
          </button>
          {cfg.f3Opts.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setStatusFilter(opt)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === opt
                  ? 'bg-[#2c2620] text-[#f3eee4]'
                  : 'text-[#9c9285] hover:text-[#ede8e0]'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-[#1b1815] border border-dashed border-[#342e27] rounded-xl p-10 text-center space-y-3">
          <p className="text-sm text-[#a59b8e]">
            {entries.length === 0 ? cfg.emptyText : 'Nessuna scheda corrisponde ai filtri attivi.'}
          </p>
          {entries.length === 0 && (
            <button
              type="button"
              onClick={onCreate}
              className="px-4 py-2 bg-[#26211c] hover:bg-[#312b25] border border-[#3a332b] text-sm font-semibold text-[#ede8e0] rounded-lg transition-colors cursor-pointer"
            >
              {cfg.newLabel}
            </button>
          )}
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 gap-4 ${
            category === 'quests' ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'
          }`}
        >
          {filtered.map((item) => {
            const { colorClass, Icon } = getStatusTone(item.status || '');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onEdit(item)}
                className="text-left bg-[#1b1815] hover:bg-[#221e1a] border border-[#2f2923] hover:border-[#d4af37]/45 rounded-xl p-5 transition-colors cursor-pointer flex flex-col gap-3"
              >
                {item.image && (
                  <div className="w-full h-36 rounded-lg overflow-hidden bg-[#12100e] border border-[#2c2620]">
                    <img
                      src={item.image}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <h3 className="font-display font-bold text-base text-[#f3eee4] leading-snug">
                    {item.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    {item.status && (
                      <span className={`inline-flex items-center gap-1 font-medium ${colorClass}`}>
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{item.status}</span>
                      </span>
                    )}
                    {item.status && item.role && (
                      <span className="text-[#5d544a]" aria-hidden="true">
                        ·
                      </span>
                    )}
                    {item.role && <span className="text-[#c5b699]">{item.role}</span>}
                  </div>
                </div>

                <p className="text-xs text-[#b9afa2] leading-relaxed line-clamp-4 whitespace-pre-line">
                  {item.desc}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
