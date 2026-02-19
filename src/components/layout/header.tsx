'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface HeaderProps {
  isLive?: boolean;
}

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/standings', label: 'Standings' },
  { href: '/teams', label: 'Teams' },
  { href: '/leaderboard', label: 'Leaderboard' },
];

export function Header({ isLive = false }: HeaderProps) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 8);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`
        hidden md:block sticky top-0 z-50
        transition-all duration-300
        ${scrolled ? 'shadow-lg shadow-black/30' : ''}
      `}
      style={{
        background: 'rgba(17, 24, 39, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="text-2xl" role="img" aria-label="football">
            🏈
          </span>
          <span className="font-bold text-lg tracking-widest text-gold group-hover:text-gold-bright transition-colors">
            GRIDIRON
          </span>
          <span className="font-bold text-lg tracking-widest text-gold-bright group-hover:text-gold transition-colors">
            LIVE
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive =
              link.href === '/'
                ? pathname === '/'
                : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  relative px-3 py-2 text-sm font-medium rounded-md
                  transition-colors duration-200
                  ${
                    isActive
                      ? 'text-gold'
                      : 'text-text-secondary hover:text-text-primary'
                  }
                `}
              >
                {link.label}
                {isActive && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-gold rounded-full" />
                )}
              </Link>
            );
          })}

          {/* Live Badge */}
          {isLive && (
            <Link
              href="/live"
              className="ml-3 flex items-center gap-1.5 px-3 py-1.5 bg-live-red/15 border border-live-red/30 rounded-full hover:bg-live-red/25 transition-colors"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-live-red opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-live-red" />
              </span>
              <span className="text-xs font-bold text-live-red tracking-wider uppercase">
                Live
              </span>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
