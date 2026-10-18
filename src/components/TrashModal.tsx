import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as haptics from '../lib/haptics';
import type { SandboxCard } from '../lib/sandbox';
import type { Deck } from '../lib/types';
import { colors } from '../theme';
import { Button } from './Button';
import { CardView } from './CardView';
import { Text } from './Text';

const COLUMNS = 4;
const GAP = 10;
const PAD = 16;

/**
 * A table's trash: the cards taken off it, newest first and face up. Tick some to put them back on the table (as one
 * face-up stack), or empty it for good.
 */
export function TrashModal({
  visible,
  cards,
  decks,
  onPutBack,
  onEmpty,
  onClose,
}: {
  visible: boolean;
  /** The trash, oldest first (as the table keeps it). */
  cards: SandboxCard[];
  decks: Map<string, Deck>;
  onPutBack: (iids: string[]) => void;
  onEmpty: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [chosen, setChosen] = useState<string[]>([]);
  const shown = [...cards].reverse();
  const cardW = (width - PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
  const ticked = chosen.filter((iid) => cards.some((c) => c.iid === iid));
  const all = shown.length > 0 && ticked.length === shown.length;

  const close = () => {
    setChosen([]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={[styles.screen, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          {shown.length > 1 ? (
            <Pressable
              onPress={() => {
                setChosen(all ? [] : shown.map((c) => c.iid));
                haptics.tick();
              }}
              hitSlop={10}
              accessibilityRole="button">
              <Text style={styles.link}>{all ? 'Deselect All' : 'Select All'}</Text>
            </Pressable>
          ) : (
            <View style={{ width: 80 }} />
          )}
          <Text style={styles.title}>Trash</Text>
          <Pressable onPress={close} hitSlop={10} accessibilityRole="button">
            <Text style={[styles.link, { fontWeight: '800' }]}>Done</Text>
          </Pressable>
        </View>

        {shown.length ? (
          <ScrollView contentContainerStyle={styles.grid}>
            {shown.map((c) => {
              const deck = decks.get(c.deckId);
              const card = deck?.cards.find((k) => k.id === c.cardId);
              if (!deck) return null;
              const on = ticked.includes(c.iid);
              return (
                <Pressable
                  key={c.iid}
                  onPress={() => {
                    setChosen((x) => (x.includes(c.iid) ? x.filter((i) => i !== c.iid) : [...x, c.iid]));
                    haptics.tick();
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={card?.name ?? 'Card'}
                  style={{ width: cardW }}>
                  <View style={!on && ticked.length ? styles.dim : undefined}>
                    <CardView deck={deck} card={card} width={cardW} />
                  </View>
                  <View style={[styles.tick, on && styles.ticked]}>{on ? <Text style={styles.tickMark}>✓</Text> : null}</View>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={styles.empty}>Nothing in the trash. Cards taken off the table go here.</Text>
        )}

        <View style={styles.footer}>
          <Button
            label={ticked.length ? `Put ${ticked.length} back on the table` : 'Tap cards to put them back'}
            variant="primary"
            disabled={!ticked.length}
            onPress={() => {
              onPutBack(ticked);
              close();
            }}
          />
          {shown.length ? (
            <Button
              label="Empty the trash"
              variant="danger"
              onPress={() => {
                haptics.warn();
                Alert.alert('Empty the trash?', 'These cards leave this table. Gather by Deck still brings whole decks back.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Empty', style: 'destructive', onPress: onEmpty },
                ]);
              }}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: PAD },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  link: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: PAD, paddingBottom: 24 },
  empty: { flex: 1, color: colors.textMuted, textAlign: 'center', marginTop: 40, paddingHorizontal: 32 },
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
  footer: { gap: 10, paddingHorizontal: PAD, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
