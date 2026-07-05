'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api, type Course } from '@/lib/api';

export default function OnboardingPage() {
  const { user, isAuthenticated, loading, refreshProfile } = useAuth();
  const router = useRouter();

  const [courses, setCourses] = useState<Course[]>([]);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    api.courses.list().then(setCourses).catch(() => {});
  }, [isAuthenticated, loading, router]);

  const handleFinish = async () => {
    setSubmitting(true);
    try {
      await api.users.updateProfile({
        displayName: displayName || user?.displayName || undefined,
        profileComplete: true,
      });

      if (selectedCourse) {
        await api.courses.enroll(selectedCourse);
      }

      await refreshProfile();
      router.push('/dashboard');
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </main>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-lg">
        {/* Steps indicator */}
        <div className="mb-10 flex items-center justify-center gap-2">
          <span className={`h-2 w-2 rounded-full ${step >= 0 ? 'bg-accent' : 'bg-line'}`} />
          <span className="h-px w-8 bg-line" />
          <span className={`h-2 w-2 rounded-full ${step >= 1 ? 'bg-accent' : 'bg-line'}`} />
        </div>

        {step === 0 && (
          <div className="text-center">
            <h1 className="hero-font text-2xl font-bold">Welcome to LabOps</h1>
            <p className="mt-2 text-sm text-muted">Let&apos;s get to know you.</p>

            <div className="mt-8 text-left">
              <label htmlFor="name" className="block text-sm font-medium text-muted">
                Your name
              </label>
              <input
                id="name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-line bg-panel px-4 py-2.5 text-sm text-text placeholder-muted transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder="Jane Doe"
              />
            </div>

            <button
              onClick={() => setStep(1)}
              disabled={!displayName.trim()}
              className="mt-8 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent/90 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <h1 className="hero-font text-2xl font-bold">Choose your path</h1>
            <p className="mt-2 text-sm text-muted">Pick a course to start with.</p>

            <div className="mt-6 grid gap-4">
              {courses.map((course) => (
                <button
                  key={course.id}
                  onClick={() => setSelectedCourse(course.id)}
                  className={`rounded-xl border p-5 text-left transition ${
                    selectedCourse === course.id
                      ? 'border-accent bg-accent/5'
                      : 'border-line bg-panel hover:border-accent/30'
                  }`}
                >
                  <h3 className="hero-font font-bold text-text">{course.title}</h3>
                  <p className="mt-1 text-sm text-muted line-clamp-2">{course.description}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                    <span>{course.labs} Labs</span>
                    <span className="text-line">|</span>
                    <span className="capitalize">{course.level}</span>
                  </div>
                </button>
              ))}

              <button
                onClick={() => setSelectedCourse(null)}
                className={`rounded-xl border p-4 text-center text-sm transition ${
                  selectedCourse === null
                    ? 'border-accent bg-accent/5'
                    : 'border-line bg-panel text-muted hover:border-accent/30'
                }`}
              >
                I&apos;ll decide later
              </button>
            </div>

            <button
              onClick={handleFinish}
              disabled={submitting}
              className="mt-8 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent/90 disabled:opacity-50"
            >
              {submitting ? 'Setting up...' : 'Start Learning'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
