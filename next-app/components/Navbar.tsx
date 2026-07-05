'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="hero-font text-lg font-bold tracking-tight text-text">
          LabOps
        </Link>

        <div className="hidden items-center gap-8 text-sm text-muted md:flex">
          <Link href="/#curriculum" className="transition hover:text-text">Curriculum</Link>
          <Link href="/#pricing" className="transition hover:text-text">Pricing</Link>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-lg border border-accent/30 px-4 py-1.5 text-sm text-accent transition hover:bg-accent/10"
              >
                Dashboard
              </Link>
              <button
                onClick={logout}
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-bg transition hover:bg-accent/90"
              >
                Log Out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-4 py-1.5 text-sm text-muted transition hover:text-text"
              >
                Log In
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-bg transition hover:bg-accent/90"
              >
                Start Free
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
