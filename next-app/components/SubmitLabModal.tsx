'use client';

interface SubmitLabModalProps {
  open: boolean;
  submitting: boolean;
  error: string | null;
  labTitle: string;
  onSubmit: () => void;
  onClose: () => void;
}

export default function SubmitLabModal({
  open,
  submitting,
  error,
  labTitle,
  onSubmit,
  onClose,
}: SubmitLabModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 backdrop-blur-[2px]"
      role="presentation"
    >
      <div
        className="w-full max-w-lg border border-line bg-panel shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-lab-title"
      >
        <div className="flex items-center justify-between border-b border-line bg-bg/50 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          <span>Lab session</span>
          <span className="text-emerald-400">complete</span>
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-emerald-400/30 bg-emerald-400/10 text-emerald-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <h2 id="submit-lab-title" className="text-base font-semibold text-text">
                All tasks verified
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {labTitle} is ready to submit. Submitting ends this session and removes its lab environment.
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-5 border border-rose-500/25 bg-rose-500/10 px-3 py-2.5">
              <p className="font-mono text-xs leading-relaxed text-rose-300">{error}</p>
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <button
              onClick={onClose}
              disabled={submitting}
              className="border border-line bg-transparent px-4 py-2 text-sm text-muted transition-colors hover:border-accent/40 hover:text-text disabled:opacity-50"
            >
              Keep working
            </button>
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="flex items-center justify-center gap-2 border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-400/20 disabled:opacity-50"
            >
              {submitting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />}
              {submitting ? 'Submitting...' : 'Submit and end session'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
