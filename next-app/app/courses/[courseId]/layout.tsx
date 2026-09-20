import Navbar from '@/components/Navbar';

export default async function CourseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-screen bg-[#0c0d0e] bg-[radial-gradient(#1f242d_1px,transparent_1px)] [background-size:16px_16px] text-zinc-100 flex flex-col select-none">
      {/* Global top app bar */}
      <Navbar />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {children}
      </div>
    </div>
  );
}

