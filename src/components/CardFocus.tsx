import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as haptics from '../lib/haptics';
import { colors } from '../theme';
import type { SheetTile } from './ActionSheet';
import { Text } from './Text';

/** How long it takes to come and go. */
const IN_MS = 180;
const OUT_MS = 150;
/** A swipe on the card this long, or this fast, sends it (and this view) away; anything less springs back. */
const SWIPE_AWAY = 70;
const SWIPE_SPEED = 0.6;
/** A finger moving less than this on the card is a tap. */
const TAP_SLOP = 8;

interface Props {
  visible: boolean;
  /** The card, drawn at the size it's given. */
  card: ReactNode;
  title?: string;
  /** Its options, as round buttons under it. Choosing one closes this (unless it `keepsOpen`). */
  tiles: SheetTile[];
  /** Shown under the card instead of its options, e.g. for dealing. */
  panel?: ReactNode;
  onClose: () => void;
  /** Shown over it, filling the screen (the card full size); this stays open underneath. */
  overlay?: ReactNode;
}

/**
 * A card brought up close: the screen behind darkened, the card in the middle, and its options floating under it.
 * Many ways out: tap the card or the background, swipe the card away, or choose an option.
 */
export function CardFocus(props: Props) {
  const { visible, onClose } = props;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // What it shows, kept while it fades away (whatever it showed may be gone by then).
  const kept = useMemo(() => {
    const box: { last: Props | null } = { last: null };
    return { keep: (p: Props) => Object.assign(box, { last: p }), get: () => box.last };
  }, []);
  if (visible) kept.keep(props);
  const { card, title, tiles, panel, overlay } = visible ? props : (kept.get() ?? props);

  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const [anim] = useState(() => ({ shown: new Animated.Value(0), pan: new Animated.ValueXY() }));
  useEffect(() => {
    if (visible) {
      anim.pan.setValue({ x: 0, y: 0 });
      Animated.timing(anim.shown, { toValue: 1, duration: IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(anim.shown, { toValue: 0, duration: OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
        ({ finished }) => finished && setMounted(false),
      );
    }
  }, [visible, anim]);

  // The card: a tap closes it, a swipe throws it away (closing it), a short drag springs back.
  const [latest] = useState(() => {
    const box = { onClose, height };
    return { set: (next: typeof box) => Object.assign(box, next), get: () => box };
  });
  latest.set({ onClose, height });
  const [cardTouches] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => anim.pan.setValue({ x: g.dx, y: g.dy }),
      onPanResponderRelease: (_, g) => {
        const moved = Math.hypot(g.dx, g.dy);
        if (moved < TAP_SLOP) return latest.get().onClose();
        if (moved > SWIPE_AWAY || Math.hypot(g.vx, g.vy) > SWIPE_SPEED) {
          // Carried on the way it was thrown, off the screen, as it all fades.
          const k = latest.get().height / Math.max(1, moved);
          Animated.timing(anim.pan, {
            toValue: { x: g.dx * k, y: g.dy * k },
            duration: OUT_MS + 60,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }).start();
          haptics.tick();
          return latest.get().onClose();
        }
        Animated.spring(anim.pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => Animated.spring(anim.pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start(),
    }),
  );

  const choose = (t: SheetTile) => {
    if (!t.keepsOpen) onClose();
    t.onPress();
  };

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      {/* The screen behind, darkened; tapping it closes this. */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim.shown }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.middle,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 },
          {
            opacity: anim.shown,
            transform: [{ scale: anim.shown.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
          },
        ]}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        <Animated.View {...cardTouches.panHandlers} style={{ transform: anim.pan.getTranslateTransform() }}>
          {card}
        </Animated.View>
        {panel ?? (
          <View style={styles.tiles}>
            {tiles.map((t) => (
              <Pressable
                key={t.label}
                onPress={() => choose(t)}
                disabled={t.disabled}
                accessibilityRole="button"
                accessibilityLabel={t.label}
                style={({ pressed }) => [styles.tile, pressed && { opacity: 0.6 }, t.disabled && { opacity: 0.35 }]}>
                <View style={styles.tileIcon}>
                  <SymbolView name={t.icon} size={22} tintColor={t.destructive ? colors.danger : colors.text} />
                </View>
                <Text style={[styles.tileText, t.destructive && { color: colors.danger }]} numberOfLines={1}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </Animated.View>
      {overlay}
    </Modal>
  );
}

const ICON = 52;

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.3)' },
  middle: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 18 },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, paddingHorizontal: 16, maxWidth: 380 },
  tile: { width: 72, alignItems: 'center', gap: 6 },
  tileIcon: {
    width: ICON,
    height: ICON,
    borderRadius: ICON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,18,26,0.85)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  tileText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
});
