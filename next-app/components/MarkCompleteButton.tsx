'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

export default function MarkCompleteButton({
  courseId,
  labId,
}: {
  courseId: string;
  labId: string;
}) {
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleClick = async () => {
    setSubmitting(true);
    try {
      const result = await api.courses.completeLab(courseId, labId);
      if (result.status === 'ok') setCompleted(true);
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  if (completed) {
    return (
      <span className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-sm text-accent">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
        Completed
      </span>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={submitting}
      className="rounded-lg bg-accent px-6 py-2 text-sm font-semibold text-bg transition hover:bg-accent/90 disabled:opacity-50"
    >
      {submitting ? 'Marking...' : 'Mark as Complete'}
    </button>
  );
}
