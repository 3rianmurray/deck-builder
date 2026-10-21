import { memo, useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { PIECE_SIZE, rollDie } from '../lib/sandbox';
import type { TablePiece } from '../lib/sandbox';
import { colors } from '../theme';
import { prefersReducedMotion } from './CardView';

/** How long a die tumbles when rolled, and how often its face changes meanwhile. */
const ROLL_MS = 420;
const ROLL_FACE_MS = 60;
/** A die's rounded corners. */
const DIE_RADIUS = 12;

/** Where a d6's pips go, on a 3 × 3 grid (0 top-left to 8 bottom-right), for each face. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** Each other die's color, by its faces, so they're told apart at a glance. */
const DIE_COLORS: Record<number, string> = {
  4: '#1d9e75',
  8: '#378add',
  10: '#7f77dd',
  12: '#d4537e',
  20: '#d85a30',
};

/**
 * A counter or a die lying on the table, drawn in table units (the camera zooms and turns it with the cards).
 * `at` puts it somewhere else for now (while it's dragged); a new `rollKey` tumbles a die onto its value.
 */
export const TablePieceView = memo(function TablePieceView({
  piece,
  at,
  rollKey = 0,
  lifted = false,
}: {
  piece: TablePiece;
  at?: { x: number; y: number };
  rollKey?: number;
  lifted?: boolean;
}) {
  const { w, h } = PIECE_SIZE[piece.kind];
  const x = at?.x ?? piece.x;
  const y = at?.y ?? piece.y;
  return (
    <View
      pointerEvents="none"
      // Its shadow follows its shape: a counter's pill, a die's rounded square.
      style={[styles.piece, { left: x - w / 2, top: y - h / 2, width: w, height: h, borderRadius: piece.kind === 'counter' ? h / 2 : DIE_RADIUS }, lifted && styles.lifted]}>
      {piece.kind === 'counter' ? <Counter piece={piece} /> : <Die piece={piece} rollKey={rollKey} />}
    </View>
  );
});

function Counter({ piece }: { piece: TablePiece }) {
  return (
    <View style={styles.counter}>
      <View style={styles.counterButton}>
        <Text allowFontScaling={false} style={styles.counterSign}>−</Text>
      </View>
      <Text allowFontScaling={false} style={styles.counterValue} numberOfLines={1} adjustsFontSizeToFit>
        {piece.value}
      </Text>
      <View style={styles.counterButton}>
        <Text allowFontScaling={false} style={styles.counterSign}>+</Text>
      </View>
      {piece.label ? (
        <Text allowFontScaling={false} style={styles.counterLabel} numberOfLines={1}>
          {piece.label}
        </Text>
      ) : null}
    </View>
  );
}

/** A die: a d6 with pips, any other with its number on its own color. Rolled, it tumbles through faces first. */
function Die({ piece, rollKey }: { piece: TablePiece; rollKey: number }) {
  const sides = piece.sides ?? 6;
  const [face, setFace] = useState<number | null>(null);
  const [tumble] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!rollKey || prefersReducedMotion()) return;
    tumble.setValue(0);
    Animated.timing(tumble, { toValue: 1, duration: ROLL_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // Faces flicker past while it tumbles, then it shows where it landed.
    const flicker = setInterval(() => setFace(rollDie(sides)), ROLL_FACE_MS);
    const settle = setTimeout(() => {
      clearInterval(flicker);
      setFace(null);
    }, ROLL_MS);
    return () => {
      clearInterval(flicker);
      clearTimeout(settle);
    };
  }, [rollKey, sides, tumble]);
  const shown = face ?? piece.value;
  const transform = [
    { rotate: tumble.interpolate({ inputRange: [0, 0.35, 0.7, 1], outputRange: ['0deg', '-28deg', '14deg', '0deg'] }) },
    { scale: tumble.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 1.18, 1] }) },
  ];
  if (sides === 6) {
    return (
      <Animated.View style={[styles.die, styles.d6, { transform }]}>
        {Array.from({ length: 9 }, (_, i) => (
          <View key={i} style={styles.pipCell}>
            {PIPS[shown]?.includes(i) ? <View style={styles.pip} /> : null}
          </View>
        ))}
      </Animated.View>
    );
  }
  return (
    <Animated.View style={[styles.die, { backgroundColor: DIE_COLORS[sides] ?? colors.accent, transform }]}>
      <Text allowFontScaling={false} style={styles.dieValue}>
        {shown}
      </Text>
      <Text allowFontScaling={false} style={styles.dieSides}>
        d{sides}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', boxShadow: '1px 3px 8px rgba(0, 0, 0, 0.45)' },
  lifted: { boxShadow: '6px 16px 18px rgba(0, 0, 0, 0.45)', transform: [{ scale: 1.08 }] },
  counter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderRadius: 30,
    backgroundColor: 'rgba(8,18,26,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  counterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  counterSign: { color: colors.text, fontSize: 26, fontWeight: '600', marginTop: -2 },
  counterValue: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 30, fontWeight: '700' },
  counterLabel: {
    position: 'absolute',
    top: 64,
    left: -20,
    right: -20,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  die: { flex: 1, borderRadius: DIE_RADIUS, alignItems: 'center', justifyContent: 'center' },
  d6: { backgroundColor: '#f4f1e8', flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  pipCell: { width: '33.33%', height: '33.33%', alignItems: 'center', justifyContent: 'center' },
  pip: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#2c2c2a' },
  dieValue: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 4 },
  dieSides: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '700', marginTop: -4 },
});
