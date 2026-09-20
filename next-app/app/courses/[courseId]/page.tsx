'use client';

import { Suspense, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { ContentCourse } from '@/lib/content-types';
import { useAuth } from '@/lib/auth-context';
import { computeCurriculumStatus } from '@/lib/curriculum';
import {
  itemHref,
  cleanTitle,
  getModuleChapterTree,
} from '@/lib/content-utils';
import { getCourseIcon, getCourseHeaderBadgeShell } from '@/lib/course-icons';

function CourseOverviewContent({ courseIdParam }: { courseIdParam: string }) {
  const { getEnrollment } = useAuth();
  const [course, setCourse] = useState<ContentCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    api.courses.get(courseIdParam)
      .then((fullCourse) => {
        if (active && fullCourse) {
          const typedCourse = fullCourse as unknown as ContentCourse;
          setCourse(typedCourse);

          // Determine initial expanded module on fetch completion
          const enrollment = getEnrollment(courseIdParam);
          const status = computeCurriculumStatus(typedCourse, enrollment);
          const overviewModules = typedCourse.modules ?? [];
          const allUnits = overviewModules.flatMap((mod) => {
            const tree = getModuleChapterTree(mod);
            return tree.map((node) => {
              const isChapterDone = node.chapter ? status.completedChapterIds.includes(node.chapter.id) : true;
              const areLabsDone = node.labs.length > 0 ? node.labs.every((l) => status.completedLabIds.includes(l.id)) : true;
              return {
                id: node.chapter?.id || node.labs[0]?.id,
                moduleId: mod.id,
                isCompleted: isChapterDone && areLabsDone,
              };
            });
          });
          const activeUnit = allUnits.find((u) => !u.isCompleted) || allUnits[0];
          const targetModId = activeUnit?.moduleId || overviewModules[0]?.id;
          if (targetModId) {
            setOpenModules({ [targetModId]: true });
          }
        }
      })
      .catch((err) => console.error(`Failed to fetch course ${courseIdParam}:`, err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [courseIdParam, getEnrollment]);

  const toggleModule = (modId: string) => {
    setOpenModules((prev) => ({
      ...prev,
      [modId]: !prev[modId],
    }));
  };

  if (loading || !course) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="flex items-center gap-3 text-zinc-400 font-mono text-xs">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          <span>Loading course briefing...</span>
        </div>
      </div>
    );
  }

  const enrollment = getEnrollment(courseIdParam);
  const status = computeCurriculumStatus(course, enrollment);
  const overviewModules = course.modules ?? [];

  // Transform modules into minimal atomic lesson units
  const moduleUnitsMap = overviewModules.map((mod) => {
    const tree = getModuleChapterTree(mod);
    const units = tree.map((node) => {
      const isChapterDone = node.chapter ? status.completedChapterIds.includes(node.chapter.id) : true;
      const areLabsDone = node.labs.length > 0 
        ? node.labs.every((l) => status.completedLabIds.includes(l.id))
        : true;
      const isCompleted = isChapterDone && areLabsDone;

      const primaryItem = node.chapter || node.labs[0];
      const title = cleanTitle(node.chapter?.title || node.labs[0]?.title || '');

      return {
        id: node.chapter?.id || node.labs[0]?.id,
        isCompleted,
        primaryItem,
        title,
      };
    });

    const completedUnitsCount = units.filter((u) => u.isCompleted).length;

    return {
      module: mod,
      units,
      completedCount: completedUnitsCount,
      totalCount: units.length,
    };
  });

  const allUnits = moduleUnitsMap.flatMap((m) => m.units);
  const totalUnitsCount = allUnits.length;
  const completedUnitsCount = allUnits.filter((u) => u.isCompleted).length;
  const percentage = totalUnitsCount > 0 ? Math.min(100, Math.round((completedUnitsCount / totalUnitsCount) * 100)) : 0;

  // Active target unit is the first incomplete unit
  const activeUnit = allUnits.find((u) => !u.isCompleted) || allUnits[0];

  return (
    <div className="min-h-full bg-transparent text-zinc-100 select-none">
      <div className="max-w-4xl mx-auto px-6 pt-6 pb-8">
        
        {/* STREAMLINED HEADER */}
        <div>
          {/* Top Row: Icon + Title */}
          <div className="flex items-center">
            <div className={getCourseHeaderBadgeShell(course.id)}>
              {getCourseIcon(course.id)}
            </div>
            <h1 className="text-2xl font-semibold text-zinc-100">{course.title}</h1>
          </div>

          {/* Action Strip (inline) */}
          <div className="flex items-center mt-4">
            {activeUnit && activeUnit.primaryItem && (
              <Link
                href={itemHref(course.id, activeUnit.primaryItem)}
                className="bg-white text-zinc-950 font-medium text-xs px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors shadow-sm"
              >
                {percentage === 0
                  ? 'Start Track ›'
                  : `Continue: ${activeUnit.title} ›`}
              </Link>
            )}
            <span className="text-xs font-mono text-zinc-500 ml-4">
              {completedUnitsCount} of {totalUnitsCount} completed ({percentage}%)
            </span>
          </div>
        </div>

        {/* ACCORDION MODULE DRAWERS */}
        <div className="mt-8 space-y-4">
          {moduleUnitsMap.map(({ module: mod, units, completedCount }, modIdx) => {
            const isOpen = !!openModules[mod.id];

            return (
              <div key={mod.id}>
                {/* Module Drawer Header */}
                <button
                  onClick={() => toggleModule(mod.id)}
                  className="w-full flex justify-between items-center text-xs font-medium text-zinc-400 py-2 px-1 hover:text-zinc-200 transition-colors select-none group cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${
                        isOpen ? 'rotate-90 text-zinc-300' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                    <span className="font-semibold text-zinc-300 group-hover:text-white">
                      Module {modIdx + 1} · {cleanTitle(mod.title)}
                    </span>
                  </div>
                  <span className="font-mono text-zinc-500 text-[11px]">
                    {completedCount}/{units.length}
                  </span>
                </button>

                {/* Inset Drawer Content */}
                {isOpen && (
                  <div className="bg-[#18181b]/80 border border-white/[0.06] rounded-xl overflow-hidden mb-4 mt-1">
                    {units.map((unit) => {
                      const isActive = activeUnit?.id === unit.id && !unit.isCompleted;

                      return (
                        <Link
                          key={unit.id}
                          href={unit.primaryItem ? itemHref(course.id, unit.primaryItem) : '#'}
                          className={`px-4 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors flex items-center justify-between group ${
                            isActive ? 'bg-white/[0.02]' : ''
                          }`}
                        >
                          {/* Left: Indicator Icon + Minimal Lesson Title */}
                          <div className="flex items-center min-w-0">
                            {unit.isCompleted ? (
                              <svg className="w-4 h-4 text-emerald-400 shrink-0 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                              </svg>
                            ) : isActive ? (
                              <svg className="w-4 h-4 text-zinc-200 shrink-0 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                              </svg>
                            ) : (
                              <span className="w-4 mr-3 shrink-0" />
                            )}
                            <span className={`text-sm transition-colors truncate ${isActive ? 'text-white font-medium' : 'text-zinc-300 group-hover:text-white'}`}>
                              {unit.title}
                            </span>
                          </div>

                          {/* Right: Subtle Hover Chevron */}
                          <svg className="w-4 h-4 text-transparent group-hover:text-zinc-500 transition-colors shrink-0 ml-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                          </svg>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

export default function CourseOverviewPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const resolvedParams = use(params);
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-12">
          <div className="flex items-center gap-3 text-zinc-400 font-mono text-xs">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
            <span>Loading course...</span>
          </div>
        </div>
      }
    >
      <CourseOverviewContent courseIdParam={resolvedParams.courseId} />
    </Suspense>
  );
}
