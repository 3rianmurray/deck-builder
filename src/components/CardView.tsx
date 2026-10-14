import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { imageUri } from '../lib/storage';
import { cardRatio } from '../lib/types';
import type { Card, Deck } from '../lib/types';
import { colors } from '../theme';
import { tabletopShadow, useTableLook } from './Tabletop';

/** Time for each half of a flip: turning edge-on, then turning back with the other face showing. */
const HALF_FLIP_MS = 120;

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled().then((on) => (reduceMotion = on));
AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => (reduceMotion = on));

/** Whether the person has asked their phone to cut down on motion; card animations are skipped if so. */
export const prefersReducedMotion = () => reduceMotion;

/**
 * Which face (and which card) to draw, plus a 0→1 value for how far the card is turned towards edge-on.
 * When `faceUp` changes, the card turns edge-on, swaps faces out of sight, then turns back. If the card itself
 * changes in the same moment (a held stack turned over shows its bottom card), the old card is kept until the
 * swap, so the new one's face is never glimpsed on the way.
 */
function useFlip<C>(faceUp: boolean, flipIn: boolean, card: C) {
  const [shown, setShown] = useState(flipIn ? !faceUp : faceUp);
  const [turn] = useState(() => new Animated.Value(0));
  // The card last drawn while not mid-flip. Updated during render, React's pattern for state derived from props.
  const [settledCard, setSettledCard] = useState(card);
  const settled = shown === faceUp;
  if (settled && settledCard !== card) setSettledCard(card);
  const shownCard = settled ? card : settledCard;

  useEffect(() => {
    const half = (toValue: number, easing: (t: number) => number) =>
      Animated.timing(turn, { toValue, duration: HALF_FLIP_MS, easing, useNativeDriver: true });
    // Faces match: either the swap just happened, or the card was flipped back mid-turn. Turn flat.
    if (faceUp === shown) {
      half(0, Easing.out(Easing.quad)).start();
      return;
    }
    // Deferred so the swap happens outside the effect, as it does after the animation.
    if (reduceMotion) {
      const timer = setTimeout(() => setShown(faceUp), 0);
      return () => clearTimeout(timer);
    }
    half(1, Easing.in(Easing.quad)).start(({ finished }) => {
      if (finished) setShown(faceUp);
    });
  }, [faceUp, shown, turn]);

  const transform = [
    { perspective: 800 },
    { rotateY: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) },
    // A slight lift sells the 3D turn.
    { scale: turn.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
  ];
  return { shown, shownCard, transform };
}

interface Props {
  deck: Deck;
  card?: Card;
  faceUp?: boolean;
  width: number;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  /** Start showing the other face and flip to `faceUp` as soon as the card appears, e.g. a card just revealed. */
  flipIn?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Renders a card face, or the deck's back when `faceUp` is false or there is no card. */
export function CardView({ deck, card: cardProp, faceUp = true, width, onPress, onLongPress, selected, flipIn = false, style }: Props) {
  const height = width / cardRatio(deck);
  const radius = Math.max(4, width * 0.06);
  const { shown, shownCard: card, transform } = useFlip(faceUp, flipIn, cardProp);
  const showFace = shown && card;
  // On the tabletop the card casts a real shadow on the cloth. It goes on this outer layer, because the card
  // itself clips its corners, which would clip the shadow too.
  const tabletop = useTableLook() === 'tabletop';

  return (
    <Animated.View
      style={[
        { transform },
        tabletop && [tabletopShadow.resting, { borderRadius: radius, backgroundColor: colors.surfaceRaised }],
        style,
      ]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={!onPress && !onLongPress}
        accessibilityRole={onPress ? 'button' : 'image'}
        accessibilityLabel={faceUp && cardProp ? cardProp.name : 'Face-down card'}
        style={({ pressed }) => [
          styles.card,
          { width, height, borderRadius: radius },
          selected && styles.selected,
          pressed && { opacity: 0.8 },
        ]}>
        {showFace ? (
          <Image source={{ uri: imageUri(card.image) }} style={[StyleSheet.absoluteFill, { borderRadius: radius }]} contentFit="cover" />
        ) : deck.backImage ? (
          <Image source={{ uri: imageUri(deck.backImage) }} style={[StyleSheet.absoluteFill, { borderRadius: radius }]} contentFit="cover" />
        ) : (
          <DefaultBack radius={radius} />
        )}
        {/* A faint sheen on the card's edge, where the light catches it. */}
        {tabletop ? <View style={[StyleSheet.absoluteFill, styles.sheen, { borderRadius: radius }]} /> : null}
      </Pressable>
    </Animated.View>
  );
}

function DefaultBack({ radius }: { radius: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.back, { borderRadius: radius }]}>
      <View style={[styles.backInner, { borderRadius: radius * 0.6 }]}>
        <Text style={styles.backMark}>✦</Text>
      </View>
    </View>
  );
}

/** A pile at least this big shows its full thickness; smaller piles thin out towards a single flat card. */
const FULL_PILE = 20;
/** Gap between drawn card edges, in points. */
const EDGE_STEP = 1.5;

/** Full thickness of a pile of cards this wide: thicker for bigger cards, within reason. */
export function pileThickness(width: number): number {
  return Math.min(14, Math.max(4, width * 0.08));
}

/**
 * Gives a pile some depth: the edges of the cards beneath its top card, stepping down and to the right.
 * Always takes up the full thickness, so the pile doesn't shift as it shrinks; `count` only changes how many
 * edges are drawn.
 */
export function PileDepth({ deck, width, count, children }: { deck: Deck; width: number; count: number; children: ReactNode }) {
  const max = pileThickness(width);
  const thickness = count <= 1 ? 0 : max * Math.min(1, (count - 1) / (FULL_PILE - 1));
  const edges = Math.round(thickness / EDGE_STEP);
  const height = width / cardRatio(deck);
  const radius = Math.max(4, width * 0.06);
  const tabletop = useTableLook() === 'tabletop';
  return (
    <View style={{ width: width + max, height: height + max }}>
      {Array.from({ length: edges }, (_, i) => {
        // Drawn bottom card first, so each edge sits over the one below it.
        const offset = (edges - i) * EDGE_STEP;
        return (
          <View
            key={i}
            style={[
              styles.edge,
              { width, height, borderRadius: radius, left: offset, top: offset },
              // On the tabletop the bottom card casts the pile's shadow onto the cloth.
              tabletop && i === 0 && tabletopShadow.resting,
            ]}
          />
        );
      })}
      {children}
    </View>
  );
}

/** A dashed placeholder the size of one of the deck's cards. */
export function EmptySlot({ deck, width, label }: { deck: Deck; width: number; label: string }) {
  return (
    <View style={[styles.empty, { width, height: width / cardRatio(deck), borderRadius: Math.max(4, width * 0.06) }]}>
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  selected: { borderWidth: 2, borderColor: colors.accent },
  sheen: {
    pointerEvents: 'none',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: 'rgba(255,255,255,0.35)',
    borderLeftColor: 'rgba(255,255,255,0.22)',
    borderRightColor: 'rgba(0,0,0,0.25)',
    borderBottomColor: 'rgba(0,0,0,0.35)',
  },
  back: { backgroundColor: '#5b2a3c', padding: '8%' },
  backInner: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backMark: { color: colors.accent, fontSize: 18 },
  // Paper-coloured card edges with a dark line between each, like the side of a real deck.
  edge: {
    position: 'absolute',
    backgroundColor: '#d8d3c8',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.45)',
  },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center' },
});
