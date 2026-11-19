import React, { useState } from 'react';
import { Check, Copy, LogOut, Plus, Trash2, Users, X } from 'lucide-react';
import type { Campaign, UserMembership } from '../types';

interface CampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberships: UserMembership[];
  activeCampaign: Campaign | null;
  onSelectCampaign: (campaignId: string) => void;
  onCreateCampaign: (name: string, system: string) => Promise<void>;
  onJoinCampaign: (inviteCode: string) => Promise<void>;
  onDeleteCampaign: (campaignId: string, campaignName: string) => Promise<void>;
  onLeaveCampaign: (campaignId: string, campaignName: string) => Promise<void>;
}

export const CampaignModal: React.FC<CampaignModalProps> = ({
  isOpen,
  onClose,
  memberships,
  activeCampaign,
  onSelectCampaign,
  onCreateCampaign,
  onJoinCampaign,
  onDeleteCampaign,
  onLeaveCampaign,
}) => {
  const [newName, setNewName] = useState('');
  const [newSystem, setNewSystem] = useState('Pathfinder 2E');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const inviteUrl = activeCampaign
    ? `${window.location.origin}/?join=${encodeURIComponent(activeCampaign.inviteCode)}`
    : '';

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsBusy(true);
    setError(null);
    try {
      await onCreateCampaign(newName.trim(), newSystem.trim() || 'Pathfinder 2E');
      setNewName('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore creazione campagna.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setIsBusy(true);
    setError(null);
    try {
      const cleaned = joinCode.includes('join=')
        ? joinCode.split('join=').pop()?.split('&')[0] || joinCode
        : joinCode;
      await onJoinCampaign(cleaned.trim());
      setJoinCode('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile unirsi alla campagna.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmRemove = async (m: UserMembership) => {
    setIsBusy(true);
    setError(null);
    try {
      if (m.role === 'gm') {
        await onDeleteCampaign(m.campaignId, m.campaignName);
      } else {
        await onLeaveCampaign(m.campaignId, m.campaignName);
      }
      setConfirmingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile rimuovere la campagna.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#1b1815] border border-[#3a332b] rounded-xl max-w-xl w-full p-6 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between pb-3 border-b border-[#2b251f]">
          <h3 className="font-display text-lg font-bold text-[#d4af37] flex items-center gap-2">
            <Users className="w-5 h-5" />
            <span>Campagne &amp; Inviti del Party</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#9c9285] hover:text-[#ede8e0] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-6 overflow-y-auto flex-1">
          {/* Active Campaign Invite Link */}
          {activeCampaign && (
            <div className="bg-[#12100e] border border-[#2f2923] rounded-lg p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#d4af37]">
                  Invita i tuoi giocatori in «{activeCampaign.name}»
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(activeCampaign.inviteCode);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="text-xs font-mono text-[#ede8e0] hover:text-[#d4af37] cursor-pointer"
                  title="Copia solo il codice invito"
                >
                  Codice: {activeCampaign.inviteCode}
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteUrl}
                  className="flex-1 bg-[#1b1815] border border-[#342e27] rounded-md px-3 py-1.5 text-xs font-mono text-[#b9afa2]"
                />
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="px-3 py-1.5 rounded-md bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiato' : 'Copia link'}</span>
                </button>
              </div>
              <p className="text-[11px] text-[#8f8578] leading-relaxed">
                Condividi con il party l’URL pubblico dell’app (pulsante Share/Condividi in alto) e
                questo codice invito: i giocatori accedono con il loro account Google senza dover
                collegare il tuo Drive.
              </p>
            </div>
          )}

          {/* Switch / Manage Campaigns */}
          {memberships.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[#b9afa2]">Le tue campagne</p>
              <div className="divide-y divide-[#2b251f] border border-[#2f2923] rounded-lg overflow-hidden bg-[#12100e]">
                {memberships.map((m) => {
                  const isCurrent = activeCampaign?.id === m.campaignId;
                  const isConfirming = confirmingId === m.campaignId;
                  const isGm = m.role === 'gm';

                  if (isConfirming) {
                    return (
                      <div
                        key={m.campaignId}
                        className="px-4 py-2.5 bg-[#241516] flex items-center justify-between gap-3"
                      >
                        <p className="text-xs text-[#f3b6ba] truncate">
                          {isGm
                            ? `Eliminare definitivamente «${m.campaignName}» e tutte le schede?`
                            : `Abbandonare la campagna «${m.campaignName}»?`}
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmingId(null)}
                            className="px-2.5 py-1 rounded bg-[#26211c] hover:bg-[#312b25] text-xs text-[#d6cec2] cursor-pointer disabled:opacity-50"
                          >
                            Annulla
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleConfirmRemove(m)}
                            className="px-2.5 py-1 rounded bg-[#74282e] hover:bg-[#8d3138] text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
                          >
                            {isBusy ? 'Attendere...' : isGm ? 'Elimina' : 'Abbandona'}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={m.campaignId}
                      className={`flex items-center justify-between gap-2 transition-colors ${
                        isCurrent ? 'bg-[#241f18]' : 'hover:bg-[#1b1815]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectCampaign(m.campaignId);
                          onClose();
                        }}
                        className="flex-1 min-w-0 px-4 py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer"
                      >
                        <span className="text-sm font-medium text-[#ede8e0] truncate">
                          {m.campaignName}
                        </span>
                        <span className="text-xs text-[#9c9285] shrink-0">
                          {isGm ? 'Game Master' : 'Giocatore'}
                          {isCurrent ? ' · Attiva' : ''}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setError(null);
                          setConfirmingId(m.campaignId);
                        }}
                        title={isGm ? 'Elimina campagna' : 'Abbandona campagna'}
                        aria-label={isGm ? `Elimina ${m.campaignName}` : `Abbandona ${m.campaignName}`}
                        className="mr-2.5 p-1.5 rounded-md text-[#8f8578] hover:text-rose-300 hover:bg-[#2c1517] transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        {isGm ? <Trash2 className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Join by Code */}
          <form onSubmit={handleJoin} className="space-y-2 pt-2 border-t border-[#2b251f]">
            <label className="block text-xs font-medium text-[#b9afa2]">
              Unisciti a una campagna esistente (codice invito o link)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Es. OTARI77K"
                className="flex-1 bg-[#12100e] border border-[#342e27] rounded-lg px-3.5 py-2 text-sm text-[#ede8e0] font-mono placeholder-[#6e6459] focus:outline-none focus:border-[#d4af37]"
              />
              <button
                type="submit"
                disabled={isBusy || !joinCode.trim()}
                className="px-4 py-2 bg-[#26211c] hover:bg-[#312b25] border border-[#3a332b] text-xs font-semibold text-[#ede8e0] rounded-lg cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                Entra
              </button>
            </div>
          </form>

          {/* Create New Campaign */}
          <form onSubmit={handleCreate} className="space-y-2.5 pt-2 border-t border-[#2b251f]">
            <label className="block text-xs font-medium text-[#b9afa2]">
              Crea una nuova campagna
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome campagna (es. Cripta di Gauntlight)"
                className="sm:col-span-2 bg-[#12100e] border border-[#342e27] rounded-lg px-3.5 py-2 text-sm text-[#ede8e0] placeholder-[#6e6459] focus:outline-none focus:border-[#d4af37]"
              />
              <input
                type="text"
                value={newSystem}
                onChange={(e) => setNewSystem(e.target.value)}
                placeholder="Sistema"
                className="bg-[#12100e] border border-[#342e27] rounded-lg px-3.5 py-2 text-sm text-[#ede8e0] focus:outline-none focus:border-[#d4af37]"
              />
            </div>
            <button
              type="submit"
              disabled={isBusy || !newName.trim()}
              className="px-4 py-2 bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] text-xs font-bold rounded-lg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crea campagna</span>
            </button>
          </form>

          {error && (
            <div className="p-3 rounded-lg bg-[#2c1517] border border-[#74282e] text-xs text-[#f3b6ba]">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
