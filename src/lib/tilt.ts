// The tabletop's camera tilt: the table leans back (far edge away from the viewer) under perspective, and is
// scaled down just enough that its near edge, which the perspective enlarges, still fits the screen.
// Everything here is plain maths so touches can be mapped between the screen and the tilted table.

export interface Tilt {
  /** Distance from the viewer to the table's centre, in points. Smaller means stronger perspective. */
  perspective: number;
  /** How far the table leans back, in degrees. 0 is flat. */
  angle: number;
  /** Uniform scale applied before tilting, so the enlarged near edge fits. */
  scale: number;
}

export interface Size {
  w: number;
  h: number;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** The tilt for a table of this size: leaning back by `angle`, scaled so its near (bottom) edge fits exactly. */
export function fitTilt(size: Size, angle: number, perspective: number): Tilt {
  if (!angle || size.h <= 0) return { perspective, angle: 0, scale: 1 };
  const sin = Math.sin(rad(angle));
  // Tilted, the scaled near edge sits (h/2)·k·sin nearer the viewer and is enlarged by p / (p − (h/2)·k·sin).
  // For it to end up exactly full width: k · p / (p − (h/2)·k·sin) = 1, so k = p / (p + (h/2)·sin).
  return { perspective, angle, scale: perspective / (perspective + (size.h / 2) * sin) };
}

/** Where a point on the table (in the table's own, untilted coordinates) appears on screen. */
export function project(x: number, y: number, size: Size, t: Tilt): { x: number; y: number } {
  const dx = (x - size.w / 2) * t.scale;
  const dy = (y - size.h / 2) * t.scale;
  const sin = Math.sin(rad(t.angle));
  const cos = Math.cos(rad(t.angle));
  // Leaning back: points above the centre (dy < 0) move away from the viewer, points below come closer.
  const s = t.perspective / (t.perspective - dy * sin);
  return { x: size.w / 2 + dx * s, y: size.h / 2 + dy * cos * s };
}

/** The point on the table under a screen position: the inverse of {@link project}. */
export function unproject(x: number, y: number, size: Size, t: Tilt): { x: number; y: number } {
  if (!t.angle) return { x: size.w / 2 + (x - size.w / 2) / t.scale, y: size.h / 2 + (y - size.h / 2) / t.scale };
  const u = x - size.w / 2;
  const v = y - size.h / 2;
  const sin = Math.sin(rad(t.angle));
  const cos = Math.cos(rad(t.angle));
  const p = t.perspective;
  // From v = dy·cos·p / (p − dy·sin), solve for dy; then undo the perspective on x.
  const dy = (v * p) / (p * cos + v * sin);
  const s = p / (p - dy * sin);
  const dx = u / s;
  return { x: size.w / 2 + dx / t.scale, y: size.h / 2 + dy / t.scale };
}

/** The React Native transform that draws a table with this tilt, about its centre. */
export function tiltTransform(t: Tilt) {
  return [{ perspective: t.perspective }, { rotateX: `${t.angle}deg` }, { scale: t.scale }];
}
