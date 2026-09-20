'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import type { RoadmapNode } from '@/lib/roadmap';
import { getCourseIcon, getCourseBadgeShell } from '@/lib/course-icons';
import { useAuth } from '@/lib/auth-context';

export default function RoadmapView({ nodes }: { nodes: RoadmapNode[] }) {
  const { getEnrollment } = useAuth();

  // Structure nodes into 3 phase columns cleanly without double slashes
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
    <div className="min-h-screen bg-[#0c0d0e] bg-[radial-gradient(#1f242d_1px,transparent_1px)] [background-size:16px_16px] font-sans text-zinc-100 select-none">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header Section */}
        <div className="mb-8 select-none">
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Tracks</h1>
          <p className="text-xs text-zinc-400 mt-1">Local containerized sandboxes and engineering workflows.</p>
        </div>

        {/* 3-Column Roadmap Pipeline Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative items-start z-10">
          {phaseColumns.map((col) => (
            <div
              key={col.id}
              className="flex flex-col bg-[#161618]/60 border border-white/[0.05] rounded-2xl p-4 backdrop-blur-sm"
            >
              {/* Clean Phase Header */}
              <h3 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase mb-3">
                {col.title}
              </h3>

              {/* Node Cards */}
              <div className="flex flex-col gap-3">
                {col.nodes.map((node) => {
                  // Dynamic user store progress binding
                  const enrollment = getEnrollment(node.id);
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

                  const href = node.slug ? `/courses/${node.slug}` : `/courses/${node.id}`;

                  // Container surface classes
                  let cardClass = '';
                  if (isUnreleased) {
                    cardClass =
                      'border border-dashed border-zinc-800/80 bg-zinc-950/20 rounded-xl p-4 opacity-50 select-none cursor-default';
                  } else if (isInProgress) {
                    cardClass =
                      'bg-[#1c1c1e] border border-white/30 rounded-xl p-4 transition-all duration-150 shadow-sm hover:translate-y-[-1px] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] cursor-pointer group';
                  } else {
                    cardClass =
                      'bg-[#1c1c1e] border border-white/[0.08] hover:border-white/[0.18] rounded-xl p-4 transition-all duration-150 shadow-sm hover:translate-y-[-1px] cursor-pointer group';
                  }

                  const cardInner = (
                    <div className="flex flex-col h-full justify-between">
                      {/* Row 1: Icon & Full-Width Title */}
                      <div className="flex items-center gap-3 w-full mb-3">
                        <div className={getCourseBadgeShell(node.id)}>
                          {getCourseIcon(node.id)}
                        </div>
                        <h4 className="text-sm font-medium text-zinc-100 leading-snug flex-1">
                          {node.title}
                        </h4>
                      </div>

                      {/* Row 2: Progress Track (if active or completed) */}
                      {isCompleted && (
                        <div className="h-0.5 w-full bg-emerald-500 rounded-full mb-3 shrink-0" />
                      )}
                      {isInProgress && (
                        <div className="h-0.5 w-full bg-zinc-800 rounded-full mb-3 overflow-hidden shrink-0">
                          <div
                            className="h-full bg-white rounded-full transition-all duration-300"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      )}

                      {/* Row 3: Footer (Tally & Action Trigger) */}
                      <div className="flex items-center justify-between text-xs font-mono pt-1 mt-auto">
                        <span className="text-zinc-500">
                          {isUnreleased
                            ? totalLabs > 0 ? `${totalLabs} Labs` : ''
                            : `${completedCount} / ${totalLabs} Labs`}
                        </span>

                        {isCompleted && (
                          <span className="text-emerald-400 font-sans text-xs">✓ Done</span>
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



