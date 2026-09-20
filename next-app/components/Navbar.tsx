'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [activeLab, setActiveLab] = useState<any>(null);
  const [isHoveringLab, setIsHoveringLab] = useState(false);
  const [showQuitModal, setShowQuitModal] = useState(false);
  const [platformStopped, setPlatformStopped] = useState(false);

  // Parse path for 'back' logic
  let backHref = '/dashboard';
  const courseSubrouteMatch = pathname?.match(/^(\/courses\/[^/]+)\/(chapters|labs)/);
  if (courseSubrouteMatch) {
    backHref = courseSubrouteMatch[1];
  }

  // Poll for active lab
  useEffect(() => {
    let mounted = true;
    const fetchActiveLabs = async () => {
      try {
        const labs = await api.labs.list();
        if (!mounted) return;
        const running = labs.find((l: any) => l.status === 'running');
        if (running) {
          setActiveLab(running);
        } else {
          setActiveLab(null);
          setIsHoveringLab(false);
        }
      } catch (e) {
        // ignore
      }
    };
    fetchActiveLabs();
    const interval = setInterval(fetchActiveLabs, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleDiscard = async () => {
    if (!activeLab) return;
    try {
      await api.labs.destroy('unknown', activeLab.lab_id, activeLab.session_id);
      setActiveLab(null);
      setIsHoveringLab(false);
    } catch (e) {
      console.error('Failed to destroy lab:', e);
    }
  };

  const handleQuit = () => {
    setShowQuitModal(true);
  };

  const confirmQuit = () => {
    setPlatformStopped(true);
    setShowQuitModal(false);
  };

  if (platformStopped) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg text-text">
        <h1 className="hero-font text-3xl font-bold tracking-tight text-white mb-2">LabOps is stopped.</h1>
        <p className="text-muted">The platform processes have been terminated. You can safely close this tab.</p>
      </div>
    );
  }

  const showBack = pathname !== '/' && pathname !== '/dashboard' && pathname !== '/onboarding';

  return (
    <>
      <nav className="shrink-0 h-[44px] w-full border-b border-zinc-800 bg-[#0c0d0e] px-4 flex items-center justify-between z-50 select-none">
        {/* A. Left Section (Back Button) */}
        <div className="flex flex-1 items-center justify-start">
          {showBack ? (
            <Link
              href={backHref}
              className="group flex items-center gap-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100"
            >
              <svg className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              Back
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
          )}
        </div>

        {/* B. Center Section (Brand) */}
        <div className="flex flex-1 items-center justify-center">
          <Link href="/" className="font-semibold text-sm tracking-tight text-zinc-100 hover:text-white transition">
            LabOps
          </Link>
        </div>

        {/* C. Right Section (Utilities) */}
        <div className="flex flex-1 items-center justify-end gap-3 relative">
          {activeLab && (
            <div 
              className="relative"
              onMouseEnter={() => setIsHoveringLab(true)}
              onMouseLeave={() => setIsHoveringLab(false)}
            >
              <div className="flex cursor-pointer items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 transition-colors hover:bg-amber-500/20">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                </span>
                <span className="max-w-[100px] truncate text-[11px] font-mono text-amber-200">
                  {activeLab.lab_id}
                </span>
              </div>

              {/* Hover Context Card */}
              {isHoveringLab && (
                <div className="absolute right-0 top-full mt-2 w-64 rounded-md border border-zinc-800 bg-[#0c0d0e] shadow-2xl p-3 z-50">
                  <div className="mb-2 border-b border-zinc-800/80 pb-2">
                    <p className="text-[10px] font-mono tracking-wider text-zinc-500 uppercase">Active Sandbox</p>
                    <h4 className="mt-0.5 font-semibold text-xs text-zinc-100 truncate">{activeLab.lab_id}</h4>
                    <p className="mt-0.5 text-[10px] text-zinc-500 font-mono">ID: {activeLab.session_id.substring(0, 8)}</p>
                  </div>
                  <button onClick={handleDiscard} className="w-full rounded bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20 border border-red-500/20">
                    Discard Session
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleQuit}
            className="flex items-center gap-1.5 rounded text-xs font-medium text-zinc-400 transition hover:text-zinc-100"
            title="Shut down platform"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" />
            </svg>
            Quit
          </button>
        </div>
      </nav>

      {/* Quit Modal */}
      {showQuitModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-6 shadow-2xl animate-pop-in">
            <h3 className="hero-font text-lg font-bold text-white mb-2">Shut down LabOps platform?</h3>
            <p className="text-sm text-slate-300 mb-6">
              This will terminate the local orchestrator, container runtimes, and close your session.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowQuitModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-line/30"
              >
                Cancel
              </button>
              <button
                onClick={confirmQuit}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
              >
                Shut Down Platform
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
