'use client';

import { useState, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ContentCourse } from '@/lib/content-types';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/auth-context';
import { computeCurriculumStatus } from '@/lib/curriculum';
import { itemHref, getAllItems, cleanTitle, getModuleChapterTree } from '@/lib/content-utils';

export default function CourseShell({
  course,
  courseId,
  children,
}: {
  course: ContentCourse;
  courseId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { getEnrollment } = useAuth();
  const enrollment = getEnrollment(courseId);
  const status = computeCurriculumStatus(course, enrollment);
  
  const percentage = status.totalItems > 0
    ? Math.min(100, Math.round((status.completedCount / status.totalItems) * 100))
    : (enrollment?.percentage ?? 0);

  // Determine mode
  const mode: 'reading' | 'lab' = pathname.includes('/labs/') ? 'lab' : 'reading';

  // Toggle state for lab sidebar on mobile/small screens
  const [treeOpen, setTreeOpen] = useState(false);

  // Find active item
  const segments = pathname.split('/');
  const activeItemId = segments[segments.length - 1];
  
  const allItems = getAllItems(course);
  const activeItem = allItems.find(i => i.id === activeItemId);

  const renderCurriculumTree = () => {
    return (
      <div className="flex h-full flex-col overflow-y-auto sidebar-scrollbar pb-12 select-none">
        <div className="flex-1 px-3 py-4 space-y-5">
          {course.modules.map((mod, modIdx) => {
            const tree = getModuleChapterTree(mod);
            const moduleTitle = `MODULE ${modIdx + 1} // ${cleanTitle(mod.title).toUpperCase()}`;

            return (
              <div key={mod.id}>
                {/* Module Group Header */}
                <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 px-3 pt-4 pb-1">
                  {moduleTitle}
                </div>

                <div className="space-y-1">
                  {tree.map(({ chapter, labs }) => {
                    const isChapterCompleted = status.completedChapterIds.includes(chapter.id);
                    const isChapterActive = activeItemId === chapter.id;

                    return (
                      <div key={chapter.id} className="space-y-0.5">
                        {/* Parent Node (Chapter / Concept) */}
                        <Link
                          href={itemHref(courseId, chapter)}
                          title={chapter.title}
                          onClick={() => {
                            if (mode === 'lab' && typeof window !== 'undefined' && window.innerWidth < 1024) {
                              setTreeOpen(false);
                            }
                          }}
                          className={`group flex items-center justify-between text-xs transition cursor-pointer ${
                            isChapterActive
                              ? 'bg-zinc-800/50 text-zinc-100 font-medium rounded-md px-2.5 py-1.5'
                              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 font-normal rounded-md px-2.5 py-1.5'
                          }`}
                        >
                          <span className="truncate min-w-0 flex-1">{cleanTitle(chapter.title)}</span>
                          {isChapterCompleted && (
                            <svg
                              className="h-3.5 w-3.5 shrink-0 text-emerald-500 text-xs ml-2"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                          )}
                        </Link>

                        {/* Child Nodes (Hands-on Labs) */}
                        {labs.map((lab) => {
                          const isLabCompleted = status.completedLabIds.includes(lab.id);
                          const isLabActive = activeItemId === lab.id;

                          return (
                            <Link
                              key={lab.id}
                              href={itemHref(courseId, lab)}
                              title={lab.title}
                              onClick={() => {
                                if (mode === 'lab' && typeof window !== 'undefined' && window.innerWidth < 1024) {
                                  setTreeOpen(false);
                                }
                              }}
                              className={`group ml-4 flex items-center justify-between text-xs transition cursor-pointer ${
                                isLabActive
                                  ? 'bg-zinc-800/50 text-zinc-100 font-medium rounded-md px-2.5 py-1.5'
                                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 font-normal rounded-md px-2.5 py-1.5'
                              }`}
                            >
                              <div className="flex items-center truncate min-w-0 flex-1">
                                <span className="font-mono text-zinc-500 mr-1.5 text-[11px] shrink-0 select-none">
                                  $
                                </span>
                                <span className="truncate min-w-0">{cleanTitle(lab.title)}</span>
                              </div>
                              {isLabCompleted && (
                                <svg
                                  className="h-3.5 w-3.5 shrink-0 text-emerald-500 text-xs ml-2"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                </svg>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col bg-[#09090b] text-zinc-100 font-sans h-screen overflow-hidden">
      <Navbar />

      {/* Persistent Sub-Header */}
      <div className="shrink-0 h-10 border-b border-zinc-800 bg-[#09090b] px-4 flex items-center justify-between text-xs select-none z-40">
        <div className="flex items-center gap-2 min-w-0">
          {mode === 'lab' && (
            <button 
              onClick={() => setTreeOpen(!treeOpen)}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition mr-1 lg:hidden"
              title="Toggle Curriculum"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          )}

          <Link href={`/dashboard?track=${courseId}`} className="font-semibold text-zinc-300 hover:text-white transition truncate">
            {course.title}
          </Link>
          
          {activeItem && (
            <div className="flex items-center gap-2 text-zinc-500 truncate min-w-0">
              <span>/</span>
              <span className="truncate text-zinc-400">{cleanTitle(activeItem.moduleTitle)}</span>
              <span>/</span>
              <span className="truncate text-zinc-200 font-medium">{cleanTitle(activeItem.title)}</span>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-[11px] text-zinc-400">{percentage}%</span>
          <div className="w-20 h-1 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full bg-zinc-200 transition-all duration-300" style={{ width: `${percentage}%` }} />
          </div>
        </div>
      </div>

      {/* Main Viewport */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Docked Curriculum Sidecar */}
        <div
          className={`shrink-0 border-r border-zinc-800 bg-[#0c0d0e] w-80 ${
            mode === 'lab' && !treeOpen
              ? 'hidden lg:block'
              : 'block'
          }`}
        >
          {renderCurriculumTree()}
        </div>

        {/* Mobile overlay for tree in lab mode */}
        {mode === 'lab' && treeOpen && (
          <div 
            className="absolute inset-0 z-20 bg-black/50 lg:hidden"
            onClick={() => setTreeOpen(false)}
          />
        )}

        {/* Dynamic Content Area (Reading / Lab) */}
        <div
          className={`flex-1 flex flex-col min-w-0 ${
            mode === 'reading' 
              ? 'bg-[#09090b] overflow-y-auto px-8 py-8 md:px-16 lg:px-24' 
              : 'overflow-hidden'
          }`}
        >
          {children}
        </div>

      </div>
    </div>
  );
}
