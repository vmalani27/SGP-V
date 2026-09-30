import CourseSidebar from '@/components/CourseSidebar';

export default async function LabWorkspaceLayout({
  params,
  children,
}: {
  params: Promise<{ courseId: string; labId: string }>;
  children: React.ReactNode;
}) {
  const { courseId } = await params;

  return (
    <div className="flex h-[calc(100vh-theme(spacing.12))] w-full overflow-hidden bg-[#090a0f]">
      {/* Single Sidebar instance docked on left */}
      <CourseSidebar courseIdParam={courseId} />

      {/* Lab Workspace Pane */}
      <main className="flex-1 overflow-hidden bg-[#090a0f] flex flex-col relative">
        {children}
      </main>
    </div>
  );
}
