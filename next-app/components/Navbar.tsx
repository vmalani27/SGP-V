'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function Navbar({ breadcrumb }: { breadcrumb?: { label: string; href?: string }[] }) {
  const { user, logout } = useAuth();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="flex h-14 w-full items-center justify-between px-5">
        <div className="flex items-center gap-4">
          <Link href="/" className="hero-font text-sm font-semibold tracking-tight text-text">
            LabOps
          </Link>
          {breadcrumb && breadcrumb.length > 0 && (
            <div className="flex items-center gap-2 text-[13px]">
              {breadcrumb.map((item, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-muted/40">/</span>}
                  {item.href ? (
                    <Link href={item.href} className="text-muted hover:text-accent transition-colors">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="font-medium text-text">{item.label}</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <button
                onClick={logout}
                className="rounded-md border border-line px-3 py-1 text-[13px] font-medium text-muted transition hover:border-accent/30 hover:text-text"
              >
                Log Out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-[13px] text-muted transition hover:text-text"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-accent px-3 py-1 text-[13px] font-medium text-bg transition hover:bg-accent/90"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
