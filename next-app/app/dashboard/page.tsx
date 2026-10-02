import RoadmapView from '@/components/RoadmapView';
import { roadmapNodes } from '@/lib/roadmap';
import { readCatalog } from '@/lib/content-local';
import type { CourseCatalogEntry } from '@/lib/content-types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let catalog: CourseCatalogEntry[] = [];
  try {
    catalog = await readCatalog();
  } catch {}

  return <RoadmapView nodes={roadmapNodes} initialCatalog={catalog} />;
}

