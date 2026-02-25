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
  cheer: "/audio/crowd-roar.mp3",
  roar: "/audio/crowd-roar.mp3",
  groan: "/audio/crowd-gasp.mp3",
  gasp: "/audio/crowd-gasp.mp3",
  whistle: "/audio/whistle.mp3",
} as const;

/**
 * Web Audio API hook for dynamic crowd noise.
 * Three layers mixed together:
 * 1. Ambient base: continuous crowd murmur (looped, low volume)
 * 2. Reaction layer: cheers/boos triggered by play results
 * 3. Peak layer: full stadium roar for touchdowns, huge plays
 *
 * Mobile: AudioContext is created + resumed synchronously within the user
 * gesture, then files are loaded in the background. A keep-alive interval
 * prevents iOS from suspending the context.
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
  const isLoadingRef = useRef(false);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ensure AudioContext exists and is running (call synchronously within gesture)
  const ensureContext = useCallback(() => {
    let ctx = audioContextRef.current;

    if (!ctx) {
      ctx = new AudioContext();
      audioContextRef.current = ctx;

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
    }

    // Resume immediately within gesture — critical for mobile
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    return ctx;
  }, [volume]);

  // Load audio files in background (non-blocking, after context is alive)
  const loadAudioFiles = useCallback((ctx: AudioContext) => {
    if (isLoadingRef.current || audioBuffersRef.current.size > 0) return;
    isLoadingRef.current = true;

    // Deduplicate URLs so we don't fetch the same file twice
    const uniqueEntries = new Map<string, string[]>();
    for (const [key, url] of Object.entries(AUDIO_FILES)) {
      const existing = uniqueEntries.get(url);
      if (existing) {
        existing.push(key);
      } else {
        uniqueEntries.set(url, [key]);
      }
    }

    for (const [url, keys] of uniqueEntries) {
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((buf) => ctx.decodeAudioData(buf))
        .then((audioBuffer) => {
          for (const key of keys) {
            audioBuffersRef.current.set(key, audioBuffer);
          }
          // Start ambient loop once it's loaded
          if (keys.includes("ambient") && !ambientSourceRef.current) {
            startAmbientLoop(ctx, audioBuffer);
          }
        })
        .catch(() => {
          // File unavailable — degrade gracefully
        });
    }
  }, []);

  // Start the looping ambient track
  const startAmbientLoop = useCallback(
    (ctx: AudioContext, buffer: AudioBuffer) => {
      if (ambientSourceRef.current) return;
      const ambientGain = ambientGainRef.current;
      if (!ambientGain) return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(ambientGain);
      source.start();
      ambientSourceRef.current = source;
    },
    []
  );

  // iOS keep-alive: periodically resume context to prevent suspension
  const startKeepAlive = useCallback(() => {
    if (keepAliveRef.current) return;
    keepAliveRef.current = setInterval(() => {
      const ctx = audioContextRef.current;
      if (ctx && ctx.state === "suspended") {
        ctx.resume();
      }
    }, 5000);
  }, []);

  const stopKeepAlive = useCallback(() => {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  // Enable — called synchronously from user gesture (click/tap)
  const enable = useCallback(() => {
    try {
      // Step 1: Create + resume AudioContext immediately within gesture
      const ctx = ensureContext();
      // Step 2: Load files in background (non-blocking)
      loadAudioFiles(ctx);
      // Step 3: Keep iOS from suspending
      startKeepAlive();
      setIsEnabled(true);
    } catch {
      // Web Audio API not available
    }
  }, [ensureContext, loadAudioFiles, startKeepAlive]);

  // Disable
  const disable = useCallback(() => {
    if (audioContextRef.current?.state === "running") {
      audioContextRef.current.suspend();
    }
    stopKeepAlive();
    setIsEnabled(false);
  }, [stopKeepAlive]);

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

      // Resume context if iOS suspended it between plays
      if (ctx.state === "suspended") {
        ctx.resume();
      }

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
      if (!isEnabled) return;

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

      // Play reaction sound (only if buffers have loaded)
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
      stopKeepAlive();
      ambientSourceRef.current?.stop();
      audioContextRef.current?.close();
    };
  }, [stopKeepAlive]);

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
