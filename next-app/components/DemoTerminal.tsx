'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { DemoStep, TerminalDemoSpec } from '@/lib/demo-directives';
import LabTerminal, { type LabTerminalHandle } from '@/components/LabTerminal';

type Phase = 'idle' | 'starting' | 'ready' | 'error';

/**
 * A live, disposable terminal embedded in a chapter slide.
 *
 * Reuses the lab WebSocket terminal infrastructure (tmux-backed, reconnect
 * with preserved scrollback) but against a label-addressed demo container —
 * never the learner's lab container.
 *
 * The demo container persists across the chapter: navigation between slides
 * unmounts this component, but the orchestrator keeps the container and its
 * tmux session alive (label-based reuse on re-ensure), so shell history and
 * scrollback survive. It is disposable and ungraded.
 *
 * Guided steps are click-to-insert commands the learner reviews, edits, and
 * runs by pressing Enter. The stepper auto-advances when the current step's
 * command is submitted, shows a "what you should see" expectation per step,
 * and can poll a live container-state chip (e.g. running / exited).
 */
export default function DemoTerminal({ spec }: { spec: TerminalDemoSpec }) {
  const steps = spec.steps;
  const stateCmd = spec.state?.command ?? null;
  const stateLabel = spec.state?.label ?? 'container';

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ wsUrl: string; wsToken: string; name: string } | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [expandedExpect, setExpandedExpect] = useState<Set<string>>(new Set());
  const [showDoneSteps, setShowDoneSteps] = useState(false);
  const [containerState, setContainerState] = useState<string | null>(null);
  const terminalRef = useRef<LabTerminalHandle>(null);
  const mounted = useRef(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const focusedOnce = useRef(false);

  const totalSteps = steps.length;
  const allDone = totalSteps > 0 && doneSteps.size === totalSteps;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Deliberately do NOT destroy the demo container here: it must survive
      // slide navigation within the chapter. Cleanup happens when the chapter
      // unmounts (SlideReader) or the demo TTL sweeper reclaims it.
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
        // A remount/cleanup cancels the in-flight request; don't flip to an
        // error state for a request we deliberately aborted.
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

  // Live container-state chip: poll the optional `state.command` so the chip
  // reflects reality (running / exited / not created) as the learner drives
  // the container through its lifecycle.
  useEffect(() => {
    if (phase !== 'ready' || !stateCmd) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.demos.exec(spec.id, stateCmd);
        if (!cancelled) setContainerState(res.output.trim() || '—');
      } catch {
        // Container may be mid-reset; keep the last known value.
      }
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase, spec.id, stateCmd]);

  // Focus the terminal as soon as it's ready so the keyboard is live without
  // the learner needing to click inside it. Re-arms on Reset.
  useEffect(() => {
    if (phase === 'ready' && !focusedOnce.current) {
      focusedOnce.current = true;
      requestAnimationFrame(() => terminalRef.current?.focus());
    }
  }, [phase]);

  // Forward Enter to the terminal whenever it is pressed while interacting
  // with this demo card (e.g. right after clicking a step) but focus isn't in
  // the terminal's own textarea. Text fields are left alone.
  useEffect(() => {
    if (phase !== 'ready') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const target = e.target as HTMLElement | null;
      if (!target || !cardRef.current?.contains(target)) return;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      const ta = cardRef.current.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea');
      if (ta && (target === ta || ta.contains(target))) return;
      e.preventDefault();
      terminalRef.current?.focus();
      terminalRef.current?.insert('\r');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  const handleReset = async () => {
    setSession(null);
    setPhase('starting');
    setError(null);
    setDoneSteps(new Set());
    setActiveStep(null);
    setExpandedExpect(new Set());
    setShowDoneSteps(false);
    setContainerState(null);
    focusedOnce.current = false;
    try {
      await api.demos.reset(spec.id);
    } catch {
      // Best-effort; next ensure recreates a fresh container.
    }
    setResetKey((k) => k + 1);
  };

  const insertCommand = useCallback(
    (command: string) => {
      terminalRef.current?.insert(command);
      // Defer focus to the next frame so the browser doesn't hand focus back
      // to the clicked step button once the click event finishes — the very
      // next Enter then lands in the terminal, not on the button.
      requestAnimationFrame(() => terminalRef.current?.focus());
    },
    []
  );

  const insertStep = useCallback(
    (index: number) => {
      if (phase !== 'ready' || index < 0 || index >= totalSteps) return;
      insertCommand(steps[index].run);
      setActiveStep(index);
    },
    [phase, totalSteps, steps, insertCommand]
  );

  const toggleDone = useCallback((index: number) => {
    setDoneSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const toggleExpect = useCallback((stepId: string) => {
    setExpandedExpect((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  }, []);

  const hasGuidedSteps = totalSteps > 0;

  const stepper = useMemo(() => {
    if (!hasGuidedSteps) return null;
    return (
      <div className="border-b border-line bg-[#0f1419] px-3 py-2.5">
        {!allDone && (
          <div className="mb-2.5 h-1 overflow-hidden rounded-full bg-line/60">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${(doneSteps.size / totalSteps) * 100}%` }}
            />
          </div>
        )}

        <ol className="space-y-1.5">
          {steps.map((step, i) => {
            const isDone = doneSteps.has(i);
            const isActive = activeStep === i;
            const showExpect = isDone || expandedExpect.has(step.id);
            return (
              <li
                key={step.id}
                onClick={() => insertStep(i)}
                title={phase === 'ready' ? `Insert: ${step.run}` : 'Waiting for the demo environment to start'}
                className={`cursor-pointer rounded-lg border px-2.5 py-1.5 transition ${
                  isActive
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : isDone
                      ? 'border-line/60 bg-[#0d1117]'
                      : 'border-line/40 bg-[#0d1117] hover:border-accent/40 hover:bg-[#111820]'
                } ${phase !== 'ready' ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDone(i);
                    }}
                    aria-label={isDone ? `Mark "${step.label}" as not done` : `Mark "${step.label}" as done`}
                    title={isDone ? 'Mark as not done' : 'Mark as done'}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                      isDone
                        ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-400'
                        : 'border-line hover:border-accent/60'
                    }`}
                  >
                    {isDone && (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                  <span
                    className={`min-w-0 flex-1 text-[12px] font-medium ${
                      isDone ? 'text-muted' : 'text-text'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>

                <div className="mt-1 overflow-x-auto">
                  <code className="font-mono text-[11px] text-sky-300">
                    <span className="select-none text-muted">$ </span>
                    {step.run}
                  </code>
                </div>

                {step.expect && showExpect && (
                  <div className="mt-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                      What you should see
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-relaxed text-[#c8d1dc]">
                      {step.expect}
                    </p>
                  </div>
                )}
                {step.expect && !showExpect && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpect(step.id);
                    }}
                    className="mt-1.5 text-[11px] font-medium text-muted transition enabled:hover:text-text"
                  >
                    ▸ Expected result
                  </button>
                )}
              </li>
            );
          })}
        </ol>

        {allDone && (
          <p className="mt-2 text-[11px] text-muted">
            All steps done. Re-run any command above, or Reset to start the environment fresh.
          </p>
        )}
      </div>
    );
  }, [hasGuidedSteps, steps, allDone, activeStep, doneSteps, phase, expandedExpect, insertStep, toggleDone, toggleExpect]);

  const examplesBlock = useMemo(() => {
    if (!spec.examples || spec.examples.length === 0) return null;
    const label = hasGuidedSteps ? 'More to explore — click to insert' : 'Example commands — click to insert, then press Enter';
    return (
      <div className="border-b border-line bg-[#0f1419] px-3 py-2 lg:border-b-0">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
        <div className="flex flex-wrap gap-1">
          {spec.examples.map((command, i) => (
            <button
              key={i}
              onClick={() => insertCommand(command)}
              disabled={phase !== 'ready'}
              className="rounded-md border border-line bg-[#161b22] px-2 py-0.5 font-mono text-[11px] text-sky-300 transition enabled:hover:border-accent/40 enabled:hover:text-sky-200 disabled:opacity-40"
              title="Insert into the terminal (does not run it)"
            >
              <span className="select-none text-muted">$ </span>
              {command}
            </button>
          ))}
        </div>
      </div>
    );
  }, [spec.examples, hasGuidedSteps, phase, insertCommand]);

  const showSidebar = !allDone || showDoneSteps;

  const terminalBox = session ? (
    <LabTerminal
      key={resetKey}
      ref={terminalRef}
      wsUrl={session.wsUrl}
      wsToken={session.wsToken}
      className="h-[380px] lg:h-[calc(100dvh_-_200px)] lg:max-h-[820px] lg:min-h-[440px]"
    />
  ) : (
    <div className="flex h-[380px] lg:h-[calc(100dvh_-_200px)] lg:max-h-[820px] lg:min-h-[440px] items-center justify-center rounded-lg bg-[#0d1117]">
      {phase === 'starting' ? (
        <div className="space-y-3 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
          <p className="text-sm text-gray-300">
            Starting a disposable demo environment…
          </p>
          <p className="text-xs text-gray-500">
            {spec.image || 'labops-docker:latest'}
          </p>
        </div>
      ) : phase === 'error' ? (
        <div className="max-w-md space-y-2 px-4 text-center">
          <p className="text-sm font-medium text-red-400">
            Could not start the demo environment
          </p>
          {error && <p className="text-xs text-gray-400">{error}</p>}
          <button
            onClick={() => ensure()}
            className="mt-2 rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-bg transition hover:bg-accent/90"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      ref={cardRef}
      className="my-4 overflow-hidden rounded-xl border border-line bg-[#0d1117]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line bg-[#161b22] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wider text-text">
            Interactive Terminal
          </span>
          <span className="hidden text-[11px] text-muted sm:inline">
            — try the commands yourself
          </span>
          {phase === 'ready' && (
            <>
              {stateCmd && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    containerState === 'running'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : containerState === 'exited' || containerState === 'created'
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-gray-500/10 text-gray-400'
                  }`}
                  title={`Live state of ${stateLabel}, polled from the demo environment`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      containerState === 'running'
                        ? 'bg-emerald-400'
                        : containerState === 'exited' || containerState === 'created'
                          ? 'bg-amber-400'
                          : 'bg-gray-400'
                    }`}
                  />
                  {stateLabel}: {containerState ?? '…'}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {session?.name}
              </span>
            </>
          )}
          {phase === 'starting' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              starting
            </span>
          )}
        </div>

        {phase !== 'idle' && (
          <button
            onClick={handleReset}
            disabled={phase === 'starting'}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition enabled:hover:text-text disabled:opacity-50"
            title="Destroy this demo environment and start a fresh one"
          >
            Reset
          </button>
        )}
      </div>

      {allDone && !showSidebar && (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-[#0f1419] px-4 py-2">
          <p className="text-[12px] font-medium text-emerald-400">✓ All steps complete</p>
          <button
            onClick={() => setShowDoneSteps((s) => !s)}
            className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-muted transition enabled:hover:border-accent/40 enabled:hover:text-text"
          >
            {showDoneSteps ? 'Hide commands' : 'Review commands'}
          </button>
        </div>
      )}
      {showSidebar ? (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="lg:h-[calc(100dvh_-_200px)] lg:max-h-[820px] lg:min-h-[440px] lg:overflow-y-auto lg:border-r lg:border-line">
            {stepper}
            {examplesBlock}
          </div>
          <div className="p-3">{terminalBox}</div>
        </div>
      ) : (
        <div className="p-3">{terminalBox}</div>
      )}

      <div className="border-t border-line px-4 py-2">
        <p className="text-[11px] text-muted">
          This disposable demo environment persists across slides until you leave the chapter.
        </p>
      </div>
    </div>
  );
}