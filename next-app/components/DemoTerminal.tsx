'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { TerminalDemoSpec } from '@/lib/demo-directives';
import LabTerminal, { type LabTerminalHandle } from '@/components/LabTerminal';

type Phase = 'idle' | 'starting' | 'ready' | 'error';

export default function DemoTerminal({ spec }: { spec: TerminalDemoSpec }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ wsUrl: string; wsToken: string; name: string } | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const terminalRef = useRef<LabTerminalHandle>(null);
  const mounted = useRef(true);

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

  return (
    <div className="flex flex-col h-full bg-[#0c0d0e] rounded-xl border border-white/[0.08] overflow-hidden shadow-2xl">
      {/* SIMPLIFIED TERMINAL HEADER */}
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#121316] px-4 py-2.5 shrink-0 select-none">
        <span className="text-xs font-mono font-medium text-zinc-400">Terminal</span>
        <button
          onClick={handleReset}
          disabled={phase === 'starting'}
          className="text-xs font-mono text-zinc-400 hover:text-zinc-200 px-2 py-0.5 rounded border border-white/[0.08] hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
        >
          Reset
        </button>
      </div>

      {/* Terminal Container */}
      <div className="flex-1 min-h-0 p-3 bg-black/90">
        {terminalBox}
      </div>
    </div>
  );
}