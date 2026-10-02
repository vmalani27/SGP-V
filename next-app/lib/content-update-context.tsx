'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '@/lib/api';

interface ContentUpdateContextType {
  hasUpdate: boolean;
  loadedVersion: string | null;
  refresh: () => void;
}

const ContentUpdateContext = createContext<ContentUpdateContextType>({
  hasUpdate: false,
  loadedVersion: null,
  refresh: () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  },
});

export function ContentUpdateProvider({ children }: { children: ReactNode }) {
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

  const refresh = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <ContentUpdateContext.Provider value={{ hasUpdate, loadedVersion, refresh }}>
      {children}
    </ContentUpdateContext.Provider>
  );
}

export function useContentUpdate() {
  return useContext(ContentUpdateContext);
}
