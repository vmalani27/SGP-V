import Navbar from '@/components/Navbar';

export default async function CourseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-screen bg-[#090a0f] text-slate-100 flex flex-col select-none">
      {/* Global top app bar */}
      <Navbar />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {children}
      </div>
    </div>
  );
}

