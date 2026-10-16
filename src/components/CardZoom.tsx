import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, View } from 'react-native';
import type { NativeTouchEvent } from 'react-native';

import { cardRatio } from '../lib/types';
import type { Card, Deck } from '../lib/types';
import { CardView } from './CardView';

/** Distance a single finger must travel before it counts as a swipe rather than a tap. */
const SWIPE_SLOP = 10;
/** A swipe this long, or this fast, sends the card away; anything less springs back. */
const DISMISS_DISTANCE = 80;
const DISMISS_SPEED = 0.6;
/** Pinching in to this fraction of the starting finger distance closes the card. */
const PINCH_CLOSE = 0.8;

const distance = (a: NativeTouchEvent, b: NativeTouchEvent) => Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);

/** A card to show, with a key that's unique to that copy of it (two copies of a card can sit side by side). */
export interface ZoomItem {
  key: string;
  card: Card;
}

interface Props {
  deck: Deck;
  current: ZoomItem;
  /** The space to fill: the card grows to nearly cover it. */
  area: { w: number; h: number };
  /** The cards a sideways swipe steps to: on the left (`prev`) and right (`next`), if any. */
  prev?: ZoomItem;
  next?: ZoomItem;
  /** Show the next (1) or previous (-1) card instead; only called when there is one. */
  onStep?: (dir: 1 | -1) => void;
  onClose: () => void;
}

/** Space between the zoomed card and its neighbours waiting just off the sides of the screen. */
const NEIGHBOUR_GAP = 32;

/**
 * A face-up card blown up to nearly fill the screen, for reading small print. Swipe sideways to step to the
 * card beside it (where there is one); otherwise pinch in, swipe it away in any direction, or tap the
 * background to put it back.
 */
export function CardZoom({ deck, current, area, prev, next, onStep, onClose }: Props) {
  const ratio = cardRatio(deck);
  const width = Math.min(area.w * 0.92, area.h * 0.9 * ratio);
  const height = width / ratio;
  // Neighbours sit one card-width-and-a-gap to either side, so they ride in with the swipe.
  const spacing = width + NEIGHBOUR_GAP;
  const hasPrev = !!prev;
  const hasNext = !!next;
  const [anim] = useState(() => ({
    pan: new Animated.ValueXY(),
    scale: new Animated.Value(0.6),
    opacity: new Animated.Value(0),
  }));
  // Neighbours stay hidden whenever the card isn't full size (opening, pinching, closing): shrinking pulls
  // them in from off screen, where they'd look like a mistake.
  const [showNeighbours, setShowNeighbours] = useState(false);
  // The cards sit on one long strip at fixed spots, `spacing` apart; `slot` is the spot of the card in the
  // middle. A step slides the strip one spot along and moves `slot` with it. Nothing is ever recentred: the
  // slide runs on the native animation thread while a recentre would come from here, and the two landing on
  // different frames is what made the art flicker between the old and new card.
  const [slot, setSlot] = useState(0);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(anim.scale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
      Animated.timing(anim.opacity, { toValue: 1, duration: 140, useNativeDriver: true }),
    // Only if it actually got there: closing mid-open stops it, and the neighbours mustn't show while it shrinks.
    ]).start(({ finished }) => finished && setShowNeighbours(true));
  }, [anim]);

  // What the gesture handling needs that changes from render to render, read when it's needed. The handler
  // itself is made once, so a gesture that's under way when the card changes carries on unbroken.
  const [latest] = useState(() => {
    const box = { spacing, hasPrev, hasNext, onStep, onClose, area };
    return { set: (next: typeof box) => Object.assign(box, next), get: () => box };
  });
  latest.set({ spacing, hasPrev, hasNext, onStep, onClose, area });

  const responder = useMemo(() => {
    // Where the strip is headed: its slot (ahead of the rendered one while a step is still sliding), and the
    // step under way, if any.
    const strip: { slot: number; stepping: { dir: 1 | -1 } | null } = { slot: 0, stepping: null };
    const rest = () => -strip.slot * latest.get().spacing;
    /** A step's slide is over (or cut short by a new touch): the card it slid to becomes the zoomed one. */
    const landStep = () => {
      const step = strip.stepping;
      if (!step) return;
      Object.assign(strip, { stepping: null });
      setSlot(strip.slot);
      latest.get().onStep?.(step.dir);
    };

    const close = (to: { x: number; y: number; scale: number }) => {
      // A swipe away keeps its neighbours in view as it slides; anything that shrinks hides them first.
      if (to.scale < 1) setShowNeighbours(false);
      return Animated.parallel([
        Animated.timing(anim.pan, { toValue: { x: rest() + to.x, y: to.y }, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim.scale, { toValue: to.scale, duration: 180, useNativeDriver: true }),
        Animated.timing(anim.opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(() => latest.get().onClose());
    };

    // Tracking for the gesture in progress, replaced at the start of each one; never part of rendering.
    // `axis` is the direction a swipe locks to once it starts, so it moves cleanly along one line.
    const fresh = () => ({ pinchStart: 0, pinchScale: 1, pinching: false, swiping: false, axis: 'x' as 'x' | 'y' });
    const s = fresh();

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        Object.assign(s, fresh());
        // A touch while the last step is still sliding: it finishes there and then, so this gesture starts from
        // the card it was going to, rather than snapping the strip back to the one it left.
        if (strip.stepping) {
          anim.pan.stopAnimation();
          anim.pan.setValue({ x: rest(), y: 0 });
          landStep();
        }
      },
      onPanResponderMove: (e, g) => {
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          // A second finger turns the gesture into a pinch; the card follows it down in size.
          if (!s.pinching) {
            s.pinching = true;
            s.pinchStart = distance(touches[0], touches[1]);
            anim.pan.setValue({ x: rest(), y: 0 });
            setShowNeighbours(false);
          }
          const k = s.pinchStart > 0 ? distance(touches[0], touches[1]) / s.pinchStart : 1;
          s.pinchScale = Math.min(1, Math.max(0.4, k));
          anim.scale.setValue(s.pinchScale);
          return;
        }
        if (s.pinching) return;
        if (!s.swiping) {
          if (Math.hypot(g.dx, g.dy) < SWIPE_SLOP) return;
          s.swiping = true;
          s.axis = Math.abs(g.dx) >= Math.abs(g.dy) ? 'x' : 'y';
        }
        anim.pan.setValue(s.axis === 'x' ? { x: rest() + g.dx, y: 0 } : { x: rest(), y: g.dy });
      },
      onPanResponderRelease: (_, g) => {
        if (s.pinching) {
          // Released after pinching: closed if it was squeezed far enough, otherwise back to full size.
          if (s.pinchScale <= PINCH_CLOSE) return close({ x: 0, y: 0, scale: 0.3 });
          return Animated.spring(anim.scale, { toValue: 1, useNativeDriver: true }).start(({ finished }) => finished && setShowNeighbours(true));
        }
        if (!s.swiping) return close({ x: 0, y: 0, scale: 0.6 }); // a tap
        // Only the locked direction counts, so a slightly crooked swipe still reads as straight.
        const d = s.axis === 'x' ? g.dx : g.dy;
        const v = s.axis === 'x' ? g.vx : g.vy;
        const far = Math.abs(d) > DISMISS_DISTANCE || Math.abs(v) > DISMISS_SPEED;
        if (!far) return Animated.spring(anim.pan, { toValue: { x: rest(), y: 0 }, useNativeDriver: true }).start();
        // A sideways swipe steps to the card that way, like turning pages: swiping left shows the next card
        // (to the right), swiping right the previous one. With no card that way, it puts the zoom away.
        const dir: 1 | -1 = d < 0 ? 1 : -1;
        const { hasNext, hasPrev, onStep, area } = latest.get();
        if (s.axis === 'x' && onStep && (dir === 1 ? hasNext : hasPrev)) {
          // Slide the strip one spot along, so the neighbour is in the middle, then make it the zoomed card.
          // The strip stays where it ends up; the new card's spot is simply one further along.
          Object.assign(strip, { slot: strip.slot + dir, stepping: { dir } });
          Animated.timing(anim.pan, {
            toValue: { x: rest(), y: 0 },
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(landStep);
          return;
        }
        // Carry on straight along the locked direction until it's off screen.
        const reach = Math.max(area.w, area.h) * Math.sign(d);
        close(s.axis === 'x' ? { x: reach, y: 0, scale: 1 } : { x: 0, y: reach, scale: 1 });
      },
    });
  }, [anim, latest]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim.opacity }]} {...responder.panHandlers}>
      {/* Growing and shrinking happens around the middle of the screen, whichever card is there... */}
      <Animated.View style={{ width, height, transform: [{ scale: anim.scale }], pointerEvents: 'none' }}>
        {/* ...while the strip of cards slides underneath it. */}
        <Animated.View style={{ width, height, transform: anim.pan.getTranslateTransform() }}>
          {/*
            Each card keeps its own view, keyed by that copy, at a fixed spot on the strip: after a step, the
            card that slid in is already drawn where it ends up, so its art never has to reload.
          */}
          {[
            { item: prev, spot: slot - 1 },
            { item: current, spot: slot },
            { item: next, spot: slot + 1 },
          ].map(({ item, spot }) =>
            item ? (
              <View
                key={item.key}
                style={[styles.slot, { left: spot * spacing }, spot !== slot && !showNeighbours && styles.hidden]}>
                <CardView deck={deck} card={item.card} width={width} sharp />
              </View>
            ) : null,
          )}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  slot: { position: 'absolute', top: 0 },
  hidden: { opacity: 0 },
});
