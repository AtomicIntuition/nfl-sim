'use client';

import type { Formation, DefensiveCall, PlayCall } from '@/lib/simulation/types';

interface PlayCallOverlayProps {
  formation: Formation | null;
  defensiveCall: DefensiveCall | null;
  playCall: PlayCall | null;
  visible: boolean;
}

const FORMATION_LABELS: Record<Formation, string> = {
  shotgun: 'SHOTGUN',
  under_center: 'UNDER CENTER',
  pistol: 'PISTOL',
  spread: 'SPREAD',
  i_formation: 'I-FORMATION',
  singleback: 'SINGLEBACK',
  goal_line: 'GOAL LINE',
  empty: 'EMPTY',
  wildcat: 'WILDCAT',
};

const PERSONNEL_LABELS: Record<string, string> = {
  base_4_3: '4-3 BASE',
  base_3_4: '3-4 BASE',
  nickel: 'NICKEL',
  dime: 'DIME',
  goal_line: 'GOAL LINE',
  prevent: 'PREVENT',
};

const COVERAGE_LABELS: Record<string, string> = {
  cover_0: 'COVER 0',
  cover_1: 'COVER 1',
  cover_2: 'COVER 2',
  cover_3: 'COVER 3',
  cover_4: 'COVER 4',
  cover_6: 'COVER 6',
  man_press: 'MAN PRESS',
};

function getPlayCallLabel(call: PlayCall): string {
  const labels: Partial<Record<PlayCall, string>> = {
    run_power: 'POWER RUN',
    run_zone: 'ZONE RUN',
    run_outside_zone: 'OUTSIDE ZONE',
    run_draw: 'DRAW',
    run_counter: 'COUNTER',
    run_sweep: 'SWEEP',
    run_qb_sneak: 'QB SNEAK',
    run_option: 'READ OPTION',
    run_inside: 'INSIDE RUN',
    run_outside: 'OUTSIDE RUN',
    pass_quick: 'QUICK PASS',
    pass_short: 'SHORT PASS',
    pass_medium: 'MEDIUM PASS',
    pass_deep: 'DEEP PASS',
    screen_pass: 'SCREEN',
    play_action_short: 'PLAY ACTION SHORT',
    play_action_deep: 'PLAY ACTION DEEP',
    pass_rpo: 'RPO',
  };
  return labels[call] ?? call.replace(/_/g, ' ').toUpperCase();
}

export function PlayCallOverlay({
  formation,
  defensiveCall,
  playCall,
  visible,
}: PlayCallOverlayProps) {
  if (!visible || !playCall) return null;

  const formationLabel = formation ? FORMATION_LABELS[formation] : null;
  const callLabel = getPlayCallLabel(playCall);
  const defenseLabel = defensiveCall
    ? `${PERSONNEL_LABELS[defensiveCall.personnel] ?? ''} | ${COVERAGE_LABELS[defensiveCall.coverage] ?? ''}`
    : null;

  return (
    <div
      className="absolute top-3 left-3 z-20 pointer-events-none"
      style={{
        animation: 'fadeInUp 300ms ease-out',
      }}
    >
      <div
        className="rounded-lg px-3 py-2"
        style={{
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {formationLabel && (
          <div className="text-[10px] font-black text-white/70 tracking-widest uppercase leading-tight">
            {formationLabel}
          </div>
        )}
        <div className="text-[11px] font-black text-white tracking-wider uppercase leading-tight mt-0.5"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
        >
          {callLabel}
        </div>
        {defenseLabel && (
          <div className="text-[9px] font-bold text-white/50 tracking-wider uppercase leading-tight mt-0.5">
            {defenseLabel}
          </div>
        )}
      </div>
    </div>
  );
}
