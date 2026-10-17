import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';

import * as haptics from '../lib/haptics';
import { colors } from '../theme';
import { Text } from './Text';

/** How far a finger slides across the number to change it by one. */
const SLIDE_STEP = 18;

/**
 * Dealing from a stack: how many cards (one up to all of them, set with − and + or by sliding across the number),
 * and who to (one button per player, with how many they hold already).
 */
export function DealPanel({
  max,
  players,
  onDeal,
  onBack,
}: {
  max: number;
  players: { name: string; holding: number }[];
  onDeal: (count: number, player: number) => void;
  onBack: () => void;
}) {
  const [count, setCount] = useState(1);
  const [latest] = useState(() => {
    const box = { count: 1, max, start: 1 };
    return { set: (next: Partial<typeof box>) => Object.assign(box, next), get: () => box };
  });
  latest.set({ count, max });
  const change = (to: number) => {
    const next = Math.max(1, Math.min(latest.get().max, to));
    if (next === latest.get().count) return;
    latest.set({ count: next });
    setCount(next);
    haptics.tick();
  };
  // Sliding across the number: right for more, left for fewer.
  const [slide] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => latest.set({ start: latest.get().count }),
      onPanResponderMove: (_, g) => change(latest.get().start + Math.round(g.dx / SLIDE_STEP)),
    }),
  );

  return (
    <View style={styles.panel}>
      <View style={styles.countRow}>
        <Pressable
          onPress={() => change(count - 1)}
          disabled={count <= 1}
          accessibilityRole="button"
          accessibilityLabel="One fewer"
          style={({ pressed }) => [styles.step, pressed && styles.pressed, count <= 1 && styles.off]}>
          <SymbolView name={{ ios: 'minus', android: 'remove', web: 'remove' }} size={18} weight="bold" tintColor={colors.text} />
        </Pressable>
        <View
          {...slide.panHandlers}
          style={styles.count}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Cards to deal"
          accessibilityValue={{ text: String(count) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => change(count + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}>
          <Text style={styles.countText}>{count}</Text>
          <Text style={styles.countLabel}>{count === 1 ? 'card' : 'cards'}</Text>
        </View>
        <Pressable
          onPress={() => change(count + 1)}
          disabled={count >= max}
          accessibilityRole="button"
          accessibilityLabel="One more"
          style={({ pressed }) => [styles.step, pressed && styles.pressed, count >= max && styles.off]}>
          <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={18} weight="bold" tintColor={colors.text} />
        </Pressable>
      </View>

      <Text style={styles.heading}>Deal to</Text>
      <View style={styles.players}>
        {players.map((p, i) => (
          <Pressable
            key={i}
            onPress={() => onDeal(count, i)}
            accessibilityRole="button"
            accessibilityLabel={`Deal ${count} to ${p.name}, who has ${p.holding}`}
            style={({ pressed }) => [styles.player, pressed && styles.pressed]}>
            <Text style={styles.playerName} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={styles.playerHolding}>{p.holding} in hand</Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
        <Text style={styles.back}>Back</Text>
      </Pressable>
    </View>
  );
}

const glass = {
  backgroundColor: 'rgba(8,18,26,0.85)',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255,255,255,0.25)',
} as const;

const styles = StyleSheet.create({
  panel: { alignItems: 'center', gap: 12, paddingHorizontal: 16, maxWidth: 380, width: '100%' },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  step: { ...glass, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  count: { ...glass, minWidth: 96, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 14, alignItems: 'center' },
  countText: { color: colors.text, fontSize: 26, fontWeight: '700' },
  countLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  heading: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  players: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  player: { ...glass, width: 150, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', gap: 2 },
  playerName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  playerHolding: { color: colors.textMuted, fontSize: 12 },
  back: { color: colors.accent, fontSize: 15, fontWeight: '600', paddingVertical: 4 },
  pressed: { opacity: 0.6 },
  off: { opacity: 0.35 },
});
