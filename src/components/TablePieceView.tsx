import { Canvas, Circle, Group, Path, Shadow, Skia } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { defaultPieceColor, pieceSizeOf, rollDie, TEXT_SIZE } from '../lib/sandbox';
import type { TablePiece } from '../lib/sandbox';
import { colors } from '../theme';
import { prefersReducedMotion } from './CardView';

/** How long a die tumbles when rolled; and how often its face changes as it starts, slowing as it settles. */
const ROLL_MS = 820;
const ROLL_FACE_MS = 45;
const ROLL_FACE_SLOWING = 1.22;
/** How many whole turns a rolled die spins as it goes. */
const ROLL_TURNS = 2;
/** How much bigger a piece looks while it's dragged. */
const LIFT = 1.08;
/**
 * A die is drawn this many times bigger than it lies and shrunk back down, so it stays sharp when the table's
 * zoomed in on it (the camera scales the table's drawing up).
 */
const OVERSAMPLE = 3;
/** Room round a die's drawing, as a share of its size, for its shadow. */
const PAD = 0.2;

/** Where a d6's pips go, on a 3 × 3 grid (0 top-left to 8 bottom-right), for each face. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

type Pt = [number, number];

// A d6's cube (in a 0–1 box): its top face, and how far back its sides go (down and to the right).
const CUBE_FACE = { x: 0.02, y: 0.02, size: 0.8 };
const CUBE_DEPTH = 0.14;
const CUBE_ROUND = 0.1;
const [FL, FT, FR, FB] = [CUBE_FACE.x, CUBE_FACE.y, CUBE_FACE.x + CUBE_FACE.size, CUBE_FACE.y + CUBE_FACE.size];
const CUBE_TOP: Pt[] = [
  [FL, FT],
  [FR, FT],
  [FR, FB],
  [FL, FB],
];
/** The whole cube's outline: the top face's top and left edges, then round the far side. */
const CUBE_OUTLINE: Pt[] = [
  [FL, FT],
  [FR, FT],
  [FR + CUBE_DEPTH, FT + CUBE_DEPTH],
  [FR + CUBE_DEPTH, FB + CUBE_DEPTH],
  [FL + CUBE_DEPTH, FB + CUBE_DEPTH],
  [FL, FB],
];
/** Its bottom side (the right side is the rest of the outline round the top face). */
const CUBE_BOTTOM: Pt[] = [
  [FL, FB],
  [FR, FB],
  [FR + CUBE_DEPTH, FB + CUBE_DEPTH],
  [FL + CUBE_DEPTH, FB + CUBE_DEPTH],
];

/** A color made lighter (toward 1) or darker (toward −1), for a face catching more or less of the light. */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const to = k > 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(k));
  const mix = (c: number) => Math.round(c + (to - c) * t);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Whether a color is light (dark marks go on it) or dark (light ones do). */
function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160;
}

/** Points round a middle, starting straight up (−90°), at a given reach (all in a 0–1 box). */
const ring = (count: number, reach: number, mid: Pt = [0.5, 0.5], start = -90): Pt[] =>
  Array.from({ length: count }, (_, i) => {
    const a = ((start + (360 / count) * i) * Math.PI) / 180;
    return [mid[0] + reach * Math.cos(a), mid[1] + reach * Math.sin(a)];
  });

/**
 * How lit a face is, from where it lies: the light comes from the top left, so faces turned that way are lighter
 * and those turned away darker. The face looking straight up (in the middle) is lit evenly.
 */
function lightOf(face: Pt[]): number {
  const cx = face.reduce((s, p) => s + p[0], 0) / face.length - 0.5;
  const cy = face.reduce((s, p) => s + p[1], 0) / face.length - 0.5;
  const d = Math.hypot(cx, cy);
  if (d < 0.06) return 0.12;
  return (-(cx * 0.6 + cy * 0.8) / d) * 0.32 - 0.12;
}

/** A die's outline, its faces (each with how lit it is), and where its number goes and how big (in a 0–1 box). */
interface DieShape {
  outline: Pt[];
  faces: { pts: Pt[]; light: number }[];
  number: { at: Pt; size: number };
}

const faces = (list: Pt[][], front?: Pt[]) => [
  ...list.map((pts) => ({ pts, light: lightOf(pts) })),
  ...(front ? [{ pts: front, light: 0.12 }] : []),
];

/** Each die's shape, seen from a little above: its faces drawn flat, shaded as if solid. */
function dieShape(sides: number): DieShape {
  if (sides === 4) {
    // A tetrahedron, point up: three faces meet in the middle.
    const [a, b, c]: Pt[] = [
      [0.5, 0.03],
      [0.98, 0.9],
      [0.02, 0.9],
    ];
    const o: Pt = [0.5, 0.6];
    return { outline: [a, b, c], faces: faces([[o, a, b], [o, b, c], [o, c, a]]), number: { at: [0.5, 0.6], size: 0.26 } };
  }
  if (sides === 8) {
    // An octahedron, point up: four faces round the near point, a little up and left of the middle.
    const [t, r, b, l]: Pt[] = [
      [0.5, 0.0],
      [0.94, 0.5],
      [0.5, 1.0],
      [0.06, 0.5],
    ];
    const o: Pt = [0.46, 0.46];
    return { outline: [t, r, b, l], faces: faces([[t, r, o], [r, b, o], [b, l, o], [l, t, o]]), number: { at: o, size: 0.3 } };
  }
  if (sides === 10) {
    // A pentagonal trapezohedron: a kite with its front face (the kite-shaped one) facing up.
    const [t, r, b, l]: Pt[] = [
      [0.5, 0.02],
      [0.96, 0.56],
      [0.5, 0.98],
      [0.04, 0.56],
    ];
    const [fr, fb, fl]: Pt[] = [
      [0.76, 0.5],
      [0.5, 0.7],
      [0.24, 0.5],
    ];
    return {
      outline: [t, r, b, l],
      faces: faces(
        [
          [t, r, fr],
          [t, fl, l],
          [l, fl, fb, b],
          [fr, r, b, fb],
        ],
        [t, fr, fb, fl],
      ),
      number: { at: [0.5, 0.44], size: 0.28 },
    };
  }
  if (sides === 12) {
    // A dodecahedron: a pentagon facing up, five more round it, its outline ten-sided.
    const inner = ring(5, 0.25, [0.5, 0.52]);
    const outer = ring(10, 0.5);
    const round = inner.map((p, i) => [p, outer[2 * i], outer[2 * i + 1], outer[(2 * i + 2) % 10], inner[(i + 1) % 5]]);
    return { outline: outer, faces: faces(round, inner), number: { at: [0.5, 0.52], size: 0.28 } };
  }
  if (sides === 20) {
    // An icosahedron: a triangle facing up in a six-sided outline, the faces round it filling the rest.
    const hex = ring(6, 0.5);
    const tri = ring(3, 0.3);
    const [t0, t1, t2] = tri;
    const round: Pt[][] = [
      [t0, hex[1], t1],
      [t1, hex[3], t2],
      [t2, hex[5], t0],
      [hex[0], hex[1], t0],
      [hex[1], hex[2], t1],
      [hex[2], hex[3], t1],
      [hex[3], hex[4], t2],
      [hex[4], hex[5], t2],
      [hex[5], hex[0], t0],
    ];
    return { outline: hex, faces: faces(round, tri), number: { at: [0.5, 0.53], size: 0.22 } };
  }
  return { outline: [], faces: [], number: { at: [0.5, 0.5], size: 0.3 } };
}

/**
 * A counter or a die lying on the table, drawn in table units (the camera zooms and turns it with the cards).
 * `at` puts it somewhere else for now (while it's dragged); a new `rollKey` tumbles a die onto its value.
 */
export const TablePieceView = memo(function TablePieceView({
  piece,
  at,
  rollKey = 0,
  rollFrom,
  lifted = false,
  selected = false,
}: {
  piece: TablePiece;
  at?: { x: number; y: number };
  rollKey?: number;
  /** Where a rolled die set off from, relative to where it now lies (it tumbles across from there). */
  rollFrom?: { dx: number; dy: number };
  lifted?: boolean;
  /** Picked out with the lasso: outlined in gold. */
  selected?: boolean;
}) {
  // Its own size (the scale is a transform, below).
  const { w, h } = pieceSizeOf({ ...piece, scale: 1 });
  const x = at?.x ?? piece.x;
  const y = at?.y ?? piece.y;
  const color = piece.color ?? defaultPieceColor(piece);
  return (
    // Drawn at its own size and scaled about its middle (its parts and lettering keep their proportions).
    <View pointerEvents="none" style={[styles.piece, { left: x - w / 2, top: y - h / 2, width: w, height: h, transform: [{ scale: (piece.scale ?? 1) * (lifted ? LIFT : 1) }] }]}>
      {piece.kind === 'counter' ? (
        <Counter piece={piece} color={color} selected={selected} />
      ) : piece.kind === 'die' ? (
        <Die piece={piece} color={color} rollKey={rollKey} rollFrom={rollFrom} size={w} selected={selected} />
      ) : piece.kind === 'coin' ? (
        <Coin piece={piece} color={color} rollKey={rollKey} size={w} selected={selected} />
      ) : piece.kind === 'text' ? (
        <TextLabel piece={piece} color={color} selected={selected} />
      ) : piece.kind === 'marker' ? (
        <Marker piece={piece} color={color} size={w} selected={selected} />
      ) : piece.kind === 'spinner' ? (
        <Spinner piece={piece} color={color} rollKey={rollKey} size={w} selected={selected} />
      ) : (
        <PlayingPiece piece={piece} color={color} w={w} h={h} selected={selected} />
      )}
    </View>
  );
});

function Counter({ piece, color, selected }: { piece: TablePiece; color: string; selected: boolean }) {
  const ink = isLight(color) ? '#2c2c2a' : '#ffffff';
  return (
    <View
      style={[
        styles.counter,
        { backgroundColor: color, borderColor: shade(color, isLight(color) ? -0.25 : 0.3) },
        // Picked out with the lasso: outlined in gold.
        selected && { borderColor: colors.accent, borderWidth: 3 },
      ]}>
      <View style={[styles.counterButton, { backgroundColor: shade(color, isLight(color) ? -0.12 : 0.16) }]}>
        <Text allowFontScaling={false} style={[styles.counterSign, { color: ink }]}>
          −
        </Text>
      </View>
      <Text allowFontScaling={false} style={[styles.counterValue, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit>
        {piece.value}
      </Text>
      <View style={[styles.counterButton, { backgroundColor: shade(color, isLight(color) ? -0.12 : 0.16) }]}>
        <Text allowFontScaling={false} style={[styles.counterSign, { color: ink }]}>
          +
        </Text>
      </View>
      {piece.label ? (
        <Text allowFontScaling={false} style={styles.counterLabel} numberOfLines={1}>
          {piece.label}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A die in its own shape and color, shaded face by face. Rolled, it tumbles across from where it was: sliding to
 * a stop as it spins, bouncing lower each time, its faces flickering past slower and slower till it lands.
 */
function Die({
  piece,
  color,
  rollKey,
  rollFrom,
  size,
  selected,
}: {
  piece: TablePiece;
  color: string;
  rollKey: number;
  rollFrom?: { dx: number; dy: number };
  size: number;
  selected: boolean;
}) {
  const sides = piece.sides ?? 6;
  const [face, setFace] = useState<number | null>(null);
  // How far through the roll: eased (sliding and spinning to a stop), and steady (for the bounces).
  const [travel] = useState(() => new Animated.Value(1));
  const [time] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!rollKey || prefersReducedMotion()) return;
    travel.setValue(0);
    time.setValue(0);
    Animated.parallel([
      Animated.timing(travel, { toValue: 1, duration: ROLL_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(time, { toValue: 1, duration: ROLL_MS, easing: Easing.linear, useNativeDriver: true }),
    ]).start();
    // Faces flicker past, slower and slower, then it shows where it landed.
    let timer: ReturnType<typeof setTimeout>;
    let gap = ROLL_FACE_MS;
    let elapsed = 0;
    const next = () => {
      elapsed += gap;
      if (elapsed >= ROLL_MS - 60) {
        setFace(null);
        return;
      }
      setFace(rollDie(sides));
      gap *= ROLL_FACE_SLOWING;
      timer = setTimeout(next, gap);
    };
    timer = setTimeout(next, gap);
    return () => clearTimeout(timer);
  }, [rollKey, sides, travel, time]);
  const shown = face ?? piece.value;
  const dx = rollFrom?.dx ?? 0;
  const dy = rollFrom?.dy ?? 0;
  // It spins the way it's thrown.
  const turn = (dx >= 0 ? 1 : -1) * 360 * ROLL_TURNS;
  const transform = useMemo(
    () => [
      { translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [-dx, 0] }) },
      { translateY: travel.interpolate({ inputRange: [0, 1], outputRange: [-dy, 0] }) },
      { rotate: travel.interpolate({ inputRange: [0, 1], outputRange: [`${-turn}deg`, '0deg'] }) },
      // Off the table and back, lower each bounce.
      { scale: time.interpolate({ inputRange: [0, 0.16, 0.34, 0.5, 0.64, 0.78, 1], outputRange: [1, 1.32, 1, 1.14, 1, 1.04, 1] }) },
    ],
    [travel, time, dx, dy, turn],
  );
  const ink = isLight(color) ? '#2c2c2a' : '#ffffff';
  const shape = useMemo(() => dieShape(sides), [sides]);
  // The drawing, oversampled (see OVERSAMPLE), with room round it for the shadow.
  const px = size * OVERSAMPLE;
  const canvas = px * (1 + PAD * 2);
  const at = (p: Pt) => [(p[0] + PAD) * px, (p[1] + PAD) * px] as const;
  const path = (pts: Pt[]) => {
    const p = Skia.Path.Make();
    pts.forEach((pt, i) => (i ? p.lineTo(...at(pt)) : p.moveTo(...at(pt))));
    p.close();
    return p;
  };
  /** A shape with its corners rounded (each by up to `r`, in the 0–1 box), as a solid's edges are. */
  const rounded = (pts: Pt[], r: number) => {
    const p = Skia.Path.Make();
    const last = pts[pts.length - 1];
    p.moveTo(...at([(last[0] + pts[0][0]) / 2, (last[1] + pts[0][1]) / 2]));
    pts.forEach((pt, i) => {
      const next = pts[(i + 1) % pts.length];
      p.arcToTangent(...at(pt), ...at(next), r * px);
    });
    p.close();
    return p;
  };
  const shadow = <Shadow dx={2 * OVERSAMPLE} dy={4 * OVERSAMPLE} blur={4 * OVERSAMPLE} color="rgba(0,0,0,0.45)" shadowOnly />;
  const edge = shade(color, -0.45);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform }]}>
      <Canvas
        style={{
          position: 'absolute',
          width: canvas,
          height: canvas,
          left: -size * PAD - (canvas - size * (1 + PAD * 2)) / 2,
          top: -size * PAD - (canvas - size * (1 + PAD * 2)) / 2,
          transform: [{ scale: 1 / OVERSAMPLE }],
        }}>
        {sides === 6 ? (
          <>
            {/*
              A cube seen from a little above and to the left: its top face, and its right and bottom sides slanting
              back to the far corner. One rounded outline round the whole cube, so its corners all meet; the sides
              are cut to it, and the top face's own rounded corners sit inside it.
            */}
            <Path path={rounded(CUBE_OUTLINE, CUBE_ROUND)} color={shade(color, -0.3)}>
              {shadow}
            </Path>
            <Path path={rounded(CUBE_OUTLINE, CUBE_ROUND)} color={shade(color, -0.3)} />
            <Group clip={rounded(CUBE_OUTLINE, CUBE_ROUND)}>
              <Path path={path(CUBE_BOTTOM)} color={shade(color, -0.48)} />
            </Group>
            <Path path={rounded(CUBE_TOP, CUBE_ROUND)} color={shade(color, 0.04)} />
            {/* The light catching the top face's edge. */}
            <Path path={rounded(CUBE_TOP, CUBE_ROUND)} color={shade(color, 0.35)} style="stroke" strokeWidth={0.8 * OVERSAMPLE} opacity={0.5} />
            {selected ? <Path path={rounded(CUBE_OUTLINE, CUBE_ROUND)} color={colors.accent} style="stroke" strokeWidth={3 * OVERSAMPLE} /> : null}
            {(PIPS[shown] ?? []).map((cell) => {
              const [cx, cy] = at([CUBE_FACE.x + CUBE_FACE.size * ((cell % 3) * 0.3 + 0.2), CUBE_FACE.y + CUBE_FACE.size * (Math.floor(cell / 3) * 0.3 + 0.2)]);
              return <Circle key={cell} cx={cx} cy={cy} r={0.085 * px} color={ink} />;
            })}
          </>
        ) : (
          <>
            <Path path={path(shape.outline)} color={color}>
              {shadow}
            </Path>
            {shape.faces.map((f, i) => (
              <Path key={i} path={path(f.pts)} color={shade(color, f.light)} />
            ))}
            {shape.faces.map((f, i) => (
              <Path key={`e${i}`} path={path(f.pts)} color={edge} style="stroke" strokeWidth={0.6 * OVERSAMPLE} opacity={0.35} />
            ))}
            {selected ? <Path path={path(shape.outline)} color={colors.accent} style="stroke" strokeWidth={3 * OVERSAMPLE} /> : null}
          </>
        )}
      </Canvas>
      {sides === 6 ? null : (
        <Text
          allowFontScaling={false}
          style={[
            styles.dieValue,
            {
              color: ink,
              fontSize: shape.number.size * size,
              left: shape.number.at[0] * size - size / 2,
              top: shape.number.at[1] * size - shape.number.size * size * 0.62,
              width: size,
            },
          ]}>
          {shown}
        </Text>
      )}
    </Animated.View>
  );
}

/**
 * A drawing for a piece `w` × `h` on the table, oversampled to stay sharp zoomed in (see OVERSAMPLE), with room
 * round it for a shadow. `at` takes a point in a 0–1 box over the piece to the drawing's own.
 */
function artFrame(w: number, h: number) {
  const pad = Math.max(w, h) * PAD;
  const cw = (w + pad * 2) * OVERSAMPLE;
  const ch = (h + pad * 2) * OVERSAMPLE;
  const at = (p: Pt) => [(p[0] * w + pad) * OVERSAMPLE, (p[1] * h + pad) * OVERSAMPLE] as const;
  return {
    style: {
      position: 'absolute' as const,
      width: cw,
      height: ch,
      left: -pad - (cw - (w + pad * 2)) / 2,
      top: -pad - (ch - (h + pad * 2)) / 2,
      transform: [{ scale: 1 / OVERSAMPLE }],
    },
    at,
    /** A length across the piece (as a share of its width) in the drawing's own units. */
    len: (u: number) => u * w * OVERSAMPLE,
    poly: (pts: Pt[]) => {
      const p = Skia.Path.Make();
      pts.forEach((pt, i) => (i ? p.lineTo(...at(pt)) : p.moveTo(...at(pt))));
      p.close();
      return p;
    },
  };
}

const pieceShadow = () => <Shadow dx={2 * OVERSAMPLE} dy={4 * OVERSAMPLE} blur={4 * OVERSAMPLE} color="rgba(0,0,0,0.45)" shadowOnly />;

/** A shape with its corners rounded (by up to `r`, as a share of the piece's width), as a solid's edges are. */
function roundedPath(art: ReturnType<typeof artFrame>, pts: Pt[], r: number) {
  const p = Skia.Path.Make();
  const last = pts[pts.length - 1];
  p.moveTo(...art.at([(last[0] + pts[0][0]) / 2, (last[1] + pts[0][1]) / 2]));
  pts.forEach((pt, i) => p.arcToTangent(...art.at(pt), ...art.at(pts[(i + 1) % pts.length]), art.len(r)));
  p.close();
  return p;
}

/**
 * A round piece's whole body seen from a little above: its top circle at `c`, and its side running down and right
 * to the bottom circle (the two circles joined along their sides), so it reads as a solid disc, not two circles.
 */
function cylinderPath(c: readonly [number, number], r: number, d: readonly [number, number]) {
  const p = Skia.Path.Make();
  const len = Math.hypot(d[0], d[1]) || 1;
  const n = [(-d[1] / len) * r, (d[0] / len) * r];
  p.addCircle(c[0], c[1], r);
  p.addCircle(c[0] + d[0], c[1] + d[1], r);
  p.moveTo(c[0] + n[0], c[1] + n[1]);
  p.lineTo(c[0] + n[0] + d[0], c[1] + n[1] + d[1]);
  p.lineTo(c[0] - n[0] + d[0], c[1] - n[1] + d[1]);
  p.lineTo(c[0] - n[0], c[1] - n[1]);
  p.close();
  return p;
}

/** Starts a tumble (or flip, or spin) each time `rollKey` changes, over ROLL_MS: 0 to 1, eased out. */
function useRollMotion(rollKey: number) {
  const [motion] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!rollKey || prefersReducedMotion()) return;
    motion.setValue(0);
    Animated.timing(motion, { toValue: 1, duration: ROLL_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [rollKey, motion]);
  return motion;
}

/** How many times a tossed coin turns over in the air. */
const COIN_FLIPS = 5;

/** A coin: heads (H) or tails (T). Tossed, it hops and turns over and over, edge-on between faces. */
function Coin({ piece, color, rollKey, size, selected }: { piece: TablePiece; color: string; rollKey: number; size: number; selected: boolean }) {
  const motion = useRollMotion(rollKey);
  const [face, setFace] = useState<number | null>(null);
  useEffect(() => {
    if (!rollKey || prefersReducedMotion()) return;
    // The faces swap each time it's edge-on, then it shows where it landed.
    let side = 1;
    const timers = Array.from({ length: COIN_FLIPS * 2 - 1 }, (_, i) =>
      setTimeout(() => setFace((side = 3 - side)), ((i + 1) * ROLL_MS) / (COIN_FLIPS * 2)),
    );
    const done = setTimeout(() => setFace(null), ROLL_MS);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [rollKey]);
  const shown = face ?? piece.value;
  const transform = useMemo(() => {
    const steps = COIN_FLIPS * 2;
    const input = Array.from({ length: steps + 1 }, (_, i) => i / steps);
    return [
      { scaleY: motion.interpolate({ inputRange: input, outputRange: input.map((_, i) => (i % 2 ? 0.08 : 1)) }) },
      { scale: motion.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 1.35, 1] }) },
    ];
  }, [motion]);
  const art = artFrame(size, size);
  const ink = shade(color, -0.55);
  const c = art.at([0.5, 0.5]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform }]}>
      <Canvas style={art.style}>
        <Circle cx={c[0]} cy={c[1]} r={art.len(0.5)} color={shade(color, -0.35)}>
          {pieceShadow()}
        </Circle>
        <Circle cx={c[0]} cy={c[1]} r={art.len(0.5)} color={shade(color, -0.35)} />
        <Circle cx={c[0] - art.len(0.02)} cy={c[1] - art.len(0.02)} r={art.len(0.44)} color={shade(color, shown === 1 ? 0.08 : -0.06)} />
        <Circle cx={c[0] - art.len(0.02)} cy={c[1] - art.len(0.02)} r={art.len(0.36)} color={shade(color, 0.35)} style="stroke" strokeWidth={art.len(0.03)} opacity={0.6} />
        {selected ? <Circle cx={c[0]} cy={c[1]} r={art.len(0.5)} color={colors.accent} style="stroke" strokeWidth={3 * OVERSAMPLE} /> : null}
      </Canvas>
      <Text allowFontScaling={false} style={[styles.coinFace, { color: ink, fontSize: size * 0.42, lineHeight: size, width: size }]}>
        {shown === 1 ? 'H' : 'T'}
      </Text>
    </Animated.View>
  );
}

/** Words on the table: in its color, with a soft shadow so they read on any cloth. */
function TextLabel({ piece, color, selected }: { piece: TablePiece; color: string; selected: boolean }) {
  return (
    <View style={[styles.textBox, selected && styles.textBoxOn]}>
      <Text allowFontScaling={false} numberOfLines={1} style={[styles.text, { color }]}>
        {piece.label || ' '}
      </Text>
    </View>
  );
}

/** A first-player (or any) marker: a raised gold disc with a star, and its word on it. */
function Marker({ piece, color, size, selected }: { piece: TablePiece; color: string; size: number; selected: boolean }) {
  const art = artFrame(size, size);
  const c = art.at([0.5, 0.5]);
  const star = ring(10, 0.42, [0.5, 0.5]).map((p, i) => (i % 2 ? ([0.5 + (p[0] - 0.5) * 0.45, 0.5 + (p[1] - 0.5) * 0.45] as Pt) : p));
  const ink = shade(color, -0.6);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas style={art.style}>
        <Path path={cylinderPath(c, art.len(0.5), [art.len(0.04), art.len(0.05)])} color={shade(color, -0.45)}>
          {pieceShadow()}
        </Path>
        <Path path={cylinderPath(c, art.len(0.5), [art.len(0.04), art.len(0.05)])} color={shade(color, -0.45)} />
        <Circle cx={c[0]} cy={c[1]} r={art.len(0.5)} color={color} />
        <Path path={art.poly(star)} color={shade(color, 0.3)} />
        <Path path={art.poly(star)} color={shade(color, -0.3)} style="stroke" strokeWidth={art.len(0.015)} opacity={0.6} />
        {selected ? <Circle cx={c[0]} cy={c[1]} r={art.len(0.52)} color={colors.accent} style="stroke" strokeWidth={3 * OVERSAMPLE} /> : null}
      </Canvas>
      {piece.label ? (
        <Text allowFontScaling={false} numberOfLines={1} adjustsFontSizeToFit style={[styles.markerText, { color: ink, fontSize: size * 0.26, lineHeight: size, width: size }]}>
          {piece.label}
        </Text>
      ) : null}
    </View>
  );
}

/** How many whole turns a spinner's arrow makes before it settles. */
const SPIN_TURNS = 3;

/** A spinner: a dial with an arrow. Spun, the arrow whirls round a few times and slows to where it points. */
function Spinner({ piece, color, rollKey, size, selected }: { piece: TablePiece; color: string; rollKey: number; size: number; selected: boolean }) {
  const [turn] = useState(() => new Animated.Value(piece.value));
  // Where the arrow's turned to so far, in whole degrees round and round (it only ever goes clockwise).
  const total = useRef(piece.value);
  useEffect(() => {
    const now = total.current;
    const to = now + ((((piece.value - now) % 360) + 360) % 360) + (rollKey ? 360 * SPIN_TURNS : 0);
    total.current = to;
    if (!rollKey || prefersReducedMotion()) {
      turn.setValue(to);
      return;
    }
    Animated.timing(turn, { toValue: to, duration: ROLL_MS * 2, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [piece.value, rollKey, turn]);
  const rotate = useMemo(() => turn.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'], extrapolate: 'extend' }), [turn]);
  const art = artFrame(size, size);
  const c = art.at([0.5, 0.5]);
  const ticks = ring(8, 0.4, [0.5, 0.5]);
  const arrow: Pt[] = [
    [0.5, 0.1],
    [0.58, 0.3],
    [0.535, 0.3],
    [0.535, 0.62],
    [0.465, 0.62],
    [0.465, 0.3],
    [0.42, 0.3],
  ];
  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas style={art.style}>
        <Path path={cylinderPath(c, art.len(0.5), [art.len(0.02), art.len(0.03)])} color={shade(color, -0.4)}>
          {pieceShadow()}
        </Path>
        <Path path={cylinderPath(c, art.len(0.5), [art.len(0.02), art.len(0.03)])} color={shade(color, -0.4)} />
        <Circle cx={c[0]} cy={c[1]} r={art.len(0.5)} color={color} />
        <Circle cx={c[0]} cy={c[1]} r={art.len(0.45)} color={shade(color, -0.15)} style="stroke" strokeWidth={art.len(0.012)} />
        {ticks.map((p, i) => {
          const q = art.at(p);
          return <Circle key={i} cx={q[0]} cy={q[1]} r={art.len(0.025)} color={shade(color, -0.45)} />;
        })}
        {selected ? <Circle cx={c[0]} cy={c[1]} r={art.len(0.52)} color={colors.accent} style="stroke" strokeWidth={3 * OVERSAMPLE} /> : null}
      </Canvas>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
        <Canvas style={art.style}>
          <Path path={art.poly(arrow)} color="#2c2c2a">
            <Shadow dx={OVERSAMPLE} dy={2 * OVERSAMPLE} blur={2 * OVERSAMPLE} color="rgba(0,0,0,0.35)" />
          </Path>
          <Circle cx={c[0]} cy={c[1]} r={art.len(0.07)} color="#2c2c2a" />
          <Circle cx={c[0] - art.len(0.015)} cy={c[1] - art.len(0.015)} r={art.len(0.03)} color="#8a8a86" />
        </Canvas>
      </Animated.View>
    </View>
  );
}

/** How far down and to the right a playing piece's sides show (as a share of its size): its thickness. */
const PIECE_DEPTH: Pt = [0.06, 0.07];

/** A meeple, pawn, cube or disc: its shape raised a little off the cloth, its side showing below and to the right. */
function PlayingPiece({ piece, color, w, h, selected }: { piece: TablePiece; color: string; w: number; h: number; selected: boolean }) {
  const art = artFrame(w, h);
  const shift = (pts: Pt[]): Pt[] => pts.map((p) => [p[0] + PIECE_DEPTH[0], p[1] + PIECE_DEPTH[1]]);
  const shape = piece.shape ?? 'meeple';
  // Each shape as outlines (several, drawn as one) and circles.
  const outlines: Pt[][] = [];
  const circles: { at: Pt; r: number }[] = [];
  if (shape === 'meeple') {
    circles.push({ at: [0.5, 0.2], r: 0.18 });
    outlines.push([
      [0.36, 0.33],
      [0.64, 0.33],
      [0.97, 0.47],
      [0.95, 0.6],
      [0.7, 0.57],
      [0.9, 0.96],
      [0.6, 0.96],
      [0.5, 0.77],
      [0.4, 0.96],
      [0.1, 0.96],
      [0.3, 0.57],
      [0.05, 0.6],
      [0.03, 0.47],
    ]);
  } else if (shape === 'pawn') {
    circles.push({ at: [0.5, 0.22], r: 0.17 });
    outlines.push(
      [
        [0.38, 0.36],
        [0.62, 0.36],
        [0.72, 0.8],
        [0.28, 0.8],
      ],
      [
        [0.12, 0.78],
        [0.88, 0.78],
        [0.88, 0.94],
        [0.12, 0.94],
      ],
    );
  }
  const sideColor = shade(color, -0.42);
  const draw = (fill: string, moved: boolean, extra?: object) => (
    <>
      {outlines.map((o, i) => (
        <Path key={`o${i}`} path={art.poly(moved ? shift(o) : o)} color={fill} {...extra} />
      ))}
      {circles.map((ci, i) => {
        const q = art.at(moved ? [ci.at[0] + PIECE_DEPTH[0], ci.at[1] + PIECE_DEPTH[1]] : ci.at);
        return <Circle key={`c${i}`} cx={q[0]} cy={q[1]} r={art.len(ci.r)} color={fill} {...extra} />;
      })}
    </>
  );
  if (shape === 'cube' || shape === 'disc') {
    // Solids drawn whole: a cube as the d6 is (top face, two sides slanting back, one rounded outline); a disc as
    // its top circle with its side joined on below and to the right.
    const c = art.at([0.47, 0.46]);
    const body = shape === 'cube' ? roundedPath(art, CUBE_OUTLINE, CUBE_ROUND) : cylinderPath(c, art.len(0.42), [art.len(0.06), art.len(0.08)]);
    const top = shape === 'cube' ? roundedPath(art, CUBE_TOP, CUBE_ROUND) : null;
    return (
      <View style={StyleSheet.absoluteFill}>
        <Canvas style={art.style}>
          <Path path={body} color={sideColor}>
            {pieceShadow()}
          </Path>
          <Path path={body} color={sideColor} />
          {shape === 'cube' ? (
            <Group clip={body}>
              <Path path={art.poly(CUBE_BOTTOM)} color={shade(color, -0.55)} />
            </Group>
          ) : null}
          {top ? <Path path={top} color={color} /> : <Circle cx={c[0]} cy={c[1]} r={art.len(0.42)} color={color} />}
          {top ? (
            <Path path={top} color={shade(color, 0.3)} style="stroke" strokeWidth={art.len(0.02)} opacity={0.55} />
          ) : (
            <Circle cx={c[0]} cy={c[1]} r={art.len(0.42)} color={shade(color, 0.3)} style="stroke" strokeWidth={art.len(0.02)} opacity={0.55} />
          )}
          {selected ? <Path path={body} color={colors.accent} style="stroke" strokeWidth={3 * OVERSAMPLE} /> : null}
        </Canvas>
      </View>
    );
  }
  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas style={art.style}>
        {/* Its shadow, then its side (the shape again, a little down and right, darker), then its top. */}
        <Group>
          {outlines.map((o, i) => (
            <Path key={`s${i}`} path={art.poly(shift(o))} color={sideColor}>
              {pieceShadow()}
            </Path>
          ))}
          {circles.map((ci, i) => {
            const q = art.at([ci.at[0] + PIECE_DEPTH[0], ci.at[1] + PIECE_DEPTH[1]]);
            return (
              <Circle key={`sc${i}`} cx={q[0]} cy={q[1]} r={art.len(ci.r)} color={sideColor}>
                {pieceShadow()}
              </Circle>
            );
          })}
        </Group>
        {draw(sideColor, true)}
        {draw(color, false)}
        {selected ? draw(colors.accent, false, { style: 'stroke', strokeWidth: 3 * OVERSAMPLE }) : null}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute' },

  counter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderRadius: 30,
    borderWidth: 1,
    boxShadow: '1px 3px 8px rgba(0, 0, 0, 0.45)',
  },
  counterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterSign: { fontSize: 26, fontWeight: '600', marginTop: -2 },
  counterValue: { flex: 1, textAlign: 'center', fontSize: 30, fontWeight: '700' },
  counterLabel: {
    position: 'absolute',
    top: 64,
    left: -20,
    right: -20,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  dieValue: { position: 'absolute', textAlign: 'center', fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 2 },
  coinFace: { position: 'absolute', left: 0, top: 0, textAlign: 'center', fontWeight: '800' },
  markerText: { position: 'absolute', left: 0, top: 0, textAlign: 'center', fontWeight: '800', paddingHorizontal: 8 },
  textBox: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  textBoxOn: { borderWidth: 2, borderColor: colors.accent, borderStyle: 'dashed' },
  text: { fontSize: TEXT_SIZE, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4, textShadowOffset: { width: 1, height: 2 } },
});
