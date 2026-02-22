'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { GameEvent } from '@/lib/simulation/types';

/**
 * Web Speech API broadcaster narration.
 * Speaks every play except pregame/coin_toss events.
 * Cancels previous utterance before speaking a new one.
 */
export function useBroadcasterAudio() {
  const [isMuted, setIsMuted] = useState(true); // default off
  const lastSpokenRef = useRef<number | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  // Initialize synth + pick a voice on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    synthRef.current = window.speechSynthesis;

    const pickVoice = () => {
      const voices = synthRef.current?.getVoices() ?? [];
      // Prefer an English male voice for broadcaster feel
      const preferred = voices.find(
        (v) => v.lang.startsWith('en') && /male|daniel|james|david|google us/i.test(v.name)
      );
      voiceRef.current = preferred ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
    };

    pickVoice();
    // Voices may load async in some browsers
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', pickVoice);
    };
  }, []);

  const speak = useCallback(
    (event: GameEvent) => {
      if (isMuted || !synthRef.current) return;
      if (event.eventNumber === lastSpokenRef.current) return;

      // Skip non-play events (pregame intro, coin toss)
      const skipTypes = ['pregame', 'coin_toss'];
      if (skipTypes.includes(event.playResult.type)) return;

      // Cancel any ongoing speech
      synthRef.current.cancel();

      const text = event.commentary.playByPlay;
      if (!text) return;

      // Vary rate by excitement — bigger plays get a more energetic delivery
      const excitement = event.commentary.excitement;
      const rate = excitement >= 70 ? 1.2 : excitement >= 40 ? 1.1 : 1.0;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = 0.85;
      if (voiceRef.current) utterance.voice = voiceRef.current;

      synthRef.current.speak(utterance);
      lastSpokenRef.current = event.eventNumber;
    },
    [isMuted]
  );

  const toggle = useCallback(() => {
    // Cancel speech when muting
    if (!isMuted && synthRef.current) {
      synthRef.current.cancel();
    }
    setIsMuted((prev) => !prev);
  }, [isMuted]);

  return { isMuted, toggle, speak };
}
