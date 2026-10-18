import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as haptics from '../lib/haptics';
import { deckSize } from '../lib/types';
import type { Deck } from '../lib/types';
import { colors } from '../theme';
import { Button } from './Button';
import { CardView } from './CardView';
import { Text } from './Text';

const COLUMNS = 4;
const GAP = 10;
const PAD = 16;

/**
 * Bringing some of a deck's cards onto a table: first which deck (each with a picture of its cards), then which of
 * its cards, ticked one by one or all at once.
 */
export function AddCardsModal({
  visible,
  decks,
  onAdd,
  onClose,
}: {
  visible: boolean;
  decks: Deck[];
  /** The chosen deck and cards (by card id). */
  onAdd: (deck: Deck, cardIds: string[]) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [deckId, setDeckId] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const deck = decks.find((d) => d.id === deckId);
  const playable = decks.filter((d) => d.cards.length);
  const cardW = (width - PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  const close = () => {
    setDeckId(null);
    setChosen([]);
    onClose();
  };
  const toggle = (id: string) => {
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
    haptics.tick();
  };
  const count = deck ? deck.cards.filter((c) => chosen.includes(c.id)).reduce((n, c) => n + (c.copies ?? 1), 0) : 0;
  const allChosen = !!deck && chosen.length === deck.cards.length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={[styles.screen, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          {deck ? (
            <Pressable
              onPress={() => {
                setDeckId(null);
                setChosen([]);
              }}
              hitSlop={10}
              accessibilityRole="button">
              <Text style={styles.link}>‹ Decks</Text>
            </Pressable>
          ) : (
            <View style={{ width: 60 }} />
          )}
          <Text style={styles.title} numberOfLines={1}>
            {deck ? deck.name : 'Add cards'}
          </Text>
          <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </View>

        {deck ? (
          <>
            <View style={styles.chooseRow}>
              <Text style={styles.muted}>Tap cards to choose them.</Text>
              <Pressable
                onPress={() => {
                  setChosen(allChosen ? [] : deck.cards.map((c) => c.id));
                  haptics.tick();
                }}
                hitSlop={8}
                accessibilityRole="button">
                <Text style={styles.link}>{allChosen ? 'Deselect All' : 'Select All'}</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.grid}>
              {deck.cards.map((c) => {
                const on = chosen.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => toggle(c.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={c.name}
                    style={{ width: cardW }}>
                    <View style={!on && chosen.length ? styles.dim : undefined}>
                      <CardView deck={deck} card={c} width={cardW} />
                    </View>
                    <View style={[styles.tick, on && styles.ticked]}>{on ? <Text style={styles.tickMark}>✓</Text> : null}</View>
                    {(c.copies ?? 1) > 1 ? <Text style={styles.copies}>×{c.copies}</Text> : null}
                    <Text style={styles.cardName} numberOfLines={1}>
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.footer}>
              <Button
                label={count ? `Add ${count} ${count === 1 ? 'card' : 'cards'}` : 'Choose some cards'}
                variant="primary"
                disabled={!count}
                onPress={() => {
                  onAdd(deck, chosen);
                  close();
                }}
              />
            </View>
          </>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {playable.length ? null : <Text style={styles.muted}>No decks with cards yet.</Text>}
            {playable.map((d) => (
              <Pressable
                key={d.id}
                onPress={() => {
                  setDeckId(d.id);
                  setChosen([]);
                  haptics.tick();
                }}
                accessibilityRole="button"
                accessibilityLabel={`${d.name}, ${deckSize(d)} cards`}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
                <CardView deck={d} card={d.cards[0]} faceUp={!d.backImage && !!d.cards[0]} width={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {d.name}
                  </Text>
                  <Text style={styles.muted}>
                    {deckSize(d)} {deckSize(d) === 1 ? 'card' : 'cards'}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: PAD },
  title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  link: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  muted: { color: colors.textMuted, fontSize: 14 },
  list: { paddingHorizontal: PAD, gap: 10, paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: 12, padding: 12 },
  name: { color: colors.text, fontSize: 17, fontWeight: '600' },
  chevron: { color: colors.textMuted, fontSize: 22 },
  chooseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: PAD, paddingBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: PAD, paddingBottom: 24 },
  dim: { opacity: 0.45 },
  tick: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticked: { backgroundColor: colors.accent, borderColor: colors.accent },
  tickMark: { color: colors.accentText, fontSize: 13, fontWeight: '800' },
  copies: { position: 'absolute', top: 5, right: 5, color: '#fff', fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden' },
  cardName: { color: colors.textMuted, fontSize: 11, marginTop: 3, textAlign: 'center' },
  footer: { paddingHorizontal: PAD, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
