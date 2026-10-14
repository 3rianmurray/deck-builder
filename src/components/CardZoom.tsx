import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet } from 'react-native';
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

interface Props {
  deck: Deck;
  card: Card;
  /** The space to fill: the card grows to nearly cover it. */
  area: { w: number; h: number };
  /** Whether there's a card to step to on the left (`hasPrev`) or right (`hasNext`) with a sideways swipe. */
  hasPrev?: boolean;
  hasNext?: boolean;
  /** Show the next (1) or previous (-1) card instead; only called when there is one. */
  onStep?: (dir: 1 | -1) => void;
  onClose: () => void;
}

/**
 * A face-up card blown up to nearly fill the screen, for reading small print. Swipe sideways to step to the
 * card beside it (where there is one); otherwise pinch in, swipe it away in any direction, or tap the
 * background to put it back.
 */
export function CardZoom({ deck, card, area, hasPrev = false, hasNext = false, onStep, onClose }: Props) {
  const ratio = cardRatio(deck);
  const width = Math.min(area.w * 0.92, area.h * 0.9 * ratio);
  const [anim] = useState(() => ({
    pan: new Animated.ValueXY(),
    scale: new Animated.Value(0.6),
    opacity: new Animated.Value(0),
  }));

  useEffect(() => {
    Animated.parallel([
      Animated.spring(anim.scale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
      Animated.timing(anim.opacity, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [anim]);

  const responder = useMemo(() => {
    const close = (to: { x: number; y: number; scale: number }) =>
      Animated.parallel([
        Animated.timing(anim.pan, { toValue: { x: to.x, y: to.y }, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim.scale, { toValue: to.scale, duration: 180, useNativeDriver: true }),
        Animated.timing(anim.opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(onClose);

    // Tracking for the gesture in progress, replaced at the start of each one; never part of rendering.
    const fresh = () => ({ pinchStart: 0, pinchScale: 1, pinching: false, swiping: false });
    const s = fresh();

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        Object.assign(s, fresh());
      },
      onPanResponderMove: (e, g) => {
        const touches = e.nativeEvent.touches;
        if (touches.length >= 2) {
          // A second finger turns the gesture into a pinch; the card follows it down in size.
          if (!s.pinching) {
            s.pinching = true;
            s.pinchStart = distance(touches[0], touches[1]);
            anim.pan.setValue({ x: 0, y: 0 });
          }
          const k = s.pinchStart > 0 ? distance(touches[0], touches[1]) / s.pinchStart : 1;
          s.pinchScale = Math.min(1, Math.max(0.4, k));
          anim.scale.setValue(s.pinchScale);
          return;
        }
        if (s.pinching) return;
        if (!s.swiping && Math.hypot(g.dx, g.dy) < SWIPE_SLOP) return;
        s.swiping = true;
        anim.pan.setValue({ x: g.dx, y: g.dy });
      },
      onPanResponderRelease: (_, g) => {
        if (s.pinching) {
          // Released after pinching: closed if it was squeezed far enough, otherwise back to full size.
          if (s.pinchScale <= PINCH_CLOSE) return close({ x: 0, y: 0, scale: 0.3 });
          return Animated.spring(anim.scale, { toValue: 1, useNativeDriver: true }).start();
        }
        if (!s.swiping) return close({ x: 0, y: 0, scale: 0.6 }); // a tap
        const far = Math.hypot(g.dx, g.dy) > DISMISS_DISTANCE || Math.hypot(g.vx, g.vy) > DISMISS_SPEED;
        if (!far) return Animated.spring(anim.pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
        // A mostly sideways swipe steps to the card that way, like turning pages: swiping left shows the next
        // card (to the right), swiping right the previous one. With no card that way, it puts the zoom away.
        const dir: 1 | -1 = g.dx < 0 ? 1 : -1;
        if (Math.abs(g.dx) > Math.abs(g.dy) && onStep && (dir === 1 ? hasNext : hasPrev)) {
          Animated.timing(anim.pan, {
            toValue: { x: -dir * area.w, y: 0 },
            duration: 160,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }).start(() => {
            onStep(dir);
            // The new card comes in from the side the swipe came from.
            anim.pan.setValue({ x: dir * area.w, y: 0 });
            Animated.spring(anim.pan, { toValue: { x: 0, y: 0 }, friction: 9, tension: 70, useNativeDriver: true }).start();
          });
          return;
        }
        // Carry on in the swipe's direction until it's off screen.
        const len = Math.hypot(g.dx, g.dy) || 1;
        const reach = Math.max(area.w, area.h);
        close({ x: (g.dx / len) * reach, y: (g.dy / len) * reach, scale: 1 });
      },
    });
  }, [anim, area.w, area.h, onClose, onStep, hasPrev, hasNext]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim.opacity }]} {...responder.panHandlers}>
      <Animated.View
        style={{
          transform: [...anim.pan.getTranslateTransform(), { scale: anim.scale }],
          pointerEvents: 'none',
        }}>
        <CardView deck={deck} card={card} width={width} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.82)', alignItems: 'center', justifyContent: 'center', zIndex: 20 },
});
