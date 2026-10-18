import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { SandboxCard } from '../lib/sandbox';
import type { Deck } from '../lib/types';
import { colors } from '../theme';
import { CardView } from './CardView';
import { Text } from './Text';

const CARD_W = 76;

/**
 * Looking through a stack on a table: its cards, top first, face up, in a row that scrolls; tapping one takes it
 * into the hand that's open (`handName`).
 */
export function StackSearch({
  cards,
  deckOf,
  handName,
  onTake,
  onBack,
}: {
  /** The stack's cards, bottom first (as the stack keeps them). */
  cards: SandboxCard[];
  deckOf: (c: SandboxCard) => Deck | undefined;
  handName: string;
  onTake: (card: SandboxCard) => void;
  onBack: () => void;
}) {
  const topFirst = [...cards].reverse();
  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>Tap a card to take it into {handName}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {topFirst.map((c, i) => {
          const deck = deckOf(c);
          const card = deck?.cards.find((k) => k.id === c.cardId);
          if (!deck) return null;
          return (
            <Pressable
              key={c.iid}
              onPress={() => onTake(c)}
              accessibilityRole="button"
              accessibilityLabel={`${card?.name ?? 'Card'}, ${i === 0 ? 'top card' : `${i + 1} from the top`}`}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.6 }]}>
              <CardView deck={deck} card={card} faceUp width={CARD_W} />
              <Text style={styles.name} numberOfLines={1}>
                {i === 0 ? 'Top' : card?.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.6 }}>
        <Text style={styles.back}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { alignItems: 'center', gap: 12, width: '100%' },
  heading: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { gap: 10, paddingHorizontal: 16 },
  card: { width: CARD_W, alignItems: 'center', gap: 4 },
  name: { color: colors.text, fontSize: 11, width: CARD_W, textAlign: 'center' },
  back: { color: colors.accent, fontSize: 15, fontWeight: '600', paddingVertical: 4 },
});
