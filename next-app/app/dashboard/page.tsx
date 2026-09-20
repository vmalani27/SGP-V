import RoadmapView from '@/components/RoadmapView';
import { roadmapNodes } from '@/lib/roadmap';

export default function DashboardPage() {
  return <RoadmapView nodes={roadmapNodes} />;
}
