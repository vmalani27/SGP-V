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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-xl border border-slate-700/50 bg-[#0d121d] p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-lab-title"
      >
        <h2 id="submit-lab-title" className="text-base font-bold tracking-tight text-white font-heading">
          Submit Lab: &ldquo;{labTitle}&rdquo;
        </h2>

        <p className="mt-1.5 text-xs text-slate-400 font-sans leading-relaxed">
          All tasks have been completed. Ready to submit?
        </p>

        {error && (
          <div className="mt-3 rounded border border-rose-500/20 bg-rose-500/[0.04] p-2 text-xs font-mono text-rose-400">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-800/80 pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-slate-700/60 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-800/40 hover:text-slate-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="flex items-center justify-center gap-1.5 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-950 transition-colors hover:bg-white disabled:opacity-50"
          >
            {submitting && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
            )}
            <span>{submitting ? 'Submitting...' : 'Submit'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}