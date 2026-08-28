'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ContentModule, CourseChanges, CourseItem, ItemChange } from '@/lib/content-types';
import { getModuleItems, itemHref } from '@/lib/content-server';

function ClipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8l-4 4 4 4M17 8l4 4-4 4M14 4l-4 16" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v6m0 0l-2.5-2.5M12 13l2.5-2.5M4 17V5a2 2 0 0 1 2-2h8l6 6v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function ChangeChip({ change }: { change: ItemChange }) {
  const isNew = change.change === 'new';
  return (
    <span
      title={isNew ? 'Newly added in the latest content release' : 'Updated in the latest content release'}
      className={`shrink-0 rounded-sm border px-1 py-px font-mono text-[10px] uppercase tracking-wide ${
        isNew
          ? 'border-emerald-500/30 text-emerald-400/90'
          : 'border-sky-500/30 text-sky-400/90'
      }`}
    >
      {isNew ? 'NEW' : 'UPDATED'}
    </span>
  );
}

function ItemRow({
  item,
  courseId,
  isCompleted,
  isActive,
  change,
}: {
  item: CourseItem;
  courseId: string;
  isCompleted: boolean;
  isActive: boolean;
  change?: ItemChange;
}) {
  const href = itemHref(courseId, item);
  const isLab = item.type === 'lab';

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 border-l-2 py-2 pl-4 pr-1 transition ${
        isActive
          ? 'border-accent bg-line/10 hover:bg-line/15'
          : 'border-transparent hover:bg-line/10'
      }`}
    >
      {/* Type icon: code glyph for labs, document for chapters */}
      <span className={`shrink-0 ${isCompleted ? 'text-emerald-400/80' : 'text-muted/70 group-hover:text-accent'}`}>
        {isLab ? <ClipIcon className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />}
      </span>

      <span className={`min-w-0 flex-1 truncate text-sm ${isCompleted ? 'text-muted' : 'text-text'}`}>
        {item.title}
      </span>

      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted/60">
        {isLab ? '[ Lab ]' : '[ Theory ]'}
      </span>

      {change && <ChangeChip change={change} />}

      {isCompleted && <CheckIcon className="h-4 w-4 shrink-0 text-emerald-400/80" />}
    </Link>
  );
}

export default function CourseAccordion({
  module,
  courseId,
  moduleIndex,
  completedChapterIds = [],
  completedLabIds = [],
  activeItemId = null,
  changes = {},
}: {
  module: ContentModule;
  courseId: string;
  moduleIndex: number;
  completedChapterIds?: string[];
  completedLabIds?: string[];
  activeItemId?: string | null;
  changes?: CourseChanges;
}) {
  const [isOpen, setIsOpen] = useState(moduleIndex === 0);

  const items = getModuleItems(module);
  const moduleChanges = items
    .map((item) => changes[item.id])
    .filter((c): c is ItemChange => Boolean(c));
  const changedCount = moduleChanges.length;
  const newCount = moduleChanges.filter((c) => c.change === 'new').length;
  const completedCount = items.filter((item) =>
    item.type === 'lab'
      ? completedLabIds.includes(item.id)
      : completedChapterIds.includes(item.id)
  ).length;
  const totalItems = items.length;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-panel">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-line/5"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-line/10 font-mono text-xs font-semibold text-muted">
          {moduleIndex + 1}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-text">{module.title}</h3>
            {changedCount > 0 && (
              <span
                title={`${newCount} new, ${changedCount - newCount} updated in the latest content release`}
                className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-accent/90"
              >
                +{changedCount} new/updated
              </span>
            )}
          </div>
          {isOpen && (
            <p className="mt-0.5 truncate text-xs text-muted">{module.description}</p>
          )}
        </div>

        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
          {completedCount}/{totalItems}
        </span>

        <svg
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-line/50 pb-1 pt-1">
          {items.map((item, idx) => (
            <ItemRow
              key={`${item.type}-${item.id}`}
              item={item}
              courseId={courseId}
              isCompleted={item.type === 'lab'
                ? completedLabIds.includes(item.id)
                : completedChapterIds.includes(item.id)}
              isActive={item.id === activeItemId}
              change={changes[item.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}