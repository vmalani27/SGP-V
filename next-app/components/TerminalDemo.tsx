export default function TerminalDemo() {
  return (
    <div className="w-full max-w-lg rounded-xl border border-line bg-panel shadow-2xl shadow-accent/5">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-500/70" />
        <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
        <span className="h-3 w-3 rounded-full bg-green-500/70" />
        <span className="ml-3 text-xs text-muted">terminal — lab-environment</span>
      </div>
      <div className="space-y-2.5 p-5 font-mono text-sm leading-relaxed">
        <div className="flex">
          <span className="text-green-400">user@lab</span>
          <span className="text-muted">:</span>
          <span className="text-accent">~</span>
          <span className="text-muted">$ </span>
          <span className="text-text">git rebase -i HEAD~3</span>
        </div>
        <div className="text-muted">Successfully rebased and updated refs/heads/main.</div>
        <div className="flex pt-1">
          <span className="text-green-400">user@lab</span>
          <span className="text-muted">:</span>
          <span className="text-accent">~</span>
          <span className="text-muted">$ </span>
          <span className="text-amber-400">docker build -t app:v2 .</span>
        </div>
        <div className="text-muted">Step 1/8 : FROM node:20-alpine</div>
        <div className="text-muted">Step 2/8 : WORKDIR /app</div>
        <div className="flex h-1 items-center gap-1 pt-1">
          <span className="text-green-400">user@lab</span>
          <span className="text-muted">:</span>
          <span className="text-accent">~</span>
          <span className="text-muted">$ </span>
          <span className="animate-pulse text-text">▊</span>
        </div>
      </div>
    </div>
  );
}
