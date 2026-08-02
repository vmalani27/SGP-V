'use client';

const CONFETTI_COLORS = ['#34d399', '#fbbf24', '#60a5fa', '#f472b6', '#a78bfa', '#f87171'];

interface CelebrationOverlayProps {
  label?: string;
}

export default function CelebrationOverlay({ label = 'Correct!' }: CelebrationOverlayProps) {
  const particles = Array.from({ length: 14 }, (_, i) => ({
    angle: (360 / 14) * i,
    delay: (i % 5) * 0.04,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  }));

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/20">
      {/* Confetti burst */}
      <div className="absolute left-1/2 top-1/2">
        {particles.map((p, i) => (
          <span
            key={i}
            className="animate-confetti absolute h-2 w-2 rounded-sm"
            style={
              {
                '--confetti-angle': `${p.angle}deg`,
                animationDelay: `${p.delay}s`,
                background: p.color,
                marginTop: -4,
                marginLeft: -4,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Checkmark + label */}
      <div className="flex flex-col items-center gap-4">
        <div className="animate-pop-in flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 border-2 border-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.35)]">
          <svg className="h-10 w-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>
        <p className="animate-fade-up text-lg font-semibold text-emerald-300" style={{ animationDelay: '0.15s' }}>
          {label}
        </p>
      </div>
    </div>
  );
}
