import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ClipboardPaste,
  FileText,
  FolderSync,
  Link2,
  Loader2,
  Search,
  Unlink,
  Wand2,
  X,
} from 'lucide-react';
import type { Campaign, DriveFileItem } from '../types';
import {
  DriveAuthExpiredError,
  extractGoogleFileId,
  fetchDriveDocumentContent,
  formatDriveMimeLabel,
  listDriveCampaignDocs,
} from '../services/driveService';
import { compressDataUrl } from '../utils/campaignUtils';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: Campaign;
  accessToken: string | null;
  onReauthorizeDrive: () => Promise<string | null>;
  onSaveImportedDiary: (
    text: string,
    stagedImages: Array<{ title: string; dataUrl: string }>,
    runAi: boolean,
    driveMeta?: { fileId: string; fileName: string } | null
  ) => Promise<void>;
  onDisconnectDrive: () => Promise<void>;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  campaign,
  accessToken,
  onReauthorizeDrive,
  onSaveImportedDiary,
  onDisconnectDrive,
}) => {
  const [mode, setMode] = useState<'drive' | 'paste'>('drive');
  const [driveSearch, setDriveSearch] = useState('');
  const [driveUrlInput, setDriveUrlInput] = useState('');
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isImportingDrive, setIsImportingDrive] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [runAiAfterDrive, setRunAiAfterDrive] = useState(true);

  const pasteRef = useRef<HTMLDivElement | null>(null);
  const [pasteTextLen, setPasteTextLen] = useState(0);
  const [stagedImages, setStagedImages] = useState<Array<{ title: string; dataUrl: string }>>([]);
  const [isSavingPaste, setIsSavingPaste] = useState(false);

  const loadDriveFiles = async (token: string, query = '') => {
    setIsLoadingFiles(true);
    setDriveError(null);
    try {
      const files = await listDriveCampaignDocs(token, query);
      setDriveFiles(files);
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        setDriveError(err.message);
      } else {
        setDriveError(err instanceof Error ? err.message : 'Errore durante la lettura di Drive.');
      }
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (isOpen && mode === 'drive' && accessToken) {
      loadDriveFiles(accessToken, driveSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, accessToken]);

  if (!isOpen) return null;

  const handleAuthorizeDrive = async () => {
    setDriveError(null);
    try {
      const token = await onReauthorizeDrive();
      if (token) {
        await loadDriveFiles(token, driveSearch);
      }
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : 'Autorizzazione non completata.');
    }
  };

  const handleSelectDriveFile = async (fileId: string) => {
    let token = accessToken;
    if (!token) {
      token = await onReauthorizeDrive();
    }
    if (!token) return;

    setIsImportingDrive(true);
    setDriveError(null);
    try {
      const result = await fetchDriveDocumentContent(token, fileId);
      if (!result.text) {
        throw new Error('Il documento selezionato sembra vuoto.');
      }
      await onSaveImportedDiary(result.text, result.images, runAiAfterDrive, {
        fileId: result.id,
        fileName: result.name,
      });
      onClose();
    } catch (err) {
      if (err instanceof DriveAuthExpiredError) {
        setDriveError(err.message);
      } else {
        setDriveError(err instanceof Error ? err.message : 'Errore importazione da Drive.');
      }
    } finally {
      setIsImportingDrive(false);
    }
  };

  const handleImportByUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractGoogleFileId(driveUrlInput);
    if (!id) {
      setDriveError('Inserisci un link valido di Google Docs / Drive oppure l’ID del documento.');
      return;
    }
    await handleSelectDriveFile(id);
  };

  const handlePasteEvent = () => {
    setTimeout(async () => {
      const area = pasteRef.current;
      if (!area) return;
      const imgs = Array.from(area.querySelectorAll('img'));
      const collected: Array<{ title: string; dataUrl: string }> = [];
      for (let i = 0; i < imgs.length; i++) {
        const src = imgs[i].src;
        if (src && src.startsWith('data:image')) {
          try {
            const compressed = await compressDataUrl(src, 960, 0.76, 400000);
            collected.push({ title: `Immagine Diario #${i + 1}`, dataUrl: compressed });
          } catch {
            // skip unreadable image
          }
        }
      }
      setStagedImages(collected);
      setPasteTextLen(area.innerText.trim().length);
    }, 120);
  };

  const handleSavePaste = async (runAi: boolean) => {
    const text = pasteRef.current?.innerText.trim() || '';
    if (!text && stagedImages.length === 0) {
      return;
    }
    setIsSavingPaste(true);
    try {
      await onSaveImportedDiary(text || campaign.diaryText, stagedImages, runAi, null);
      onClose();
    } finally {
      setIsSavingPaste(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#1b1815] border border-[#3a332b] rounded-xl max-w-2xl w-full p-6 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between pb-4 border-b border-[#2b251f]">
          <h3 className="font-display text-lg font-bold text-[#d4af37] flex items-center gap-2">
            <FolderSync className="w-5 h-5" />
            <span>Collega Google Drive o Importa Diario</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9c9285] hover:text-[#ede8e0] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="mt-4 flex items-center gap-1 p-1 bg-[#12100e] border border-[#2f2923] rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setMode('drive')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              mode === 'drive'
                ? 'bg-[#2a241e] text-[#f3eee4]'
                : 'text-[#9c9285] hover:text-[#ede8e0]'
            }`}
          >
            <FolderSync className="w-3.5 h-3.5 text-[#d4af37]" />
            <span>Collega Google Drive</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('paste')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              mode === 'paste'
                ? 'bg-[#2a241e] text-[#f3eee4]'
                : 'text-[#9c9285] hover:text-[#ede8e0]'
            }`}
          >
            <ClipboardPaste className="w-3.5 h-3.5 text-[#d4af37]" />
            <span>Incolla Testo e Immagini</span>
          </button>
        </div>

        {mode === 'drive' ? (
          <div className="py-4 space-y-4 overflow-y-auto flex-1">
            {campaign.driveFileId && (
              <div className="p-3.5 rounded-lg bg-[#231f1a] border border-[#d4af37]/30 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-[#a59b8e]">Documento attualmente collegato:</p>
                  <p className="text-sm font-medium text-[#ede8e0] truncate">
                    {campaign.driveFileName || campaign.driveFileId}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onDisconnectDrive}
                  className="px-3 py-1.5 rounded-md bg-[#2b1a1b] hover:bg-[#3a2022] border border-[#6e3236] text-xs text-rose-300 flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Scollega</span>
                </button>
              </div>
            )}

            {!accessToken ? (
              <div className="bg-[#12100e] border border-[#2f2923] rounded-lg p-6 text-center space-y-3">
                <p className="text-sm text-[#cbc2b6]">
                  Per sfogliare e sincronizzare il documento dal tuo Google Drive è necessario
                  concedere il permesso in sola lettura per questa sessione.
                </p>
                <button
                  type="button"
                  onClick={handleAuthorizeDrive}
                  className="px-4 py-2.5 bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] font-semibold text-sm rounded-lg transition-colors cursor-pointer"
                >
                  Autorizza accesso a Google Drive
                </button>
              </div>
            ) : (
              <>
                <form onSubmit={handleImportByUrl} className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#b9afa2]">
                    Incolla il link di Google Drive (Google Doc, file Word .docx o testo)
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Link2 className="w-4 h-4 text-[#7c7266] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={driveUrlInput}
                        onChange={(e) => setDriveUrlInput(e.target.value)}
                        placeholder="https://drive.google.com/file/d/... oppure docs.google.com/document/d/..."
                        className="w-full bg-[#12100e] border border-[#342e27] rounded-lg pl-9 pr-3 py-2 text-sm text-[#ede8e0] placeholder-[#6e6459] focus:outline-none focus:border-[#d4af37]"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isImportingDrive || !driveUrlInput.trim()}
                      className="px-4 py-2 bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] font-semibold text-sm rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      Collega URL
                    </button>
                  </div>
                </form>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-[#b9afa2]">
                      Oppure scegli dai tuoi file recenti (Google Docs, .docx, .txt, .md)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-[#7c7266] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={driveSearch}
                          onChange={(e) => setDriveSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              loadDriveFiles(accessToken, driveSearch);
                            }
                          }}
                          placeholder="Filtra per nome..."
                          className="bg-[#12100e] border border-[#342e27] rounded-md pl-8 pr-2.5 py-1 text-xs text-[#ede8e0] focus:outline-none focus:border-[#d4af37]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => loadDriveFiles(accessToken, driveSearch)}
                        className="px-2.5 py-1 bg-[#26211c] hover:bg-[#312b25] border border-[#3a332b] text-xs text-[#ede8e0] rounded-md cursor-pointer"
                      >
                        Cerca
                      </button>
                    </div>
                  </div>

                  <div className="border border-[#2f2923] rounded-lg divide-y divide-[#2b251f] max-h-56 overflow-y-auto bg-[#12100e]">
                    {isLoadingFiles ? (
                      <div className="p-6 text-center text-xs text-[#a59b8e] flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-[#d4af37]" />
                        <span>Caricamento file da Google Drive...</span>
                      </div>
                    ) : driveFiles.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#8f8578]">
                        Nessun Google Doc, file Word (.docx) o testo trovato. Prova a cercare per nome o incolla il link qui sopra.
                      </div>
                    ) : (
                      driveFiles.map((file) => {
                        const isLinked = campaign.driveFileId === file.id;
                        const mimeLabel = formatDriveMimeLabel(file);
                        const dateLabel = file.modifiedTime
                          ? new Date(file.modifiedTime).toLocaleDateString('it-IT')
                          : null;
                        return (
                          <div
                            key={file.id}
                            className="px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-[#1b1815]"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileText className="w-4 h-4 text-[#d4af37] shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm text-[#ede8e0] truncate">{file.name}</p>
                                <p className="text-[11px] text-[#8f8578] font-mono tabular-nums">
                                  {dateLabel ? `${mimeLabel} · ${dateLabel}` : mimeLabel}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={isImportingDrive}
                              onClick={() => handleSelectDriveFile(file.id)}
                              className="px-3 py-1.5 rounded-md bg-[#26211c] hover:bg-[#d4af37] hover:text-[#12100e] border border-[#3a332b] text-xs font-medium text-[#ede8e0] transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 flex items-center gap-1"
                            >
                              {isLinked && <Check className="w-3.5 h-3.5" />}
                              <span>{isLinked ? 'Risincronizza' : 'Collega'}</span>
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-[#cbc2b6] cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={runAiAfterDrive}
                    onChange={(e) => setRunAiAfterDrive(e.target.checked)}
                    className="accent-[#d4af37]"
                  />
                  <span>Estrai automaticamente PNG, luoghi, missioni e timeline con il Bardo AI dopo il collegamento</span>
                </label>
              </>
            )}

            {driveError && (
              <div className="p-3 rounded-lg bg-[#2c1517] border border-[#74282e] text-xs text-[#f3b6ba] space-y-2">
                <p>{driveError}</p>
                {driveError.includes('scaduta') && (
                  <button
                    type="button"
                    onClick={handleAuthorizeDrive}
                    className="underline font-semibold text-[#f3d67d] cursor-pointer"
                  >
                    Riconnetti Google Drive
                  </button>
                )}
              </div>
            )}

            {isImportingDrive && (
              <div className="p-3 rounded-lg bg-[#231f1a] border border-[#d4af37]/30 text-xs text-[#e8d59a] flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>
                  {runAiAfterDrive
                    ? 'Sincronizzazione da Drive ed estrazione Wiki AI in corso (per riassunti molto lunghi può richiedere circa 1 minuto)...'
                    : 'Scaricamento e salvataggio del documento da Google Drive in corso...'}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="py-4 space-y-4 overflow-y-auto flex-1">
            <div className="bg-[#12100e] border border-[#2f2923] rounded-lg p-3.5 text-xs text-[#b9afa2] space-y-1">
              <p className="font-semibold text-[#d4af37]">Come importare testo e immagini insieme:</p>
              <p>1. Apri il tuo documento e premi Ctrl + A poi Ctrl + C.</p>
              <p>2. Clicca nel riquadro qui sotto e premi Ctrl + V: testo e immagini verranno estratti insieme.</p>
            </div>

            <div
              ref={pasteRef}
              contentEditable
              onPaste={handlePasteEvent}
              onInput={() => setPasteTextLen(pasteRef.current?.innerText.trim().length || 0)}
              className="w-full min-h-[180px] max-h-[260px] overflow-y-auto bg-[#12100e] border border-[#342e27] rounded-lg p-3.5 text-sm text-[#ede8e0] focus:outline-none focus:border-[#d4af37]"
            />

            {(pasteTextLen > 0 || stagedImages.length > 0) && (
              <div className="flex items-center justify-between bg-[#15241b] border border-[#28543a] rounded-lg px-3.5 py-2 text-xs text-emerald-300">
                <span className="font-mono tabular-nums">
                  Rilevati {pasteTextLen.toLocaleString('it-IT')} caratteri e {stagedImages.length} immagini
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (pasteRef.current) pasteRef.current.innerHTML = '';
                    setPasteTextLen(0);
                    setStagedImages([]);
                  }}
                  className="underline cursor-pointer"
                >
                  Svuota
                </button>
              </div>
            )}

            <div className="pt-2 flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-[#26211c] hover:bg-[#312b25] text-xs font-medium text-[#d6cec2] cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={isSavingPaste || (pasteTextLen === 0 && stagedImages.length === 0)}
                onClick={() => handleSavePaste(false)}
                className="px-4 py-2 rounded-lg bg-[#2e2822] hover:bg-[#3a332b] text-xs font-semibold text-[#ede8e0] cursor-pointer disabled:opacity-50"
              >
                Salva nel Compendio
              </button>
              <button
                type="button"
                disabled={isSavingPaste || (pasteTextLen === 0 && stagedImages.length === 0)}
                onClick={() => handleSavePaste(true)}
                className="px-4 py-2 rounded-lg bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>Salva e Analizza con AI</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
