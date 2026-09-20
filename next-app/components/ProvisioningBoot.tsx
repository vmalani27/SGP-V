'use client';

import { useEffect, useState } from 'react';

interface BootStep {
  at: number;
  text: string;
}

export default function ProvisioningBoot({ image, label }: { image: string; label: string }) {
  const steps: BootStep[] = [
    { at: 0, text: '[0.002] Initializing ephemeral sandbox container...' },
    { at: 800, text: `[0.420] Pulling runtime base image: ${image || label || 'sandbox'}` },
    { at: 1700, text: '[1.320] Attaching isolated tty session...' },
    { at: 2600, text: '[2.140] Waiting for provisioning daemon...' },
  ];

  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const timers = steps
      .map((s, i) => (i > 0 ? setTimeout(() => setVisible(i), s.at) : 0))
      .filter((t): t is ReturnType<typeof setTimeout> => t !== 0);
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-0 flex-1 select-none flex-col bg-[#090a0c] p-5 font-mono text-xs">
      {steps.slice(0, visible + 1).map((s, i) => (
        <div key={i} className={i === visible ? 'text-zinc-200' : 'text-zinc-500'}>
          {s.text}
        </div>
      ))}
      <div className="mt-2 flex items-center gap-2 text-zinc-300">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-zinc-400 border-t-transparent" />
        Provisioning environment...
      </div>
    </div>
  );
}