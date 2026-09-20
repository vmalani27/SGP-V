'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Zap } from 'lucide-react';

interface ChapterItemProps {
  courseId: string;
  chapter: {
    id: string;
    title: string;
    hasLab?: boolean;
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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const openFlyout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (rowRef.current) {
      const rect = rowRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top + rect.height / 2,
        left: rect.right + 4,
      });
      setIsHovered(true);
    }
  };

  const closeFlyoutWithDelay = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 180);
  };

  useEffect(() => {
    if (!isHovered) return;
    const handleDismiss = () => setIsHovered(false);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [isHovered]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div className="group relative">
      {/* Primary Sidebar Row */}
      <div 
        ref={rowRef}
        onMouseEnter={openFlyout}
        onMouseLeave={closeFlyoutWithDelay}
        onClick={() => router.push(`/courses/${courseId}/chapters/${chapter.id}`)}
        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer select-none ${
          isActive 
            ? 'bg-zinc-850 text-zinc-100 font-medium' 
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          {isCompleted ? (
            <span className="text-emerald-400 text-xs">✓</span>
          ) : isActive ? (
            <span className="text-zinc-200 text-xs">→</span>
          ) : (
            <span className="w-2.5" />
          )}
          <span className="truncate">{chapter.title}</span>
        </div>
      </div>

      {/* Horizontal Flyout Submenu rendered via Portal to break out of scroll containers and overflow clipping */}
      {mounted && isHovered && createPortal(
        <div
          onMouseEnter={openFlyout}
          onMouseLeave={closeFlyoutWithDelay}
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

          <div className="flex flex-col min-w-[150px] p-1 rounded-lg bg-[#141518] border border-white/[0.08] shadow-2xl backdrop-blur-md">
            {/* Option 1: Theory */}
            <Link
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-zinc-300 hover:text-white hover:bg-zinc-800/80 transition-colors"
              href={`/courses/${courseId}/chapters/${chapter.id}`}
              onClick={() => setIsHovered(false)}
            >
              <BookOpen className="w-3.5 h-3.5 text-zinc-400"/>
              <span>Theory Briefing</span>
            </Link>

            {/* Option 2: Lab (Conditional) */}
            {chapter.hasLab && (
              <Link
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-sky-400 hover:text-sky-300 hover:bg-sky-950/40 transition-colors"
                href={`/courses/${courseId}/chapters/${chapter.id}#lab`}
                onClick={() => setIsHovered(false)}
              >
                <Zap className="w-3.5 h-3.5 fill-current text-sky-400"/>
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
