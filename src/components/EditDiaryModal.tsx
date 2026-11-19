import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { FIELD_LIMITS } from '../types';

interface EditDiaryModalProps {
  isOpen: boolean;
  initialText: string;
  onClose: () => void;
  onSave: (newText: string) => Promise<void>;
}

export const EditDiaryModal: React.FC<EditDiaryModalProps> = ({
  isOpen,
  initialText,
  onClose,
  onSave,
}) => {
  const [text, setText] = useState(initialText);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setText(initialText);
    }
  }, [isOpen, initialText]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(text.slice(0, FIELD_LIMITS.diaryTextMax));
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-[#1b1815] border border-[#3a332b] rounded-xl max-w-3xl w-full p-6 flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#2b251f]">
          <h3 className="font-display text-lg font-bold text-[#d4af37]">
            Modifica Testo del Diario
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9c9285] hover:text-[#ede8e0] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 flex-1 flex flex-col gap-2">
          <textarea
            rows={15}
            maxLength={FIELD_LIMITS.diaryTextMax}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Sessione 1 - Titolo..."
            className="w-full flex-1 bg-[#12100e] border border-[#342e27] rounded-lg p-3.5 text-sm text-[#ede8e0] leading-relaxed focus:outline-none focus:border-[#d4af37]"
          />
          <p className="text-[11px] text-[#8f8578] font-mono tabular-nums text-right">
            {text.length.toLocaleString('it-IT')} / {FIELD_LIMITS.diaryTextMax.toLocaleString('it-IT')} caratteri
          </p>
        </div>

        <div className="pt-3 border-t border-[#2b251f] flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#26211c] hover:bg-[#312b25] text-xs font-medium text-[#d6cec2] cursor-pointer"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2 rounded-lg bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            {isSaving ? 'Salvataggio...' : 'Salva modifiche'}
          </button>
        </div>
      </form>
    </div>
  );
};
