'use client';

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

export default function ContentUpdateNotifier() {
  const [loadedVersion, setLoadedVersion] = useState<string | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Fetch initial version on mount
    api.content
      .getVersion()
      .then((res) => {
        if (!cancelled && res?.version) {
          setLoadedVersion(res.version);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loadedVersion) return;

    let cancelled = false;

    const checkVersion = () => {
      api.content
        .getVersion()
        .then((res) => {
          if (!cancelled && res?.version && res.version !== loadedVersion) {
            setHasUpdate(true);
          }
        })
        .catch(() => {});
    };

    // Periodically poll version every 60 seconds
    const interval = setInterval(checkVersion, 60000);

    // Check version when browser tab regains focus
    const onFocus = () => checkVersion();
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadedVersion]);

  if (!hasUpdate) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-sky-500/30 bg-[#12141a]/95 p-3.5 px-4 text-xs shadow-2xl text-zinc-200 backdrop-blur-md animate-in fade-in slide-in-from-bottom-3 select-none">
      <RefreshCw className="h-4 w-4 text-sky-400 shrink-0" />
      <span className="font-sans text-zinc-300">
        Curriculum updated. Refresh to load the latest version.
      </span>
      <button
        onClick={() => window.location.reload()}
        className="rounded-lg bg-sky-500 px-3 py-1.5 font-medium text-white hover:bg-sky-400 transition-colors cursor-pointer shrink-0 ml-1"
      >
        Refresh
      </button>
    </div>
  );
}
