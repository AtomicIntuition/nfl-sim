import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-midnight mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-gold font-bold text-lg tracking-tight">
              GRIDIRON
            </span>
            <span className="text-text-primary font-bold text-lg tracking-tight">
              LIVE
            </span>
          </div>

          <nav className="flex items-center gap-6 text-sm text-text-secondary">
            <Link
              href="/"
              className="hover:text-text-primary transition-colors"
            >
              Home
            </Link>
            <Link
              href="/schedule"
              className="hover:text-text-primary transition-colors"
            >
              Schedule
            </Link>
            <Link
              href="/leaderboard"
              className="hover:text-text-primary transition-colors"
            >
              Leaderboard
            </Link>
          </nav>

          <div className="text-xs text-text-muted">
            Provably fair simulations. All games are verifiable.
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-border/50 text-center text-xs text-text-muted">
          GridIron Live is a simulation platform. Not affiliated with the NFL.
        </div>
      </div>
    </footer>
  );
}
