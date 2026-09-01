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
    <main className="min-h-screen bg-bg text-text selection:bg-accent selection:text-bg font-sans antialiased">
      <Navbar />

      {/* Hero Section: Split View with Terminal Proof */}
      <section className="relative border-b border-line bg-panel/10">
        <div className="mx-auto max-w-6xl px-6 pt-20 pb-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left: Value Proposition */}
          <div className="lg:col-span-7 space-y-6">

            <h1 className="hero-font text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-text leading-[1.1]">
              Master the tools.<br />
              <span className="text-muted font-bold">Skip setup fatigue.</span>
            </h1>

            <p className="text-base sm:text-lg text-muted max-w-xl leading-relaxed">
              Stop watching videos and reading disconnected guides. Build genuine muscle memory in pre-configured, isolated environments with instant state-level verification.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                href="/register"
                className="rounded bg-accent px-5 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 shadow-sm"
              >
                Start Learning Free
              </Link>
              <a
                href="#curriculum"
                className="rounded border border-line bg-panel/40 px-5 py-2.5 text-sm font-medium text-text transition hover:bg-panel hover:border-accent/40"
              >
                Browse Syllabus
              </a>
            </div>
          </div>

          {/* Right: Technical Proof (Simulated Terminal) */}
          <div className="lg:col-span-5">
            <div className="rounded border border-line bg-panel shadow-2xl overflow-hidden font-mono text-xs">
              <div className="flex items-center justify-between border-b border-line bg-bg/70 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-line" />
                  <div className="h-2.5 w-2.5 rounded-full bg-line" />
                  <div className="h-2.5 w-2.5 rounded-full bg-line" />
                  <span className="ml-2 text-[11px] text-muted">lab-session: active</span>
                </div>
                <span className="text-[10px] text-accent uppercase font-bold tracking-wider">SANDBOX</span>
              </div>
              <div className="p-4 space-y-2.5 text-muted leading-relaxed">
                <p>
                  <span className="text-accent font-semibold">student@lab</span>:
                  <span className="text-text">~</span>$ git checkout -b fix/auth-token
                </p>
                <p className="text-text/80">Switched to a new branch 'fix/auth-token'</p>
                <p>
                  <span className="text-accent font-semibold">student@lab</span>:
                  <span className="text-text">~</span>$ labops check --task 1
                </p>
                <div className="rounded border border-line/60 bg-bg/40 p-2.5 space-y-1 my-2">
                  <p className="text-emerald-400">[✓] Validating branch head pointer ... PASS</p>
                  <p className="text-emerald-400">[✓] Clean working tree confirmation ... PASS</p>
                  <p className="text-text/90 pt-1 font-sans text-xs">Task 1 complete: Branching verified.</p>
                </div>
                <p className="flex items-center gap-1 text-text">
                  <span className="text-accent font-semibold">student@lab</span>:
                  <span className="text-text">~</span>$ <span className="h-3.5 w-1.5 bg-accent animate-pulse inline-block" />
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Pillars: Simple & Direct */}
      <section className="border-b border-line bg-bg">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 divide-y md:divide-y-0 md:divide-x divide-line">
            
            <div className="space-y-3 md:pr-6">
              <h3 className="hero-font text-lg font-bold text-text">Real Environments</h3>
              <p className="text-sm text-muted leading-relaxed">
                Practice in actual Linux and Docker terminals, not simulations. What you type here works exactly the same in production.
              </p>
            </div>

            <div className="space-y-3 pt-6 md:pt-0 md:px-6">
              <h3 className="hero-font text-lg font-bold text-text">Structured Learning</h3>
              <p className="text-sm text-muted leading-relaxed">
                Follow a clear syllabus. Start with the basics and progressively build up to complex, industry-standard workflows.
              </p>
            </div>

            <div className="space-y-3 pt-6 md:pt-0 md:pl-6">
              <h3 className="hero-font text-lg font-bold text-text">Instant Feedback</h3>
              <p className="text-sm text-muted leading-relaxed">
                Get immediate validation on your tasks. The platform checks your work in real-time so you never get stuck guessing.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Curriculum Grid */}
      <section id="curriculum" className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-10 text-center">
          <h2 className="hero-font text-3xl font-bold text-text tracking-tight">Industry-Ready Foundations</h2>
          <p className="text-sm text-muted mt-2">Comprehensive courses designed to make you productive on day one.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {courses.map((course) => (
            <div 
              key={course.id}
              className="flex flex-col rounded-sm border border-line bg-panel/30 p-8 hover:bg-panel/50 hover:border-accent/50 transition-colors"
            >
              <div className="flex items-center justify-between text-xs font-mono text-muted mb-4">
                <span className="rounded-sm border border-line px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted">
                  {course.level}
                </span>
                <span>{course.modules?.length || 0} Modules</span>
              </div>
              <h3 className="hero-font text-xl font-bold text-text mb-2">{course.title}</h3>
              <p className="text-sm text-muted leading-relaxed mb-8 flex-1">{course.description}</p>

              <Link
                href={`/courses/${course.id}`}
                className="inline-flex items-center justify-between w-full text-sm font-semibold text-accent border-t border-line pt-4 transition hover:text-accent/80"
              >
                <span>Explore Syllabus</span>
                <span className="font-mono">-&gt;</span>
              </Link>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </main>
  );
}