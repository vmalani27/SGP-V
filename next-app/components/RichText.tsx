'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function RichText({
  content,
  className = '',
  size = 'base',
}: {
  content: string;
  className?: string;
  size?: 'base' | 'sm' | 'xs';
}) {
  const sizeClass = size === 'sm' ? ' prose-sm' : size === 'xs' ? ' prose-xs' : '';
  return (
    <div className={`prose-custom${sizeClass} ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
