'use client';

interface TaskProgressProps {
  currentIndex: number;
  total: number;
  completed: boolean;
}

export default function TaskProgress({ currentIndex, total, completed }: TaskProgressProps) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {completed ? (
        <div className="flex items-center gap-2 text-emerald-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span className="text-sm font-medium">All tasks complete</span>
        </div>
      ) : (
        <>
          <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${((currentIndex) / total) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted whitespace-nowrap">
            {currentIndex + 1} of {total}
          </span>
        </>
      )}
    </div>
  );
}
