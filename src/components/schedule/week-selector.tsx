'use client';

import { useRef, useEffect } from 'react';

interface WeekSelectorProps {
  currentWeek: number;
  totalWeeks: number;
  selectedWeek: number;
  onSelectWeek: (week: number) => void;
  seasonStatus: string;
}

interface WeekItem {
  weekNumber: number;
  label: string;
  isPlayoff: boolean;
}

function buildWeekItems(totalWeeks: number): WeekItem[] {
  const items: WeekItem[] = [];

  // Regular season weeks (1-18)
  const regularWeeks = Math.min(totalWeeks, 18);
  for (let i = 1; i <= regularWeeks; i++) {
    items.push({ weekNumber: i, label: `${i}`, isPlayoff: false });
  }

  // Playoff rounds
  const playoffLabels: [number, string][] = [
    [19, 'WC'],
    [20, 'DIV'],
    [21, 'CC'],
    [22, 'SB'],
  ];

  for (const [weekNum, label] of playoffLabels) {
    if (weekNum <= totalWeeks) {
      items.push({ weekNumber: weekNum, label, isPlayoff: true });
    }
  }

  return items;
}

export function WeekSelector({
  currentWeek,
  totalWeeks,
  selectedWeek,
  onSelectWeek,
}: WeekSelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const items = buildWeekItems(totalWeeks);

  // Scroll to the selected week on mount and when selectedWeek changes
  useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const element = selectedRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();

      const scrollLeft =
        element.offsetLeft -
        container.offsetLeft -
        containerRect.width / 2 +
        elementRect.width / 2;

      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, [selectedWeek]);

  return (
    <div className="relative">
      {/* Fade edges */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 z-10 bg-gradient-to-r from-midnight to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 z-10 bg-gradient-to-l from-midnight to-transparent" />

      {/* Scrollable container */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1.5 overflow-x-auto scrollbar-none px-6 py-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map((item) => {
          const isSelected = item.weekNumber === selectedWeek;
          const isCurrent = item.weekNumber === currentWeek;
          const isCompleted = item.weekNumber < currentWeek;

          return (
            <button
              key={item.weekNumber}
              ref={isSelected ? selectedRef : undefined}
              onClick={() => onSelectWeek(item.weekNumber)}
              className={`
                relative shrink-0 flex items-center justify-center
                min-w-[40px] h-9 px-3 rounded-lg
                text-xs font-semibold
                transition-all duration-200
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold
                ${
                  isSelected
                    ? 'bg-gold text-midnight shadow-lg shadow-gold/20'
                    : isCurrent
                      ? 'bg-gold/15 text-gold border border-gold/30'
                      : isCompleted
                        ? 'bg-surface-elevated text-text-secondary hover:bg-surface-hover'
                        : 'bg-surface text-text-muted hover:bg-surface-elevated hover:text-text-secondary'
                }
                ${item.isPlayoff ? 'tracking-wider' : 'font-mono'}
              `}
            >
              {/* Week label */}
              <span>{item.isPlayoff ? item.label : item.label}</span>

              {/* Checkmark for completed weeks */}
              {isCompleted && !isSelected && (
                <svg
                  className="absolute -top-0.5 -right-0.5 w-3 h-3 text-success"
                  viewBox="0 0 12 12"
                  fill="currentColor"
                >
                  <circle cx="6" cy="6" r="6" opacity="0.2" />
                  <path
                    d="M3.5 6L5.5 8L8.5 4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
