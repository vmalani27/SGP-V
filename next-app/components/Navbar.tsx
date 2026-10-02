'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Terminal as TerminalIcon, Bell, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useContentUpdate } from '@/lib/content-update-context';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { hasUpdate, refresh } = useContentUpdate();
  const isHomeScreen = pathname === '/' || pathname === '/dashboard';
  const [activeLab, setActiveLab] = useState<any>(null);
  const [isHoveringLab, setIsHoveringLab] = useState(false);
  const [isChapterTerminalOpen, setIsChapterTerminalOpen] = useState(true);
  const [isUpdatePopoverOpen, setIsUpdatePopoverOpen] = useState(false);
  const updatePopoverRef = useRef<HTMLDivElement>(null);

  const isChapterView = pathname?.includes('/chapters/') ?? false;

  // Close update popover on route change
  useEffect(() => {
    setIsUpdatePopoverOpen(false);
  }, [pathname]);

  // Handle click outside update popover
  useEffect(() => {
    if (!isUpdatePopoverOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (updatePopoverRef.current && !updatePopoverRef.current.contains(e.target as Node)) {
        setIsUpdatePopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUpdatePopoverOpen]);

  // Listen to terminal status updates from chapter reader
  useEffect(() => {
    const handleStatus = (e: Event) => {
      const customEvent = e as CustomEvent<{ isOpen: boolean }>;
      if (typeof customEvent.detail?.isOpen === 'boolean') {
        setIsChapterTerminalOpen(customEvent.detail.isOpen);
      }
    };
    window.addEventListener('chapter-terminal-status', handleStatus);
    return () => {
      window.removeEventListener('chapter-terminal-status', handleStatus);
    };
  }, []);

  const handleToggleTerminal = () => {
    const nextState = !isChapterTerminalOpen;
    setIsChapterTerminalOpen(nextState);
    window.dispatchEvent(
      new CustomEvent('toggle-chapter-terminal', { detail: { isOpen: nextState } })
    );
  };

  // Keyboard shortcut Ctrl + ` (or Ctrl + ~) to toggle terminal
  useEffect(() => {
    if (!isChapterView) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.key === '~')) {
        e.preventDefault();
        handleToggleTerminal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isChapterView, isChapterTerminalOpen]);

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

  const showBack = pathname !== '/' && pathname !== '/dashboard' && pathname !== '/onboarding';

  return (
    <nav className="shrink-0 h-[44px] w-full border-b border-white/[0.08] bg-[#090a0f] px-4 flex items-center justify-between z-50 select-none">
      {/* A. Left Section (Back Button) */}
      <div className="flex flex-1 items-center justify-start">
        {showBack ? (
          <Link
            href={backHref}
            className="group flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-white"
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
        <Link href="/" className="font-bold text-sm tracking-tight text-white transition">
          LabOps
        </Link>
      </div>

      {/* C. Right Section (Utilities & Terminal Toggle) */}
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
              <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-white/[0.08] bg-[#12151c] shadow-2xl p-3 z-50">
                <div className="mb-2 border-b border-white/[0.06] pb-2">
                  <p className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">Active Sandbox</p>
                  <h4 className="mt-0.5 font-semibold text-xs text-white truncate">{activeLab.lab_id}</h4>
                  <p className="mt-0.5 text-[10px] text-slate-500 font-mono">ID: {activeLab.session_id.substring(0, 8)}</p>
                </div>
                <button onClick={handleDiscard} className="w-full rounded bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20 border border-red-500/20 cursor-pointer">
                  Discard Session
                </button>
              </div>
            )}
          </div>
        )}

        {/* Curriculum Update Notification Icon (Non-blocking during chapters / labs / etc.) */}
        {hasUpdate && !isHomeScreen && (
          <div className="relative" ref={updatePopoverRef}>
            <button
              type="button"
              onClick={() => setIsUpdatePopoverOpen((prev) => !prev)}
              className={`relative flex items-center justify-center h-7 w-7 rounded-md border transition-colors cursor-pointer ${
                isUpdatePopoverOpen
                  ? 'border-sky-500/50 bg-sky-500/20 text-sky-300'
                  : 'border-white/[0.08] bg-[#161a24]/80 hover:bg-[#1f2533] text-slate-300 hover:text-white'
              }`}
              title="Curriculum update available"
              aria-label="Curriculum update available"
            >
              <Bell className="h-3.5 w-3.5 text-sky-400" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
              </span>
            </button>

            {isUpdatePopoverOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-lg border border-white/[0.08] bg-[#12151c] shadow-2xl p-3.5 z-50 animate-in fade-in zoom-in-95">
                <div className="flex items-start gap-2.5">
                  <div className="h-7 w-7 rounded-md bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <RefreshCw className="h-3.5 w-3.5 text-sky-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-white">Curriculum Update</h4>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">New</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                      Curriculum updated. Refresh to load the latest version.
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsUpdatePopoverOpen(false)}
                    className="rounded px-2.5 py-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors cursor-pointer"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={refresh}
                    className="flex items-center gap-1.5 rounded bg-sky-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-sky-400 transition-colors shadow-sm cursor-pointer"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {isChapterView && !isChapterTerminalOpen && (
          <button
            onClick={handleToggleTerminal}
            type="button"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-white/[0.08] bg-[#161a24]/80 hover:bg-[#1f2533] text-slate-300 hover:text-white transition-colors cursor-pointer shadow-sm group"
            title="Launch Terminal (Ctrl + `)"
          >
            <TerminalIcon className="h-3.5 w-3.5 text-slate-400 group-hover:text-emerald-400 transition-colors" />
            <span className="font-mono text-[11px] font-medium">Terminal</span>
          </button>
        )}
      </div>
    </nav>
  );
}
