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
import { ChevronDown } from 'lucide-react';
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
  const [isTrackDropdownOpen, setIsTrackDropdownOpen] = useState(false);

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

  const handleSelectTrack = (targetCourseId: string) => {
    setSelectedCourseId(targetCourseId);
    router.push(`/courses/${targetCourseId}`);
  };

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
      <aside className="w-64 shrink-0 flex flex-col h-full bg-[#09090b] border-r border-zinc-800/80">
        <div className="h-12 px-3 flex items-center border-b border-zinc-800/80 bg-[#0c0d0e]">
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
    <aside className="w-64 shrink-0 flex flex-col h-full bg-[#101114] border-r border-white/[0.06] select-none relative z-30">
      {/* 1. Track Switcher Header */}
      <div className="h-12 px-3 flex items-center border-b border-white/[0.06] bg-[#0e0f12] shrink-0 relative">
        <button
          onClick={() => setIsTrackDropdownOpen((prev) => !prev)}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-zinc-800/50 transition-colors text-left cursor-pointer"
        >
          <div className="flex items-center truncate min-w-0 mr-2">
            <span className="w-4 h-4 text-zinc-300 mr-2 shrink-0 flex items-center justify-center">
              {getCourseIcon(selectedCourse.id)}
            </span>
            <span className="text-xs font-semibold text-zinc-200 truncate">
              {selectedCourse.title}
            </span>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform duration-150 ${
              isTrackDropdownOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Track Switcher Popover Menu */}
        {isTrackDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-transparent"
              onClick={() => setIsTrackDropdownOpen(false)}
            />
            <div className="absolute top-full left-2 right-2 mt-1 py-1 bg-[#121316] border border-zinc-800 rounded-lg shadow-2xl z-50 overflow-hidden font-sans space-y-0.5">
              {courses.map((c) => {
                const isSelected = c.id === selectedCourseId;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      handleSelectTrack(c.id);
                      setIsTrackDropdownOpen(false);
                    }}
                    className={`flex items-center justify-between w-full px-2.5 py-2 text-xs transition-colors cursor-pointer text-left ${
                      isSelected
                        ? 'bg-zinc-800/70 text-zinc-100 font-medium'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex items-center truncate min-w-0 mr-2">
                      <span className="w-4 h-4 text-zinc-400 mr-2 shrink-0 flex items-center justify-center">
                        {getCourseIcon(c.id)}
                      </span>
                      <span className="truncate">{c.title}</span>
                    </div>
                    {isSelected && (
                      <svg
                        className="w-3.5 h-3.5 text-emerald-400 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
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
              const hasLab = node.labs.length > 0 || Boolean(chapterObj?.assessment);

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
              };
            });

            const completedUnitsCount = units.filter((u) => u.isCompleted).length;
            const moduleTitle = cleanTitle(mod.title).toUpperCase();

            return (
              <div key={mod.id} className="space-y-0.5">
                {/* Module Header */}
                <div className="mt-5 first:mt-1 mb-1.5 px-2.5 pb-1 border-b border-zinc-800/60 flex items-center justify-between text-[11px] font-mono font-semibold tracking-wider text-zinc-300 uppercase select-none">
                  <span className="truncate min-w-0 flex-1">{moduleTitle}</span>
                  <span className="tabular-nums text-zinc-400 ml-1.5 shrink-0">
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
