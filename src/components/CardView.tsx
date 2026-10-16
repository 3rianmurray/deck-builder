import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { imageUri } from '../lib/storage';
import { cardRatio } from '../lib/types';
import type { Card, Deck } from '../lib/types';
import { colors } from '../theme';
import { tabletopShadow, useOnTabletop } from './Tabletop';
import { MAX_LEAN, viewTilt } from './viewpoint';
import type { Lean } from './viewpoint';

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
  // Still turning back flat after the swap (the second half of the flip).
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    const half = (toValue: number, easing: (t: number) => number) =>
      Animated.timing(turn, { toValue, duration: HALF_FLIP_MS, easing, useNativeDriver: true });
    // Faces match: either the swap just happened, or the card was flipped back mid-turn. Turn flat.
    if (faceUp === shown) {
      half(0, Easing.out(Easing.quad)).start(({ finished }) => finished && setSettling(false));
      return;
    }
    // Deferred so the swap happens outside the effect, as it does after the animation.
    if (reduceMotion) {
      const timer = setTimeout(() => setShown(faceUp), 0);
      return () => clearTimeout(timer);
    }
    half(1, Easing.in(Easing.quad)).start(({ finished }) => {
      if (!finished) return;
      setSettling(true);
      setShown(faceUp);
    });
  }, [faceUp, shown, turn]);

  // Built once: rebuilt each render, a re-render mid-turn could draw it flat for a frame.
  const transform = useMemo(
    () => [
      { perspective: 800 },
      { rotateY: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) },
      // A slight lift sells the 3D turn.
      { scale: turn.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
    ],
    [turn],
  );
  // Mid-flip: from starting to turn until it's lying flat again.
  const turning = !settled || settling;
  return { shown, shownCard, transform, turning };
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
  /**
   * Called once the card is actually drawn: when its art has been decoded and shown (pictures take a few frames
   * to appear in a new card), or straight away for the built-in back, which has no picture.
   */
  onReady?: () => void;
  /**
   * Load the art at full resolution. Normally it's shrunk to the card's size to save memory, but a card shown
   * at one size and then drawn bigger (lifted, zoomed) would reuse that shrunk copy and look soft until it
   * reloaded. For cards that are drawn large or resized while you watch.
   */
  sharp?: boolean;
  /**
   * No shadow at all, e.g. for a card flipping in mid-air: anything behind a card shows round its edges while
   * it turns edge-on.
   */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Renders a card face, or the deck's back when `faceUp` is false or there is no card. */
export function CardView({
  deck,
  card: cardProp,
  faceUp = true,
  width,
  onPress,
  onLongPress,
  selected,
  flipIn = false,
  onReady,
  sharp = false,
  flat = false,
  style,
}: Props) {
  const height = width / cardRatio(deck);
  const radius = Math.max(4, width * 0.06);
  const { shown, shownCard: card, transform, turning } = useFlip(faceUp, flipIn, cardProp);
  const showFace = shown && card;
  // While it turns, the face it's turning to is already there underneath, hidden, so its picture has loaded by
  // the time it shows at the halfway point (rather than a grey card while it loads). Each side keeps its own
  // view, so a side doesn't reload when it goes from hidden to shown.
  const faceCard = shown ? card : cardProp;
  const faceVisible = !!showFace;
  const faceMounted = !!faceCard && (faceVisible || (turning && faceUp));
  const backMounted = !faceVisible || (turning && !faceUp);
  const hasPicture = !!showFace || !!deck.backImage;
  useEffect(() => {
    if (!hasPicture) onReady?.();
    // Only on mount: the built-in back is there as soon as the card is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // On the tabletop the card casts a real shadow on the cloth. It goes on this outer layer, because the card
  // itself clips its corners, which would clip the shadow too.
  const tabletop = useOnTabletop();

  // While it turns, the card is drawn inside a clipping layer a little bigger than it (room for the lift and a
  // little shadow). On iOS that flattens the turning card into its own plane; otherwise its 3D turn is sorted
  // against the views beside it, and the half turning away goes behind them (the edges of a held stack, a
  // shadow layer), showing grey where the card should be. Clipping only while it turns keeps its shadow whole
  // the rest of the time. The layer is always there, so starting a turn never rebuilds the card.
  // Room for the lift, the perspective bulge of the near edge as it turns, and a little shadow.
  const room = Math.ceil(Math.max(10, height * 0.15));
  return (
    <View style={{ margin: -room, padding: room, overflow: turning ? 'hidden' : 'visible' }}>
    <Animated.View
      style={[
        { transform },
        // Sized to the card exactly: unsized, it can stretch wider than the card and show as a grey card behind.
        tabletop && !flat && [tabletopShadow.resting, { width, height, borderRadius: radius, backgroundColor: colors.surfaceRaised }],
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
          flat && styles.noShadow,
          { width, height, borderRadius: radius },
          selected && styles.selected,
          pressed && { opacity: 0.8 },
        ]}>
        {backMounted ? (
          <View key="back" style={[StyleSheet.absoluteFill, faceVisible && styles.hiddenSide]}>
            {deck.backImage ? (
              <Image
                source={{ uri: imageUri(deck.backImage) }}
                style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
                contentFit="cover"
                onDisplay={faceVisible ? undefined : onReady}
                allowDownscaling={!sharp}
              />
            ) : (
              <DefaultBack radius={radius} />
            )}
          </View>
        ) : null}
        {faceMounted && faceCard ? (
          <View key="face" style={[StyleSheet.absoluteFill, !faceVisible && styles.hiddenSide]}>
            <Image
              source={{ uri: imageUri(faceCard.image) }}
              style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
              contentFit="cover"
              onDisplay={faceVisible ? onReady : undefined}
              allowDownscaling={!sharp}
            />
          </View>
        ) : null}
        {/* A faint sheen on the card's edge, where the light catches it. */}
        {tabletop ? <View style={[StyleSheet.absoluteFill, styles.sheen, { borderRadius: radius }]} /> : null}
      </Pressable>
    </Animated.View>
    </View>
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
 * How far a pile of `count` cards rises: its top card sits this many points from its bottom card for each
 * unit of lean (see `leanOffset`). A pile of one lies flat; it rises steadily up to `FULL_PILE` cards, and no
 * further.
 */
export function pileRise(width: number, count: number): number {
  const thickness = count <= 1 ? 0 : pileThickness(width) * Math.min(1, (count - 1) / (FULL_PILE - 1));
  return Math.round(thickness / EDGE_STEP) * EDGE_STEP;
}

/** How long a pile takes to settle into a new lean. */
const LEAN_GLIDE_MS = 260;

/** Up and to the left: how a pile leans when nothing says otherwise. */
const DEFAULT_LEAN: Lean = { x: -0.7, y: -0.7 };

/**
 * Gives a pile some depth. The bottom card sits exactly in the pile's spot, and each card above it steps
 * towards its top card, which is risen out of the spot. The pile's own box stays the size of one card, so
 * nothing around it moves as it grows or shrinks.
 *
 * `lean` is which way the top card rises, in pile thicknesses: away from the middle of the table, as a real
 * pile seen from above the middle would (see `viewpoint.ts`). The phone's tilt adds to it as it moves.
 *
 * `height`, if given, is how much of the pile is there, from 0 to 1, as it changes: at 0 it's gone, leaving
 * just its spot, with its top card (and anything drawn on it) sunk down to the table. For a deck being
 * shuffled, whose cards are all in the player's hands for a moment. It must be a JS-driven value, like the tilt.
 */
export function PileDepth({
  deck,
  width,
  count,
  lean = DEFAULT_LEAN,
  height: present,
  children,
}: {
  deck: Deck;
  width: number;
  count: number;
  lean?: Lean;
  height?: Animated.Value;
  children: ReactNode;
}) {
  const rise = pileRise(width, count);
  // Enough edges to look solid however far the pile leans.
  const edges = Math.round((rise * MAX_LEAN) / EDGE_STEP);
  const height = width / cardRatio(deck);
  const radius = Math.max(4, width * 0.06);
  const tabletop = useOnTabletop();
  // The lean glides to a new value rather than jumping, e.g. while the screen is still measuring where the pile
  // is (as it opens), or as a stack's spot scrolls. JS-driven, like the tilt it's added to.
  const [leanX] = useState(() => new Animated.Value(lean.x));
  const [leanY] = useState(() => new Animated.Value(lean.y));
  useEffect(() => {
    const glide = (v: Animated.Value, to: number) =>
      Animated.timing(v, { toValue: to, duration: LEAN_GLIDE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    const anim = Animated.parallel([glide(leanX, lean.x), glide(leanY, lean.y)]);
    anim.start();
    return () => anim.stop();
  }, [lean.x, lean.y, leanX, leanY]);
  // The top card's offset from the spot, following the tilt; each edge is part of the way there.
  const offsets = useMemo(() => {
    if (!rise) return null;
    const axis = (tilt: Animated.Value, base: Animated.Value) =>
      Animated.add(tilt, base).interpolate({
        inputRange: [-MAX_LEAN, MAX_LEAN],
        outputRange: [-MAX_LEAN * rise, MAX_LEAN * rise],
        extrapolate: 'clamp',
      });
    // Lowered as the pile goes (see `height`).
    const lowered = (v: Animated.AnimatedInterpolation<number>) => (present ? Animated.multiply(v, present) : v);
    const top = { x: lowered(axis(viewTilt.x, leanX)), y: lowered(axis(viewTilt.y, leanY)) };
    const part = (f: number) => [{ translateX: Animated.multiply(top.x, f) }, { translateY: Animated.multiply(top.y, f) }];
    return {
      top: [{ translateX: top.x }, { translateY: top.y }],
      edge: Array.from({ length: edges }, (_, i) => part(i / edges)),
      // The edges fade out as the pile all but goes, so only its spot is left.
      opacity: present?.interpolate({ inputRange: [0, 0.35], outputRange: [0, 1], extrapolate: 'clamp' }),
    };
  }, [rise, edges, leanX, leanY, present]);
  return (
    <View style={{ width, height }}>
      {offsets?.edge.map((transform, i) => (
        // Drawn bottom card first (at the pile's spot), so each edge sits over the one below it.
        <Animated.View
          key={i}
          style={[
            styles.edge,
            { width, height, borderRadius: radius, transform, opacity: offsets.opacity ?? 1 },
            // On the tabletop the bottom card casts the pile's shadow onto the cloth.
            tabletop && i === 0 && tabletopShadow.resting,
          ]}
        />
      ))}
      {/* The top card, risen above the rest. */}
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, transform: offsets?.top ?? [] }}>{children}</Animated.View>
    </View>
  );
}

/** A dashed placeholder the size of one of the deck's cards, with an optional hint inside. */
export function EmptySlot({ deck, width, label }: { deck: Deck; width: number; label?: string }) {
  return (
    <View style={[styles.empty, { width, height: width / cardRatio(deck), borderRadius: Math.max(4, width * 0.06) }]}>
      {label ? <Text style={styles.emptyText}>{label}</Text> : null}
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
  // The side not showing, loaded and ready underneath while the card turns.
  hiddenSide: { opacity: 0 },
  noShadow: { shadowOpacity: 0, elevation: 0 },
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
