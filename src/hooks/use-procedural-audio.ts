'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { CrowdReaction } from '@/lib/simulation/types';

interface ProceduralAudioState {
  isEnabled: boolean;
  isMuted: boolean;
}

interface ProceduralAudioControls {
  toggle: () => void;
  triggerReaction: (reaction: CrowdReaction, excitement: number) => void;
}

/**
 * Procedural crowd audio using Web Audio API — no MP3 files needed.
 * Generates ambient crowd noise from pink noise + bandpass filter,
 * and reaction one-shots from filtered noise bursts + oscillators.
 */
export function useProceduralAudio(): ProceduralAudioState & ProceduralAudioControls {
  const [isMuted, setIsMuted] = useState(true);
  const [isEnabled, setIsEnabled] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const ambientGainRef = useRef<GainNode | null>(null);
  const ambientNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const isInitRef = useRef(false);

  // ── Create pink noise buffer ────────────────────────────────
  const createPinkNoise = useCallback((ctx: AudioContext, seconds: number): AudioBuffer => {
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * seconds;
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Pink noise via Paul Kellet's method
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }, []);

  // ── Initialize audio context ────────────────────────────────
  const init = useCallback(() => {
    if (isInitRef.current) return;

    try {
      const ctx = new AudioContext();
      ctxRef.current = ctx;

      // Master gain
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.4;
      masterGain.connect(ctx.destination);
      masterGainRef.current = masterGain;

      // Ambient gain
      const ambientGain = ctx.createGain();
      ambientGain.gain.value = 0.12;
      ambientGain.connect(masterGain);
      ambientGainRef.current = ambientGain;

      // Ambient crowd: pink noise → bandpass → gain
      const noiseBuffer = createPinkNoise(ctx, 4);
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 800;
      bandpass.Q.value = 0.5;

      noiseSource.connect(bandpass);
      bandpass.connect(ambientGain);
      noiseSource.start();
      ambientNodeRef.current = noiseSource;

      isInitRef.current = true;
    } catch {
      // Web Audio API not available
    }
  }, [createPinkNoise]);

  // ── Toggle audio on/off ─────────────────────────────────────
  const toggle = useCallback(() => {
    if (isMuted) {
      // Unmute
      if (!isInitRef.current) init();
      if (ctxRef.current?.state === 'suspended') {
        ctxRef.current.resume();
      }
      setIsMuted(false);
      setIsEnabled(true);
    } else {
      // Mute
      if (ctxRef.current?.state === 'running') {
        ctxRef.current.suspend();
      }
      setIsMuted(true);
      setIsEnabled(false);
    }
  }, [isMuted, init]);

  // ── Generate a reaction one-shot ────────────────────────────
  const triggerReaction = useCallback((reaction: CrowdReaction, excitement: number) => {
    const ctx = ctxRef.current;
    const masterGain = masterGainRef.current;
    const ambientGain = ambientGainRef.current;
    if (!ctx || !masterGain || !ambientGain || isMuted) return;

    // Adjust ambient volume based on excitement
    const ambientVol = 0.08 + (excitement / 100) * 0.25;
    ambientGain.gain.setTargetAtTime(ambientVol, ctx.currentTime, 0.3);

    const reactionVol = 0.2 + (excitement / 100) * 0.5;

    switch (reaction) {
      case 'roar':
      case 'cheer':
      case 'chant': {
        // Rising noise burst with bandpass — crowd cheering
        playNoiseBurst(ctx, masterGain, {
          duration: reaction === 'roar' ? 2.0 : 1.5,
          freqStart: 600,
          freqEnd: reaction === 'roar' ? 1800 : 1200,
          gain: reactionVol * (reaction === 'roar' ? 1.0 : 0.7),
          q: 0.8,
        });
        break;
      }
      case 'groan':
      case 'boo': {
        // Falling noise burst — disappointment
        playNoiseBurst(ctx, masterGain, {
          duration: 1.2,
          freqStart: 800,
          freqEnd: 300,
          gain: reactionVol * 0.6,
          q: 0.6,
        });
        break;
      }
      case 'gasp': {
        // Sharp short burst
        playNoiseBurst(ctx, masterGain, {
          duration: 0.5,
          freqStart: 1200,
          freqEnd: 600,
          gain: reactionVol * 0.8,
          q: 1.2,
        });
        break;
      }
      case 'silence': {
        // Fade ambient down
        ambientGain.gain.setTargetAtTime(0.03, ctx.currentTime, 0.5);
        break;
      }
      case 'murmur': {
        // Ambient adjustment only (already handled above)
        break;
      }
    }
  }, [isMuted]);

  // ── Noise burst helper ──────────────────────────────────────
  function playNoiseBurst(
    ctx: AudioContext,
    destination: AudioNode,
    opts: { duration: number; freqStart: number; freqEnd: number; gain: number; q: number },
  ) {
    const { duration, freqStart, freqEnd, gain: vol, q } = opts;

    // Create white noise buffer
    const length = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Bandpass filter with frequency sweep
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freqStart, ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(freqEnd, ctx.currentTime + duration);
    filter.Q.value = q;

    // Gain envelope: quick attack, sustain, fade out
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.05);
    gainNode.gain.setValueAtTime(vol, ctx.currentTime + duration * 0.6);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(destination);
    source.start();
    source.stop(ctx.currentTime + duration);
  }

  // ── Cleanup on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      ambientNodeRef.current?.stop();
      ctxRef.current?.close();
    };
  }, []);

  return {
    isEnabled,
    isMuted,
    toggle,
    triggerReaction,
  };
}
