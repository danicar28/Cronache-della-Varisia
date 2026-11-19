import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Trash2, X } from 'lucide-react';
import {
  CATEGORY_CONFIG,
  FIELD_LIMITS,
  type WikiCategory,
  type WikiEntry,
} from '../types';
import { compressImageFile } from '../utils/campaignUtils';

interface EntryModalProps {
  isOpen: boolean;
  category: WikiCategory;
  entry: WikiEntry | null;
  defaultOrder: number;
  onClose: () => void;
  onSave: (
    payload: {
      category: WikiCategory;
      name: string;
      role: string;
      status: string;
      desc: string;
      order?: number | null;
      image?: string | null;
    },
    entryId?: string
  ) => Promise<void>;
  onDelete: (entryId: string) => Promise<void>;
}

export const EntryModal: React.FC<EntryModalProps> = ({
  isOpen,
  category,
  entry,
  defaultOrder,
  onClose,
  onSave,
  onDelete,
}) => {
  const cfg = CATEGORY_CONFIG[category];
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [desc, setDesc] = useState('');
  const [order, setOrder] = useState<number>(defaultOrder);
  const [image, setImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(entry?.name || '');
    setRole(entry?.role || '');
    setStatus(entry?.status || (cfg.f3Opts[0] ?? ''));
    setDesc(entry?.desc || '');
    setOrder(entry?.order ?? defaultOrder);
    setImage(entry?.image || null);
    setConfirmDelete(false);
    setError(null);
  }, [isOpen, entry, category, defaultOrder, cfg.f3Opts]);

  if (!isOpen) return null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageFile(
        file,
        720,
        0.74,
        FIELD_LIMITS.entryImageMax - 2000
      );
      setImage(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore caricamento immagine.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Il nome è obbligatorio.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSave(
        {
          category,
          name: name.trim().slice(0, FIELD_LIMITS.entryNameMax),
          role: role.trim().slice(0, FIELD_LIMITS.entryRoleMax),
          status: cfg.f3Label ? status.slice(0, FIELD_LIMITS.entryStatusMax) : '',
          desc: desc.trim().slice(0, FIELD_LIMITS.entryDescMax),
          order: category === 'timeline' ? order : null,
          image,
        },
        entry?.id
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore durante il salvataggio.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#1b1815] border border-[#3a332b] rounded-xl max-w-lg w-full p-6 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between pb-3 border-b border-[#2b251f]">
          <h3 className="font-display text-lg font-bold text-[#d4af37]">
            {entry ? `Modifica ${cfg.singular}` : `Nuova ${cfg.singular}`}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9c9285] hover:text-[#ede8e0] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="py-4 space-y-3.5 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-medium text-[#b9afa2] mb-1">{cfg.f1}</label>
            <input
              type="text"
              required
              maxLength={FIELD_LIMITS.entryNameMax}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#12100e] border border-[#342e27] rounded-lg px-3.5 py-2 text-sm text-[#ede8e0] focus:outline-none focus:border-[#d4af37]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#b9afa2] mb-1">{cfg.f2}</label>
            <input
              type="text"
              maxLength={FIELD_LIMITS.entryRoleMax}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-[#12100e] border border-[#342e27] rounded-lg px-3.5 py-2 text-sm text-[#ede8e0] focus:outline-none focus:border-[#d4af37]"
            />
          </div>

          {category === 'timeline' && (
            <div>
              <label className="block text-xs font-medium text-[#b9afa2] mb-1">
                Ordine nella timeline (1, 2, 3…)
              </label>
              <input
                type="number"
                min={0}
                max={100000}
                value={order}
                onChange={(e) => setOrder(Number(e.target.value) || 1)}
                className="w-full bg-[#12100e] border border-[#342e27] rounded-lg px-3.5 py-2 text-sm text-[#ede8e0] font-mono tabular-nums focus:outline-none focus:border-[#d4af37]"
              />
            </div>
          )}

          {cfg.f3Label && (
            <div>
              <label className="block text-xs font-medium text-[#b9afa2] mb-1">
                {cfg.f3Label}
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-[#12100e] border border-[#342e27] rounded-lg px-3.5 py-2 text-sm text-[#ede8e0] focus:outline-none focus:border-[#d4af37]"
              >
                {cfg.f3Opts.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#b9afa2] mb-1">
              Descrizione e note
            </label>
            <textarea
              rows={4}
              required
              maxLength={FIELD_LIMITS.entryDescMax}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full bg-[#12100e] border border-[#342e27] rounded-lg px-3.5 py-2 text-sm text-[#ede8e0] focus:outline-none focus:border-[#d4af37]"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-[#b9afa2]">
              Immagine scheda (opzionale)
            </label>
            <div className="flex items-center gap-3">
              <label className="px-3 py-1.5 bg-[#26211c] hover:bg-[#312b25] border border-[#3a332b] text-xs text-[#ede8e0] rounded-lg cursor-pointer inline-flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Scegli file</span>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
              {image && (
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  className="text-xs text-rose-400 hover:underline cursor-pointer"
                >
                  Rimuovi immagine
                </button>
              )}
            </div>
            {image && (
              <img
                src={image}
                alt="Anteprima scheda"
                className="mt-2 max-h-32 rounded-lg border border-[#342e27] object-cover"
              />
            )}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-[#2c1517] border border-[#74282e] text-xs text-[#f3b6ba]">
              {error}
            </div>
          )}

          <div className="pt-3 border-t border-[#2b251f] flex items-center justify-between gap-2">
            {entry ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={async () => {
                      setIsSubmitting(true);
                      await onDelete(entry.id);
                      setIsSubmitting(false);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-rose-900 hover:bg-rose-800 text-xs font-semibold text-white cursor-pointer"
                  >
                    Conferma eliminazione
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs text-[#9c9285] hover:text-[#ede8e0] cursor-pointer"
                  >
                    Annulla
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-1.5 rounded-lg bg-[#2b1a1b] hover:bg-[#3a2022] border border-[#6e3236] text-xs font-medium text-rose-300 flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Elimina</span>
                </button>
              )
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-[#26211c] hover:bg-[#312b25] text-xs font-medium text-[#d6cec2] cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
