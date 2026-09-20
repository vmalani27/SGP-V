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
        className="w-full max-w-lg rounded-xl border border-white/[0.06] bg-[#121316] shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="submit-lab-title"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#0e0f12] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-400">
          <span>Lab Completed</span>
          <span className="text-emerald-400 font-semibold">100%</span>
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <h2 id="submit-lab-title" className="text-base font-semibold text-zinc-100">
                All tasks completed!
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                Great job! You&apos;ve completed all tasks in {labTitle}. Ready to submit?
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-5 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2.5">
              <p className="font-mono text-xs leading-relaxed text-rose-300">{error}</p>
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 border-t border-white/[0.06] pt-4 sm:flex-row sm:justify-end">
            <button
              onClick={onClose}
              disabled={submitting}
              className="border border-white/[0.08] bg-zinc-900/80 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 rounded-lg disabled:opacity-50 cursor-pointer"
            >
              Back to lab
            </button>
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="flex items-center justify-center gap-2 bg-white text-zinc-950 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-200 rounded-lg shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {submitting && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-950 border-t-transparent" />}
              {submitting ? 'Submitting...' : 'Submit Lab'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
