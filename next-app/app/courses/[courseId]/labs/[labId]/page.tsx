'use client';

import { useEffect, useState, useCallback } from 'react';
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

type LabPhase = 'intro' | 'provisioning' | 'running' | 'error';

export default function LabPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();

  const courseId = params.courseId as string;
  const labId = params.labId as string;

  const [labInfo, setLabInfo] = useState<LabInfo | null>(null);
  const [labState, setLabState] = useState<LabState | null>(null);
  const [phase, setPhase] = useState<LabPhase>('intro');
  const [error, setError] = useState<string | null>(null);
  const [destroying, setDestroying] = useState(false);

  // Fetch lab instructions on mount
  useEffect(() => {
    if (!isAuthenticated || !courseId || !labId) return;

    api.content.getLabInstructions(courseId, labId).then((data) => {
      setLabInfo({
        labId: data.lab_id,
        title: data.title,
        moduleId: data.module_id,
        chapterId: data.chapter_id,
        instructions: data.instructions || '',
      });
    }).catch(() => {
      // If instructions not found, still allow starting
      setLabInfo({ labId, title: labId, moduleId: '', chapterId: '', instructions: '' });
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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1419]">
        <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0f1419]">
      <Navbar
        breadcrumb={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: courseId, href: `/courses/${courseId}` },
          { label: labInfo?.title || labId },
        ]}
      />

      {/* ── Intro phase ───────────────────────────────────────────────── */}
      {phase === 'intro' && (
        <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-10">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-400">
                Lab
              </span>
              {labInfo?.moduleId && (
                <span className="text-xs text-muted">{labInfo.moduleId}</span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-text mb-2">
              {labInfo?.title || labId}
            </h1>
          </div>

          {/* Lab instructions markdown */}
          {labInfo?.instructions && (
            <div className="prose prose-invert prose-sm max-w-none mb-10">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {labInfo.instructions}
              </ReactMarkdown>
            </div>
          )}

          {!labInfo?.instructions && (
            <div className="text-muted text-sm mb-10">
              <p>No written instructions for this lab. Start the environment and follow the tasks in the terminal.</p>
            </div>
          )}

          {/* Start button */}
          <button
            onClick={handleStart}
            className="flex items-center gap-3 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
            </svg>
            Start Lab
          </button>

          <p className="mt-3 text-xs text-muted">
            A containerized environment will be provisioned for you. This may take 30-60 seconds.
          </p>
        </div>
      )}

      {/* ── Provisioning phase ────────────────────────────────────────── */}
      {phase === 'provisioning' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-300 text-sm">Provisioning lab environment...</p>
            <p className="text-gray-500 text-xs">Pulling image, creating container, installing packages</p>
          </div>
        </div>
      )}

      {/* ── Running phase ─────────────────────────────────────────────── */}
      {phase === 'running' && labState && (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${
                labState.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
              }`} />
              <span className="text-sm text-gray-300 font-mono">{labState.containerName}</span>
              <span className="text-xs text-gray-500">Session: {labState.sessionId}</span>
            </div>

            <div className="flex items-center gap-2">
              {labState.status === 'running' && (
                <button
                  onClick={handleStop}
                  className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded text-xs font-medium transition-colors"
                >
                  Pause
                </button>
              )}
              {labState.status === 'stopped' && (
                <button
                  onClick={handleResume}
                  className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded text-xs font-medium transition-colors"
                >
                  Resume
                </button>
              )}
              <button
                onClick={handleDestroy}
                disabled={destroying}
                className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-xs font-medium transition-colors disabled:opacity-50"
              >
                {destroying ? 'Destroying...' : 'Destroy'}
              </button>
            </div>
          </div>

          {/* Terminal */}
          <div className="flex-1 p-2">
            {labState.status === 'running' && labState.wsUrl && (
              <LabTerminal
                wsUrl={labState.wsUrl}
                className="h-full rounded-lg overflow-hidden border border-gray-800"
              />
            )}
            {labState.status === 'stopped' && (
              <div className="flex items-center justify-center h-[600px]">
                <div className="text-center space-y-3">
                  <p className="text-gray-400">Lab is paused</p>
                  <button
                    onClick={handleResume}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Resume Lab
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Error phase ───────────────────────────────────────────────── */}
      {phase === 'error' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 max-w-md">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
              <span className="text-red-400 text-xl">!</span>
            </div>
            <h2 className="text-lg font-semibold text-white">Lab Failed to Start</h2>
            <p className="text-gray-400 text-sm">{error}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleStart}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Retry
              </button>
              <button
                onClick={() => router.push(`/courses/${courseId}`)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-colors"
              >
                Back to Course
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
