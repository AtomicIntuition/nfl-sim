'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  GameEvent,
  GameState,
  BoxScore,
  PlayerGameStats,
  StreamMessage,
} from '@/lib/simulation/types';

interface GameStreamState {
  events: GameEvent[];
  currentEvent: GameEvent | null;
  gameState: GameState | null;
  boxScore: BoxScore | null;
  mvp: PlayerGameStats | null;
  finalScore: { home: number; away: number } | null;
  status: 'connecting' | 'live' | 'catchup' | 'game_over' | 'error' | 'intermission';
  error: string | null;
  intermissionMessage: string | null;
  intermissionCountdown: number;
  nextGameId: string | null;
}

const INITIAL_STATE: GameStreamState = {
  events: [],
  currentEvent: null,
  gameState: null,
  boxScore: null,
  mvp: null,
  finalScore: null,
  status: 'connecting',
  error: null,
  intermissionMessage: null,
  intermissionCountdown: 0,
  nextGameId: null,
};

const MAX_RECONNECT_DELAY = 30000;
const BASE_RECONNECT_DELAY = 1000;

export function useGameStream(gameId: string | null): GameStreamState & {
  reconnect: () => void;
} {
  const [state, setState] = useState<GameStreamState>(INITIAL_STATE);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackQueueRef = useRef<GameEvent[]>([]);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCatchingUpRef = useRef(false);
  const isReconnectingRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  }, []);

  const processPlaybackQueue = useCallback(() => {
    if (playbackQueueRef.current.length === 0) return;

    const nextEvent = playbackQueueRef.current.shift()!;

    setState((prev) => ({
      ...prev,
      events: [...prev.events, nextEvent],
      currentEvent: nextEvent,
      gameState: nextEvent.gameState,
      status: 'live',
    }));

    // Schedule next event playback with timing based on play type
    if (playbackQueueRef.current.length > 0) {
      const delay = getPlaybackDelay(nextEvent);
      playbackTimerRef.current = setTimeout(processPlaybackQueue, delay);
    }
  }, []);

  const connect = useCallback(() => {
    if (!gameId) return;

    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    clearTimers();

    // When reconnecting (server-initiated or error recovery with existing state),
    // keep the current UI state instead of flashing back to "connecting"
    if (!isReconnectingRef.current) {
      setState((prev) => ({ ...prev, status: 'connecting', error: null }));
    } else {
      setState((prev) => ({ ...prev, error: null }));
    }

    const url = `/api/game/${gameId}/stream`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      reconnectAttemptRef.current = 0;
      isReconnectingRef.current = false;
    };

    eventSource.onmessage = (event) => {
      try {
        const message: StreamMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'catchup': {
            isCatchingUpRef.current = true;
            // Apply all catchup events immediately without animation delay
            setState((prev) => ({
              ...prev,
              events: message.events,
              currentEvent: message.events[message.events.length - 1] ?? null,
              gameState: message.gameState,
              status: 'catchup',
            }));
            // Briefly show catchup state, then transition to live
            setTimeout(() => {
              isCatchingUpRef.current = false;
              setState((prev) => ({
                ...prev,
                status: 'live',
              }));
            }, 500);
            break;
          }

          case 'play': {
            if (isCatchingUpRef.current) {
              // Still catching up -- queue this play
              playbackQueueRef.current.push(message.event);
            } else if (playbackQueueRef.current.length > 0) {
              // There are queued plays, add to queue
              playbackQueueRef.current.push(message.event);
            } else {
              // Immediately display the play
              setState((prev) => ({
                ...prev,
                events: [...prev.events, message.event],
                currentEvent: message.event,
                gameState: message.event.gameState,
                status: 'live',
              }));
            }
            break;
          }

          case 'game_over': {
            // Flush any remaining queued events
            playbackQueueRef.current = [];
            clearTimers();

            setState((prev) => ({
              ...prev,
              boxScore: message.boxScore,
              finalScore: message.finalScore,
              mvp: message.mvp,
              status: 'game_over',
            }));
            break;
          }

          case 'intermission': {
            setState((prev) => ({
              ...prev,
              // Don't overwrite game_over status — the user should see the
              // game-over summary, not the intermission screen. Store the
              // intermission data so GameOverWithRedirect can show "Up Next".
              status: prev.status === 'game_over' ? 'game_over' : 'intermission',
              intermissionMessage: message.message,
              intermissionCountdown: message.countdown,
              nextGameId: message.nextGameId,
            }));
            break;
          }

          case 'reconnect': {
            // Server is about to close the connection (approaching Vercel timeout).
            // Reconnect seamlessly without resetting UI state.
            isReconnectingRef.current = true;
            reconnectAttemptRef.current = 0;
            // Store in ref so clearTimers() cancels it on gameId change
            reconnectTimeoutRef.current = setTimeout(() => connect(), 100);
            break;
          }

          case 'week_recap': {
            // Week recap can be handled by the parent component
            // We just store it as an event for now
            break;
          }

          case 'error': {
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: message.message,
            }));
            break;
          }
        }
      } catch {
        console.error('Failed to parse SSE message');
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;

      // Don't reconnect if the game is over or intermission
      setState((prev) => {
        if (prev.status === 'game_over' || prev.status === 'intermission') return prev;

        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(
          BASE_RECONNECT_DELAY * Math.pow(2, attempt),
          MAX_RECONNECT_DELAY
        );
        reconnectAttemptRef.current = attempt + 1;

        // If we have events, reconnect silently in the background
        // without changing the displayed status (no UI flash)
        if (prev.events.length > 0) {
          isReconnectingRef.current = true;
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);

        // Keep current status if we have events (silent reconnect)
        return {
          ...prev,
          status: prev.events.length > 0 ? prev.status : 'error',
          error: prev.events.length > 0 ? null : `Connection lost. Reconnecting in ${Math.round(delay / 1000)}s...`,
        };
      });
    };
  }, [gameId, clearTimers]);

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    connect();
  }, [connect]);

  // Connect on mount / gameId change
  useEffect(() => {
    if (!gameId) {
      setState(INITIAL_STATE);
      return;
    }

    // Reset state for new game
    setState(INITIAL_STATE);
    playbackQueueRef.current = [];
    isCatchingUpRef.current = false;
    isReconnectingRef.current = false;

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      clearTimers();
      playbackQueueRef.current = [];
    };
  }, [gameId, connect, clearTimers]);

  // Start playback queue processing when catchup finishes and there are queued plays
  useEffect(() => {
    if (
      state.status === 'live' &&
      !isCatchingUpRef.current &&
      playbackQueueRef.current.length > 0 &&
      !playbackTimerRef.current
    ) {
      processPlaybackQueue();
    }
  }, [state.status, processPlaybackQueue]);

  return {
    ...state,
    reconnect,
  };
}

/**
 * Calculate playback delay between events based on play significance.
 * Bigger plays get more breathing room to build drama.
 */
function getPlaybackDelay(event: GameEvent): number {
  const { playResult, commentary } = event;

  // Touchdowns and turnovers deserve the most dramatic pause
  if (playResult.isTouchdown) return 1200;
  if (playResult.turnover) return 1000;

  // Scoring plays
  if (playResult.scoring) return 800;

  // Big plays (15+ yards)
  if (playResult.yardsGained >= 15) return 600;

  // Sacks and penalties
  if (playResult.type === 'sack') return 500;
  if (playResult.penalty && !playResult.penalty.declined) return 500;

  // High excitement commentary
  if (commentary.excitement > 70) return 600;

  // Kickoffs
  if (playResult.type === 'kickoff') return 700;
  // Punts
  if (playResult.type === 'punt') return 500;

  // Normal plays
  return 300;
}
