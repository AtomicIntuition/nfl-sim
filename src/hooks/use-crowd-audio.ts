"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { CrowdReaction } from "@/lib/simulation/types";

interface CrowdAudioState {
  isEnabled: boolean;
  volume: number;
  currentReaction: CrowdReaction | null;
}

interface CrowdAudioControls {
  enable: () => void;
  disable: () => void;
  toggle: () => void;
  setVolume: (vol: number) => void;
  triggerReaction: (reaction: CrowdReaction, excitement: number) => void;
}

const AUDIO_FILES = {
  ambient: "/audio/crowd-ambient.mp3",
  cheer: "/audio/crowd-cheer.mp3",
  roar: "/audio/crowd-roar.mp3",
  groan: "/audio/crowd-groan.mp3",
  gasp: "/audio/crowd-gasp.mp3",
  whistle: "/audio/whistle.mp3",
} as const;

/**
 * Web Audio API hook for dynamic crowd noise.
 * Three layers mixed together:
 * 1. Ambient base: continuous crowd murmur (looped, low volume)
 * 2. Reaction layer: cheers/boos triggered by play results
 * 3. Peak layer: full stadium roar for touchdowns, huge plays
 */
export function useCrowdAudio(): CrowdAudioState & CrowdAudioControls {
  const [isEnabled, setIsEnabled] = useState(false);
  const [volume, setVolumeState] = useState(0.5);
  const [currentReaction, setCurrentReaction] = useState<CrowdReaction | null>(
    null
  );

  const audioContextRef = useRef<AudioContext | null>(null);
  const ambientSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ambientGainRef = useRef<GainNode | null>(null);
  const reactionGainRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const isInitializedRef = useRef(false);

  // Initialize Web Audio context
  const initAudio = useCallback(async () => {
    if (isInitializedRef.current) return;

    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      // Create gain nodes
      const masterGain = ctx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(ctx.destination);
      masterGainRef.current = masterGain;

      const ambientGain = ctx.createGain();
      ambientGain.gain.value = 0.15;
      ambientGain.connect(masterGain);
      ambientGainRef.current = ambientGain;

      const reactionGain = ctx.createGain();
      reactionGain.gain.value = 0.6;
      reactionGain.connect(masterGain);
      reactionGainRef.current = reactionGain;

      // Load audio buffers
      await Promise.allSettled(
        Object.entries(AUDIO_FILES).map(async ([key, url]) => {
          try {
            const response = await fetch(url);
            if (!response.ok) return;
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            audioBuffersRef.current.set(key, audioBuffer);
          } catch {
            // Audio file not available — degrade gracefully
          }
        })
      );

      // Start ambient loop
      const ambientBuffer = audioBuffersRef.current.get("ambient");
      if (ambientBuffer) {
        const source = ctx.createBufferSource();
        source.buffer = ambientBuffer;
        source.loop = true;
        source.connect(ambientGain);
        source.start();
        ambientSourceRef.current = source;
      }

      isInitializedRef.current = true;
    } catch {
      // Web Audio API not available
    }
  }, [volume]);

  // Enable audio
  const enable = useCallback(async () => {
    if (!isInitializedRef.current) {
      await initAudio();
    }
    if (audioContextRef.current?.state === "suspended") {
      await audioContextRef.current.resume();
    }
    setIsEnabled(true);
  }, [initAudio]);

  // Disable audio
  const disable = useCallback(() => {
    if (audioContextRef.current?.state === "running") {
      audioContextRef.current.suspend();
    }
    setIsEnabled(false);
  }, []);

  // Toggle
  const toggle = useCallback(() => {
    if (isEnabled) {
      disable();
    } else {
      enable();
    }
  }, [isEnabled, enable, disable]);

  // Set volume
  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(
        clamped,
        audioContextRef.current?.currentTime || 0,
        0.1
      );
    }
  }, []);

  // Play a one-shot reaction sound
  const playReactionSound = useCallback(
    (bufferKey: string, gainValue: number) => {
      const ctx = audioContextRef.current;
      const buffer = audioBuffersRef.current.get(bufferKey);
      const reactionGain = reactionGainRef.current;

      if (!ctx || !buffer || !reactionGain) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      gain.connect(reactionGain);
      source.connect(gain);

      // Fade in
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(gainValue, ctx.currentTime + 0.1);

      source.start();

      // Auto-fade out near end
      const duration = buffer.duration;
      gain.gain.setValueAtTime(gainValue, ctx.currentTime + duration - 0.5);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
    },
    []
  );

  // Trigger a crowd reaction
  const triggerReaction = useCallback(
    (reaction: CrowdReaction, excitement: number) => {
      if (!isEnabled || !isInitializedRef.current) return;

      setCurrentReaction(reaction);

      // Adjust ambient volume based on excitement
      const ambientVol = 0.1 + (excitement / 100) * 0.3;
      if (ambientGainRef.current && audioContextRef.current) {
        ambientGainRef.current.gain.setTargetAtTime(
          ambientVol,
          audioContextRef.current.currentTime,
          0.3
        );
      }

      // Play reaction sound
      const reactionVolume = 0.3 + (excitement / 100) * 0.7;

      switch (reaction) {
        case "roar":
          playReactionSound("roar", reactionVolume);
          break;
        case "cheer":
        case "chant":
          playReactionSound("cheer", reactionVolume * 0.8);
          break;
        case "groan":
        case "boo":
          playReactionSound("groan", reactionVolume * 0.7);
          break;
        case "gasp":
          playReactionSound("gasp", reactionVolume * 0.9);
          break;
        case "murmur":
          // Just ambient adjustment, no one-shot
          break;
        case "silence":
          // Fade ambient down
          if (ambientGainRef.current && audioContextRef.current) {
            ambientGainRef.current.gain.setTargetAtTime(
              0.05,
              audioContextRef.current.currentTime,
              0.5
            );
          }
          break;
      }

      // Reset reaction after delay
      setTimeout(() => setCurrentReaction(null), 3000);
    },
    [isEnabled, playReactionSound]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      ambientSourceRef.current?.stop();
      audioContextRef.current?.close();
    };
  }, []);

  return {
    isEnabled,
    volume,
    currentReaction,
    enable,
    disable,
    toggle,
    setVolume,
    triggerReaction,
  };
}
