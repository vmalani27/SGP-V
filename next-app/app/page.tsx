'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { api, type CourseMeta } from '@/lib/api';

export default function HomePage() {
  const [courses, setCourses] = useState<CourseMeta[]>([]);

  useEffect(() => {
    api.courses.list().then(setCourses).catch(() => {});
  }, []);

  return (
    <main className="min-h-screen bg-bg text-text">
      <Navbar />

      {/* Hero */}
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-12 px-6 pt-24 md:flex-row md:gap-16">
        <div className="max-w-xl space-y-6">
          <h1 className="hero-font text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            Master Git & Docker Through Hands-On Labs
          </h1>
          <p className="text-lg leading-relaxed text-muted">
            Stop watching videos. Start typing commands. Learn by doing in our interactive,
            in-browser terminal environments.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/register"
              className="rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-bg transition hover:bg-accent/90"
            >
              Start Learning for Free
            </Link>
            <a
              href="#curriculum"
              className="rounded-lg border border-line px-6 py-3 text-sm font-semibold text-muted transition hover:border-accent/50 hover:text-text"
            >
              View Curriculum
            </a>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="mx-auto max-w-6xl px-6 pb-32">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-line bg-panel p-6 transition hover:border-accent/30">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <TerminalIcon />
            </div>
            <h3 className="hero-font mb-2 text-lg font-semibold">Interactive In-Browser Terminals</h3>
            <p className="text-sm leading-relaxed text-muted">
              No local setup required. Spin up real Git and Docker environments instantly
              from your browser.
            </p>
          </div>
          <div className="rounded-xl border border-line bg-panel p-6 transition hover:border-accent/30">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <BugIcon />
            </div>
            <h3 className="hero-font mb-2 text-lg font-semibold">Real-World Scenarios</h3>
            <p className="text-sm leading-relaxed text-muted">
              Learn how to fix broken deployments, resolve merge conflicts, and optimize
              Dockerfiles — not just basic commands.
            </p>
          </div>
          <div className="rounded-xl border border-line bg-panel p-6 transition hover:border-accent/30">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <CheckIcon />
            </div>
            <h3 className="hero-font mb-2 text-lg font-semibold">Instant Feedback</h3>
            <p className="text-sm leading-relaxed text-muted">
              Automated grading validates your lab work so you know immediately when
              you&apos;ve solved it correctly.
            </p>
          </div>
        </div>
      </section>

      {/* Learning Paths */}
      <section id="curriculum" className="mx-auto max-w-6xl px-6 pb-32">
        <div className="mb-12 text-center">
          <h2 className="hero-font text-3xl font-bold">Learning Paths</h2>
          <p className="mt-3 text-muted">Structured curriculums built by DevOps engineers.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {courses.length > 0
            ? courses.map((course) => (
                <div
                  key={course.id}
                  className="rounded-xl border border-line bg-panel p-8 transition hover:border-accent/30"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    {course.id === 'git-fundamentals' ? <GitIcon /> : <DockerIcon />}
                  </div>
                  <h3 className="hero-font mb-2 text-xl font-bold">{course.title}</h3>
                  <p className="mb-4 text-sm text-muted">{course.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted">
                    <span>{course.modules.length} {course.modules.length === 1 ? 'Module' : 'Modules'}</span>
                    <span className="text-line">|</span>
                    <span className="capitalize">{course.level}</span>
                  </div>
                </div>
              ))
            : /* Static fallback */
              <>
                <div className="rounded-xl border border-line bg-panel p-8 transition hover:border-accent/30">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <GitIcon />
                  </div>
                  <h3 className="hero-font mb-2 text-xl font-bold">Git Fundamentals</h3>
                  <p className="mb-4 text-sm text-muted">
                    From your first commit to advanced branching strategies and CI/CD integration.
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted">
                    <span>1 Module</span>
                    <span className="text-line">|</span>
                    <span className="capitalize">beginner</span>
                  </div>
                </div>
                <div className="rounded-xl border border-line bg-panel p-8 transition hover:border-accent/30">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <DockerIcon />
                  </div>
                  <h3 className="hero-font mb-2 text-xl font-bold">Docker Mastery</h3>
                  <p className="mb-4 text-sm text-muted">
                    Containers, multi-stage builds, Docker Compose, and production-ready deployments.
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted">
                    <span>1 Module</span>
                    <span className="text-line">|</span>
                    <span className="capitalize">intermediate</span>
                  </div>
                </div>
              </>
          }
        </div>
      </section>

      <Footer />
    </main>
  );
}

function TerminalIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}

function BugIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44a23.91 23.91 0 0 0 1.153 6.06M12 12.75a2.25 2.25 0 0 0 2.248-2.354M12 12.75a2.25 2.25 0 0 1-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 0 0-.399-2.25M12 8.25c-.995 0-1.97-.08-2.922-.236-.402-.066-.74-.358-.795-.762a3.778 3.778 0 0 1 .399-2.25M12 8.25a2.25 2.25 0 0 0-2.248 2.146M12 8.25a2.25 2.25 0 0 1 2.248 2.146M8.683 5a6.032 6.032 0 0 1-1.155-1.002c.708-.591 1.572-.81 2.453-.548.698.208 1.27.797 1.543 1.553M15.317 5a6.032 6.032 0 0 0 1.155-1.002c-.708-.591-1.572-.81-2.453-.548-.698.208-1.27.797-1.543 1.553" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function GitIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

function DockerIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
    </svg>
  );
}
