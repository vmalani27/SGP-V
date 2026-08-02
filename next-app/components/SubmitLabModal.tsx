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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-gray-800 bg-[#161b22] p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/30">
          <svg className="h-7 w-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>

        <h2 className="text-xl font-semibold text-white">Lab Complete!</h2>
        <p className="mt-1 text-sm text-muted">
          All tasks in <span className="text-text font-medium">{labTitle}</span> completed successfully.
          Submit to end the session and clean up your lab environment.
        </p>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {submitting && (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {submitting ? 'Submitting...' : 'Submit Lab'}
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-full px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 rounded-lg text-sm font-medium transition-colors"
          >
            Keep working
          </button>
        </div>
      </div>
    </div>
  );
}
