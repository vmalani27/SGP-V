'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { api, type CourseMeta, type Enrollment } from '@/lib/api';

export default function DashboardPage() {
  const { user, isAuthenticated, loading, logout, enrolledCourses, refreshEnrollments } = useAuth();
  const router = useRouter();
  const [courses, setCourses] = useState<CourseMeta[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    Promise.all([
      api.courses.list(),
      api.users.enrollments(),
    ])
      .then(([c, e]) => {
        setCourses(c);
        setEnrollments(e);
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [isAuthenticated, loading, router]);

  const handleEnroll = async (courseId: string) => {
    try {
      await api.courses.enroll(courseId);
      await refreshEnrollments();
      const updated = await api.users.enrollments();
      setEnrollments(updated);
    } catch {
      // silent
    }
  };

  if (loading || fetching) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg">
        <div className="flex items-center gap-3 text-muted">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="text-sm">Loading your dashboard...</span>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) return null;

  const enrolledIds = new Set(enrolledCourses);
  const enrolledList = courses.filter((c) => enrolledIds.has(c.id));
  const availableList = courses.filter((c) => !enrolledIds.has(c.id));

  const getProgress = (courseId: string): number => {
    const enrollment = enrollments.find((e) => e.courseId === courseId);
    if (!enrollment?.progress) return 0;
    const pct = (enrollment.progress as { percentage?: number }).percentage;
    return pct ?? 0;
  };

  return (
    <main className="min-h-screen bg-bg">
      <Navbar />

      <div className="mx-auto max-w-5xl px-6 py-10 pt-20">
        <h1 className="hero-font text-3xl font-bold">
          Welcome back, {user?.displayName?.replace(/\b\w/g, c => c.toUpperCase()) || 'Developer'}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {enrolledList.length > 0 ? 'Pick up where you left off.' : 'Enroll in a course to get started.'}
        </p>

        {enrolledList.length > 0 && (
          <section className="mt-12">
            <h2 className="hero-font text-xl font-semibold">My Courses</h2>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              {enrolledList.map((course) => (
                <div
                  key={course.id}
                  className="rounded-xl border border-line bg-panel p-6 transition hover:border-accent/30"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      {course.id === 'git-fundamentals' ? <GitIcon /> : <DockerIcon />}
                    </div>
                    <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                      {getProgress(course.id)}%
                    </span>
                  </div>
                  <h3 className="hero-font mt-4 text-lg font-bold">{course.title}</h3>
                  <p className="mt-1 text-sm text-muted">{course.description}</p>
                  <div className="mt-4 flex items-center gap-4 text-xs text-muted">
                    <span>{course.labs} Labs</span>
                    <span className="text-line">|</span>
                    <span className="capitalize">{course.level}</span>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${getProgress(course.id)}%` }}
                    />
                  </div>
                  <Link
                    href={`/courses/${course.id}`}
                    className="mt-4 inline-block rounded-lg border border-accent/30 px-4 py-1.5 text-sm text-accent transition hover:bg-accent/10"
                  >
                    Continue
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {availableList.length > 0 && (
          <section className="mt-12">
            <h2 className="hero-font text-xl font-semibold">Browse Courses</h2>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              {availableList.map((course) => (
                <div
                  key={course.id}
                  className="rounded-xl border border-line bg-panel p-6 transition hover:border-accent/30"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    {course.id === 'git-fundamentals' ? <GitIcon /> : <DockerIcon />}
                  </div>
                  <h3 className="hero-font mt-4 text-lg font-bold">{course.title}</h3>
                  <p className="mt-1 text-sm text-muted">{course.description}</p>
                  <div className="mt-4 flex items-center gap-4 text-xs text-muted">
                    <span>{course.labs} Labs</span>
                    <span className="text-line">|</span>
                    <span className="capitalize">{course.level}</span>
                  </div>
                  <button
                    onClick={() => handleEnroll(course.id)}
                    className="mt-4 rounded-lg border border-accent/30 px-4 py-1.5 text-sm text-accent transition hover:bg-accent/10"
                  >
                    Enroll Now
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function GitIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

function DockerIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
    </svg>
  );
}
