"use client";

import { useCallback, useRef, useState } from "react";
import { nextRate } from "./episode-timeline";

/**
 * The transport for one episode: play, pause, seek, speed, and where it has got
 * to.
 *
 * The media element stays the source of truth for playback and this hook only
 * mirrors it, which is why every piece of state is set from an event rather
 * than optimistically. A player that flips its own button to "playing" and then
 * finds the audio would not start is lying about something the listener can
 * hear.
 *
 * `bind` is spread onto the element so the wiring cannot drift from the state
 * it feeds: there is no way to use this hook and forget one of the listeners.
 */
export type EpisodePlayer = {
  playing: boolean;
  /** Seconds elapsed, mirrored from the element. */
  at: number;
  /** The element's duration once known, falling back to the stored one. */
  total: number;
  rate: number;
  toggle: () => void;
  seek: (seconds: number) => void;
  cycleRate: () => void;
  bind: {
    ref: React.RefObject<HTMLAudioElement | null>;
    onLoadedMetadata: (event: React.SyntheticEvent<HTMLAudioElement>) => void;
    onTimeUpdate: (event: React.SyntheticEvent<HTMLAudioElement>) => void;
    onPlay: () => void;
    onPause: () => void;
    onEnded: () => void;
  };
};

export function useEpisodePlayer(durationSec: number): EpisodePlayer {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [total, setTotal] = useState(durationSec);
  const [rate, setRate] = useState(1);

  const seek = useCallback((seconds: number) => {
    const element = audio.current;
    if (!element) return;

    element.currentTime = seconds;
    // Set here as well as from the event, so a click lands on the transcript
    // immediately rather than on the next `timeupdate` a quarter second later.
    setAt(seconds);
    void element.play().catch(() => undefined);
  }, []);

  const toggle = useCallback(() => {
    const element = audio.current;
    if (!element) return;

    if (element.paused) void element.play().catch(() => undefined);
    else element.pause();
  }, []);

  const cycleRate = useCallback(() => {
    setRate((current) => {
      const next = nextRate(current);
      if (audio.current) audio.current.playbackRate = next;
      return next;
    });
  }, []);

  return {
    playing,
    at,
    total,
    rate,
    toggle,
    seek,
    cycleRate,
    bind: {
      ref: audio,
      onLoadedMetadata: (event) => {
        // A stream still being served can report Infinity or NaN, and either
        // would make the scrubber unusable, so the stored duration stands.
        const found = event.currentTarget.duration;
        if (Number.isFinite(found) && found > 0) setTotal(found);
      },
      onTimeUpdate: (event) => setAt(event.currentTarget.currentTime),
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onEnded: () => setPlaying(false),
    },
  };
}
