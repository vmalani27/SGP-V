'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Terminal } from 'lucide-react';

interface ChapterItemProps {
  courseId: string;
  chapter: {
    id: string;
    title: string;
    hasLab?: boolean;
    labId?: string;
  };
  isActive?: boolean;
  isCompleted?: boolean;
}

export function SidebarChapterItem({ courseId, chapter, isActive, isCompleted }: ChapterItemProps) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const rowRef = useRef<HTMLDivElement>(null);
  const enterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleRowEnter = () => {
    // Cancel any pending close timer
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }

    // Hover intent delay: only mount/open if cursor dwells on this item for 140ms
    if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current);
    enterTimeoutRef.current = setTimeout(() => {
      if (rowRef.current) {
        const rect = rowRef.current.getBoundingClientRect();
        setCoords({
          top: rect.top + rect.height / 2,
          left: rect.right + 4,
        });
        console.log(`[Hover Log] Hover item created (dwell threshold met): "${chapter.title}" (id: ${chapter.id})`);
        setIsHovered(true);
      }
    }, 140);
  };

  const handleRowLeave = () => {
    // If the mouse left before the 140ms dwell delay, cancel the open (no flyout created)
    if (enterTimeoutRef.current) {
      clearTimeout(enterTimeoutRef.current);
      enterTimeoutRef.current = null;
    }

    // If it was already open, allow a grace period to move into the flyout
    if (isHovered) {
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = setTimeout(() => {
        console.log(`[Hover Log] Hover item closed/destroyed: "${chapter.title}" (id: ${chapter.id})`);
        setIsHovered(false);
      }, 180);
    }
  };

  const handleFlyoutEnter = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    setIsHovered(true);
  };

  const handleFlyoutLeave = () => {
    if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    leaveTimeoutRef.current = setTimeout(() => {
      console.log(`[Hover Log] Hover item closed/destroyed: "${chapter.title}" (id: ${chapter.id})`);
      setIsHovered(false);
    }, 180);
  };

  useEffect(() => {
    if (!isHovered) return;
    const handleDismiss = () => {
      console.log(`[Hover Log] Hover item dismissed via scroll/resize: "${chapter.title}" (id: ${chapter.id})`);
      setIsHovered(false);
    };
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [isHovered, chapter.id, chapter.title]);

  useEffect(() => {
    return () => {
      if (enterTimeoutRef.current) clearTimeout(enterTimeoutRef.current);
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    };
  }, []);

  return (
    <div className="group relative">
      {/* Primary Sidebar Row */}
      <div 
        ref={rowRef}
        onMouseEnter={handleRowEnter}
        onMouseLeave={handleRowLeave}
        onClick={() => router.push(`/courses/${courseId}/chapters/${chapter.id}`)}
        className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-all duration-150 cursor-pointer select-none ${
          isActive 
            ? 'bg-[#1c2230] text-white font-medium border-l-2 border-slate-300' 
            : 'text-slate-400 hover:text-slate-200 hover:bg-[#151922]'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          {isCompleted ? (
            <svg className="h-3 w-3 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          ) : isActive ? (
            <span className="text-white text-xs font-bold">→</span>
          ) : (
            <span className="w-2.5" />
          )}
          <span className="truncate">{chapter.title}</span>
        </div>
      </div>

      {/* Horizontal Flyout Submenu rendered via Portal to break out of scroll containers and overflow clipping */}
      {mounted && isHovered && createPortal(
        <div
          onMouseEnter={handleFlyoutEnter}
          onMouseLeave={handleFlyoutLeave}
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            transform: 'translateY(-50%)',
            zIndex: 9999,
          }}
          className="pl-1 flex pointer-events-auto"
        >
          {/* Invisible hit-box bridge to avoid hover drops */}
          <div className="absolute -left-3 top-0 bottom-0 w-4" />

          <div className="flex flex-col min-w-[155px] p-1 rounded-lg bg-[#181d28] border border-white/[0.1] shadow-2xl backdrop-blur-md">
            {/* Option 1: Theory */}
            <Link
              className="group/opt flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
              href={`/courses/${courseId}/chapters/${chapter.id}`}
              onClick={() => setIsHovered(false)}
            >
              <BookOpen className="w-3.5 h-3.5 text-slate-400 group-hover/opt:text-slate-200"/>
              <span>Theory Briefing</span>
            </Link>

            {/* Option 2: Lab (Conditional) */}
            {chapter.hasLab && (
              <Link
                className="group/opt flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
                href={chapter.labId ? `/courses/${courseId}/labs/${chapter.labId}` : `/courses/${courseId}/chapters/${chapter.id}`}
                onClick={() => setIsHovered(false)}
              >
                <Terminal className="w-3.5 h-3.5 text-slate-400 group-hover/opt:text-slate-200"/>
                <span>Hands-on Lab</span>
              </Link>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default SidebarChapterItem;
