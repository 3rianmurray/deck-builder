import { useState } from 'react';
import { Keyboard, PanResponder, Pressable, StyleSheet, TextInput, View } from 'react-native';

import * as haptics from '../lib/haptics';
import { colors } from '../theme';
import { MAX_TEXT_SCALE, Text } from './Text';

/** How far a finger slides across the number to change it by one. */
const SCRUB_STEP_PX = 18;

/**
 * A whole number from `min` to `max`: − and + on either side to step it, or a finger slid left and right across
 * the number (one step per short slide, with a tick for each); tapped, it can be typed instead.
 */
export function CountStepper({
  value,
  onChange,
  min = 1,
  max,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max: number;
  label: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const [sliding, setSliding] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  // What the slide needs that changes from render to render; the slide's own handlers are made once.
  const [latest] = useState(() => {
    const box = { value, min, max, onChange, typing: false, start: value, shown: value, moved: false };
    return { set: (next: Partial<typeof box>) => Object.assign(box, next), get: () => box };
  });
  latest.set({ value, min, max, onChange, typing: typed !== null });
  const step = (by: number) => {
    const next = clamp(value + by);
    if (next === value) return;
    onChange(next);
    haptics.tick();
  };
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.get().typing,
      onMoveShouldSetPanResponder: () => !latest.get().typing,
      // Once it's being slid, the slide is its own (not the sheet's).
      onPanResponderTerminationRequest: () => !latest.get().moved,
      onPanResponderGrant: () => {
        const now = latest.get().value;
        latest.set({ start: now, shown: now, moved: false });
      },
      onPanResponderMove: (_, g) => {
        const { start, shown, moved, min: least, max: most, onChange: change } = latest.get();
        if (!moved) {
          if (Math.abs(g.dx) < 6) return;
          latest.set({ moved: true });
          setSliding(true);
        }
        const next = Math.min(most, Math.max(least, start + Math.round(g.dx / SCRUB_STEP_PX)));
        if (next === shown) return;
        latest.set({ shown: next });
        change(next);
        haptics.tick();
      },
      onPanResponderRelease: () => {
        setSliding(false);
        // A tap, not a slide: type a number instead.
        if (!latest.get().moved) setTyped(String(latest.get().value));
      },
      onPanResponderTerminate: () => setSliding(false),
    }),
  );
  const finishTyping = () => {
    if (typed === null) return;
    const n = parseInt(typed.replace(/\D/g, ''), 10);
    setTyped(null);
    Keyboard.dismiss();
    if (Number.isFinite(n)) onChange(clamp(n));
  };
  const button = (by: number) => (
    <Pressable
      onPress={() => step(by)}
      disabled={by < 0 ? value <= min : value >= max}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={by < 0 ? 'Fewer' : 'More'}
      style={({ pressed }) => [styles.button, (by < 0 ? value <= min : value >= max) && styles.off, pressed && { opacity: 0.6 }]}>
      <Text style={styles.sign}>{by < 0 ? '−' : '+'}</Text>
    </Pressable>
  );
  return (
    <View style={styles.row}>
      {button(-1)}
      {typed !== null ? (
        <View style={[styles.number, styles.numberOn]}>
          <TextInput
            autoFocus
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            value={typed}
            onChangeText={(t) => setTyped(t.replace(/\D/g, ''))}
            onBlur={finishTyping}
            onSubmitEditing={finishTyping}
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={String(max).length}
            selectTextOnFocus
            style={styles.value}
            accessibilityLabel={label}
          />
        </View>
      ) : (
        <View
          {...responder.panHandlers}
          style={[styles.number, sliding && styles.numberOn]}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min, max, now: value }}
          accessibilityHint="Swipe up or down to change it, or double-tap to type a number."
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'increment') step(1);
            else if (e.nativeEvent.actionName === 'decrement') step(-1);
            else setTyped(String(value));
          }}>
          <Text style={styles.value}>{value}</Text>
          <Text style={styles.hint}>slide</Text>
        </View>
      )}
      {button(1)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 8 },
  button: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  off: { opacity: 0.35 },
  sign: { color: colors.text, fontSize: 26, fontWeight: '600', marginTop: -2 },
  number: { minWidth: 120, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  numberOn: { borderColor: colors.accent, backgroundColor: 'rgba(255,255,255,0.1)' },
  value: { color: colors.text, fontSize: 26, fontWeight: '800', textAlign: 'center', minWidth: 60, fontVariant: ['tabular-nums'] },
  hint: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginTop: -2, textTransform: 'uppercase', letterSpacing: 0.5 },
});
