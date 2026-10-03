'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import type { RoadmapNode } from '@/lib/roadmap';
import type { CourseCatalogEntry } from '@/lib/content-types';
import type { Enrollment } from '@/lib/api';
import { api } from '@/lib/api';
import { getCourseIcon, getCourseBadgeShell } from '@/lib/course-icons';
import { useAuth } from '@/lib/auth-context';

interface OngoingModuleInfo {
  moduleId: string;
  moduleTitle: string;
  moduleOrder: number;
  completedLabs: number;
  totalLabs: number;
  isCompleted: boolean;
}

/**
 * Determine which module the user is actively working on.
 * Scans course modules in sequence and picks the first module with incomplete items.
 */
function getOngoingModuleInfo(
  courseData: CourseCatalogEntry | undefined,
  enrollment: Enrollment | undefined,
): OngoingModuleInfo | null {
  if (!courseData || !Array.isArray(courseData.modules) || courseData.modules.length === 0) {
    return null;
  }

  const modules = [...courseData.modules].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  const courseProg = (enrollment?.progress as Record<string, Record<string, string>> | undefined) || {};
  const labProg = (enrollment?.labsProgress as Record<string, Record<string, string>> | undefined) || {};

  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i] as any;
    const modId = mod.id;
    const modChapters: any[] = mod.chapters || [];
    const modLabs: any[] = mod.labs || [];

    const completedLabCount = modLabs.filter((l: any) => {
      return labProg[modId]?.[l.id] === 'completed';
    }).length;

    const completedChapterCount = modChapters.filter((c: any) => {
      return courseProg[modId]?.[c.id] === 'completed';
    }).length;

    const totalLabCount = modLabs.length;
    const totalChapterCount = modChapters.length;

    const isModuleDone =
      (totalLabCount === 0 || completedLabCount >= totalLabCount) &&
      (totalChapterCount === 0 || completedChapterCount >= totalChapterCount);

    if (!isModuleDone) {
      return {
        moduleId: modId,
        moduleTitle: mod.title || modId,
        moduleOrder: mod.order || i + 1,
        completedLabs: completedLabCount,
        totalLabs: totalLabCount,
        isCompleted: false,
      };
    }
  }

  // If all modules are finished, return the final module as completed
  const lastMod = modules[modules.length - 1] as any;
  const modLabs: any[] = lastMod?.labs || [];
  const completedLabCount = modLabs.filter((l: any) => {
    return labProg[lastMod?.id]?.[l.id] === 'completed';
  }).length;

  return {
    moduleId: lastMod?.id || '',
    moduleTitle: lastMod?.title || '',
    moduleOrder: lastMod?.order || modules.length,
    completedLabs: completedLabCount,
    totalLabs: modLabs.length,
    isCompleted: true,
  };
}

export default function RoadmapView({
  nodes,
  initialCatalog,
}: {
  nodes: RoadmapNode[];
  initialCatalog?: CourseCatalogEntry[];
}) {
  const { getEnrollment } = useAuth();
  const [catalog, setCatalog] = useState<CourseCatalogEntry[]>(initialCatalog || []);
  const [isModuleView, setIsModuleView] = useState(false);

  // Fetch catalog client-side if not initially available
  useEffect(() => {
    if (!initialCatalog || initialCatalog.length === 0) {
      api.courses.list()
        .then((data) => {
          if (Array.isArray(data)) setCatalog(data as unknown as CourseCatalogEntry[]);
        })
        .catch(() => {});
    }
  }, [initialCatalog]);

  // Infinite upward loop: 0 = Course, 1 = Module, 2 = Course (seamless reset snap)
  const [tickerStep, setTickerStep] = useState(0);
  const [animating, setAnimating] = useState(true);

  useEffect(() => {
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    let t3: ReturnType<typeof setTimeout>;

    const cycle = () => {
      // Step 0 -> 1: Course to Module (swipe UP) after 2.5s
      t1 = setTimeout(() => {
        setAnimating(true);
        setTickerStep(1);

        // Step 1 -> 2: Module to Course (swipe UP) after 2.5s
        t2 = setTimeout(() => {
          setAnimating(true);
          setTickerStep(2);

          // Step 2 -> 0: Snap instantly back to 0 without animation after 700ms transition finishes
          t3 = setTimeout(() => {
            setAnimating(false);
            setTickerStep(0);
            cycle();
          }, 700);
        }, 2500);
      }, 2500);
    };

    cycle();

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  // Structure nodes into 3 phase columns
  const phaseColumns = useMemo(() => {
    return [
      {
        id: 1,
        title: 'Foundations',
        nodes: nodes.filter(
          (n) => n.stage.toUpperCase().includes('FOUNDATIONS') || n.stage.startsWith('01')
        ),
      },
      {
        id: 2,
        title: 'Runtimes & Networks',
        nodes: nodes.filter(
          (n) =>
            n.stage.toUpperCase().includes('RUNTIMES') ||
            n.stage.toUpperCase().includes('CONTAINER') ||
            n.stage.startsWith('02')
        ),
      },
      {
        id: 3,
        title: 'Orchestration',
        nodes: nodes.filter(
          (n) => n.stage.toUpperCase().includes('ORCHESTRATION') || n.stage.startsWith('03')
        ),
      },
    ];
  }, [nodes]);

  return (
    <div className="min-h-screen bg-[#090a0f] font-sans text-slate-100 select-none">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header Section */}
        <div className="mb-8 select-none">
          <h1 className="text-2xl font-bold text-white tracking-tight">Tracks</h1>
          <p className="text-xs text-[#94a3b8] mt-1">Local containerized sandboxes and engineering workflows.</p>
        </div>

        {/* 3-Column Roadmap Pipeline Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative items-start z-10">
          {phaseColumns.map((col) => (
            <div
              key={col.id}
              className="flex flex-col bg-[#111318] border border-white/[0.08] rounded-2xl p-4 shadow-sm"
            >
              {/* Clean Phase Header */}
              <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase mb-3">
                {col.title}
              </h3>

              {/* Node Cards */}
              <div className="flex flex-col gap-3">
                {col.nodes.map((node) => {
                  const courseId = node.slug || node.id;
                  const enrollment = getEnrollment(courseId) || getEnrollment(node.id);
                  const courseData = catalog.find((c) => c.id === courseId || c.id === node.id);
                  const ongoingModule = getOngoingModuleInfo(courseData, enrollment);

                  // Calculate course-level completed labs
                  let completedCount = node.progress?.completed ?? 0;
                  if (enrollment?.labsProgress) {
                    const dynamicCount = Object.values(enrollment.labsProgress)
                      .flatMap((mod) => Object.values(mod))
                      .filter((s) => s === 'completed').length;
                    if (dynamicCount > 0) {
                      completedCount = dynamicCount;
                    }
                  }

                  const totalLabs = node.progress?.total ?? 0;
                  const isUnreleased = node.status === 'unreleased';

                  // Dynamic state per module vs course
                  const isModuleActive = Boolean(ongoingModule) && tickerStep === 1;

                  const activeCompletedLabs = ongoingModule
                    ? ongoingModule.completedLabs
                    : completedCount;

                  const activeTotalLabs = ongoingModule
                    ? ongoingModule.totalLabs
                    : totalLabs;

                  let computedStatus: string = node.status;
                  if (!isUnreleased && totalLabs > 0) {
                    if (completedCount >= totalLabs && completedCount > 0) {
                      computedStatus = 'completed';
                    } else if (completedCount > 0) {
                      computedStatus = 'in-progress';
                    } else {
                      computedStatus = 'available';
                    }
                  }

                  const isCompleted = computedStatus === 'completed';
                  const isInProgress = computedStatus === 'in-progress';
                  const isAvailable = computedStatus === 'available';

                  const progressPct =
                    totalLabs > 0 ? Math.min(100, Math.round((completedCount / totalLabs) * 100)) : 0;

                  const moduleProgressPct =
                    activeTotalLabs > 0 ? Math.min(100, Math.round((activeCompletedLabs / activeTotalLabs) * 100)) : 0;

                  const activeProgressPct = isModuleActive ? moduleProgressPct : progressPct;

                  const href = node.slug ? `/courses/${node.slug}` : `/courses/${node.id}`;

                  // Container surface classes
                  let cardClass = '';
                  if (isUnreleased) {
                    cardClass =
                      'border border-dashed border-white/[0.08] bg-[#12151c]/40 rounded-xl p-4 opacity-50 select-none cursor-default';
                  } else if (isInProgress) {
                    cardClass =
                      'bg-[#181d28] border border-white/20 rounded-xl p-4 transition-all duration-150 shadow-sm hover:translate-y-[-1px] cursor-pointer group';
                  } else {
                    cardClass =
                      'bg-[#151922] border border-white/[0.08] hover:border-white/[0.18] rounded-xl p-4 transition-all duration-150 shadow-sm hover:translate-y-[-1px] cursor-pointer group';
                  }

                  const cardInner = (
                    <div className="flex flex-col h-full justify-between">
                      {/* Row 1: Icon & Looping Title with Swipe-up Transition */}
                      <div className="flex items-center gap-3 w-full mb-3">
                        <div className={`shrink-0 ${getCourseBadgeShell(node.id)}`}>
                          {getCourseIcon(node.id)}
                        </div>
                        {ongoingModule && !isUnreleased ? (
                          <div className="relative h-6 overflow-hidden flex-1">
                            <div
                              className={`flex flex-col ${
                                animating ? 'transition-transform duration-700 ease-in-out' : 'transition-none'
                              }`}
                              style={{
                                transform:
                                  tickerStep === 0
                                    ? 'translateY(0%)'
                                    : tickerStep === 1
                                    ? 'translateY(-33.333%)'
                                    : 'translateY(-66.666%)',
                              }}
                            >
                              {/* Row 0: Course Title (white) */}
                              <div className="h-6 flex items-center shrink-0">
                                <h4 className="text-sm font-semibold text-white leading-snug truncate">
                                  {node.title}
                                </h4>
                              </div>

                              {/* Row 1: Ongoing Module Title (emerald green) */}
                              <div className="h-6 flex items-center shrink-0">
                                <h4
                                  className="text-sm font-medium text-emerald-400 leading-snug truncate"
                                  title={ongoingModule.moduleTitle}
                                >
                                  {ongoingModule.moduleTitle}
                                </h4>
                              </div>

                              {/* Row 2: Course Title Clone (white) */}
                              <div className="h-6 flex items-center shrink-0">
                                <h4 className="text-sm font-semibold text-white leading-snug truncate">
                                  {node.title}
                                </h4>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <h4 className="text-sm font-semibold text-white leading-snug flex-1 truncate">
                            {node.title}
                          </h4>
                        )}
                      </div>

                      {/* Row 2: Progress Track (if active or completed) */}
                      {isCompleted && (
                        <div className="h-0.5 w-full bg-emerald-500 rounded-full mb-3 shrink-0" />
                      )}
                      {isInProgress && (
                        <div className="h-0.5 w-full bg-zinc-800 rounded-full mb-3 overflow-hidden shrink-0">
                          <div
                            className="h-full bg-white rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${activeProgressPct}%` }}
                          />
                        </div>
                      )}

                      {/* Row 3: Footer (Tally with Looping Swipe-up Transition & Action Trigger) */}
                      <div className="flex items-center justify-between text-xs font-mono pt-1 mt-auto">
                        {ongoingModule && !isUnreleased ? (
                          <div className="relative h-4 overflow-hidden">
                            <div
                              className={`flex flex-col ${
                                animating ? 'transition-transform duration-700 ease-in-out' : 'transition-none'
                              }`}
                              style={{
                                transform:
                                  tickerStep === 0
                                    ? 'translateY(0%)'
                                    : tickerStep === 1
                                    ? 'translateY(-33.333%)'
                                    : 'translateY(-66.666%)',
                              }}
                            >
                              {/* Row 0: Course Labs Tally */}
                              <div className="h-4 flex items-center shrink-0">
                                <span className="text-zinc-500 font-mono text-xs">
                                  {isUnreleased
                                    ? 'Coming Soon'
                                    : `${completedCount} / ${totalLabs} Labs`}
                                </span>
                              </div>

                              {/* Row 1: Ongoing Module Labs Tally (emerald green) */}
                              <div className="h-4 flex items-center shrink-0">
                                <span className="text-emerald-400/90 font-mono text-xs font-medium">
                                  {`${activeCompletedLabs} / ${activeTotalLabs} Labs`}
                                </span>
                              </div>

                              {/* Row 2: Course Labs Tally Clone */}
                              <div className="h-4 flex items-center shrink-0">
                                <span className="text-zinc-500 font-mono text-xs">
                                  {isUnreleased
                                    ? 'Coming Soon'
                                    : `${completedCount} / ${totalLabs} Labs`}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-zinc-500 font-mono text-xs">
                            {isUnreleased
                              ? 'Coming Soon'
                              : `${completedCount} / ${totalLabs} Labs`}
                          </span>
                        )}

                        {isCompleted && (
                          <span className="text-emerald-400 font-sans text-xs">Done</span>
                        )}
                        {isInProgress && (
                          <span className="text-zinc-200 group-hover:text-white font-sans text-xs font-medium flex items-center gap-1">
                            Continue ›
                          </span>
                        )}
                        {isAvailable && (
                          <span className="text-zinc-400 group-hover:text-zinc-200 font-sans text-xs flex items-center gap-1">
                            Start ›
                          </span>
                        )}
                      </div>
                    </div>
                  );

                  if (isUnreleased) {
                    return (
                      <div key={node.id} className={cardClass}>
                        {cardInner}
                      </div>
                    );
                  }

                  return (
                    <Link key={node.id} href={href} className={cardClass}>
                      {cardInner}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}



