'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { api, type CourseMeta } from '@/lib/api';
import type { ContentCourse } from '@/lib/content-types';
import { useAuth } from '@/lib/auth-context';
import { computeCurriculumStatus } from '@/lib/curriculum';
import {
  cleanTitle,
  getModuleChapterTree,
} from '@/lib/content-utils';
import { getCourseIcon } from '@/lib/course-icons';
import { SidebarChapterItem } from '@/components/SidebarChapterItem';

export default function CourseSidebar({ courseIdParam }: { courseIdParam: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const chapterParam = searchParams.get('chapter');
  const labParam = searchParams.get('lab');

  const { getEnrollment } = useAuth();
  const [courses, setCourses] = useState<CourseMeta[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>(courseIdParam);
  const [courseDetails, setCourseDetails] = useState<Record<string, ContentCourse>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.courses.list()
      .then(async (list) => {
        if (!active) return;
        setCourses(list);

        const initialTrack = list.some((c) => c.id === courseIdParam)
          ? courseIdParam
          : list[0]?.id || '';
        setSelectedCourseId(initialTrack);

        const detailsMap: Record<string, ContentCourse> = {};
        await Promise.all(
          list.map(async (c) => {
            try {
              const fullCourse = await api.courses.get(c.id);
              if (fullCourse) detailsMap[c.id] = fullCourse as unknown as ContentCourse;
            } catch (e) {
              console.error(`Failed to fetch course details for ${c.id}:`, e);
            }
          })
        );
        if (active) {
          setCourseDetails(detailsMap);
        }
      })
      .catch((err) => console.error('[CourseSidebar] Fetch failed:', err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [courseIdParam]);

  useEffect(() => {
    if (courseIdParam && courses.some((c) => c.id === courseIdParam)) {
      setSelectedCourseId(courseIdParam);
    }
  }, [courseIdParam, courses]);

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) || courses[0];
  const selectedDetail = selectedCourseId ? courseDetails[selectedCourseId] : null;
  const selectedEnrollment = selectedCourseId ? getEnrollment(selectedCourseId) : undefined;
  const selectedStatus = selectedDetail ? computeCurriculumStatus(selectedDetail, selectedEnrollment) : null;
  const overviewModules = selectedDetail?.modules ?? [];

  // Determine active chapter/lab from params or route
  let activeId = chapterParam || labParam;
  if (!activeId) {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.includes('chapters') || segments.includes('labs')) {
      activeId = segments[segments.length - 1];
    }
  }

  if (loading || !selectedCourse) {
    return (
      <aside className="w-64 shrink-0 flex flex-col h-full bg-[#0e1117] border-r border-[#30363d]">
        <div className="flex items-center space-x-2.5 px-4 py-3 border-b border-[#30363d] bg-[#0b0e13]">
          <div className="w-7 h-7 rounded-md bg-zinc-800 animate-pulse shrink-0" />
          <div className="h-4 w-32 bg-zinc-800 animate-pulse rounded" />
        </div>
        <div className="p-3 space-y-3">
          <div className="h-3 w-20 bg-zinc-800/60 animate-pulse rounded" />
          <div className="h-6 w-full bg-zinc-800/40 animate-pulse rounded" />
          <div className="h-6 w-full bg-zinc-800/40 animate-pulse rounded" />
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 shrink-0 flex flex-col h-full bg-[#0e1117] border-r border-white/[0.08] select-none relative z-30">
      {/* 1. Static Course Header Block */}
      <div className="flex items-center space-x-2.5 px-4 py-3 border-b border-[#30363d] bg-[#0b0e13] shrink-0">
        <span className="p-1.5 rounded-md bg-[#21262d] text-[#58a6ff] flex items-center justify-center shrink-0">
          {getCourseIcon(selectedCourse.id)}
        </span>
        <h2 className="text-sm font-semibold text-[#c9d1d9] truncate min-w-0 flex-1">
          {selectedCourse.title}
        </h2>
      </div>

      {/* 2. Curriculum Tree (Minimal Atomic Lesson Units) */}
      <div className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto content-scrollbar">
        {selectedDetail ? (
          overviewModules.map((mod) => {
            const tree = getModuleChapterTree(mod);
            const units = tree.map((node) => {
              const isChapterDone = node.chapter ? Boolean(selectedStatus?.completedChapterIds.includes(node.chapter.id)) : true;
              const areLabsDone = node.labs.length > 0
                ? node.labs.every((l) => Boolean(selectedStatus?.completedLabIds.includes(l.id)))
                : true;
              const isCompleted = Boolean(isChapterDone && areLabsDone);

              const chapterObj = mod.chapters.find((c) => c.id === node.chapter?.id);
              const labId = node.labs[0]?.id;
              const hasLab = Boolean(labId || chapterObj?.assessment);

              const primaryItem = node.chapter || node.labs[0];
              const unitId = node.chapter?.id || node.labs[0]?.id;
              const isSelected = Boolean(activeId === unitId || (node.chapter && activeId === node.chapter.id) || node.labs.some((l) => l.id === activeId));
              const title = cleanTitle(node.chapter?.title || node.labs[0]?.title || '');

              return {
                id: unitId,
                isCompleted,
                isSelected,
                primaryItem,
                title,
                hasLab,
                labId,
              };
            });

            const completedUnitsCount = units.filter((u) => u.isCompleted).length;
            const moduleTitle = cleanTitle(mod.title).toUpperCase();

            return (
              <div key={mod.id} className="space-y-0.5">
                {/* Module Header */}
                <div className="mt-5 first:mt-1 mb-1.5 px-2.5 pb-1 border-b border-white/[0.06] flex items-center justify-between text-[11px] font-mono font-semibold tracking-wider text-slate-400 uppercase select-none">
                  <span className="truncate min-w-0 flex-1">{moduleTitle}</span>
                  <span className="tabular-nums text-[#64748b] ml-1.5 shrink-0">
                    {completedUnitsCount}/{units.length}
                  </span>
                </div>

                {/* Minimal Atomic Lesson Rows with Flyout */}
                <div className="space-y-0.5">
                  {units.map((unit) => (
                    <SidebarChapterItem
                      key={unit.id}
                      courseId={selectedCourse.id}
                      chapter={{
                        id: unit.primaryItem?.id || unit.id,
                        title: unit.title,
                        hasLab: unit.hasLab,
                        labId: unit.labId,
                      }}
                      isActive={unit.isSelected}
                      isCompleted={unit.isCompleted}
                    />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-xs text-zinc-500 font-mono py-4 px-2.5">Loading syllabus...</div>
        )}
      </div>
    </aside>
  );
}
