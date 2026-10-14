import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '../../components/ActionSheet';
import { Button } from '../../components/Button';
import { CardSizePicker } from '../../components/CardSizePicker';
import { CardView } from '../../components/CardView';
import { CropModal } from '../../components/CropModal';
import { ReorderableGrid } from '../../components/ReorderableGrid';
import { SpriteSheetModal } from '../../components/SpriteSheetModal';
import { useDecks } from '../../lib/DecksContext';
import { imageUri } from '../../lib/storage';
import { cardRatio, copiesOf, deckSize } from '../../lib/types';
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
    // Full quality here; the cropper compresses once when it saves.
    quality: 1,
  });
  return result.canceled ? [] : result.assets.map((a) => a.uri);
}

/** Returns the photo's uri, or null if the user cancelled or denied camera access. */
async function takePhoto(): Promise<string | null> {
  const { granted } = await ImagePicker.requestCameraPermissionsAsync();
  if (!granted) {
    Alert.alert('Camera access needed', 'Allow camera access for Card Table in Settings to photograph cards.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  return result.canceled ? null : result.assets[0].uri;
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
  const [copiesDraft, setCopiesDraft] = useState('1');
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  /** Images waiting in the cropper, and what they become once cropped. */
  const [crop, setCrop] = useState<{ uris: string[]; target: 'cards' | 'back' | { cardId: string } } | null>(null);
  const [spriteSheet, setSpriteSheet] = useState<string | null>(null);

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
      if (uris.length) setCrop({ uris, target: 'cards' });
    });

  const addCardFromCamera = () =>
    withBusy(async () => {
      const uri = await takePhoto();
      if (uri) setCrop({ uris: [uri], target: 'cards' });
    });

  const saveCropped = (uris: string[]) => {
    const target = crop?.target;
    if (target === 'back') decks.setCardBack(deck.id, uris[0]);
    else if (typeof target === 'object') decks.replaceCardImage(deck.id, target.cardId, uris[0]);
    else decks.addCards(deck.id, uris);
    setCrop(null);
  };

  const importSpriteSheet = () =>
    withBusy(async () => {
      const [uri] = await pickImages(false);
      if (uri) setSpriteSheet(uri);
    });

  // Each opens a system picker, which iOS can only present after this sheet has dismissed.
  const addActions = [
    { label: 'Take photo', opensModal: true, onPress: addCardFromCamera },
    { label: 'Choose from Photos', opensModal: true, onPress: addCards },
    { label: 'Import sprite sheet', opensModal: true, onPress: importSpriteSheet },
  ];

  const chooseBack = () =>
    withBusy(async () => {
      const [uri] = await pickImages(false);
      if (uri) setCrop({ uris: [uri], target: 'back' });
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
        {
          label: 'Rotate or re-crop art',
          opensModal: true,
          onPress: () => setCrop({ uris: [imageUri(selected.image)], target: { cardId: selected.id } }),
        },
        { label: 'Remove from deck', destructive: true, onPress: () => decks.removeCard(deck.id, selected.id) },
      ]
    : [];

  // Saved as soon as the field holds a valid number, so closing the sheet never loses an edit.
  const changeCopies = (text: string) => {
    const digits = text.replace(/\D/g, '');
    setCopiesDraft(digits);
    const n = parseInt(digits, 10);
    if (selected && n >= 1) decks.setCopies(deck.id, selected.id, n);
  };

  const resetCopiesDraft = () => {
    const live = deck.cards.find((c) => c.id === selected?.id);
    if (live) setCopiesDraft(String(copiesOf(live)));
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: deck.name }} />
      <ReorderableGrid
        items={deck.cards}
        keyOf={(c) => c.id}
        columns={COLUMNS}
        itemWidth={cardWidth}
        gap={GAP}
        padding={PADDING}
        bottomInset={insets.bottom + 72}
        onMove={(picked, to) => decks.reorderCards(deck.id, picked, to)}
        onPress={(item) => {
          setSelected(item);
          setCopiesDraft(String(copiesOf(item)));
          setSheetOpen(true);
        }}
        renderLifted={(item) => <CardView deck={deck} card={item} width={cardWidth} />}
        header={
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

            <Text style={styles.label}>Card size</Text>
            <CardSizePicker shape={deck.cardShape ?? { kind: 'standard' }} onChange={(s) => decks.setCardShape(deck.id, s)} />
            {deck.cards.length > 0 ? (
              <Text style={[styles.muted, { fontSize: 13 }]}>
                Cards already in the deck are trimmed to fit a new size. New images are cropped to it.
              </Text>
            ) : null}

            <View style={[styles.backRow, { marginTop: 12 }]}>
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
                Cards <Text style={styles.muted}>({deckSize(deck)})</Text>
              </Text>
              <Button label="+ Add cards" variant="primary" onPress={() => setAddSheetOpen(true)} disabled={busy} />
            </View>
            {deck.cards.length === 0 ? (
              <Text style={[styles.muted, { marginTop: 8 }]}>
                Take a photo or pick images from Photos to turn them into cards. Tap a card to rename it, set how many copies are in the deck, or remove it.
              </Text>
            ) : (
              <Text style={[styles.muted, { fontSize: 13 }]}>
                Hold a card and drag it to reorder. The first card is the top of the deck.
              </Text>
            )}
          </View>
        }
        renderItem={(item) => (
          <View>
            <CardView deck={deck} card={item} width={cardWidth} />
            {copiesOf(item) > 1 ? (
              <View style={styles.copiesBadge}>
                <Text style={styles.copiesBadgeText}>×{copiesOf(item)}</Text>
              </View>
            ) : null}
            <Text style={styles.cardName} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
        )}
        footer={
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
              <View style={styles.copiesRow}>
                <Text style={styles.copiesLabel}>Copies in deck</Text>
                <TextInput
                  value={copiesDraft}
                  onChangeText={changeCopies}
                  onBlur={resetCopiesDraft}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  maxLength={3}
                  selectTextOnFocus
                  style={styles.copiesInput}
                  accessibilityLabel="Copies in deck"
                />
              </View>
            </View>
          ) : null
        }
        actions={cardActions}
        onClose={() => setSheetOpen(false)}
      />

      <ActionSheet
        visible={addSheetOpen}
        title="Add cards"
        actions={addActions}
        onClose={() => setAddSheetOpen(false)}
      />

      <CropModal uris={crop?.uris ?? []} ratio={cardRatio(deck)} onDone={saveCropped} onCancel={() => setCrop(null)} />

      <SpriteSheetModal
        uri={spriteSheet}
        onDone={(uris) => {
          decks.addCards(deck.id, uris);
          setSpriteSheet(null);
        }}
        onCancel={() => setSpriteSheet(null)}
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
  copiesBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  copiesBadgeText: { color: colors.accentText, fontSize: 12, fontWeight: '700' },
  copiesRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  copiesLabel: { color: colors.text, fontSize: 16 },
  copiesInput: {
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    minWidth: 64,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
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
