'use client';

import { useState, type ReactNode } from 'react';
import Navbar from '@/components/Navbar';
import PlayerSidebar from '@/components/PlayerSidebar';
import { useAuth } from '@/lib/auth-context';
import type { ContentCourse } from '@/lib/content-types';

interface PlayerItem {
  id: string;
  title: string;
  moduleId: string;
  moduleTitle: string;
}

export default function LearningPlayer({
  course,
  courseId,
  currentItem,
  children,
}: {
  course: ContentCourse;
  courseId: string;
  currentItem: PlayerItem;
  children: ReactNode;
}) {
  const { getEnrollment } = useAuth();
  const enrollment = getEnrollment(courseId);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const completedChapterIds: string[] = [];
  if (enrollment?.progress) {
    for (const modVal of Object.values(enrollment.progress)) {
      if (modVal && typeof modVal === 'object') {
        for (const [chId, status] of Object.entries(modVal as Record<string, unknown>)) {
          if (status === 'completed') completedChapterIds.push(chId);
        }
      }
    }
  }

  return (
    <main className="flex h-screen flex-col bg-bg text-text">
      <Navbar
        breadcrumb={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: course.title, href: `/courses/${courseId}` },
          { label: currentItem.title },
        ]}
      />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden pt-14">
        {/* Left Sidebar */}
        <aside
          className={`shrink-0 overflow-y-auto transition-all duration-200 ${
            sidebarOpen ? 'w-64' : 'w-0'
          }`}
        >
          {sidebarOpen && (
            <PlayerSidebar
              course={course}
              courseId={courseId}
              currentItemId={currentItem.id}
              completedChapterIds={completedChapterIds}
              onToggle={() => setSidebarOpen(false)}
            />
          )}
        </aside>

        {/* Center: Content */}
        <section className="flex flex-1 flex-col overflow-y-auto">
          {/* Sidebar toggle when closed */}
          {!sidebarOpen && (
            <div className="sticky top-0 z-10 border-b border-line bg-bg/80 backdrop-blur px-4 py-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="rounded p-1.5 text-muted hover:bg-line/20 hover:text-text transition"
                title="Open sidebar"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
            </div>
          )}
          <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
