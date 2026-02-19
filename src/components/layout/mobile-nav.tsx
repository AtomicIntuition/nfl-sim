'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface MobileNavProps {
  isLive?: boolean;
}

interface NavTab {
  href: string;
  label: string;
  icon: React.ReactNode;
  matchPaths?: string[];
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function PlayIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function TrophyIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 010-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 000-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0012 0V2z" />
    </svg>
  );
}

function MenuIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

const tabs: NavTab[] = [
  {
    href: '/',
    label: 'Home',
    icon: <HomeIcon active={false} />,
    matchPaths: ['/'],
  },
  {
    href: '/live',
    label: 'Live',
    icon: <PlayIcon active={false} />,
    matchPaths: ['/live', '/game'],
  },
  {
    href: '/schedule',
    label: 'Schedule',
    icon: <CalendarIcon active={false} />,
    matchPaths: ['/schedule'],
  },
  {
    href: '/standings',
    label: 'Standings',
    icon: <TrophyIcon active={false} />,
    matchPaths: ['/standings'],
  },
  {
    href: '/more',
    label: 'More',
    icon: <MenuIcon active={false} />,
    matchPaths: ['/more', '/teams', '/leaderboard'],
  },
];

function TabIcon({ tab, active }: { tab: NavTab; active: boolean }) {
  switch (tab.label) {
    case 'Home':
      return <HomeIcon active={active} />;
    case 'Live':
      return <PlayIcon active={active} />;
    case 'Schedule':
      return <CalendarIcon active={active} />;
    case 'Standings':
      return <TrophyIcon active={active} />;
    case 'More':
      return <MenuIcon active={active} />;
    default:
      return null;
  }
}

export function MobileNav({ isLive = false }: MobileNavProps) {
  const pathname = usePathname();

  const isTabActive = (tab: NavTab) => {
    if (tab.href === '/') return pathname === '/';
    return tab.matchPaths?.some((p) =>
      p === '/' ? pathname === '/' : pathname.startsWith(p)
    ) ?? false;
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 safe-bottom"
      style={{
        background: 'rgba(10, 14, 26, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const active = isTabActive(tab);
          const isLiveTab = tab.label === 'Live';

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`
                relative flex flex-col items-center justify-center
                flex-1 h-full pt-1
                transition-colors duration-200
                ${active ? 'text-gold' : 'text-text-muted'}
              `}
            >
              <div className="relative">
                <TabIcon tab={tab} active={active} />
                {/* Red dot for live indicator */}
                {isLiveTab && isLive && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-live-red opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-live-red" />
                  </span>
                )}
              </div>
              <span
                className={`
                  text-[10px] mt-0.5 font-medium
                  ${active ? 'text-gold' : 'text-text-muted'}
                `}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
