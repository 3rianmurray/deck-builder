import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '../../components/ActionSheet';
import { Button } from '../../components/Button';
import { CardSizePicker } from '../../components/CardSizePicker';
import { CardView } from '../../components/CardView';
import { CropModal } from '../../components/CropModal';
import { ReorderableGrid } from '../../components/ReorderableGrid';
import { SpriteSheetModal } from '../../components/SpriteSheetModal';
import { useDecks } from '../../lib/DecksContext';
import { shareDecks } from '../../lib/deckExport';
import { deleteDeckWarning } from '../../lib/deckInUse';
import { sampleBack, sampleCards } from '../../lib/sampleDeck';
import { cropToShape } from '../../lib/images';
import { imageUri } from '../../lib/storage';
import { tourEvent } from '../../lib/tour';
import { cardRatio, copiesOf, deckSize } from '../../lib/types';
import type { Card, CardShape } from '../../lib/types';
import { colors } from '../../theme';
import { MAX_TEXT_SCALE, Text } from '../../components/Text';
import { TourSpot } from '../../components/TourSpot';

const COLUMNS = 3;
const GAP = 10;
const PADDING = 16;

/** What a picked picture is for: new cards, or the deck's card back. */
type ArtTarget = 'cards' | 'back';

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

/** Picks images from the Files app (iCloud Drive and other storage apps), copied somewhere the app can read them. */
async function pickFiles(multiple: boolean): Promise<string[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', multiple, copyToCacheDirectory: true });
  return result.canceled ? [] : result.assets.map((a) => a.uri);
}

/** Returns the photo's uri, or null if the user cancelled or denied camera access. */
async function takePhoto(): Promise<string | null> {
  const { granted } = await ImagePicker.requestCameraPermissionsAsync();
  if (!granted) {
    Alert.alert('Camera access needed', 'Allow camera access for Shufflevale in Settings to photograph cards.');
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
  /**
   * The open picture menu: where new card art (`cards`) or the card back (`back`) comes from, or, after
   * choosing a sprite sheet, where that sheet comes from (`sheet-…`).
   */
  const [menu, setMenu] = useState<ArtTarget | `sheet-${ArtTarget}` | null>(null);
  /** Images waiting in the cropper, and what they become once cropped. */
  const [crop, setCrop] = useState<{ uris: string[]; target: ArtTarget | { cardId: string } } | null>(null);
  /** A sprite sheet being cut into cards, or picked from for the card back. */
  const [spriteSheet, setSpriteSheet] = useState<{ uri: string; target: ArtTarget } | null>(null);

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

  // Art for new cards (several at once from Photos or Files) or the card back (one). Everything goes through
  // the cropper, except sprite sheets, which have their own screen.
  const fromCamera = (target: ArtTarget) =>
    withBusy(async () => {
      const uri = await takePhoto();
      if (uri) setCrop({ uris: [uri], target });
    });
  const fromPhotos = (target: ArtTarget) =>
    withBusy(async () => {
      const uris = await pickImages(target === 'cards');
      if (uris.length) setCrop({ uris, target });
    });
  const fromFiles = (target: ArtTarget) =>
    withBusy(async () => {
      const uris = await pickFiles(target === 'cards');
      if (uris.length) setCrop({ uris, target });
    });
  // The app's own sample art: no cropping needed, as it's already card shaped.
  const fromSamples = (target: ArtTarget) =>
    withBusy(async () => {
      if (target === 'back') {
        const back = await sampleBack();
        decks.setCardBack(deck.id, back, back);
        tourEvent('back-set');
      } else {
        const { uris, names } = await sampleCards();
        decks.addCards(deck.id, uris, names);
        tourEvent('cards-added');
      }
    });
  const sheetFrom = (target: ArtTarget, source: 'photos' | 'files') =>
    withBusy(async () => {
      const [uri] = source === 'photos' ? await pickImages(false) : await pickFiles(false);
      if (uri) setSpriteSheet({ uri, target });
    });

  // The pickers are system screens, which iOS can only show once this menu has gone (hence opensModal).
  const sourceActions = (target: ArtTarget) => [
    { label: 'Take photo', opensModal: true, onPress: () => fromCamera(target) },
    { label: 'Choose from Photos', opensModal: true, onPress: () => fromPhotos(target) },
    { label: 'Choose from Files', opensModal: true, onPress: () => fromFiles(target) },
    // A sprite sheet is a way of using a picture, not a place it comes from: so ask where it is next.
    {
      label: target === 'cards' ? 'Import sprite sheet…' : 'From a sprite sheet…',
      onPress: () => setMenu(`sheet-${target}`),
    },
    { label: target === 'cards' ? 'Sample cards' : 'Sample back', onPress: () => fromSamples(target) },
  ];
  /** Opens the art menu for new cards or the back (and tells the walkthrough, which may be waiting for it). */
  const openArtMenu = (target: ArtTarget) => {
    setMenu(target);
    tourEvent(target === 'cards' ? 'add-cards-menu' : 'back-menu');
  };
  const sheetSourceActions = (target: ArtTarget) => [
    { label: 'From Photos', opensModal: true, onPress: () => sheetFrom(target, 'photos') },
    { label: 'From Files', opensModal: true, onPress: () => sheetFrom(target, 'files') },
  ];
  const menuProps =
    menu === 'cards'
      ? { title: 'Add cards', actions: sourceActions('cards') }
      : menu === 'back'
        ? { title: 'Card back', actions: sourceActions('back') }
        : menu === 'sheet-cards'
          ? { title: 'Sprite sheet from…', actions: sheetSourceActions('cards') }
          : menu === 'sheet-back'
            ? { title: 'Sprite sheet from…', actions: sheetSourceActions('back') }
            : { actions: [] };

  /** The picture the back is cut from: the uncropped original where it's kept, else the back as it is. */
  const backSource = deck.backOriginal ? imageUri(deck.backOriginal) : deck.backImage ? imageUri(deck.backImage) : null;

  // A new card size: the back is cut again from its original to fit (so a landscape photo shows whole on
  // landscape cards, rather than the middle of a portrait crop of it). Backs set before originals were kept
  // just show trimmed, as before.
  const changeShape = (shape: CardShape) => {
    const before = cardRatio(deck);
    decks.setCardShape(deck.id, shape);
    const after = cardRatio({ cardShape: shape });
    const original = deck.backOriginal;
    if (!original || Math.abs(after - before) < 0.001) return;
    withBusy(async () => decks.setCardBack(deck.id, await cropToShape(imageUri(original), after)));
  };

  const saveCropped = (uris: string[]) => {
    const target = crop?.target;
    // A back keeps the picture it was cut from, to cut again if the card size changes; cutting the kept one
    // again (tapping the back) keeps it as it is.
    if (target === 'back') decks.setCardBack(deck.id, uris[0], crop?.uris[0] === backSource ? undefined : crop?.uris[0]);
    else if (typeof target === 'object') decks.replaceCardImage(deck.id, target.cardId, uris[0]);
    else decks.addCards(deck.id, uris);
    setCrop(null);
  };

  const shareDeck = () => withBusy(() => shareDecks([deck]));

  const confirmDelete = () =>
    Alert.alert(`Delete "${deck.name}"?`, deleteDeckWarning(deck.id, decks.sessions), [
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
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
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
            <CardSizePicker shape={deck.cardShape ?? { kind: 'standard' }} onChange={changeShape} />
            {deck.cards.length > 0 ? (
              <Text style={[styles.muted, { fontSize: 13 }]}>
                Cards already in the deck are trimmed to fit a new size. New images are cropped to it.
              </Text>
            ) : null}

            <View style={[styles.backRow, { marginTop: 12 }]}>
              {/* Once it has a picture, tapping it goes back to cropping that; until then, to choosing one. */}
              <CardView
                deck={deck}
                faceUp={false}
                width={64}
                onPress={() => (backSource ? setCrop({ uris: [backSource], target: 'back' }) : openArtMenu('back'))}
              />
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={styles.label}>Card back</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TourSpot id="deck.back">
                    <Button label="Choose image" onPress={() => openArtMenu('back')} disabled={busy} />
                  </TourSpot>
                  {deck.backImage ? <Button label="Reset" onPress={() => decks.setCardBack(deck.id, null)} /> : null}
                </View>
              </View>
            </View>

            <View style={styles.cardsHeader}>
              <Text style={styles.sectionTitle}>
                Cards <Text style={styles.muted}>({deckSize(deck)})</Text>
              </Text>
              <TourSpot id="deck.addCards">
                <Button label="+ Add cards" variant="primary" onPress={() => openArtMenu('cards')} disabled={busy} />
              </TourSpot>
            </View>
            {deck.cards.length === 0 ? (
              <Text style={[styles.muted, { marginTop: 8 }]}>
                Take a photo, pick images from Photos or Files, or cut up a sprite sheet to make cards. Tap a card to rename it, set how many copies are in the deck, or remove it.
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
          <View style={{ marginTop: 24, gap: 10, paddingBottom: insets.bottom + 90 }}>
            {/* To keep a copy somewhere safe, move it to another phone, or give it to a friend. */}
            <Button label="Share or back up this deck…" onPress={shareDeck} disabled={busy || deck.cards.length === 0} />
            <Button label="Delete deck" variant="danger" onPress={confirmDelete} />
          </View>
        }
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TourSpot id="deck.play">
          <Button
            label={deck.cards.length ? 'Play with this deck' : 'Add cards to play'}
            variant="primary"
            disabled={deck.cards.length === 0}
            onPress={() => {
              router.push({ pathname: '/play/[id]', params: { id: deck.id } });
              tourEvent('table-opened');
            }}
          />
        </TourSpot>
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
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
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

      <ActionSheet visible={menu !== null} {...menuProps} onClose={() => setMenu(null)} />

      <CropModal uris={crop?.uris ?? []} ratio={cardRatio(deck)} onDone={saveCropped} onCancel={() => setCrop(null)} />

      <SpriteSheetModal
        uri={spriteSheet?.uri ?? null}
        pickOne={spriteSheet?.target === 'back'}
        cardRatio={cardRatio(deck)}
        onDone={(uris) => {
          if (spriteSheet?.target === 'back') decks.setCardBack(deck.id, uris[0], uris[0]);
          else decks.addCards(deck.id, uris);
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
