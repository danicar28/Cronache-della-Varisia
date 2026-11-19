import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let displayMsg = error.message || 'Errore imprevisto nell’applicazione.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; path?: string };
      if (parsed.error) {
        displayMsg = `Errore database (${parsed.path || 'archivio'}): ${parsed.error}`;
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, message: displayMsg };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#12100e] text-[#ede8e0] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#1b1815] border border-[#3a332c] rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="font-display text-lg font-bold">Si è verificato un errore</h2>
            </div>
            <p className="text-sm text-[#b9afa2] leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#d4af37] hover:bg-[#e1be4d] text-[#12100e] font-semibold text-sm rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Ricarica applicazione</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
