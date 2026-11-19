import React from 'react';
import { BookOpen, FolderSync, Sparkles, Users } from 'lucide-react';

interface LoginScreenProps {
  onSignIn: () => void;
  isSigningIn: boolean;
  error: string | null;
  pendingInviteCode: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onSignIn,
  isSigningIn,
  error,
  pendingInviteCode,
}) => {
  return (
    <div className="min-h-screen bg-[#12100e] text-[#ede8e0] flex items-center justify-center p-6">
      <div className="max-w-3xl w-full bg-[#1b1815] border border-[#2f2923] rounded-xl p-8 sm:p-10 space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-mono tracking-wider text-[#d4af37] uppercase">
            Pathfinder 2E · Compendio di Campagna
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#f5f0e6] text-balance">
            Cronache di Golarion
          </h1>
          <p className="text-base text-[#b9afa2] max-w-2xl leading-relaxed">
            Collega il tuo documento su Google Drive con il riassunto della campagna, condividi
            l’archivio in tempo reale con il party e interroga il Bardo AI su PNG, luoghi,
            missioni e indizi.
          </p>
        </div>

        {pendingInviteCode && (
          <div className="p-4 rounded-lg bg-[#241f18] border border-[#d4af37]/40 text-sm text-[#e8d59a]">
            Hai ricevuto un invito per unirti a una campagna (codice{' '}
            <span className="font-mono font-semibold">{pendingInviteCode}</span>). Accedi con
            Google per entrare subito nel gruppo.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-2 border-t border-[#2b251f]">
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center gap-2 text-[#d4af37] text-sm font-semibold">
              <FolderSync className="w-4 h-4 shrink-0" />
              <span>Google Drive</span>
            </div>
            <p className="text-xs text-[#a59b8e] leading-relaxed">
              Collega direttamente Google Docs o file di testo lunghi e sincronizza le nuove
              sessioni con un clic.
            </p>
          </div>
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center gap-2 text-[#d4af37] text-sm font-semibold">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Bardo &amp; Wiki AI</span>
            </div>
            <p className="text-xs text-[#a59b8e] leading-relaxed">
              Fai domande sulle sessioni passate ed estrai automaticamente schede di PNG, luoghi,
              tesori e timeline.
            </p>
          </div>
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center gap-2 text-[#d4af37] text-sm font-semibold">
              <Users className="w-4 h-4 shrink-0" />
              <span>Party Condiviso</span>
            </div>
            <p className="text-xs text-[#a59b8e] leading-relaxed">
              Invita i tuoi compagni con un link dedicato per modificare schede, note di gruppo e
              galleria mappe insieme.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-lg bg-[#2c1517] border border-[#74282e] text-sm text-[#f3b6ba]">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={onSignIn}
            disabled={isSigningIn}
            className="inline-flex items-center justify-center gap-3 px-5 py-3 bg-white hover:bg-[#f4f4f4] text-[#1f1f1f] font-medium text-sm rounded-lg border border-[#dadce0] transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            <span>{isSigningIn ? 'Accesso in corso...' : 'Sign in with Google'}</span>
          </button>

          <div className="flex items-center gap-2 text-xs text-[#8f8578]">
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>Accesso in sola lettura a Google Drive su tua autorizzazione</span>
          </div>
        </div>
      </div>
    </div>
  );
};
