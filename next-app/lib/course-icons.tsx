import { Terminal, Layers, Shield, Cpu, Workflow } from "lucide-react";
import { JSX } from "react";

function DockerIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.186v1.887c0 .102.083.185.185.185zm-2.954-5.43h2.118a.185.185 0 00.186-.186V3.574a.185.185 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185zm0 2.716h2.118a.185.185 0 00.186-.186V6.29a.185.185 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.186.185.186zm-2.93 0h2.119a.185.185 0 00.185-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186zm0 2.714h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186H8.1a.185.185 0 00-.185.186v1.887c0 .102.083.185.185.185zm-2.955 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186H5.144a.185.185 0 00-.185.186v1.887c0 .102.083.185.185.185zm5.91 0h2.118a.185.185 0 00.186-.185V9.006a.185.185 0 00-.186-.186h-2.118a.185.185 0 00-.185.186v1.887c0 .102.082.185.185.185zm-8.864 0h2.118a.185.185 0 00.186-.185V9.006a.185.185 0 00-.186-.186H2.19a.185.185 0 00-.185.186v1.887c0 .102.083.185.185.185zm0-2.714h2.118a.185.185 0 00.186-.186V6.29a.185.185 0 00-.186-.185H2.19a.185.185 0 00-.185.185v1.887c0 .102.083.186.185.186zm14.814 3.033c-.07.03-.787.323-1.851.323-1.045 0-1.782-.284-1.85-.323l-.11-.051-.108.055c-.71.365-1.92.518-3.088.518-1.166 0-2.378-.153-3.088-.518l-.108-.055-.11.051c-.068.039-.805.323-1.85.323-1.064 0-1.78-.293-1.851-.323L0 11.834v2.793c0 3.237 3.991 5.799 11.968 5.799 8.167 0 12.032-2.673 12.032-5.799v-2.793l-.017-.008z" />
    </svg>
  );
}

function GitIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M23.546 10.93L13.067.452c-.604-.603-1.582-.603-2.188 0L8.708 2.627l2.76 2.76c.645-.216 1.379-.07 1.888.44.515.515.658 1.253.434 1.9l2.66 2.66c.647-.224 1.385-.08 1.9.435.699.699.699 1.833 0 2.533-.7.7-1.834.7-2.534 0-.537-.537-.674-1.3-.414-1.948l-2.484-2.484V15.7a2.22 2.22 0 0 1 .593 1.583c0 1.229-.996 2.225-2.225 2.225-1.228 0-2.225-.996-2.225-2.225 0-.676.303-1.282.784-1.692l-2.434-2.434H4.156c-.675.48-1.28.783-1.956.783C.971 13.94 0 12.944 0 11.715c0-1.228.971-2.224 2.2-2.224.676 0 1.281.303 1.762.784l2.434 2.434v-4.88c-.481-.41-.784-1.016-.784-1.692 0-1.229.996-2.225 2.225-2.225 1.229 0 2.225.996 2.225 2.225 0 .676-.303 1.282-.784 1.692l2.64 2.64c.26-.26.623-.396 1.006-.396.383 0 .746.136 1.006.396.537.537.674 1.3.414 1.948l2.484 2.484c.648-.224 1.386-.08 1.901.435.7.7.7 1.834 0 2.534-.7.7-1.834.7-2.534 0-.515-.515-.658-1.253-.434-1.901l-2.66-2.66c-.224.647-.08 1.385.434 1.9.509.509 1.243.655 1.888.44l2.76 2.76 2.177-2.177c.604-.604.604-1.582 0-2.187z" />
    </svg>
  );
}

function LinuxIcon({ className = "w-4 h-4" }: { className?: string }) {
  return <Terminal className={className} />;
}

function KubernetesIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0L1.608 6v12L12 24l10.392-6V6L12 0zm0 2.31l8.392 4.845v9.69L12 21.69l-8.392-4.845v-9.69L12 2.31zM12 5a7 7 0 100 14 7 7 0 000-14zm0 2a5 5 0 110 10 5 5 0 010-10z" />
    </svg>
  );
}

const ICON_REGISTRY: Record<string, JSX.Element> = {
  "docker-mastery": <DockerIcon className="w-4 h-4" />,
  "docker-compose": <Layers className="w-4 h-4" />,
  "git-fundamentals": <GitIcon className="w-4 h-4" />,
  "linux-basics": <LinuxIcon className="w-4 h-4" />,
  "kubernetes-fundamentals": <KubernetesIcon className="w-4 h-4" />,
  "helm-charts": <Shield className="w-4 h-4" />,
  "ci-cd-pipelines": <Workflow className="w-4 h-4" />,
  "terraform-iac": <Cpu className="w-4 h-4" />,
};

export function getCourseIcon(courseId: string): JSX.Element {
  return ICON_REGISTRY[courseId] ?? <Terminal className="w-4 h-4" />;
}

export function getCourseBadgeShell(courseId: string): string {
  switch (courseId) {
    case 'docker-mastery':
    case 'docker-compose':
      return 'w-8 h-8 rounded-lg bg-[#2496ED]/10 border border-[#2496ED]/20 flex items-center justify-center shrink-0 text-[#2496ED]';
    case 'git-fundamentals':
      return 'w-8 h-8 rounded-lg bg-[#F05032]/10 border border-[#F05032]/20 flex items-center justify-center shrink-0 text-[#F05032]';
    case 'kubernetes-fundamentals':
      return 'w-8 h-8 rounded-lg bg-[#326CE5]/10 border border-[#326CE5]/20 flex items-center justify-center shrink-0 text-[#326CE5]';
    case 'helm-charts':
      return 'w-8 h-8 rounded-lg bg-[#277A9F]/10 border border-[#277A9F]/20 flex items-center justify-center shrink-0 text-[#277A9F]';
    case 'linux-basics':
    default:
      return 'w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center shrink-0 text-[#E5E7EB]';
  }
}

export function getCourseHeaderBadgeShell(courseId: string): string {
  switch (courseId) {
    case 'docker-mastery':
    case 'docker-compose':
      return 'w-9 h-9 rounded-xl bg-[#2496ED]/10 border border-[#2496ED]/20 flex items-center justify-center shrink-0 text-[#2496ED] mr-3';
    case 'git-fundamentals':
      return 'w-9 h-9 rounded-xl bg-[#F05032]/10 border border-[#F05032]/20 flex items-center justify-center shrink-0 text-[#F05032] mr-3';
    case 'kubernetes-fundamentals':
      return 'w-9 h-9 rounded-xl bg-[#326CE5]/10 border border-[#326CE5]/20 flex items-center justify-center shrink-0 text-[#326CE5] mr-3';
    case 'helm-charts':
      return 'w-9 h-9 rounded-xl bg-[#277A9F]/10 border border-[#277A9F]/20 flex items-center justify-center shrink-0 text-[#277A9F] mr-3';
    case 'linux-basics':
    default:
      return 'w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700/60 flex items-center justify-center shrink-0 text-[#E5E7EB] mr-3';
  }
}


