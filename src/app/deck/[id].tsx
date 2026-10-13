import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '../../components/ActionSheet';
import { Button } from '../../components/Button';
import { CardView } from '../../components/CardView';
import { useDecks } from '../../lib/DecksContext';
import type { Card } from '../../lib/types';
import { colors } from '../../theme';

const COLUMNS = 3;
const GAP = 10;
const PADDING = 16;

async function pickImages(multiple: boolean): Promise<string[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: multiple,
    selectionLimit: multiple ? 0 : 1,
    quality: 0.85,
  });
  return result.canceled ? [] : result.assets.map((a) => a.uri);
}

export default function DeckEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const decks = useDecks();
  const deck = decks.getDeck(id);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Card | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!deck) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>This deck no longer exists.</Text>
      </View>
    );
  }

  const cardWidth = (width - PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Something went wrong', String(e));
    } finally {
      setBusy(false);
    }
  };

  const addCards = () =>
    withBusy(async () => {
      const uris = await pickImages(true);
      if (uris.length) decks.addCards(deck.id, uris);
    });

  const chooseBack = () =>
    withBusy(async () => {
      const [uri] = await pickImages(false);
      if (uri) decks.setCardBack(deck.id, uri);
    });

  const confirmDelete = () =>
    Alert.alert(`Delete "${deck.name}"?`, 'This removes the deck and all of its card images from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          router.back();
          decks.deleteDeck(deck.id);
        },
      },
    ]);

  const renameCard = (card: Card) => {
    if (Platform.OS !== 'ios') return;
    Alert.prompt('Rename card', undefined, (name) => name.trim() && decks.renameCard(deck.id, card.id, name.trim()), 'plain-text', card.name);
  };

  const cardActions = selected
    ? [
        ...(Platform.OS === 'ios' ? [{ label: 'Rename', opensModal: true, onPress: () => renameCard(selected) }] : []),
        { label: 'Add another copy', onPress: () => decks.duplicateCard(deck.id, selected.id) },
        { label: 'Remove from deck', destructive: true, onPress: () => decks.removeCard(deck.id, selected.id) },
      ]
    : [];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: deck.name }} />
      <FlatList
        data={deck.cards}
        keyExtractor={(c) => c.id}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ padding: PADDING, gap: GAP }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.label}>Deck name</Text>
            <TextInput
              defaultValue={deck.name}
              onEndEditing={(e) => {
                const name = e.nativeEvent.text.trim();
                if (name && name !== deck.name) decks.renameDeck(deck.id, name);
              }}
              style={styles.input}
              placeholder="Deck name"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
            />

            <View style={styles.backRow}>
              <CardView deck={deck} faceUp={false} width={64} onPress={chooseBack} />
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={styles.label}>Card back</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button label="Choose image" onPress={chooseBack} />
                  {deck.backImage ? <Button label="Reset" onPress={() => decks.setCardBack(deck.id, null)} /> : null}
                </View>
              </View>
            </View>

            <View style={styles.cardsHeader}>
              <Text style={styles.sectionTitle}>
                Cards <Text style={styles.muted}>({deck.cards.length})</Text>
              </Text>
              <Button label="+ Add from Photos" variant="primary" onPress={addCards} disabled={busy} />
            </View>
            {deck.cards.length === 0 ? (
              <Text style={[styles.muted, { marginTop: 8 }]}>
                Pick one or more images to turn them into cards. Tap a card to rename it, add copies, or remove it.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ width: cardWidth }}>
            <CardView
              deck={deck}
              card={item}
              width={cardWidth}
              onPress={() => {
                setSelected(item);
                setSheetOpen(true);
              }}
            />
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
        )}
        ListFooterComponent={
          <View style={{ marginTop: 24, paddingBottom: insets.bottom + 90 }}>
            <Button label="Delete deck" variant="danger" onPress={confirmDelete} />
          </View>
        }
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          label={deck.cards.length ? 'Play with this deck' : 'Add cards to play'}
          variant="primary"
          disabled={deck.cards.length === 0}
          onPress={() => router.push({ pathname: '/play/[id]', params: { id: deck.id } })}
        />
      </View>

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : null}

      <ActionSheet
        visible={sheetOpen}
        title={selected?.name}
        header={
          selected ? (
            <View style={{ alignItems: 'center', marginBottom: 6 }}>
              <CardView deck={deck} card={selected} width={Math.min(200, width * 0.5)} />
            </View>
          ) : null
        }
        actions={cardActions}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  header: { gap: 8, marginBottom: 4 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 17,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  cardsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 14, fontWeight: '400' },
  cardName: { color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  busy: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
});
