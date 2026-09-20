export interface RoadmapNode {
  id: string;
  slug?: string;
  title: string;
  stage: string;
  status: 'completed' | 'in-progress' | 'available' | 'unreleased';
  progress?: { completed: number; total: number };
}

export const roadmapNodes: RoadmapNode[] = [
  {
    id: 'linux-basics',
    slug: 'linux-basics',
    title: 'Linux Fundamentals',
    stage: 'Foundations',
    status: 'available',
    progress: { completed: 0, total: 8 },
  },
  {
    id: 'git-fundamentals',
    slug: 'git-fundamentals',
    title: 'Git Fundamentals',
    stage: 'Foundations',
    status: 'available',
    progress: { completed: 0, total: 6 },
  },
  {
    id: 'docker-mastery',
    slug: 'docker-mastery',
    title: 'Docker Containers & Images',
    stage: 'Runtimes & Networks',
    status: 'available',
    progress: { completed: 0, total: 29 },
  },
  {
    id: 'docker-compose',
    slug: 'docker-mastery',
    title: 'Docker Compose & Multi-Container',
    stage: 'Runtimes & Networks',
    status: 'available',
    progress: { completed: 0, total: 12 },
  },
  {
    id: 'kubernetes-fundamentals',
    slug: 'kubernetes-fundamentals',
    title: 'Kubernetes Core Concepts & Pods',
    stage: 'Orchestration',
    status: 'unreleased',
    progress: { completed: 0, total: 15 },
  },
  {
    id: 'helm-charts',
    title: 'Helm Package Management',
    stage: 'Orchestration',
    status: 'unreleased',
    progress: { completed: 0, total: 10 },
  },
];



