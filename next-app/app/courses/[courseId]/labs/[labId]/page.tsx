'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import LabTerminal from '@/components/LabTerminal';
import Navbar from '@/components/Navbar';

interface LabInfo {
  labId: string;
  title: string;
  moduleId: string;
  chapterId: string;
  instructions: string;
}

interface LabState {
  sessionId: string;
  wsUrl: string;
  containerName: string;
  status: string;
}

type LabPhase = 'loading' | 'intro' | 'provisioning' | 'running' | 'error';

export default function LabPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const courseId = params.courseId as string;
  const labId = params.labId as string;

  const [labInfo, setLabInfo] = useState<LabInfo | null>(null);
  const [labState, setLabState] = useState<LabState | null>(null);
  const [phase, setPhase] = useState<LabPhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [destroying, setDestroying] = useState(false);
  const [restarting, setRestarting] = useState(false);
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
        instructions: data.instructions || '',
      };
      setLabInfo(labInfoResult);
    }).catch(() => {
      labInfoResult = { labId, title: labId, moduleId: '', chapterId: '', instructions: '' };
      setLabInfo(labInfoResult);
    }).finally(() => {
      // After fetching instructions, check for active session
      api.labs.active(courseId, labId).then((active) => {
        if (active) {
          setLabState({
            sessionId: active.session_id,
            wsUrl: active.ws_url,
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
    });
  }, [isAuthenticated, courseId, labId]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  const handleStart = useCallback(async () => {
    setPhase('provisioning');
    setError(null);
    try {
      const result = await api.labs.start(courseId, labId);
      setLabState({
        sessionId: result.session_id,
        wsUrl: result.ws_url,
        containerName: result.container_name,
        status: result.status,
      });
      setPhase('running');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to start lab';
      setError(msg);
      setPhase('error');
    }
  }, [courseId, labId]);

  const handleRestart = async () => {
    if (!labState) return;
    setRestarting(true);
    try {
      await api.labs.destroy(courseId, labId, labState.sessionId);
    } catch (e) {
      console.error('Failed to destroy old lab:', e);
    }
    setLabState(null);
    setRestarting(false);
    await handleStart();
  };

  const handleStop = async () => {
    if (!labState) return;
    try {
      await api.labs.stop(courseId, labId, labState.sessionId);
      setLabState({ ...labState, status: 'stopped' });
    } catch (e) {
      console.error('Failed to stop lab:', e);
    }
  };

  const handleResume = async () => {
    if (!labState) return;
    try {
      await api.labs.resume(courseId, labId, labState.sessionId);
      setLabState({ ...labState, status: 'running' });
    } catch (e) {
      console.error('Failed to resume lab:', e);
    }
  };

  const handleDestroy = async () => {
    if (!labState) return;
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

  if (authLoading || phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1419]">
        <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  const hasInstructions = labInfo?.instructions && labInfo.instructions.length > 0;

  return (
    <div className="h-screen flex flex-col bg-[#0f1419] overflow-hidden">
      <Navbar
        breadcrumb={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: courseId, href: `/courses/${courseId}` },
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
              <button onClick={handleStop} className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded text-xs font-medium transition-colors">
                Pause
              </button>
            )}
            {labState.status === 'stopped' && (
              <button onClick={handleResume} className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded text-xs font-medium transition-colors">
                Resume
              </button>
            )}
            <button onClick={handleRestart} disabled={restarting} className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded text-xs font-medium transition-colors disabled:opacity-50">
              {restarting ? 'Restarting...' : 'Restart'}
            </button>
            <button onClick={handleDestroy} disabled={destroying} className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-xs font-medium transition-colors disabled:opacity-50">
              {destroying ? 'Destroying...' : 'Destroy'}
            </button>
          </div>
        </div>
      )}

      {/* Two-pane body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left pane — instructions */}
        {(phase === 'intro' || phase === 'running' || phase === 'provisioning') && labInfo && (
          <div className={`overflow-y-auto border-r border-gray-800 ${
            (phase === 'running' || phase === 'provisioning') ? 'w-[400px] min-w-[320px]' : 'flex-1 max-w-3xl mx-auto px-6'
          }`}>
            <div className="px-6 py-8">
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-400">
                    Lab
                  </span>
                  {labInfo?.moduleId && (
                    <span className="text-xs text-muted">{labInfo.moduleId}</span>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-text">
                  {labInfo?.title || labId}
                </h1>
              </div>

              {/* Instructions */}
              {hasInstructions && (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {labInfo.instructions}
                  </ReactMarkdown>
                </div>
              )}
              {!hasInstructions && phase === 'intro' && (
                <p className="text-muted text-sm">
                  No written instructions for this lab. Start the environment and follow the tasks in the terminal.
                </p>
              )}


            </div>
          </div>
        )}

        {/* Right pane — terminal / action */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {phase === 'intro' && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
                  <svg className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-text mb-2">Ready when you are</h2>
                <p className="text-sm text-muted mb-6">
                  Read the instructions on the left, then start the lab to open a live terminal.
                </p>
                <button
                  onClick={handleStart}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                  </svg>
                  Start Lab
                </button>
              </div>
            </div>
          )}

          {phase === 'provisioning' && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-gray-300 text-sm">
                  {restarting ? 'Restarting lab environment...' : 'Provisioning lab environment...'}
                </p>
                <p className="text-gray-500 text-xs">Pulling image, creating container, installing packages</p>
              </div>
            </div>
          )}

          {phase === 'running' && labState && (
            <>
              {labState.status === 'running' && labState.wsUrl && (
                <LabTerminal
                  wsUrl={labState.wsUrl}
                  className="flex-1 p-2"
                />
              )}
              {labState.status === 'stopped' && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <p className="text-gray-400">Lab is paused</p>
                    <button onClick={handleResume} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors">
                      Resume Lab
                    </button>
                  </div>
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
    </div>
  );
}
