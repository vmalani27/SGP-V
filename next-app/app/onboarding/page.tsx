'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

export default function OnboardingPage() {
  const { user, isAuthenticated, loading: authLoading, profileComplete } = useAuth();
  const router = useRouter();
  const [name, setName] = useState(user?.displayName ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (profileComplete) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, authLoading, profileComplete, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await api.users.updateProfile({ displayName: name.trim(), profileComplete: true });
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </main>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <main className="min-h-screen bg-bg text-text">
      <Navbar />
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center justify-center px-4">
        <div className="w-full rounded-2xl border border-line bg-panel p-8 shadow-2xl shadow-black/50">
          <div className="mb-8 flex items-center justify-center">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-accent" />
              <div className="h-0.5 w-8 bg-line" />
              <div className="h-2 w-2 rounded-full bg-line" />
            </div>
          </div>

          <div className="mb-8 text-center">
            <h1 className="hero-font text-2xl font-bold">Welcome to LabOps</h1>
            <p className="mt-2 text-sm text-muted">Let&apos;s get to know you.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-muted">
                Your name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-line bg-bg px-4 py-2.5 text-sm text-text placeholder-muted transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder="John Doe"
                autoFocus
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/60 focus:ring-offset-2 focus:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
