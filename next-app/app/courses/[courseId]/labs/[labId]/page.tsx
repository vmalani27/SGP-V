import { notFound } from 'next/navigation';
import { getCourse, getAllItems } from '@/lib/content-server';
import LabClient from '@/components/LabClient';

export default async function LabPage({
  params,
}: {
  params: Promise<{ courseId: string; labId: string }>;
}) {
  const { courseId, labId } = await params;
  const course = await getCourse(courseId);
  if (!course) return notFound();

  // Continue along the linear learning path: the item right after this lab
  // (a chapter or another lab), so submitting sends the learner onward.
  const items = getAllItems(course);
  const idx = items.findIndex((item) => item.id === labId);
  const nextItem = idx >= 0 ? items[idx + 1] : undefined;

  return (
    <LabClient courseId={courseId} labId={labId} course={course} nextItem={nextItem} />
  );
}
