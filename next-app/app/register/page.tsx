'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

function getAuthErrorMessage(errorCode: string): string {
  const errorMap: Record<string, string> = {
    'auth/email-already-in-use': 'This email is already registered. Please sign in instead.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/operation-not-allowed': 'Email/password registration is not enabled.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    'auth/missing-password': 'Please enter a password.',
  };
  return errorMap[errorCode] || 'An error occurred. Please try again.';
}

export default function RegisterPage() {
  const { register, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, authLoading, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await register(email, password, name);
      router.push('/onboarding');
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      if (firebaseError.code) {
        setError(getAuthErrorMessage(firebaseError.code));
      } else {
        setError(err instanceof Error ? err.message : 'Registration failed');
      }
    }
  };

  return (
    <main className="flex min-h-screen bg-bg">
      {/* Left — Branding panel */}
      <div className="hidden w-1/2 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#0a1628] via-panel to-[#0d1a2d] p-12 md:flex">
        <div className="relative flex h-full w-full items-center justify-center">
          <div className="absolute inset-0" aria-hidden="true">
            <div className="absolute left-1/4 top-1/3 h-2 w-2 rounded-full bg-accent/30 animate-pulse" style={{ animationDelay: '0s', animationDuration: '3s' }} />
            <div className="absolute left-2/3 top-1/4 h-1.5 w-1.5 rounded-full bg-accent/20 animate-pulse" style={{ animationDelay: '0.5s', animationDuration: '4s' }} />
            <div className="absolute left-1/2 top-2/3 h-2.5 w-2.5 rounded-full bg-accent/25 animate-pulse" style={{ animationDelay: '1s', animationDuration: '3.5s' }} />
            <div className="absolute left-3/4 top-1/2 h-1.5 w-1.5 rounded-full bg-accent/15 animate-pulse" style={{ animationDelay: '1.5s', animationDuration: '2.8s' }} />
            <div className="absolute left-1/5 top-3/4 h-2 w-2 rounded-full bg-accent/20 animate-pulse" style={{ animationDelay: '2s', animationDuration: '4.2s' }} />
            <div className="absolute left-4/5 top-1/5 h-1 w-1 rounded-full bg-accent/20 animate-pulse" style={{ animationDelay: '0.3s', animationDuration: '3.2s' }} />
            <svg className="absolute inset-0 h-full w-full opacity-20" viewBox="0 0 500 500">
              <line x1="125" y1="167" x2="333" y2="125" stroke="#60a5fa" strokeWidth="0.5" />
              <line x1="333" y1="125" x2="250" y2="333" stroke="#60a5fa" strokeWidth="0.5" />
              <line x1="250" y1="333" x2="375" y2="250" stroke="#60a5fa" strokeWidth="0.5" />
              <line x1="100" y1="375" x2="125" y2="167" stroke="#60a5fa" strokeWidth="0.5" />
              <line x1="400" y1="100" x2="333" y2="125" stroke="#60a5fa" strokeWidth="0.5" />
            </svg>
          </div>
          <div className="relative text-center">
            <Link href="/" className="hero-font text-3xl font-bold tracking-tight text-text">
              LabOps
            </Link>
            <p className="mt-4 text-lg text-muted">Master Git & Docker through hands-on labs</p>
          </div>
        </div>
      </div>

      {/* Right — Register form */}
      <div className="flex w-full items-center justify-center px-6 md:w-1/2">
        {/* Card Container */}
        <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-8 shadow-2xl shadow-black/50">
          <div className="mb-8">
            <Link href="/" className="hero-font text-lg font-bold tracking-tight text-text md:hidden">
              LabOps
            </Link>
            <h1 className="hero-font mt-8 text-2xl font-bold md:mt-0">Create your account</h1>
            <p className="mt-1 text-sm text-muted">Start learning Git & Docker today</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-muted">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-line bg-bg px-4 py-2.5 text-sm text-text placeholder-muted transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-muted">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-line bg-bg px-4 py-2.5 text-sm text-text placeholder-muted transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-muted">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-line bg-bg px-4 py-2.5 text-sm text-text placeholder-muted transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/60 focus:ring-offset-2 focus:ring-offset-bg"
            >
              Create Account
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-muted">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-accent transition hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}