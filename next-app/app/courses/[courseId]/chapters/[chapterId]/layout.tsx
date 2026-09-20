import CourseSidebar from '@/components/CourseSidebar';

export default async function ChapterWorkspaceLayout({
  params,
  children,
}: {
  params: Promise<{ courseId: string; chapterId: string }>;
  children: React.ReactNode;
}) {
  const { courseId } = await params;

  return (
    <div className="flex h-[calc(100vh-theme(spacing.12))] w-full overflow-hidden bg-[#0b0c0e]">
      {/* Single Sidebar instance docked on left */}
      <CourseSidebar courseIdParam={courseId} />

      {/* Chapter Workspace Pane */}
      <main className="flex-1 overflow-hidden bg-[#0b0c0e] flex flex-col relative">
        {children}
      </main>
    </div>
  );
}
