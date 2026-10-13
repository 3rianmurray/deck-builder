import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { CardView } from '../components/CardView';
import { useDecks } from '../lib/DecksContext';
import { colors } from '../theme';

export default function HomeScreen() {
  const { decks, createDeck } = useDecks();
  const insets = useSafeAreaInsets();

  const newDeck = () => {
    const deck = createDeck(`Deck ${decks.length + 1}`);
    router.push({ pathname: '/deck/[id]', params: { id: deck.id } });
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={decks}
        keyExtractor={(d) => d.id}
        contentContainerStyle={[styles.list, decks.length === 0 && { flex: 1 }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No decks yet</Text>
            <Text style={styles.emptyBody}>
              Create a deck, add your own card art from Photos, then take it to the table to draw, shuffle and play.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
            onPress={() => router.push({ pathname: '/deck/[id]', params: { id: item.id } })}>
            <CardView deck={item} card={item.cards[0]} faceUp={!item.backImage && !!item.cards[0]} width={48} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.meta}>
                {item.cards.length} {item.cards.length === 1 ? 'card' : 'cards'}
              </Text>
            </View>
            <Button
              label="Play"
              variant="primary"
              disabled={item.cards.length === 0}
              onPress={() => router.push({ pathname: '/play/[id]', params: { id: item.id } })}
            />
          </Pressable>
        )}
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button label="+ New Deck" variant="primary" onPress={newDeck} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
  },
  name: { color: colors.text, fontSize: 17, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  emptyBody: { color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  footer: { paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
