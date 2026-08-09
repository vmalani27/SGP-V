'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { getCourse, getAllItems, itemHref } from '@/lib/content-server';
import type { LabMeta, TaskStatus, TaskProgressData } from '@/lib/task-types';
import type { ContentCourse } from '@/lib/content-types';
import LabTerminal from '@/components/LabTerminal';
import Navbar from '@/components/Navbar';
import LearningPlayer from '@/components/LearningPlayer';
import TheorySection from '@/components/TheorySection';
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
}

type LabPhase = 'loading' | 'intro' | 'provisioning' | 'running' | 'error';

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
    if (lab.completion) meta.completion = lab.completion as LabMeta['completion'];
  };

  fromLab(config);

  return meta;
}

// The environment config the orchestrator needs to provision the container.
// Comes from the lab config's resolved environment ({base_image, apt_packages,
// pre_pull}) plus the lab's top-level setup commands.
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

// Difficulty shown as a compact 3-bar meter placeholder (value stays in YAML).
const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced'];

function DifficultyMeter({ level }: { level: LabMeta['difficulty'] }) {
  const filled = Math.max(1, DIFFICULTY_LEVELS.indexOf(level) + 1);
  return (
    <span className="flex items-center gap-1.5" title={`Difficulty: ${level}`}>
      <span className="flex items-end gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`w-1 rounded-sm ${i < filled ? 'bg-accent' : 'bg-muted/25'}`}
            style={{ height: `${6 + i * 3}px` }}
          />
        ))}
      </span>
      <span className="text-xs text-muted">Difficulty</span>
    </span>
  );
}

export default function LabPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading, refreshEnrollments } = useAuth();

  const courseId = params.courseId as string;
  const labId = params.labId as string;

  const [labInfo, setLabInfo] = useState<LabInfo | null>(null);
  const [labMeta, setLabMeta] = useState<LabMeta | null>(null);
  const [labConfig, setLabConfig] = useState<Record<string, unknown> | null>(null);
  const [course, setCourse] = useState<ContentCourse | null>(null);
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

  // Fetch lab instructions + check active session on mount
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
      // After fetching instructions, build lab meta and check for active session
      api.content.getLabConfig(courseId, labId)
        .then((config) => {
          setLabConfig(config);
          setLabMeta(buildLabMeta(config, labId, labInfoResult?.title || labId));
        })
        .catch(() => setLabMeta(buildLabMeta(null, labId, labInfoResult?.title || labId)));

      api.labs.active(courseId, labId).then((active) => {
        if (active) {
          setLabState({
            sessionId: active.session_id,
            wsUrl: active.ws_url,
            wsToken: active.ws_token,
            containerName: active.container_name,
            status: active.status,
          });
          setPhase('running');
        } else {
          setPhase('intro');
        }
      }).catch(() => {
        setPhase('intro');
      });

      // Course TOC so the intro phase can render inside the shared player layout.
      getCourse(courseId)
        .then((c) => setCourse(c))
        .catch(() => setCourse(null));
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

  const cancelCelebration = () => {
    if (celebrateTimerRef.current) {
      clearTimeout(celebrateTimerRef.current);
      celebrateTimerRef.current = null;
    }
    setCelebrating(false);
  };

  const handleStart = useCallback(async () => {
    cancelCelebration();
    setPhase('provisioning');
    setError(null);
    try {
      // The client owns the lab config — fetch it if it didn't arrive on mount.
      let config = labConfig;
      if (!config) {
        try {
          config = await api.content.getLabConfig(courseId, labId);
        } catch {
          config = null;
        }
      }
      const result = await api.labs.start(courseId, labId, envConfigFrom(config));
      setLabState({
        sessionId: result.session_id,
        wsUrl: result.ws_url,
        wsToken: result.ws_token,
        containerName: result.container_name,
        status: result.status,
      });
      setPhase('running');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to start lab';
      setError(msg);
      setPhase('error');
    }
  }, [courseId, labId, labConfig]);

  const handleRestart = async () => {
    if (!labState) return;
    cancelCelebration();
    setRestarting(true);
    setPhase('provisioning');
    try {
      // Restart the SAME container (stop + start) so the student's changes
      // persist — e.g. adding 'student' to the docker group survives restart.
      if (labState.status === 'running') {
        await api.labs.stop(courseId, labId, labState.sessionId);
      }
      await api.labs.resume(courseId, labId, labState.sessionId);
      setLabState({ ...labState, status: 'running' });
    } catch (e) {
      // Fall back to a full destroy + recreate if the container is unusable.
      console.error('Stop/resume restart failed, recreating container:', e);
      try {
        await api.labs.destroy(courseId, labId, labState.sessionId);
      } catch (e2) {
        console.error('Failed to destroy old lab:', e2);
      }
      setLabState(null);
      try {
        const result = await api.labs.start(courseId, labId, envConfigFrom(labConfig));
        setLabState({
          sessionId: result.session_id,
          wsUrl: result.ws_url,
          wsToken: result.ws_token,
          containerName: result.container_name,
          status: result.status,
        });
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
      setPhase('intro');
      setSubmitOpen(false);
      cancelCelebration();
      await refreshEnrollments();

      // Continue along the linear learning path: go to the next item after
      // this lab (a chapter or another lab), falling back to the course page.
      const course = await getCourse(courseId);
      const items = course ? getAllItems(course) : [];
      const idx = items.findIndex((item) => item.id === labId);
      const nextItem = idx >= 0 ? items[idx + 1] : undefined;
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

    // Tasks come from the client's local lab config; the backend enriches
    // dynamic multiple-choice options against the live container.
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

  // Intro — rendered inside the shared LearningPlayer layout so the pre-start
  // lab page matches the chapter reading experience exactly.
  if (phase === 'intro' && course) {
    const moduleTitle =
      course.modules.find((m) => m.id === labInfo?.moduleId)?.title ?? labInfo?.moduleId ?? '';
    return (
      <LearningPlayer
        course={course}
        courseId={courseId}
        currentItem={{ id: labId, title: meta.title, moduleId: labInfo?.moduleId || '', moduleTitle }}
      >
        <div className="space-y-6">
          <DifficultyMeter level={meta.difficulty} />

          <TheorySection
            title="Instructions"
            content={labInfo?.instructions || 'Complete the tasks below to finish this lab.'}
          />

          {meta.objectives.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Objectives</h3>
              <div className="space-y-2">
                {meta.objectives.map((obj, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 mt-0.5 shrink-0">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </span>
                    <p className="text-sm text-text">{obj}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleStart}
              className="flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent/90"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
              </svg>
              Start Lab
            </button>
          </div>
        </div>
      </LearningPlayer>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0f1419] overflow-hidden pt-14">
      <Navbar
        breadcrumb={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: courseId, href: `/courses/${courseId}` },
          { label: (labInfo?.moduleId || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Course' },
          { label: labInfo?.title || labId },
        ]}
      />

      {/* Toolbar — shown while lab is running/stopped */}
      {phase === 'running' && labState && (
        <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${
              labState.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
            }`} />
            <span className="text-sm text-gray-300 font-mono">{labState.containerName}</span>
            <span className="text-xs text-gray-500">Session: {labState.sessionId}</span>
          </div>

          <div className="flex items-center gap-2">
            {labState.status === 'running' && (
              <button onClick={handleStop} disabled={stopping || restarting || destroying} className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {stopping ? 'Pausing...' : 'Pause'}
              </button>
            )}
            {labState.status === 'stopped' && (
              <button onClick={handleResume} disabled={resuming || restarting || destroying} className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {resuming ? 'Resuming...' : 'Resume'}
              </button>
            )}
            <button onClick={handleRestart} disabled={restarting || stopping || resuming || destroying} className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded text-xs font-medium transition-colors disabled:opacity-50">
              {restarting ? 'Restarting...' : 'Restart'}
            </button>
            <button onClick={handleDestroy} disabled={destroying || stopping || resuming || restarting} className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-xs font-medium transition-colors disabled:opacity-50">
              {destroying ? 'Destroying...' : 'Destroy'}
            </button>
          </div>
        </div>
      )}

      {/* Intro — fallback centered card (only if course TOC failed to load) */}
      {phase === 'intro' && (() => {
        return (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto px-6 py-12">
            <div className="flex items-center gap-2 text-xs text-muted mb-6">
              <span>{labInfo?.moduleId || 'Course'}</span>
              <span className="text-muted/40">/</span>
              <span className="text-text font-medium">{meta.title}</span>
            </div>

            <h1 className="text-3xl font-bold text-text mb-2">{meta.title}</h1>

            <DifficultyMeter level={meta.difficulty} />

            <div className="rounded-xl border border-line bg-panel mb-8">
              {labInfo?.instructions ? (
                <article className="prose-custom max-w-none p-6 text-sm text-text leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {labInfo.instructions}
                  </ReactMarkdown>
                </article>
              ) : (
                <p className="p-6 text-sm text-text leading-relaxed">
                  Complete the tasks below to finish this lab.
                </p>
              )}
            </div>

            {meta.objectives.length > 0 && (
              <>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Objectives</h3>
                <div className="space-y-2 mb-8">
                  {meta.objectives.map((obj, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 mt-0.5 shrink-0">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      </span>
                      <p className="text-sm text-text">{obj}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            <button
              onClick={handleStart}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-accent hover:bg-accent/90 text-bg rounded-xl font-medium transition-colors text-sm"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
              </svg>
              Start Lab
            </button>
          </div>
        </div>
        );
      })()}

      {/* Split-pane body — provisioning / running / error */}
      {phase !== 'intro' && (
        <div className="relative flex flex-1 overflow-hidden">
          {phase === 'running' && celebrating && <CelebrationOverlay />}
          {/* Left pane — tasks */}
          {(phase === 'provisioning' || phase === 'running') && (
            <div className="overflow-y-auto border-r border-gray-800 w-[400px] min-w-[320px]">
              <div className="px-6 py-8">
                {(phase === 'running' && taskProgress && taskProgress.tasks.length > 0) ? (
                  <LabTaskRenderer
                    progress={taskProgress}
                    taskStatuses={taskStatuses}
                    taskErrors={taskErrors}
                    validating={validating}
                    onValidate={handleValidate}
                  />
                ) : tasksError ? (
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-sm text-red-300">{tasksError}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                      Loading lab tasks...
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right pane — terminal / action */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {phase === 'provisioning' && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-4">
                  <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-gray-300 text-sm">
                    {restarting ? 'Restarting lab environment...' : 'Provisioning lab environment...'}
                  </p>
                  <p className="text-gray-500 text-xs">Hang on, this will take a few minutes</p>
                </div>
              </div>
            )}

            {phase === 'running' && labState && (
              <>
                {labState.status === 'running' && labState.wsUrl && (
                  <LabTerminal
                    key={labState.sessionId}
                    wsUrl={labState.wsUrl}
                    wsToken={labState.wsToken}
                    className="flex-1 p-2"
                  />
                )}
                {labState.status === 'stopped' && (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-gray-400">Lab is paused</p>
                  </div>
                )}
              </>
            )}

            {phase === 'error' && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-4 max-w-md">
                  <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
                    <span className="text-red-400 text-xl">!</span>
                  </div>
                  <h2 className="text-lg font-semibold text-white">Lab Failed to Start</h2>
                  <p className="text-gray-400 text-sm">{error}</p>
                  <div className="flex gap-3 justify-center">
                    <button onClick={handleStart} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors">
                      Retry
                    </button>
                    <button onClick={() => router.push(`/courses/${courseId}`)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-colors">
                      Back to Course
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <SubmitLabModal
        open={submitOpen}
        submitting={submitting}
        error={submitError}
        labTitle={labInfo?.title || labId}
        onSubmit={handleSubmitLab}
        onClose={() => setSubmitOpen(false)}
      />
    </div>
  );
}
