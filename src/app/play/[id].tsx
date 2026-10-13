import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, type SheetAction } from '../../components/ActionSheet';
import { Button } from '../../components/Button';
import { CardView, EmptySlot } from '../../components/CardView';
import { useDecks } from '../../lib/DecksContext';
import * as T from '../../lib/table';
import type { CardInstance, Deck, TableState, Zone } from '../../lib/types';
import { colors } from '../../theme';

type Sheet =
  | { kind: 'card'; iid: string }
  | { kind: 'deck' }
  | { kind: 'discard' }
  | { kind: 'table' };

export default function PlayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const decks = useDecks();
  const deck = decks.getDeck(id);
  const [table, setTable] = useState<TableState | undefined>(() => decks.getTable(id));

  useEffect(() => {
    if (table) decks.setTable(id, table);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save only when the table itself changes
  }, [table]);

  if (!deck || !table) {
    return (
      <View style={[styles.felt, styles.center]}>
        <Text style={styles.muted}>This deck no longer exists.</Text>
      </View>
    );
  }
  return <Table deck={deck} table={table} setTable={setTable} />;
}

function Table({
  deck,
  table,
  setTable,
}: {
  deck: Deck;
  table: TableState;
  setTable: Dispatch<SetStateAction<TableState | undefined>>;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<Sheet>({ kind: 'table' });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchZone, setSearchZone] = useState<Zone | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const pileWidth = Math.min(96, width * 0.2);
  const handWidth = Math.min(110, width * 0.24);
  const tableCardWidth = Math.min(90, width * 0.2);
  const cardsById = new Map(deck.cards.map((c) => [c.id, c]));
  const missing = T.missingCards(table, deck).length;

  const flash = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1200);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const apply = (fn: (t: TableState) => TableState, msg?: string) => {
    setTable((t) => (t ? fn(t) : t));
    if (msg) flash(msg);
  };

  const open = (s: Sheet) => {
    setSheet(s);
    setSheetOpen(true);
  };

  const confirmReset = () =>
    Alert.alert('Reset the table?', 'Every card goes back into the deck and the deck is shuffled.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => apply(T.resetTable, 'Table reset') },
    ]);

  const moveActions = (iid: string, from: Zone): SheetAction[] => {
    const to = (zone: Zone, label: string, position?: T.Position): SheetAction => ({
      label,
      onPress: () => apply((t) => T.moveCard(t, iid, zone, position)),
    });
    const actions: SheetAction[] = [];
    if (from !== 'hand') actions.push(to('hand', 'Put in hand'));
    if (from !== 'table') actions.push(to('table', 'Play to table'));
    if (from === 'table') actions.push({ label: 'Flip over', onPress: () => apply((t) => T.flip(t, iid)) });
    if (from !== 'discard') actions.push(to('discard', 'Discard'));
    actions.push(to('deck', from === 'deck' ? 'Move to top of deck' : 'Put on top of deck', 'top'));
    actions.push(to('deck', from === 'deck' ? 'Move to bottom of deck' : 'Put on bottom of deck', 'bottom'));
    return actions;
  };

  const sheetProps = (() => {
    switch (sheet.kind) {
      case 'card': {
        const found = T.findCard(table, sheet.iid);
        if (!found) return { actions: [] };
        const inst = table[found.zone][found.index];
        const card = cardsById.get(inst.cardId);
        // The owner may always peek at their own cards, even face-down ones on the table.
        return {
          title: card?.name,
          header: (
            <View style={{ alignItems: 'center', marginBottom: 6 }}>
              <CardView deck={deck} card={card} width={Math.min(240, width * 0.6)} />
            </View>
          ),
          actions: moveActions(inst.iid, found.zone),
        };
      }
      case 'deck':
        return {
          title: `Deck · ${table.deck.length} cards`,
          actions: [
            { label: 'Draw 1', onPress: () => apply((t) => T.draw(t, 1)) },
            { label: 'Draw 3', onPress: () => apply((t) => T.draw(t, 3)) },
            { label: 'Draw 5', onPress: () => apply((t) => T.draw(t, 5)) },
            { label: 'Deal top card to table', onPress: () => apply((t) => (t.deck[0] ? T.moveCard(t, t.deck[0].iid, 'table') : t)) },
            { label: 'Shuffle deck', onPress: () => apply((t) => T.shuffleZone(t, 'deck'), 'Shuffled') },
            { label: 'Search deck', opensModal: true, onPress: () => setSearchZone('deck') },
          ],
        };
      case 'discard':
        return {
          title: `Discard pile · ${table.discard.length} cards`,
          actions: [
            { label: 'Take top card into hand', onPress: () => apply((t) => T.takeTopOfDiscard(t, 'hand')) },
            { label: 'Play top card to table', onPress: () => apply((t) => T.takeTopOfDiscard(t, 'table')) },
            { label: 'Search discard pile', opensModal: true, onPress: () => setSearchZone('discard') },
            {
              label: 'Shuffle discard pile into deck',
              onPress: () => apply(T.shuffleDiscardIntoDeck, 'Shuffled into deck'),
            },
          ],
        };
      case 'table':
        return {
          title: deck.name,
          actions: [
            { label: 'Discard entire hand', onPress: () => apply(T.discardHand) },
            { label: 'Shuffle discard pile into deck', onPress: () => apply(T.shuffleDiscardIntoDeck, 'Shuffled into deck') },
            { label: 'Edit deck', onPress: () => router.push({ pathname: '/deck/[id]', params: { id: deck.id } }) },
            { label: 'Reset table', destructive: true, opensModal: true, onPress: confirmReset },
          ],
        };
    }
  })();

  const renderCard = (inst: CardInstance, w: number) => (
    <CardView
      key={inst.iid}
      deck={deck}
      card={cardsById.get(inst.cardId)}
      faceUp={inst.faceUp}
      width={w}
      onPress={() => open({ kind: 'card', iid: inst.iid })}
    />
  );

  const topDiscard = table.discard[0];

  return (
    <View style={styles.felt}>
      <Stack.Screen
        options={{
          title: deck.name,
          headerRight: () => (
            <Pressable onPress={() => open({ kind: 'table' })} hitSlop={12} accessibilityLabel="Table options">
              <Text style={styles.headerButton}>•••</Text>
            </Pressable>
          ),
        }}
      />

      {missing > 0 ? (
        <Pressable style={styles.banner} onPress={() => apply((t) => T.addMissingCards(t, deck), 'Added to deck')}>
          <Text style={styles.bannerText}>
            {missing} new {missing === 1 ? 'card' : 'cards'} in this deck · Tap to shuffle in
          </Text>
        </Pressable>
      ) : null}

      {/* Piles */}
      <View style={styles.piles}>
        <View style={styles.pile}>
          {table.deck.length ? (
            <CardView
              deck={deck}
              faceUp={false}
              width={pileWidth}
              onPress={() => apply((t) => T.draw(t, 1))}
              onLongPress={() => open({ kind: 'deck' })}
            />
          ) : (
            <EmptySlot width={pileWidth} label="Deck empty" />
          )}
          <Text style={styles.pileLabel}>Deck · {table.deck.length}</Text>
        </View>

        <View style={styles.pileButtons}>
          <Button label="Draw" variant="primary" onPress={() => apply((t) => T.draw(t, 1))} disabled={!table.deck.length} />
          <Button label="Shuffle" onPress={() => apply((t) => T.shuffleZone(t, 'deck'), 'Shuffled')} disabled={table.deck.length < 2} />
          <Button label="Deck…" onPress={() => open({ kind: 'deck' })} />
        </View>

        <View style={styles.pile}>
          {topDiscard ? (
            <CardView
              deck={deck}
              card={cardsById.get(topDiscard.cardId)}
              width={pileWidth}
              onPress={() => open({ kind: 'discard' })}
            />
          ) : (
            <EmptySlot width={pileWidth} label="Discard" />
          )}
          <Text style={styles.pileLabel}>Discard · {table.discard.length}</Text>
        </View>
      </View>

      {/* Play area */}
      <ScrollView style={styles.playArea} contentContainerStyle={styles.playAreaContent}>
        {table.table.length ? (
          table.table.map((inst) => renderCard(inst, tableCardWidth))
        ) : (
          <Text style={styles.hint}>Tap a card in your hand to play it here.</Text>
        )}
      </ScrollView>

      {/* Hand */}
      <View style={[styles.hand, { paddingBottom: insets.bottom + 8 }]}>
        <Text style={styles.handLabel}>Hand · {table.hand.length}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.handCards}>
          {table.hand.length ? (
            table.hand.map((inst) => renderCard(inst, handWidth))
          ) : (
            <EmptySlot width={handWidth} label="Tap the deck to draw" />
          )}
        </ScrollView>
      </View>

      {toast ? (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <ActionSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} {...sheetProps} />

      <SearchModal
        zone={searchZone}
        deck={deck}
        table={table}
        apply={apply}
        moveActions={moveActions}
        onClose={() => setSearchZone(null)}
      />
    </View>
  );
}

/** Full-screen browser for every card in the deck or discard pile, top card first. */
function SearchModal({
  zone,
  deck,
  table,
  apply,
  moveActions,
  onClose,
}: {
  zone: Zone | null;
  deck: Deck;
  table: TableState;
  apply: (fn: (t: TableState) => TableState, msg?: string) => void;
  moveActions: (iid: string, from: Zone) => SheetAction[];
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const cards = zone ? table[zone] : [];
  const cardsById = new Map(deck.cards.map((c) => [c.id, c]));
  const columns = 4;
  const cardWidth = (width - 16 * 2 - 8 * (columns - 1)) / columns;
  const selectedCard = selected ? cards.find((c) => c.iid === selected) : undefined;

  return (
    <Modal visible={zone !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.searchScreen, { paddingTop: insets.top + 8 }]}>
        <View style={styles.searchHeader}>
          <Text style={styles.searchTitle}>
            {zone === 'deck' ? 'Deck' : 'Discard pile'} · {cards.length}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.headerButton}>Done</Text>
          </Pressable>
        </View>
        <Text style={styles.searchHint}>Top card first. Tap a card to move it.</Text>
        <FlatList
          data={cards}
          keyExtractor={(c) => c.iid}
          numColumns={columns}
          columnWrapperStyle={{ gap: 8 }}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          ListEmptyComponent={<Text style={styles.hint}>No cards here.</Text>}
          renderItem={({ item, index }) => (
            <View>
              <CardView
                deck={deck}
                card={cardsById.get(item.cardId)}
                width={cardWidth}
                onPress={() => {
                  setSelected(item.iid);
                  setSheetOpen(true);
                }}
              />
              <Text style={styles.searchIndex}>{index + 1}</Text>
            </View>
          )}
        />
        {zone === 'deck' ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 12 }}>
            <Button
              label="Shuffle & close"
              variant="primary"
              onPress={() => {
                apply((t) => T.shuffleZone(t, 'deck'), 'Shuffled');
                onClose();
              }}
            />
          </View>
        ) : null}
      </View>

      {/* Rendered inside the search modal so iOS can present it on top. */}
      <ActionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={selectedCard ? cardsById.get(selectedCard.cardId)?.name : undefined}
        header={
          selectedCard ? (
            <View style={{ alignItems: 'center', marginBottom: 6 }}>
              <CardView deck={deck} card={cardsById.get(selectedCard.cardId)} width={Math.min(240, width * 0.6)} />
            </View>
          ) : null
        }
        actions={selectedCard && zone ? moveActions(selectedCard.iid, zone) : []}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  felt: { flex: 1, backgroundColor: colors.felt },
  center: { alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.textMuted },
  headerButton: { color: colors.accent, fontSize: 17, fontWeight: '600' },
  banner: { backgroundColor: colors.accent, paddingVertical: 8, paddingHorizontal: 12 },
  bannerText: { color: colors.accentText, textAlign: 'center', fontWeight: '600' },
  piles: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: colors.feltDark,
  },
  pile: { alignItems: 'center', gap: 6 },
  pileLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
  pileButtons: { flex: 1, gap: 8, paddingHorizontal: 12, justifyContent: 'center' },
  playArea: { flex: 1 },
  playAreaContent: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16, flexGrow: 1 },
  hint: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', width: '100%', marginTop: 24 },
  hand: { backgroundColor: 'rgba(0,0,0,0.35)', paddingTop: 8 },
  handLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', paddingHorizontal: 16, marginBottom: 6 },
  handCards: { paddingHorizontal: 16, gap: 8 },
  toast: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  toastText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  searchScreen: { flex: 1, backgroundColor: colors.bg },
  searchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  searchTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  searchHint: { color: colors.textMuted, paddingHorizontal: 16, marginTop: 4 },
  searchIndex: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 2 },
});
