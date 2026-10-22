import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
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

/**
 * A row in the list under a card's buttons, for its less used options: one action (a chevron if it shows more,
 * red if it's destructive), a few actions side by side (e.g. Turn: Left | Right), or a switch.
 */
export type FocusRow =
  | { kind: 'action'; label: string; onPress: () => void; destructive?: boolean; more?: boolean; keepsOpen?: boolean }
  | { kind: 'pair'; label: string; options: { label: string; onPress: () => void }[] }
  | { kind: 'toggle'; label: string; value: boolean; onChange: (on: boolean) => void };

interface Props {
  visible: boolean;
  /** The card, drawn at the size it's given. */
  card: ReactNode;
  title?: string;
  /** Its options, as round buttons under it. Choosing one closes this (unless it `keepsOpen`). */
  tiles: SheetTile[];
  /** Its other options, as a quiet list under the buttons. Each closes this, but for switches and keepsOpen. */
  rows?: FocusRow[];
  /** Shown under the card instead of its options, e.g. for dealing. */
  panel?: ReactNode;
  onClose: () => void;
  /** Shown over it, filling the screen (the card full size); this stays open underneath. */
  overlay?: ReactNode;
  /**
   * Instead of a copy of the card: the thing itself, where it lies (the camera glides in on it), lit up over the
   * darkened table. The options sit at the bottom of the screen, and onOptionsTop says where they start, so it
   * can be centered above them.
   */
  spotlight?: ReactNode;
  onOptionsTop?: (y: number) => void;
  /**
   * Compact, beside it (on iPad): where the thing is on screen. Its options float in a small panel next to it,
   * nothing darkened, and the panel can be dragged elsewhere (by its title, or the grip in its corner).
   */
  near?: { x: number; y: number; w: number; h: number };
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
  const { card, title, tiles, rows, panel, overlay, spotlight, near } = visible ? props : (kept.get() ?? props);
  const { onOptionsTop } = props;
  const { width: screenW } = useWindowDimensions();
  /** The compact panel's height, once laid out (it's placed beside the thing by it). */
  const [panelH, setPanelH] = useState<number | null>(null);

  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const [anim] = useState(() => ({ shown: new Animated.Value(0), pan: new Animated.ValueXY() }));
  useEffect(() => {
    if (visible) {
      anim.pan.setOffset({ x: 0, y: 0 });
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

  // The compact panel, dragged by its title or its corner grip: it stays where it's let go.
  const [panelTouches] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => anim.pan.extractOffset(),
      onPanResponderMove: (_, g) => anim.pan.setValue({ x: g.dx, y: g.dy }),
      onPanResponderRelease: () => anim.pan.flattenOffset(),
      onPanResponderTerminate: () => anim.pan.flattenOffset(),
    }),
  );

  const choose = (t: SheetTile) => {
    if (!t.keepsOpen) onClose();
    t.onPress();
  };

  // Its options: as round buttons, then a quiet list (or, instead, the panel given).
  const options = panel ?? (
      <>
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
      {rows?.length ? (
        <View style={styles.list}>
          {rows.map((r, i) => (
            <View key={r.label} style={[styles.row, i > 0 && styles.rowLine, r.kind === 'action' && r.destructive && styles.dangerRow]}>
              {r.kind === 'action' ? (
                <Pressable
                  onPress={() => {
                    if (!r.keepsOpen) onClose();
                    r.onPress();
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.rowPress, pressed && { opacity: 0.6 }]}>
                  <Text style={[styles.rowText, r.destructive && { color: colors.danger }]}>{r.label}</Text>
                  {r.more ? <Text style={styles.chevron}>›</Text> : null}
                </Pressable>
              ) : r.kind === 'pair' ? (
                <>
                  <Text style={styles.rowText}>{r.label}</Text>
                  <View style={styles.pair}>
                    {r.options.map((o) => (
                      <Pressable
                        key={o.label}
                        onPress={() => {
                          onClose();
                          o.onPress();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${r.label} ${o.label}`}
                        style={({ pressed }) => [styles.pairButton, pressed && { opacity: 0.6 }]}>
                        <Text style={styles.pairText}>{o.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={[styles.rowText, styles.rowLabel]} numberOfLines={1}>
                    {r.label}
                  </Text>
                  {/* In a slot of its own on the right, centered in the row, as the other rows' ends are. */}
                  <View style={styles.switchSlot}>
                    <Switch value={r.value} onValueChange={r.onChange} trackColor={{ true: colors.accent, false: undefined }} accessibilityLabel={r.label} />
                  </View>
                </>
              )}
            </View>
          ))}
        </View>
      ) : null}
      </>
  );

  if (near) {
    // Beside it, on the right if there's room (else the left, else over it), level with its middle, on screen.
    const H = panelH ?? 0;
    const right = near.x + near.w + COMPACT_GAP;
    const left = near.x - COMPACT_GAP - COMPACT_W;
    const x =
      right + COMPACT_W <= screenW - 12 ? right : left >= 12 ? left : Math.max(12, Math.min(screenW - COMPACT_W - 12, near.x + near.w / 2 - COMPACT_W / 2));
    const y = Math.max(insets.top + 8, Math.min(height - insets.bottom - H - 8, near.y + near.h / 2 - H / 2));
    return (
      <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
        {/* Nothing darkened: a tap anywhere else closes it. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <Animated.View
          onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
          style={[
            styles.compact,
            { left: x, top: y, width: COMPACT_W },
            {
              opacity: panelH === null ? 0 : anim.shown,
              transform: [...anim.pan.getTranslateTransform(), { scale: anim.shown.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
            },
          ]}>
          <View {...panelTouches.panHandlers} style={styles.compactHead}>
            <Text style={styles.compactTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {options}
          {/* The grip: it can be moved (as a window's corner, or a zone's). */}
          <View {...panelTouches.panHandlers} style={styles.compactGripSpot} hitSlop={10}>
            <View style={styles.compactGrip} />
          </View>
        </Animated.View>
        {overlay}
      </Modal>
    );
  }

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      {/* The screen behind, darkened; tapping it closes this. */}
      <Animated.View style={[StyleSheet.absoluteFill, spotlight ? styles.darker : styles.backdrop, { opacity: anim.shown }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      {/* The thing itself, lit up as the rest goes dark (a tap on it, as on the dark, closes this). */}
      {spotlight ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: anim.shown }]}>
          {spotlight}
        </Animated.View>
      ) : null}
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.middle,
          !!spotlight && styles.bottom,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 },
          {
            opacity: anim.shown,
            transform: [{ scale: anim.shown.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
          },
        ]}>
        {spotlight ? null : (
          <>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            <Animated.View {...cardTouches.panHandlers} style={{ transform: anim.pan.getTranslateTransform() }}>
              {card}
            </Animated.View>
          </>
        )}
        <View
          pointerEvents="box-none"
          style={styles.options}
          onLayout={(e) => visible && onOptionsTop?.(e.nativeEvent.layout.y)}>
        {spotlight && title ? <Text style={styles.title}>{title}</Text> : null}
        {options}
        </View>
      </Animated.View>
      {overlay}
    </Modal>
  );
}

const ICON = 52;
/** The compact panel (on iPad): its width, and its gap from the thing it's beside. */
const COMPACT_W = 320;
const COMPACT_GAP = 16;
const ROW_H = 44;

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.3)' },
  // Behind the thing lit up: the rest of the table, well darkened.
  darker: { backgroundColor: 'rgba(0,0,0,0.62)' },
  middle: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 18 },
  // With the thing lit up where it lies: the options at the foot of the screen, under it.
  bottom: { justifyContent: 'flex-end' },
  options: { alignItems: 'center', gap: 18, alignSelf: 'stretch' },
  // The compact panel: its options, framed, floating beside the thing.
  compact: {
    position: 'absolute',
    alignItems: 'center',
    gap: 14,
    paddingTop: 4,
    paddingBottom: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(8,18,26,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  compactHead: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  compactTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  compactGripSpot: { position: 'absolute', right: 0, bottom: 0, width: 30, height: 30 },
  compactGrip: { position: 'absolute', right: 7, bottom: 7, width: 14, height: 14, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 6, borderColor: 'rgba(255,255,255,0.85)' },
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
  // The quiet list of other options under the buttons.
  list: {
    width: '92%',
    maxWidth: 360,
    backgroundColor: 'rgba(8,18,26,0.85)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  row: { minHeight: ROW_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.14)' },
  dangerRow: { borderTopColor: 'rgba(255,255,255,0.3)' },
  rowPress: { flex: 1, minHeight: ROW_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText: { color: colors.text, fontSize: 15, fontWeight: '500' },
  rowLabel: { flex: 1, marginRight: 12 },
  switchSlot: { height: ROW_H, justifyContent: 'center', alignItems: 'flex-end' },
  chevron: { color: colors.textMuted, fontSize: 20 },
  pair: { flexDirection: 'row', gap: 8 },
  pairButton: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)' },
  pairText: { color: colors.text, fontSize: 14, fontWeight: '600' },
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
