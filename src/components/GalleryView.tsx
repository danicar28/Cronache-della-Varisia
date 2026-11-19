import React, { useState } from 'react';
import { Image as ImageIcon, Trash2, Upload, X } from 'lucide-react';
import type { GalleryImage } from '../types';

interface GalleryViewProps {
  images: GalleryImage[];
  onUploadFiles: (files: FileList) => Promise<void>;
  onDeleteImage: (id: string) => Promise<void>;
  isUploading: boolean;
}

export const GalleryView: React.FC<GalleryViewProps> = ({
  images,
  onUploadFiles,
  onDeleteImage,
  isUploading,
}) => {
  const [lightboxSrc, setLightboxSrc] = useState<{ title: string; url: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await onUploadFiles(e.target.files);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-[#d4af37]">
            Galleria Immagini &amp; Mappe
          </h2>
          <p className="text-xs text-[#a59b8e]">
            Mappe tattiche, ritratti dei personaggi e reperti visivi condivisi con il party.
          </p>
        </div>

        <label className="px-4 py-2 bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] font-semibold text-sm rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0">
          <Upload className="w-4 h-4" />
          <span>{isUploading ? 'Caricamento...' : 'Carica immagine'}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={isUploading}
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      </div>

      {images.length === 0 ? (
        <div className="bg-[#1b1815] border border-dashed border-[#342e27] rounded-xl p-12 text-center space-y-3">
          <ImageIcon className="w-8 h-8 text-[#6e6459] mx-auto" />
          <p className="text-sm text-[#a59b8e]">
            Nessuna immagine salvata. Puoi caricare mappe o incollare immagini dal tuo Google Doc.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {images.map((img) => (
            <div
              key={img.id}
              className="bg-[#1b1815] border border-[#2f2923] rounded-xl overflow-hidden flex flex-col"
            >
              <button
                type="button"
                onClick={() => setLightboxSrc({ title: img.title, url: img.dataUrl })}
                className="h-52 w-full bg-[#12100e] overflow-hidden cursor-zoom-in block"
              >
                <img
                  src={img.dataUrl}
                  alt={img.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                />
              </button>

              <div className="px-4 py-3 border-t border-[#2b251f] flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-[#ede8e0] truncate">{img.title}</span>
                {confirmDeleteId === img.id ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        await onDeleteImage(img.id);
                        setConfirmDeleteId(null);
                      }}
                      className="text-xs text-rose-400 font-semibold hover:underline cursor-pointer"
                    >
                      Conferma
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs text-[#9c9285] hover:text-[#ede8e0] cursor-pointer"
                    >
                      Annulla
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={`Elimina ${img.title}`}
                    onClick={() => setConfirmDeleteId(img.id)}
                    className="text-[#8f8578] hover:text-rose-400 transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6 cursor-zoom-out"
        >
          <div className="max-w-5xl w-full flex justify-end mb-3">
            <button
              type="button"
              onClick={() => setLightboxSrc(null)}
              className="p-2 rounded-lg bg-[#1b1815] border border-[#342e27] text-[#ede8e0] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <img
            src={lightboxSrc.url}
            alt={lightboxSrc.title}
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[82vh] rounded-lg border border-[#342e27]"
          />
          <p className="mt-3 text-xs text-[#b9afa2]">{lightboxSrc.title}</p>
        </div>
      )}
    </div>
  );
};
