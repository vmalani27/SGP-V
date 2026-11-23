'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';

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
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: CodeBlock,
          img: ({ src, alt }: { src?: string; alt?: string }) => (
            <figure className="my-4 flex flex-col items-center">
              <div className="w-full flex justify-center items-center p-3 rounded-lg bg-[#141822] border border-white/[0.08] overflow-hidden">
                <img src={src} alt={alt || 'Image'} className="max-h-[400px] max-w-full w-auto object-contain" loading="lazy" />
              </div>
              {alt && <figcaption className="mt-1.5 text-xs font-mono text-zinc-400">{alt}</figcaption>}
            </figure>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
