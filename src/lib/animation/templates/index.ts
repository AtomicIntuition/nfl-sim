/**
 * Template registry — maps play types to their choreography templates.
 */

import type { PlayTemplate, PlayContext } from '../types';
import { passPlayTemplate } from './pass-play';
import { runPlayTemplate } from './run-play';
import { kickoffTemplate } from './kickoff';
import { puntTemplate } from './punt';
import { fieldGoalTemplate } from './field-goal';
import { specialTemplate, turnoverTemplate } from './special';

/** Select the appropriate template for a play */
export function getTemplate(ctx: PlayContext): PlayTemplate {
  const { play } = ctx;

  // Turnovers get special treatment
  if (play.turnover) return turnoverTemplate;

  switch (play.type) {
    case 'pass_complete':
    case 'pass_incomplete':
    case 'sack':
      return passPlayTemplate;

    case 'run':
    case 'scramble':
    case 'two_point':
      return runPlayTemplate;

    case 'kickoff':
      return kickoffTemplate;

    case 'punt':
      return puntTemplate;

    case 'field_goal':
    case 'extra_point':
      return fieldGoalTemplate;

    case 'kneel':
    case 'spike':
    case 'touchback':
      return specialTemplate;

    default:
      // Fallback to run template for unknown types
      return runPlayTemplate;
  }
}

export { passPlayTemplate, runPlayTemplate, kickoffTemplate, puntTemplate, fieldGoalTemplate, specialTemplate, turnoverTemplate };
