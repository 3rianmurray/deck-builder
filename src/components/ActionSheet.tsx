import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { SymbolView } from 'expo-symbols';
import type { SymbolViewProps } from 'expo-symbols';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { previousTourStep, useTourStep } from '../lib/tour';
import { colors } from '../theme';
import { Text } from './Text';
import { TourTip } from './TourOverlay';

export interface SheetAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  /** Set when the action opens another modal; iOS can only present it once this sheet has dismissed. */
  opensModal?: boolean;
  /** The sheet stays open, e.g. for an action that shows something over it (see `overlay`). */
  keepsOpen?: boolean;
  /** Starts a new group of actions: a little space above it. */
  groupStart?: boolean;
  /** Part of Shufflevale Pro, not yet unlocked: a gold PRO tag on the right (a tile's, in its corner). It still works: it opens Pro. */
  pro?: boolean;
}

/** An action shown as a small labeled icon tile, in a grid above the other actions. */
export interface SheetTile extends SheetAction {
  /** SF Symbol on iOS, Material Symbol on Android and web. */
  icon: SymbolViewProps['name'];
  /** Shown dimmed and can't be pressed, e.g. a card's current place. */
  disabled?: boolean;
}

interface Props {
  visible: boolean;
  title?: string;
  /** Optional content shown above the actions, e.g. a large card preview. */
  header?: ReactNode;
  /** Optional content under the title, above the actions: e.g. a featured choice drawn its own way. */
  banner?: ReactNode;
  /** Shown over the sheet, filling the screen, e.g. a card full size; the sheet stays open underneath. */
  overlay?: ReactNode;
  /** Actions shown as a grid of icon tiles, three to a row, above `actions`. */
  tiles?: SheetTile[];
  actions: SheetAction[];
  onClose: () => void;
  /**
   * The bottom button's label, which just closes the sheet: Cancel, unless what's changed in the sheet (e.g. a
   * card's copies) is kept as it's made, when it's Done.
   */
  closeLabel?: string;
}

/** How long the sheet takes to come up, and to go. */
const IN_MS = 260;
const OUT_MS = 200;

/**
 * A bottom sheet of actions. Each action closes the sheet when pressed. The dimmed backdrop fades in and out
 * over the screen while the sheet itself slides up from the bottom (and back down).
 */
export function ActionSheet(props: Props) {
  const { visible, onClose } = props;
  const insets = useSafeAreaInsets();
  const pending = useRef<(() => void) | null>(null);
  // 0 is closed, 1 open: the backdrop's opacity, and how far up the sheet has slid.
  const [progress] = useState(() => new Animated.Value(0));
  // Starts below the screen, until the sheet has been measured (it slides in only once it has).
  const { height: screenHeight } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState(screenHeight);
  const [measured, setMeasured] = useState(false);
  // What the sheet shows, kept from when it was last open: while it slides away, whatever it was showing may
  // already be gone (the card just moved, the group just deleted), and it should leave as it was.
  const shown = useMemo(() => {
    const box: { last: Props | null } = { last: null };
    return { keep: (p: Props) => Object.assign(box, { last: p }), get: () => box.last };
  }, []);
  if (visible) shown.keep(props);
  const { title, header, banner, tiles, actions, overlay, closeLabel = 'Cancel' } = visible ? props : (shown.get() ?? props);
  // The modal stays up after `visible` goes false until the sheet has slid away.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  // The walkthrough, when its step is about one of this menu's choices: the tip shows here, by that choice.
  const tour = useTourStep();
  const guided = visible && tour?.step.tile && [...(tiles ?? []), ...actions].some((a) => a.label === tour.step.tile) ? tour : null;
  const guide = useMemo(() => {
    const box = { chosen: false, was: false };
    return { box };
  }, []);
  // Closed without making that choice: back to the step that opens the menu, so the player isn't left stranded.
  useEffect(() => {
    if (guided) {
      Object.assign(guide.box, { was: true, chosen: false });
      return;
    }
    if (!visible && guide.box.was) {
      if (!guide.box.chosen) previousTourStep();
      Object.assign(guide.box, { was: false, chosen: false });
    }
  }, [guided, visible, guide]);
  const isGuided = (a: SheetAction) => guided?.step.tile === a.label;
  // Everything else is grayed out and can't be pressed meanwhile (Cancel still closes the menu).
  const isOff = (a: SheetAction) => !!guided && !isGuided(a);

  useEffect(() => {
    if (visible && !measured) return;
    if (visible) {
      Animated.timing(progress, { toValue: 1, duration: IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
        ({ finished }) => finished && setMounted(false),
      );
    }
  }, [visible, measured, progress]);

  const run = (a: SheetAction) => {
    if (isGuided(a)) Object.assign(guide.box, { chosen: true });
    if (a.keepsOpen) return a.onPress();
    if (a.opensModal && Platform.OS === 'ios') {
      pending.current = a.onPress;
      onClose();
    } else {
      onClose();
      a.onPress();
    }
  };

  return (
    <Modal
      visible={mounted}
      transparent
      // Animated here instead: the system's slide would carry the backdrop up with the sheet.
      animationType="none"
      onRequestClose={onClose}
      // After the slide away has finished and the modal has gone: iOS can now show another one.
      onDismiss={() => {
        const next = pending.current;
        pending.current = null;
        next?.();
      }}>
      {/* Lifts the sheet above the keyboard when the header contains a text field. */}
      <KeyboardAvoidingView style={styles.screen} behavior="padding">
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          onLayout={(e) => {
            // Not while it slides away: its height changing then would make the slide jump.
            if (!visible) return;
            setSheetHeight(e.nativeEvent.layout.height);
            setMeasured(true);
          }}
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 8 },
            { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] }) }] },
          ]}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {guided ? <TourTip index={guided.index} step={guided.step} /> : null}
            {header}
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {banner}
            {tiles?.length ? (
              <View style={styles.tiles}>
                {tiles.map((t) => (
                  // Three to a row, or four when there are more than six, so the rows stay even.
                  <View key={t.label} style={[styles.tileCell, { width: tiles.length > 6 ? '25%' : '33.333%' }]}>
                    <Pressable
                      onPress={() => run(t)}
                      disabled={t.disabled || isOff(t)}
                      accessibilityRole="button"
                      accessibilityLabel={t.label}
                      accessibilityState={{ disabled: t.disabled || isOff(t) }}
                      style={({ pressed }) => [
                        styles.tile,
                        isGuided(t) && styles.guided,
                        pressed && styles.pressed,
                        (t.disabled || isOff(t)) && styles.tileDisabled,
                      ]}>
                      <SymbolView name={t.icon} size={22} tintColor={t.destructive ? colors.danger : colors.text} />
                      <Text style={[styles.tileText, t.destructive && { color: colors.danger }]} numberOfLines={1}>
                        {t.label}
                      </Text>
                      {t.pro ? (
                        <View style={[styles.proTag, styles.tileProTag]}>
                          <Text style={styles.proTagText}>PRO</Text>
                        </View>
                      ) : null}
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            {actions.map((a) => (
              <Pressable
                key={a.label}
                onPress={() => run(a)}
                disabled={isOff(a)}
                accessibilityRole="button"
                accessibilityState={{ disabled: isOff(a) }}
                style={({ pressed }) => [styles.action, a.groupStart && styles.groupStart, isGuided(a) && styles.guided, pressed && styles.pressed, isOff(a) && styles.tileDisabled]}>
                <Text style={[styles.actionText, a.destructive && { color: colors.danger }]}>{a.label}</Text>
                {a.pro ? (
                  <View style={styles.proTagSpot}>
                    <View style={styles.proTag}>
                      <Text style={styles.proTagText}>PRO</Text>
                    </View>
                  </View>
                ) : null}
              </Pressable>
            ))}
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={({ pressed }) => [styles.action, styles.cancel, pressed && styles.pressed]}>
              <Text style={[styles.actionText, { fontWeight: '600' }]}>{closeLabel}</Text>
            </Pressable>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
      {overlay}
    </Modal>
  );
}

const styles = StyleSheet.create({
  // The sheet sits at the bottom, over a backdrop that covers the whole screen.
  screen: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
  },
  content: { padding: 12, gap: 6 },
  title: { color: colors.textMuted, textAlign: 'center', fontSize: 13, marginVertical: 6 },
  action: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancel: { marginTop: 6 },
  groupStart: { marginTop: 10 },
  // Part of Pro, not yet unlocked: a gold tag at the right end of the action.
  proTagSpot: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
  proTag: { backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  proTagText: { color: colors.accentText, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  // Each tile sits in a cell with a little padding all round, so the gaps between them stay even.
  tiles: { flexDirection: 'row', flexWrap: 'wrap', margin: -3 },
  tileCell: { padding: 3 },
  tile: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    gap: 5,
  },
  tileDisabled: { opacity: 0.35 },
  // On a tile: in its top right corner.
  tileProTag: { position: 'absolute', top: 4, right: 4, paddingHorizontal: 5, paddingVertical: 1 },
  tileText: { color: colors.text, fontSize: 12, fontWeight: '500' },
  pressed: { opacity: 0.7 },
  // The walkthrough's choice, ringed in gold.
  guided: { borderWidth: 2, borderColor: colors.accent },
  actionText: { color: colors.text, fontSize: 16 },
});
