'use client';

import { usePathname } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { useContentUpdate } from '@/lib/content-update-context';

export default function ContentUpdateNotifier() {
  const pathname = usePathname();
  const { hasUpdate, refresh } = useContentUpdate();

  // Keep bottom-right banner only on the homescreen / dashboard
  const isHomeScreen = pathname === '/' || pathname === '/dashboard';

  if (!hasUpdate || !isHomeScreen) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-sky-500/30 bg-[#12141a]/95 p-3.5 px-4 text-xs shadow-2xl text-zinc-200 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 select-none">
      <RefreshCw className="h-4 w-4 text-sky-400 shrink-0" />
      <span className="font-sans text-zinc-300">
        Curriculum updated. Refresh to load the latest version.
      </span>
      <button
        onClick={refresh}
        className="rounded-lg bg-sky-500 px-3 py-1.5 font-medium text-white hover:bg-sky-400 transition-colors cursor-pointer shrink-0 ml-1"
      >
        Refresh
      </button>
    </div>
  );
}
