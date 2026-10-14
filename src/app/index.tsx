import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { CardView } from '../components/CardView';
import { useDecks } from '../lib/DecksContext';
import { deckSize } from '../lib/types';
import { colors } from '../theme';

export default function HomeScreen() {
  const { decks, createDeck, sessions, getDeck } = useDecks();
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
        ListHeaderComponent={
          sessions.length ? (
            <View style={{ gap: 10, marginBottom: 6 }}>
              <Text style={styles.section}>Sessions</Text>
              {sessions.map((s) => {
                const names = s.deckIds.flatMap((d) => getDeck(d)?.name ?? []);
                return (
                  <Pressable
                    key={s.id}
                    style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
                    onPress={() => router.push({ pathname: '/session/edit', params: { id: s.id } })}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {s.name}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {names.length ? names.join(' · ') : 'No decks'}
                      </Text>
                    </View>
                    <Button
                      label="Play"
                      variant="primary"
                      disabled={names.length === 0}
                      onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id } })}
                    />
                  </Pressable>
                );
              })}
              {decks.length ? <Text style={[styles.section, { marginTop: 10 }]}>Decks</Text> : null}
            </View>
          ) : null
        }
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
                {deckSize(item)} {deckSize(item) === 1 ? 'card' : 'cards'}
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
        <Button label="+ New Deck" variant="primary" onPress={newDeck} style={{ flex: 1 }} />
        <Button
          label="+ New Session"
          onPress={() => router.push('/session/edit')}
          disabled={decks.length === 0}
          style={{ flex: 1 }}
        />
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
  section: { color: colors.textMuted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
