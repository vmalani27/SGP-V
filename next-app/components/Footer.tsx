export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-10 md:flex-row md:justify-between">
        <p className="text-sm text-muted">
          Built by DevOps Engineers, for Developers
        </p>
        <div className="flex items-center gap-6 text-sm text-muted">
          <a href="#" className="transition hover:text-text">GitHub</a>
          <a href="#" className="transition hover:text-text">Twitter</a>
          <a href="#" className="transition hover:text-text">Discord</a>
          <span className="text-line">|</span>
          <span className="text-xs">&copy; {new Date().getFullYear()} LabOps</span>
        </div>
      </div>
    </footer>
  );
}
