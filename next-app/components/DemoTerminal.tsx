'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { TerminalDemoSpec } from '@/lib/demo-directives';
import LabTerminal, { type LabTerminalHandle } from '@/components/LabTerminal';

type Phase = 'idle' | 'starting' | 'ready' | 'error';

export interface DemoTerminalProps {
  spec: TerminalDemoSpec;
  onClose?: () => void;
}

export default function DemoTerminal({ spec, onClose }: DemoTerminalProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ wsUrl: string; wsToken: string; name: string } | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [isMaximized, setIsMaximized] = useState(false);
  const terminalRef = useRef<LabTerminalHandle>(null);
  const mounted = useRef(true);

  // Restore on Escape when maximized
  useEffect(() => {
    if (!isMaximized) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMaximized(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMaximized]);

  useEffect(() => {
    mounted.current = true;
    const handleSendToTerminal = (e: Event) => {
      const customEvt = e as CustomEvent<string>;
      const cmd = customEvt.detail;
      if (cmd && terminalRef.current) {
        terminalRef.current.insert(cmd.trim() + '\r');
        terminalRef.current.focus();
      }
    };
    window.addEventListener('send-to-terminal', handleSendToTerminal);
    return () => {
      mounted.current = false;
      window.removeEventListener('send-to-terminal', handleSendToTerminal);
    };
  }, []);

  const ensure = useCallback(
    async (signal?: AbortSignal) => {
      setPhase('starting');
      setError(null);
      try {
        const res = await api.demos.ensure(
          spec.id,
          { image: spec.image, pre_pull: spec.pre_pull },
          { signal }
        );
        if (!mounted.current) return;
        setSession({
          wsUrl: res.ws_url,
          wsToken: res.ws_token,
          name: res.name,
        });
        setPhase('ready');
      } catch (e) {
        if (!mounted.current) return;
        if (signal?.aborted) return;
        setPhase('error');
        setError(e instanceof Error ? e.message : 'Failed to start demo environment');
      }
    },
    [spec.id, spec.image, spec.pre_pull]
  );

  useEffect(() => {
    const controller = new AbortController();
    ensure(controller.signal);
    return () => controller.abort();
  }, [ensure, resetKey]);

  const handleReset = async () => {
    setSession(null);
    setPhase('idle');
    try {
      await api.demos.destroy(spec.id);
    } catch {
      // ignore
    }
    setResetKey((k) => k + 1);
  };

  const terminalBox = session ? (
    <LabTerminal
      ref={terminalRef}
      wsUrl={session.wsUrl}
      wsToken={session.wsToken}
      className="h-full w-full"
    />
  ) : (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      {phase === 'starting' ? (
        <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          <span>Starting terminal environment...</span>
        </div>
      ) : phase === 'error' ? (
        <div className="space-y-2">
          <p className="font-mono text-xs text-rose-400">Failed to connect terminal</p>
          {error && <p className="font-mono text-[11px] text-zinc-500">{error}</p>}
          <button
            onClick={() => ensure()}
            className="mt-2 rounded bg-zinc-800 px-3 py-1 font-mono text-xs text-zinc-200 hover:bg-zinc-700"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );

  const handleClear = () => {
    if (terminalRef.current) {
      terminalRef.current.insert('clear\r');
      terminalRef.current.focus();
    }
  };

  return (
    <div
      className={
        isMaximized
          ? 'fixed inset-0 z-50 flex flex-col bg-[#0d1117]'
          : 'flex flex-col h-full bg-[#0d1117] border-l border-[#30363d]'
      }
    >
      {/* Clean, Non-Slop Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-[#30363d] select-none shrink-0">
        {/* Left: Title & Status */}
        <div className="text-xs font-mono text-[#8b949e] flex items-center space-x-2">
          <span>Terminal Shell</span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              phase === 'ready'
                ? 'bg-emerald-500 animate-pulse'
                : phase === 'starting'
                ? 'bg-amber-400 animate-pulse'
                : phase === 'error'
                ? 'bg-rose-500'
                : 'bg-slate-500'
            }`}
            title={phase === 'ready' ? 'Connected' : phase === 'starting' ? 'Connecting...' : phase === 'error' ? 'Disconnected' : 'Idle'}
          />
        </div>

        {/* Right: Functional Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleClear}
            disabled={phase !== 'ready'}
            type="button"
            className="text-xs text-[#8b949e] hover:text-[#c9d1d9] transition-colors px-2.5 py-1 rounded bg-[#21262d] border border-[#30363d] font-mono cursor-pointer disabled:opacity-40"
          >
            clear
          </button>

          {/* Maximize / Restore Toggle */}
          <button
            onClick={() => setIsMaximized((prev) => !prev)}
            type="button"
            className="p-1.5 text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] rounded transition-colors cursor-pointer"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 9V4.5M9 9H4.5M9 9l-6-6M15 15v4.5M15 15h4.5M15 15l6 6" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
              </svg>
            )}
          </button>

          {/* Close / Hide Toggle */}
          {onClose && (
            <button
              onClick={onClose}
              type="button"
              className="p-1.5 text-[#8b949e] hover:text-[#f85149] hover:bg-[#21262d] rounded transition-colors cursor-pointer"
              title="Close Terminal"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Terminal PTY Viewport */}
      <div className="flex-1 min-h-0 overflow-hidden bg-black p-3">
        {terminalBox}
      </div>
    </div>
  );
}