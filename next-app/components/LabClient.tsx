'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { itemHref } from '@/lib/content-server';
import type { LabMeta, TaskStatus, TaskProgressData, LabTask } from '@/lib/task-types';
import type { ContentCourse, CourseItem } from '@/lib/content-types';
import LabTerminal from '@/components/LabTerminal';
import LabBriefing from '@/components/LabBriefing';
import ProvisioningBoot from '@/components/ProvisioningBoot';
import Navbar from '@/components/Navbar';
import PlayerSidebar from '@/components/PlayerSidebar';
import LabTaskRenderer from '@/components/LabTaskRenderer';
import CelebrationOverlay from '@/components/CelebrationOverlay';
import SubmitLabModal from '@/components/SubmitLabModal';

interface LabInfo {
  labId: string;
  title: string;
  moduleId: string;
  chapterId: string;
  instructions: string | null;
}

interface LabState {
  sessionId: string;
  wsUrl: string;
  wsToken: string;
  containerName: string;
  status: string;
  expiresAt?: string | null;
  remainingSeconds?: number | null;
}

type LabPhase = 'loading' | 'intro' | 'provisioning' | 'running' | 'expired' | 'error';

// ── Lab meta helpers ────────────────────────────────────────────────
const DEFAULT_META: LabMeta = {
  id: '',
  title: '',
  difficulty: 'beginner',
  estimated_time: 10,
  xp: 50,
  tags: [],
  objectives: [],
  environment: '',
  completion: { required_tasks: 'all' },
};

function buildLabMeta(
  config: Record<string, unknown> | null,
  labId: string,
  titleFallback: string,
): LabMeta {
  const meta: LabMeta = { ...DEFAULT_META, id: labId, title: titleFallback };
  if (!config) return meta;

  const fromLab = (lab: Record<string, unknown>) => {
    if (lab.title) meta.title = String(lab.title);
    if (lab.difficulty) meta.difficulty = lab.difficulty as LabMeta['difficulty'];
    if (typeof lab.estimated_time === 'number') meta.estimated_time = lab.estimated_time;
    if (typeof lab.xp === 'number') meta.xp = lab.xp;
    if (Array.isArray(lab.tags)) meta.tags = lab.tags as string[];
    if (Array.isArray(lab.objectives)) meta.objectives = lab.objectives as string[];
    if (lab.summary) meta.summary = String(lab.summary);
    if (lab.completion) meta.completion = lab.completion as LabMeta['completion'];
  };

  fromLab(config);

  return meta;
}

function envConfigFrom(labConfig: Record<string, unknown> | null): {
  image: string;
  apt_packages: string[];
  pre_pull: string[];
  setup: unknown[];
} {
  const env = (labConfig?.environment as Record<string, unknown> | undefined) ?? {};
  return {
    image: (env.base_image as string | undefined) ?? '',
    apt_packages: Array.isArray(env.apt_packages) ? (env.apt_packages as string[]) : [],
    pre_pull: Array.isArray(env.pre_pull) ? (env.pre_pull as string[]) : [],
    setup: Array.isArray(labConfig?.setup) ? (labConfig.setup as unknown[]) : [],
  };
}

function labStateFrom(res: {
  session_id: string;
  ws_url: string;
  ws_token: string;
  container_name: string;
  status: string;
  expires_at?: string | null;
  remaining_seconds?: number | null;
}): LabState {
  return {
    sessionId: res.session_id,
    wsUrl: res.ws_url,
    wsToken: res.ws_token,
    containerName: res.container_name,
    status: res.status,
    expiresAt: res.expires_at ?? null,
    remainingSeconds: res.remaining_seconds ?? null,
  };
}

export default function LabClient({
  courseId,
  labId,
  course,
  nextItem,
}: {
  courseId: string;
  labId: string;
  course: ContentCourse;
  nextItem?: CourseItem;
}) {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading, refreshEnrollments, getEnrollment } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [labInfo, setLabInfo] = useState<LabInfo | null>(null);
  const [labMeta, setLabMeta] = useState<LabMeta | null>(null);
  const [labConfig, setLabConfig] = useState<Record<string, unknown> | null>(null);
  const [labState, setLabState] = useState<LabState | null>(null);
  const [phase, setPhase] = useState<LabPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [destroying, setDestroying] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [taskProgress, setTaskProgress] = useState<TaskProgressData | null>(null);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({});
  const [taskErrors, setTaskErrors] = useState<Record<string, string>>({});
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const celebrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskProgressRef = useRef<TaskProgressData | null>(null);
  const initialCheckDone = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !courseId || !labId) return;
    if (initialCheckDone.current) return;
    initialCheckDone.current = true;

    let labInfoResult: LabInfo | null = null;

    api.content.getLabInstructions(courseId, labId).then((data) => {
      labInfoResult = {
        labId: data.lab_id,
        title: data.title,
        moduleId: data.module_id,
        chapterId: data.chapter_id,
        instructions: data.instructions,
      };
      setLabInfo(labInfoResult);
    }).catch(() => {
      labInfoResult = { labId, title: labId, moduleId: '', chapterId: '', instructions: null };
      setLabInfo(labInfoResult);
    }).finally(() => {
      api.content.getLabConfig(courseId, labId)
        .then((config) => {
          setLabConfig(config);
          setLabMeta(buildLabMeta(config, labId, labInfoResult?.title || labId));
        })
        .catch(() => setLabMeta(buildLabMeta(null, labId, labInfoResult?.title || labId)));

      api.labs.active(courseId, labId).then((active) => {
        if (active) {
          setLabState(labStateFrom(active));
          setPhase('running');
        } else {
          setPhase('intro');
        }
      }).catch(() => {
        setPhase('intro');
      });
    });
  }, [isAuthenticated, courseId, labId]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    return () => {
      if (celebrateTimerRef.current) clearTimeout(celebrateTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen((open) => !open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const enrollment = getEnrollment(courseId);
  const completedChapterIds: string[] = [];
  if (enrollment?.progress) {
    for (const modVal of Object.values(enrollment.progress)) {
      if (modVal && typeof modVal === 'object') {
        for (const [chId, status] of Object.entries(modVal as Record<string, unknown>)) {
          if (status === 'completed') completedChapterIds.push(chId);
        }
      }
    }
  }

  const cancelCelebration = () => {
    if (celebrateTimerRef.current) {
      clearTimeout(celebrateTimerRef.current);
      celebrateTimerRef.current = null;
    }
    setCelebrating(false);
  };

  const provisionLab = useCallback(async () => {
    setPhase('provisioning');
    setError(null);
    setTaskProgress(null);
    taskProgressRef.current = null;
    setTaskStatuses({});
    setTaskErrors({});
    setTasksError(null);
    let config = labConfig;
    if (!config) {
      try {
        config = await api.content.getLabConfig(courseId, labId);
      } catch {
        config = null;
      }
    }
    const result = await api.labs.start(courseId, labId, envConfigFrom(config));
    setLabState(labStateFrom(result));
    setPhase('running');
  }, [courseId, labId, labConfig]);

  const handleStart = useCallback(async () => {
    cancelCelebration();
    try {
      await provisionLab();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to start lab';
      setError(msg);
      setPhase('error');
    }
  }, [provisionLab, cancelCelebration]);

  const handleStartNew = useCallback(async () => {
    cancelCelebration();
    if (labState) {
      try {
        await api.labs.destroy(courseId, labId, labState.sessionId);
      } catch {
        // Session might already be destroyed
      }
      setLabState(null);
    }
    try {
      await provisionLab();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to start lab';
      setError(msg);
      setPhase('error');
    }
  }, [provisionLab, cancelCelebration, labState, courseId, labId]);

  const handleRestart = async () => {
    if (!labState) return;
    cancelCelebration();
    setRestarting(true);
    setPhase('provisioning');
    try {
      if (labState.status === 'running') {
        await api.labs.stop(courseId, labId, labState.sessionId);
      }
      await api.labs.resume(courseId, labId, labState.sessionId);
      setLabState({ ...labState, status: 'running' });
    } catch (e) {
      console.error('Stop/resume restart failed, recreating container:', e);
      try {
        await api.labs.destroy(courseId, labId, labState.sessionId);
      } catch (e2) {
        console.error('Failed to destroy old lab:', e2);
      }
      setLabState(null);
      try {
        const result = await api.labs.start(courseId, labId, envConfigFrom(labConfig));
        setLabState(labStateFrom(result));
      } catch (e3) {
        const msg = e3 instanceof Error ? e3.message : 'Failed to start lab';
        setError(msg);
        setPhase('error');
        setRestarting(false);
        return;
      }
    }
    setRestarting(false);
    setPhase('running');
  };

  const handleStop = async () => {
    if (!labState || stopping) return;
    setStopping(true);
    try {
      await api.labs.stop(courseId, labId, labState.sessionId);
      setLabState({ ...labState, status: 'stopped' });
    } catch (e) {
      console.error('Failed to stop lab:', e);
    } finally {
      setStopping(false);
    }
  };

  const handleResume = async () => {
    if (!labState || resuming) return;
    setResuming(true);
    try {
      await api.labs.resume(courseId, labId, labState.sessionId);
      setLabState({ ...labState, status: 'running' });
    } catch (e) {
      console.error('Failed to resume lab:', e);
    } finally {
      setResuming(false);
    }
  };

  const handleDestroy = async () => {
    if (!labState) return;
    cancelCelebration();
    setSubmitOpen(false);
    setDestroying(true);
    try {
      await api.labs.destroy(courseId, labId, labState.sessionId);
      setLabState(null);
      setPhase('intro');
      setTaskProgress(null);
      taskProgressRef.current = null;
      setTaskStatuses({});
      setTaskErrors({});
      setTasksError(null);
      setDestroying(false);
    } catch (e) {
      console.error('Failed to destroy lab:', e);
      setDestroying(false);
    }
  };

  const handleSubmitLab = async () => {
    if (!labState || !labInfo) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (labInfo.moduleId) {
        await api.courses.updateLabProgress(courseId, labId, labInfo.moduleId);
      }
      await api.labs.destroy(courseId, labId, labState.sessionId);
      setLabState(null);
      setSubmitOpen(false);
      cancelCelebration();
      setTaskProgress(null);
      taskProgressRef.current = null;
      setTaskStatuses({});
      setTaskErrors({});
      setTasksError(null);
      await refreshEnrollments();

      if (nextItem) {
        router.push(itemHref(courseId, nextItem));
      } else {
        router.push(`/courses/${courseId}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to submit lab. Please try again.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Load real tasks once the lab session is running
  useEffect(() => {
    if (phase !== 'running' || taskProgress) return;
    let cancelled = false;

    const tasks = (labConfig?.tasks as unknown[] | undefined) ?? [];
    api.labs.tasks(courseId, labId, tasks)
      .then((data) => {
        if (cancelled) return;
        if (data.tasks.length === 0) {
          setTasksError('This lab has no tasks yet.');
          return;
        }
        setTaskProgress({ tasks: data.tasks, currentIndex: 0, completed: false });
        taskProgressRef.current = { tasks: data.tasks, currentIndex: 0, completed: false };
      })
      .catch(() => {
        if (!cancelled) setTasksError('Failed to load lab tasks. Refresh the page to retry.');
      });

    return () => { cancelled = true; };
  }, [phase, taskProgress, courseId, labId, labConfig]);

  // Session expiry countdown
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (phase !== 'running' || !labState?.expiresAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase, labState?.expiresAt]);

  const deadlineMs = labState?.expiresAt ? new Date(labState.expiresAt).getTime() : null;
  const remainingSec =
    deadlineMs && !Number.isNaN(deadlineMs)
      ? Math.max(0, Math.ceil((deadlineMs - now) / 1000))
      : null;

  useEffect(() => {
    if (remainingSec !== null && remainingSec <= 0 && phase === 'running') {
      cancelCelebration();
      setPhase('expired');
    }
  }, [remainingSec, phase, cancelCelebration]);

  const formatRemaining = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleValidate = useCallback(async (taskId: string, answer?: string) => {
    if (!labState) return;
    setValidating(true);
    setTaskErrors((prev) => ({ ...prev, [taskId]: '' }));
    try {
      const task = taskProgressRef.current?.tasks.find((t) => t.id === taskId);
      if (!task) {
        throw new Error('Task definition missing. Refresh the page to retry.');
      }
      const result = await api.labs.validate(courseId, labId, taskId, answer, task);
      if (result.correct) {
        setTaskStatuses((prev) => ({ ...prev, [taskId]: 'correct' }));
        setCelebrating(true);
        if (celebrateTimerRef.current) clearTimeout(celebrateTimerRef.current);
        celebrateTimerRef.current = setTimeout(() => {
          celebrateTimerRef.current = null;
          setCelebrating(false);
          const prev = taskProgressRef.current;
          if (!prev) return;
          const nextIndex = prev.currentIndex + 1;
          const completed = nextIndex >= prev.tasks.length;
          const next = { ...prev, currentIndex: nextIndex, completed };
          taskProgressRef.current = next;
          setTaskProgress(next);
          if (completed) setSubmitOpen(true);
        }, 1400);
      } else {
        setTaskStatuses((prev) => ({ ...prev, [taskId]: 'incorrect' }));
        setTaskErrors((prev) => ({ ...prev, [taskId]: result.error || 'Incorrect. Try again.' }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Validation failed.';
      setTaskStatuses((prev) => ({ ...prev, [taskId]: 'incorrect' }));
      setTaskErrors((prev) => ({ ...prev, [taskId]: msg }));
    } finally {
      setValidating(false);
    }
  }, [courseId, labId, labState]);

  if (authLoading || phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1419]">
        <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  const meta = labMeta || { ...DEFAULT_META, id: labId, title: labInfo?.title || labId };
  const moduleTitle =
    course.modules.find((m) => m.id === labInfo?.moduleId)?.title ?? labInfo?.moduleId ?? '';
  const env = envConfigFrom(labConfig);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-bg text-text antialiased">
      <Navbar
        breadcrumb={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: course.title, href: `/courses/${courseId}` },
          { label: moduleTitle || 'Course' },
        ]}
      />

      <div className="flex flex-1 overflow-hidden pt-14">
        {/* Course Sidebar */}
        <aside
          className={`shrink-0 overflow-hidden border-r border-line bg-panel transition-all duration-200 ${
            sidebarOpen ? 'w-64' : 'w-0 border-r-0'
          }`}
        >
          {sidebarOpen && (
            <PlayerSidebar
              course={course}
              courseId={courseId}
              currentItemId={labId}
              completedChapterIds={completedChapterIds}
              onToggle={() => setSidebarOpen(false)}
            />
          )}
        </aside>

        {!sidebarOpen && (
          <div className="flex w-10 shrink-0 items-start justify-center border-r border-line bg-panel/40 pt-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded p-1.5 text-muted transition hover:bg-line/20 hover:text-text"
              title="Open sidebar (ESC)"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          </div>
        )}

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Pre-flight Briefing */}
          {phase === 'intro' && (
            <LabBriefing
              meta={meta}
              env={env}
              tasks={(labConfig?.tasks as LabTask[]) ?? []}
              onStart={handleStart}
            />
          )}

          {/* Active Runner Session */}
          {(phase === 'provisioning' ||
            phase === 'running' ||
            phase === 'expired' ||
            phase === 'error') && (
            <>
              {/* Clean Workspace Toolbar */}
              {phase === 'running' && labState && (
                <div className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-panel/50 px-4 font-mono text-xs">
                  {/* Left: Environment Status Indicator + Timer */}
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium tracking-wide ${
                        labState.status === 'running'
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                          : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                      }`}
                      title={`Internal ID: ${labState.sessionId}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          labState.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                        }`}
                      />
                      <span>{labState.status === 'running' ? 'CONNECTED' : 'PAUSED'}</span>
                    </div>

                    {remainingSec !== null && (
                      <>
                        <span className="text-line">|</span>
                        <div
                          className={`flex items-center gap-1.5 text-xs ${
                            remainingSec <= 60
                              ? 'text-rose-400 font-semibold'
                              : remainingSec <= 300
                              ? 'text-amber-400'
                              : 'text-muted'
                          }`}
                        >
                          <span className="text-muted/60">TIME:</span>
                          <span className="font-semibold text-text">{formatRemaining(remainingSec)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Right: Compact Environment Actions */}
                  <div className="flex items-center gap-2">
                    {labState.status === 'running' && (
                      <button
                        onClick={handleStop}
                        disabled={stopping || restarting || destroying}
                        className="rounded border border-line bg-panel px-2.5 py-1 text-xs text-muted hover:border-zinc-700 hover:text-text transition-colors disabled:opacity-50"
                      >
                        {stopping ? 'Pausing...' : 'Pause'}
                      </button>
                    )}
                    {labState.status === 'stopped' && (
                      <button
                        onClick={handleResume}
                        disabled={resuming || restarting || destroying}
                        className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                      >
                        {resuming ? 'Resuming...' : 'Resume'}
                      </button>
                    )}
                    <button
                      onClick={handleRestart}
                      disabled={restarting || stopping || resuming || destroying}
                      className="rounded border border-line bg-panel px-2.5 py-1 text-xs text-muted hover:border-zinc-700 hover:text-text transition-colors disabled:opacity-50"
                    >
                      {restarting ? 'Restarting...' : '↻ Restart'}
                    </button>
                    <button
                      onClick={handleDestroy}
                      disabled={destroying || stopping || resuming || restarting}
                      className="rounded border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/40 transition-colors disabled:opacity-50"
                    >
                      {destroying ? 'Ending...' : '✕ End Lab'}
                    </button>
                  </div>
                </div>
              )}

              <div className="relative flex flex-1 overflow-hidden">
                {phase === 'running' && celebrating && <CelebrationOverlay />}

                {/* Left Pane: Tasks */}
                {(phase === 'provisioning' || phase === 'running') && (
                  <div className="w-[420px] min-w-[340px] overflow-y-auto border-r border-line bg-bg">
                    <div className="p-6">
                      {phase === 'running' && taskProgress && taskProgress.tasks.length > 0 ? (
                        <LabTaskRenderer
                          progress={taskProgress}
                          taskStatuses={taskStatuses}
                          taskErrors={taskErrors}
                          validating={validating}
                          onValidate={handleValidate}
                        />
                      ) : tasksError ? (
                        <div className="rounded border border-rose-500/20 bg-rose-500/10 p-4 font-mono text-xs text-rose-300">
                          {tasksError}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 font-mono text-xs text-muted">
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                          {phase === 'provisioning' ? 'Setting up task harness...' : 'Loading lab tasks...'}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Right Pane: Terminal / Boot States */}
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-black">
                  {phase === 'provisioning' && (
                    <ProvisioningBoot image={env.image} label={meta.environment} />
                  )}

                  {phase === 'running' && labState && (
                    <>
                      {labState.status === 'running' && labState.wsUrl && (
                        <LabTerminal
                          key={labState.sessionId}
                          wsUrl={labState.wsUrl}
                          wsToken={labState.wsToken}
                          className="flex-1 p-2"
                          onTerminated={({ code }) => {
                            if (code === 4003) {
                              cancelCelebration();
                              setPhase('expired');
                            }
                          }}
                        />
                      )}
                      {labState.status === 'stopped' && (
                        <div className="flex flex-1 items-center justify-center font-mono text-xs text-muted">
                          Lab is paused. Click Resume above to reconnect.
                        </div>
                      )}
                    </>
                  )}

                  {phase === 'expired' && (
                    <div className="flex flex-1 items-center justify-center">
                      <div className="max-w-md space-y-4 text-center font-mono">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400">
                          ⏱
                        </div>
                        <div>
                          <h2 className="text-base font-semibold text-text">Lab Session Expired</h2>
                          <p className="mt-1 text-xs text-muted leading-relaxed">
                            This ephemeral sandbox container reached its time limit and was shut down.
                          </p>
                        </div>
                        <div className="flex justify-center gap-3 pt-2">
                          <button
                            onClick={handleStartNew}
                            className="rounded bg-accent px-4 py-2 text-xs font-semibold text-bg hover:bg-accentStrong transition-colors"
                          >
                            Start New Lab
                          </button>
                          <button
                            onClick={() => router.push(`/courses/${courseId}`)}
                            className="rounded border border-line bg-panel px-4 py-2 text-xs text-text hover:bg-line/20 transition-colors"
                          >
                            Back to Course
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {phase === 'error' && (
                    <div className="flex flex-1 items-center justify-center">
                      <div className="max-w-md space-y-4 text-center font-mono">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-400">
                          !
                        </div>
                        <div>
                          <h2 className="text-base font-semibold text-text">Lab Initialization Failed</h2>
                          <p className="mt-1 text-xs text-rose-400 leading-relaxed">{error}</p>
                        </div>
                        <div className="flex justify-center gap-3 pt-2">
                          <button
                            onClick={handleStart}
                            className="rounded bg-accent px-4 py-2 text-xs font-semibold text-bg hover:bg-accentStrong transition-colors"
                          >
                            Retry
                          </button>
                          <button
                            onClick={() => router.push(`/courses/${courseId}`)}
                            className="rounded border border-line bg-panel px-4 py-2 text-xs text-text hover:bg-line/20 transition-colors"
                          >
                            Back to Course
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <SubmitLabModal
        open={submitOpen}
        submitting={submitting}
        error={submitError}
        labTitle={labInfo?.title || labId}
        onSubmit={handleSubmitLab}
        onClose={() => setSubmitOpen(false)}
      />
    </main>
  );
}