'use client';

import React, { useState, type ReactNode } from 'react';
import { Play, Check, Copy } from 'lucide-react';

export function extractText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return extractText((node as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

export function getCodeLanguage(node?: ReactNode): string {
  if (!node) return '';
  if (Array.isArray(node)) {
    for (const item of node) {
      const lang = getCodeLanguage(item);
      if (lang) return lang;
    }
    return '';
  }
  if (React.isValidElement(node)) {
    const props = node.props as { className?: string; children?: ReactNode };
    if (props && typeof props.className === 'string') {
      const match = /language-([\w-]+)/.exec(props.className);
      if (match) return match[1].toLowerCase();
    }
    if (props && props.children) {
      return getCodeLanguage(props.children);
    }
  }
  return '';
}

const SHELL_COMMANDS = new Set([
  'docker', 'docker-compose', 'git', 'curl', 'wget', 'cat', 'echo', 'ls',
  'cd', 'mkdir', 'rm', 'cp', 'mv', 'chmod', 'chown', 'export', 'source',
  'sudo', 'apt', 'apt-get', 'apk', 'npm', 'yarn', 'pnpm', 'node', 'python',
  'python3', 'pip', 'pip3', 'systemctl', 'service', 'grep', 'sed', 'awk',
  'tar', 'ps', 'kill', 'pkill', 'sleep', 'touch', 'tail', 'head', 'which',
  'env', 'find', 'ssh', 'scp', 'crontab', 'wsl', 'hostname', 'ping', 'dig',
  'netstat', 'ip', 'ifconfig', 'ss', 'nc', 'nmap', 'jq'
]);

export function checkIsExecutable(code: string, lang: string): boolean {
  const normalizedLang = lang.trim().toLowerCase();
  if (['bash', 'sh', 'shell', 'zsh', 'terminal', 'console'].includes(normalizedLang)) {
    return true;
  }
  if (['json', 'yaml', 'yml', 'toml', 'html', 'css', 'javascript', 'typescript', 'js', 'ts', 'go', 'python', 'py', 'sql', 'markdown', 'md'].includes(normalizedLang)) {
    return false;
  }
  const trimmed = code.trim();
  if (!trimmed) return false;
  const lines = trimmed.split('\n');
  const firstLine = lines[0].trim();
  if (firstLine.startsWith('$ ') || firstLine.startsWith('# ')) {
    return true;
  }
  const firstToken = firstLine.split(/[\s|&;]+/)[0]?.toLowerCase();
  if (firstToken && SHELL_COMMANDS.has(firstToken)) {
    return true;
  }
  return false;
}

export interface CodeBlockProps {
  children?: ReactNode;
  code?: string;
  language?: string;
  className?: string;
}

export default function CodeBlock({
  children,
  code: directCode,
  language: directLanguage,
  className = '',
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const rawCode = directCode !== undefined ? directCode : extractText(children);
  const code = rawCode.replace(/\n$/, '');

  const lang = directLanguage || getCodeLanguage(children);
  const isExecutable = checkIsExecutable(code, lang);

  const cleanCommand = (str: string) =>
    str
      .split('\n')
      .map((line) => (line.trim().startsWith('$ ') ? line.trim().slice(2) : line))
      .join('\n')
      .trim();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanCommand(code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleRun = () => {
    window.dispatchEvent(new CustomEvent('send-to-terminal', { detail: cleanCommand(code) }));
  };

  return (
    <div
      className={`group relative my-3 rounded-lg bg-[#141416] border border-white/[0.06] p-3 transition-colors hover:border-white/[0.12] ${className}`}
    >
      {/* Action Triggers (Floating, no dedicated header row) */}
      <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity select-none z-10">
        {isExecutable && (
          <button
            onClick={handleRun}
            type="button"
            className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] font-mono text-sky-400 hover:text-sky-300 transition-colors cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current" /> Run
          </button>
        )}
        <button
          onClick={handleCopy}
          type="button"
          className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" /> Copied
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" /> Copy
            </>
          )}
        </button>
      </div>

      {/* Command Text (Zero inner borders, wrapping enabled) */}
      <pre className="font-mono text-[13px] leading-6 text-zinc-200 whitespace-pre-wrap break-words pr-20 select-text">
        <code className="font-mono text-[13px] leading-6 text-zinc-200">{code}</code>
      </pre>
    </div>
  );
}
