import { useEffect, useRef } from 'react';

/** A frame at 60 Hz: steps are measured in these, so motion runs at the same speed on 60 and 120 Hz screens. */
const FRAME_MS = 1000 / 60;
/** A late frame counts as at most this many, so a hiccup doesn't make things lurch. */
const MAX_FRAMES = 3;

/**
 * Runs `onFrame` on every screen frame while `running`, with how much time has passed since the last one (in
 * 60 Hz frames: 1 at 60 Hz, about 0.5 at 120 Hz). Returning false stops it. Unlike a timer it keeps step with
 * the screen, so scrolling it drives stays smooth on fast screens.
 */
export function useFrameLoop(running: boolean, onFrame: (frames: number) => boolean | void) {
  // The latest callback, so it can read fresh state without restarting the loop.
  const latest = useRef(onFrame);
  useEffect(() => {
    latest.current = onFrame;
  });
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last: number | null = null;
    const loop = (t: number) => {
      const frames = last === null ? 1 : Math.min(MAX_FRAMES, (t - last) / FRAME_MS);
      last = t;
      if (latest.current(frames) === false) return;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}

export { FRAME_MS };
