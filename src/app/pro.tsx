import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '../components/AppIcon';
import { Button } from '../components/Button';
import { Text } from '../components/Text';
import { FREE_CARD_LIMIT } from '../lib/limits';
import { buyPro, isPro, restorePro, useProState } from '../lib/pro';
import { colors } from '../theme';

/** Why the screen was opened: the card limit reached, a deck file wanted, or one of the table's components. */
type Reason = 'cards' | 'files' | 'components';

const REASONS: Record<Reason, string> = {
  cards: `The free version holds ${FREE_CARD_LIMIT} cards, and you’ve used them all. Pro removes the limit.`,
  files: 'Sharing, backing up and importing decks and tables are part of Pro.',
  components: 'Bags, tracks, timers, counters and the rest of the table’s components are part of Pro. Dice are free, and the Playground has them all to try.',
};

const PERKS: [string, string][] = [
  ['Unlimited cards', `No ${FREE_CARD_LIMIT}-card limit: every deck for every game.`],
  ['Every component', 'Bags, tracks, timers, counters, pieces, zones and your own art, on any table.'],
  ['Share decks and tables', 'Send a deck, a group or a whole table to a friend as one file.'],
  ['Back up and import', 'Keep everything safe in Files, and bring it to a new phone.'],
  ['Support Shufflevale', 'Made by one person. Every Pro keeps it growing.'],
];

/** Shufflevale Pro: what it adds, its price, and buying or restoring it. Closes itself once Pro is on. */
export default function ProScreen() {
  const { reason } = useLocalSearchParams<{ reason?: Reason }>();
  const insets = useSafeAreaInsets();
  const pro = useProState();
  const on = isPro(pro);

  // Bought (or restored) while it's open: done, back to what they were doing.
  const wasOn = useRef(on);
  useEffect(() => {
    if (on && !wasOn.current && router.canGoBack()) router.back();
    wasOn.current = on;
  }, [on]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <AppIcon size={96} />
      <Text style={styles.title}>Shufflevale Pro</Text>
      {reason && REASONS[reason] && !on ? <Text style={styles.reason}>{REASONS[reason]}</Text> : null}

      <View style={styles.perks}>
        {PERKS.map(([title, body]) => (
          <View key={title} style={styles.perk}>
            <Text style={styles.check}>✓</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.perkTitle}>{title}</Text>
              <Text style={styles.perkBody}>{body}</Text>
            </View>
          </View>
        ))}
      </View>

      {on ? (
        <Text style={styles.owned}>You have Shufflevale Pro. Thank you!</Text>
      ) : (
        <>
          <Button
            label={pro.price ? `Unlock Pro · ${pro.price}` : 'Unlock Pro'}
            variant="primary"
            disabled={pro.busy}
            onPress={buyPro}
            style={styles.buy}
          />
          <Text style={styles.small}>One-time purchase. No subscription.</Text>
        </>
      )}
      {pro.busy ? <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} /> : null}

      {/* Apple asks for this: Pro bought before (or on another phone) can always be brought back. */}
      <Pressable onPress={restorePro} disabled={pro.busy} hitSlop={10} accessibilityRole="button" style={({ pressed }) => [styles.restore, pressed && { opacity: 0.6 }]}>
        <Text style={styles.restoreText}>Restore Purchases</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { alignItems: 'center', padding: 24, paddingTop: 32 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', marginTop: 14 },
  reason: { color: colors.accent, fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 21 },
  perks: { alignSelf: 'stretch', backgroundColor: colors.surface, borderRadius: 14, padding: 16, gap: 14, marginTop: 22 },
  perk: { flexDirection: 'row', gap: 12 },
  check: { color: colors.accent, fontSize: 17, fontWeight: '800', marginTop: 1 },
  perkTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  perkBody: { color: colors.textMuted, fontSize: 14, marginTop: 2, lineHeight: 19 },
  buy: { alignSelf: 'stretch', marginTop: 24 },
  small: { color: colors.textMuted, fontSize: 13, marginTop: 8 },
  owned: { color: colors.accent, fontSize: 16, fontWeight: '600', marginTop: 24 },
  restore: { marginTop: 20, padding: 6 },
  restoreText: { color: colors.textMuted, fontSize: 14, textDecorationLine: 'underline' },
});
