import { Canvas, Circle, Path, RoundedRect, Shadow, Skia } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { defaultPieceColor, PIECE_SIZE, rollDie } from '../lib/sandbox';
import type { TablePiece } from '../lib/sandbox';
import { colors } from '../theme';
import { prefersReducedMotion } from './CardView';

/** How long a die tumbles when rolled; and how often its face changes as it starts, slowing as it settles. */
const ROLL_MS = 820;
const ROLL_FACE_MS = 45;
const ROLL_FACE_SLOWING = 1.22;
/** How many whole turns a rolled die spins as it goes. */
const ROLL_TURNS = 2;
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
  const { w, h } = PIECE_SIZE[piece.kind];
  const x = at?.x ?? piece.x;
  const y = at?.y ?? piece.y;
  const color = piece.color ?? defaultPieceColor(piece);
  return (
    <View pointerEvents="none" style={[styles.piece, { left: x - w / 2, top: y - h / 2, width: w, height: h }, lifted && styles.lifted]}>
      {piece.kind === 'counter' ? (
        <Counter piece={piece} color={color} />
      ) : (
        <Die piece={piece} color={color} rollKey={rollKey} rollFrom={rollFrom} size={w} selected={selected} />
      )}
    </View>
  );
});

function Counter({ piece, color }: { piece: TablePiece; color: string }) {
  const ink = isLight(color) ? '#2c2c2a' : '#ffffff';
  return (
    <View style={[styles.counter, { backgroundColor: color, borderColor: shade(color, isLight(color) ? -0.25 : 0.3) }]}>
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
            {/* A cube from a little above and to the left: its top face, with its two sides showing below and right. */}
            <RoundedRect x={at([0.1, 0.1])[0]} y={at([0.1, 0.1])[1]} width={0.88 * px} height={0.88 * px} r={0.16 * px} color={shade(color, -0.42)}>
              {shadow}
            </RoundedRect>
            <RoundedRect x={at([0.1, 0.1])[0]} y={at([0.1, 0.1])[1]} width={0.88 * px} height={0.88 * px} r={0.16 * px} color={shade(color, -0.42)} />
            <RoundedRect x={at([0.02, 0.02])[0]} y={at([0.02, 0.02])[1]} width={0.84 * px} height={0.84 * px} r={0.15 * px} color={shade(color, 0.04)} />
            {selected ? (
              <RoundedRect x={at([0.02, 0.02])[0]} y={at([0.02, 0.02])[1]} width={0.96 * px} height={0.96 * px} r={0.17 * px} color={colors.accent} style="stroke" strokeWidth={3 * OVERSAMPLE} />
            ) : null}
            {(PIPS[shown] ?? []).map((cell) => {
              const [cx, cy] = at([0.02 + 0.84 * ((cell % 3) * 0.3 + 0.2), 0.02 + 0.84 * (Math.floor(cell / 3) * 0.3 + 0.2)]);
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

const styles = StyleSheet.create({
  piece: { position: 'absolute' },
  lifted: { transform: [{ scale: 1.08 }] },
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
});
