import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '../../components/ActionSheet';
import { Button } from '../../components/Button';
import { CardSizePicker } from '../../components/CardSizePicker';
import { CardView } from '../../components/CardView';
import { CardScanModal } from '../../components/CardScanModal';
import { CropModal } from '../../components/CropModal';
import { ReorderableGrid } from '../../components/ReorderableGrid';
import { SpriteSheetModal } from '../../components/SpriteSheetModal';
import { useDecks } from '../../lib/DecksContext';
import { askName, MAX_NAME_LENGTH, titleCase } from '../../lib/names';
import { appleScannerAvailable, fitScan, scanCards } from '../../lib/appleScanner';
import { backUpWithNotice, shareWithNotice } from '../../lib/fileActions';
import { deleteDeckWarning } from '../../lib/deckInUse';
import { cardRoom, FREE_CARD_LIMIT } from '../../lib/limits';
import { exampleAllowances, usePro } from '../../lib/pro';
import { sandboxes } from '../../lib/sandboxStore';
import * as haptics from '../../lib/haptics';
import { sampleBack, sampleCards } from '../../lib/sampleDeck';
import { cropToShape, loadUpright, smallPixels } from '../../lib/images';
import { guessSheet } from '../../lib/sheetGuess';
import { imageUri } from '../../lib/storage';
import { offerTipAfterUses, offerTipSoon } from '../../lib/tips';
import { tourEvent, useTourStep } from '../../lib/tour';
import { cardRatio, copiesOf, deckSize, detectShape } from '../../lib/types';
import type { Card, CardShape } from '../../lib/types';
import { colors } from '../../theme';
import { MAX_TEXT_SCALE, Text } from '../../components/Text';
import { TourSpot } from '../../components/TourSpot';

/** The deck's grid: at least 3 columns (every iPhone), and more on wider screens (an iPad), about this wide each. */
const MIN_COLUMNS = 3;
const COLUMN_WIDTH = 150;
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
    // The picture as it is, not converted: a PNG stays a PNG, so its see-through parts can be kept.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });
  return result.canceled ? [] : result.assets.map((a) => a.uri);
}

/** Picks images from the Files app (iCloud Drive and other storage apps), copied somewhere the app can read them. */
async function pickFiles(multiple: boolean): Promise<string[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', multiple, copyToCacheDirectory: true });
  return result.canceled ? [] : result.assets.map((a) => a.uri);
}

/** Returns the photo's uri, or null if the user canceled or denied camera access. */
async function takePhoto(): Promise<string | null> {
  const { granted } = await ImagePicker.requestCameraPermissionsAsync();
  if (!granted) {
    Alert.alert('Camera access needed', 'Allow camera access for Shufflevale in Settings to photograph cards.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  return result.canceled ? null : result.assets[0].uri;
}

/** Whether a picture looks like a grid of cards: one the sheet finder finds two or more cards in, clearly. */
async function looksLikeSheet(uri: string, ratio: number): Promise<boolean> {
  try {
    const img = await loadUpright(uri);
    const found = guessSheet(await smallPixels(img.uri, img.width), ratio);
    return found.confidence === 'high' && found.rows * found.columns >= 2;
  } catch {
    return false;
  }
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
  /** The deck's own menu (•••, top right): share or delete it. */
  const [deckMenuOpen, setDeckMenuOpen] = useState(false);
  const [copiesDraft, setCopiesDraft] = useState('1');
  /**
   * The open picture menu: where new card art (`cards`) or the card back (`back`) comes from, or, after
   * choosing a sprite sheet, where that sheet comes from (`sheet-…`).
   */
  const [menu, setMenu] = useState<ArtTarget | `sheet-${ArtTarget}` | null>(null);
  /** The walkthrough, if it's running: only then are the sample pictures offered. */
  const tour = useTourStep();
  // A tip, the first time a deck has a few cards: reordering them.
  const reorderable = (decks.getDeck(id)?.cards.length ?? 0) > 1;
  useEffect(() => (reorderable ? offerTipSoon('deck-hold-reorder') : undefined), [reorderable]);
  /** The deck's name as it's being typed (in title case), until it's done. */
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  /** The card being given its own back (a two-sided card), while its back's picture is chosen; else the deck's. */
  const [backFor, setBackFor] = useState<string | null>(null);
  /** The deck settings panel is open: at first only for a deck with no cards yet. */
  const [settingsOpen, setSettingsOpen] = useState(() => !decks.getDeck(id)?.cards.length);
  /** Choosing cards, e.g. to delete several at once: tapping a card ticks it rather than opening it. */
  const [choosing, setChoosing] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  /** Images waiting in the cropper, and what they become once cropped. */
  const [crop, setCrop] = useState<{ uris: string[]; target: ArtTarget | { cardId: string } } | null>(null);
  /** A photo of a card being found and straightened, and what it's for. */
  const [scan, setScan] = useState<{ uri: string; target: ArtTarget } | null>(null);
  /** Cropping by hand instead, once the scan screen has gone (iOS shows one full-screen view at a time). */
  const [cropNext, setCropNext] = useState<{ uris: string[]; target: ArtTarget } | null>(null);
  /** A sprite sheet being cut into cards, or picked from for the card back. */
  const [spriteSheet, setSpriteSheet] = useState<{ uri: string; target: ArtTarget } | null>(null);
  const pro = usePro();
  /** How many more cards fit in the free version (unlimited with Pro). */
  const room = cardRoom(decks.decks, exampleAllowances(), pro);

  if (!deck) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>This deck no longer exists.</Text>
      </View>
    );
  }

  const columns = Math.max(MIN_COLUMNS, Math.floor((width - PADDING * 2) / COLUMN_WIDTH));
  const cardWidth = (width - PADDING * 2 - GAP * (columns - 1)) / columns;

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

  /** Opens Shufflevale Pro (once a menu or picker has gone), saying why. */
  const openPro = (reason: 'cards' | 'files') => router.push({ pathname: '/pro', params: { reason } });

  /**
   * New cards: as many as the free version has room for (all of them with Pro). Past that, says how many were
   * added and offers Pro; nothing already added is lost.
   */
  const addNewCards = (uris: string[], originals: string[], names?: string[]) => {
    const fit = Math.min(uris.length, room);
    if (fit > 0) decks.addCards(deck.id, uris.slice(0, fit), names?.slice(0, fit), originals.slice(0, fit));
    if (fit < uris.length) {
      Alert.alert(
        fit ? `Added ${fit} of ${uris.length} cards` : 'You’ve reached the free limit',
        `The free version holds ${FREE_CARD_LIMIT} cards. Shufflevale Pro removes the limit.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'See Pro', onPress: () => openPro('cards') },
        ],
      );
    }
  };

  // Art for new cards (several at once from Photos or Files) or the card back (one). Everything goes through
  // the cropper, except sprite sheets, which have their own screen.
  const fromCamera = (target: ArtTarget) =>
    withBusy(async () => {
      // Apple's scanner, where the app has it: it finds and straightens each card itself, several in a row,
      // and they're fitted to the deck's card size. (Just the first, for the back.)
      if (appleScannerAvailable()) {
        const scans = await scanCards();
        if (!scans.length) return;
        const ratio = await settleAuto(scans[0]);
        if (target === 'back') {
          const back = await fitScan(scans[0], ratio);
          setBack(back, back);
        } else {
          const cards = await Promise.all(scans.map((s) => fitScan(s, ratio)));
          addNewCards(cards, cards);
        }
        return;
      }
      const uri = await takePhoto();
      // The card is found in the photo and straightened (or cropped by hand, if the player prefers).
      if (uri) setScan({ uri, target });
    });
  const fromPhotos = (target: ArtTarget) =>
    withBusy(async () => {
      const uris = await pickImages(target === 'cards');
      if (uris.length) await cropOrCut(uris, target);
    });
  const fromFiles = (target: ArtTarget) =>
    withBusy(async () => {
      const uris = await pickFiles(target === 'cards');
      if (uris.length) await cropOrCut(uris, target);
    });
  // One picture that looks like a sprite sheet (a grid of cards): asked whether to cut it up as one, rather than
  // crop it as a single card.
  const cropOrCut = async (uris: string[], target: ArtTarget) => {
    // To crop: an automatic card size is worked out from the first picture first, so the frame fits it.
    const crop = async () => {
      await settleAuto(uris[0]);
      setCrop({ uris, target });
    };
    if (uris.length !== 1 || !(await looksLikeSheet(uris[0], cardRatio(deck)))) return crop();
    Alert.alert(
      'This looks like a sprite sheet',
      target === 'cards' ? 'Import it as a sprite sheet, cut into cards?' : 'Choose the back from it as a sprite sheet?',
      [
        { text: 'No', style: 'cancel', onPress: () => withBusy(crop) },
        { text: 'Yes', onPress: () => setSpriteSheet({ uri: uris[0], target }) },
      ],
    );
  };

  /**
   * Works out an automatic card size (one not yet worked out) from a picture of a card, the deck's first art,
   * cutting anything already cut to fit it again. Gives the deck's card shape (width / height) from then on.
   */
  const settleAuto = async (uri: string): Promise<number> => {
    if (deck.cardShape?.kind !== 'auto' || deck.cardShape.detected) return cardRatio(deck);
    const img = await loadUpright(uri);
    const shape: CardShape = { kind: 'auto', detected: detectShape(img.width / img.height) };
    changeShape(shape);
    return cardRatio({ cardShape: shape });
  };

  // The app's own sample art: no cropping needed, as it's already card shaped.
  const fromSamples = (target: ArtTarget) =>
    withBusy(async () => {
      if (target === 'back') {
        const back = await sampleBack();
        await settleAuto(back);
        setBack(back, back);
        tourEvent('back-set');
      } else {
        const { uris, names } = await sampleCards();
        await settleAuto(uris[0]);
        // Already card shaped; each is its own original.
        decks.addCards(deck.id, uris, names, uris);
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
    {
      // With Apple's scanner, it scans (several cards in a row, for new cards); otherwise a plain photo.
      label: appleScannerAvailable() ? (target === 'cards' ? 'Scan cards' : 'Scan card back') : 'Take photo',
      opensModal: true,
      onPress: () => fromCamera(target),
    },
    { label: 'Choose from Photos', opensModal: true, onPress: () => fromPhotos(target) },
    { label: 'Choose from Files', opensModal: true, onPress: () => fromFiles(target) },
    // A sprite sheet is a way of using a picture, not a place it comes from: so ask where it is next.
    {
      label: target === 'cards' ? 'Import Sprite Sheet' : 'From a Sprite Sheet',
      onPress: () => setMenu(`sheet-${target}`),
    },
    // The app's own art, just for the walkthrough.
    ...(tour ? [{ label: target === 'cards' ? 'Sample cards' : 'Sample back', onPress: () => fromSamples(target) }] : []),
  ];
  /** A new back: the card's own, if one's being given one (see `backFor`), else the deck's. */
  const setBack = (uri: string, original: string) => {
    if (backFor) decks.setOwnBack(deck.id, backFor, uri, original);
    else decks.setCardBack(deck.id, uri, original);
  };
  const openDeckBackMenu = () => {
    setBackFor(null);
    openArtMenu('back');
  };
  /** Opens the art menu for new cards or the back (and tells the walkthrough, which may be waiting for it). */
  const openArtMenu = (target: ArtTarget) => {
    // No room for more cards in the free version: Pro instead (the walkthrough's sample cards are always allowed).
    if (target === 'cards' && room <= 0 && !tour) {
      openPro('cards');
      return;
    }
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
        ? { title: backFor ? 'This card’s back' : 'Card back', actions: sourceActions('back') }
        : menu === 'sheet-cards'
          ? { title: 'Sprite sheet from…', actions: sheetSourceActions('cards') }
          : menu === 'sheet-back'
            ? { title: 'Sprite sheet from…', actions: sheetSourceActions('back') }
            : { actions: [] };

  /** The picture the back is cut from: the uncropped original where it's kept, else the back as it is. */
  const backSource = deck.backOriginal ? imageUri(deck.backOriginal) : deck.backImage ? imageUri(deck.backImage) : null;

  // A new card size: everything kept with its original is cut again from it to fit (so a landscape photo
  // shows whole on landscape cards, rather than the middle of a portrait crop of it). Cards and backs added
  // before originals were kept just show trimmed, as before.
  const changeShape = (shape: CardShape) => {
    // Auto, chosen for a deck that has art already: worked out from that.
    const art = deck.cards[0]?.original ?? deck.cards[0]?.image ?? deck.backOriginal ?? deck.backImage;
    if (shape.kind === 'auto' && !shape.detected && art) {
      withBusy(async () => {
        const img = await loadUpright(imageUri(art));
        changeShape({ kind: 'auto', detected: detectShape(img.width / img.height) });
      });
      return;
    }
    const before = cardRatio(deck);
    decks.setCardShape(deck.id, shape);
    const after = cardRatio({ cardShape: shape });
    const back = deck.backOriginal;
    const cards = deck.cards.flatMap((c) => (c.original ? [{ id: c.id, original: c.original }] : []));
    const ownBacks = deck.cards.flatMap((c) => (c.backOriginal ? [{ id: c.id, original: c.backOriginal }] : []));
    if (Math.abs(after - before) < 0.001 || (!back && !cards.length && !ownBacks.length)) return;
    withBusy(async () => {
      if (back) decks.setCardBack(deck.id, await cropToShape(imageUri(back), after));
      for (const c of cards) decks.replaceCardImage(deck.id, c.id, await cropToShape(imageUri(c.original), after));
      for (const c of ownBacks) decks.setOwnBack(deck.id, c.id, await cropToShape(imageUri(c.original), after));
    });
  };

  // Cropped pictures keep what they were cut from (as cropped: turned, if turned), to cut again if the card
  // size changes.
  const saveCropped = (uris: string[], originals: string[]) => {
    const target = crop?.target;
    if (target === 'back') setBack(uris[0], originals[0]);
    else if (typeof target === 'object') decks.replaceCardImage(deck.id, target.cardId, uris[0], originals[0]);
    else addNewCards(uris, originals);
    setCrop(null);
  };

  const confirmDelete = () =>
    Alert.alert(`Delete "${deck.name}"?`, deleteDeckWarning(deck.id, decks.sessions, sandboxes()), [
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
    askName('Rename card', card.name, (name) => decks.renameCard(deck.id, card.id, name));
  };

  const cardActions = selected
    ? [
        ...(Platform.OS === 'ios' ? [{ label: 'Rename', opensModal: true, onPress: () => renameCard(selected) }] : []),
        {
          label: 'Rotate or re-crop art',
          opensModal: true,
          // From the picture it was cut from, where that's kept.
          onPress: () => setCrop({ uris: [imageUri(selected.original ?? selected.image)], target: { cardId: selected.id } }),
        },
        // A card with two different sides: its own back, rather than the deck's.
        {
          label: selected.back ? 'Change its back' : 'Give it its own back',
          opensModal: true,
          onPress: () => {
            setBackFor(selected.id);
            openArtMenu('back');
          },
        },
        ...(selected.back
          ? [{ label: 'Use the deck’s back', onPress: () => decks.setOwnBack(deck.id, selected.id, null) }]
          : []),
        { label: 'Remove from deck', destructive: true, onPress: () => decks.removeCard(deck.id, selected.id) },
      ]
    : [];

  const toggleChosen = (cardId: string) => {
    setChosen((c) => (c.includes(cardId) ? c.filter((id) => id !== cardId) : [...c, cardId]));
    haptics.tick();
  };
  const stopChoosing = () => {
    setChoosing(false);
    setChosen([]);
  };
  const deleteChosen = () => {
    const ids = chosen.filter((id) => deck.cards.some((c) => c.id === id));
    if (!ids.length) return;
    haptics.warn();
    Alert.alert(`Delete ${ids.length} ${ids.length === 1 ? 'card' : 'cards'}?`, 'They’re removed from this deck, art and all.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          decks.removeCards(deck.id, ids);
          stopChoosing();
        },
      },
    ]);
  };

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
      <Stack.Screen
        options={{
          title: deck.name,
          // The deck's own actions (share, delete), out of the way of its cards.
          headerRight: () => (
            <Pressable onPress={() => setDeckMenuOpen(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Deck options">
              <Text style={styles.headerMenu}>•••</Text>
            </Pressable>
          ),
        }}
      />
      <ReorderableGrid
        items={deck.cards}
        keyOf={(c) => c.id}
        columns={columns}
        itemWidth={cardWidth}
        gap={GAP}
        padding={PADDING}
        bottomInset={insets.bottom + 72}
        // Holding a chosen card picks up every chosen card (it first, the rest in deck order), to move them
        // together; they stay chosen. Holding any other card lets the choice go.
        liftWith={(index) => {
          const held = deck.cards[index]?.id;
          if (!held || !chosen.includes(held)) return [index];
          return [index, ...deck.cards.flatMap((c, i) => (i !== index && chosen.includes(c.id) ? [i] : []))];
        }}
        onHold={(h) => {
          if (h && chosen.length && h.picked.every((i) => !chosen.includes(deck.cards[i]?.id))) setChosen([]);
        }}
        onMove={(picked, to) => decks.reorderCards(deck.id, picked, to)}
        onPress={(item) => {
          // Choosing cards (to delete several): a tap ticks or unticks it.
          if (choosing) return toggleChosen(item.id);
          setSelected(item);
          setCopiesDraft(String(copiesOf(item)));
          setSheetOpen(true);
        }}
        renderLifted={(item) => <CardView deck={deck} card={item} width={cardWidth} />}
        header={
          <View style={styles.header}>
            {/* The deck's settings, together in one panel, folded away once it has cards (the cards come first). */}
            <View style={styles.panel}>
              <Pressable
                onPress={() => {
                  setSettingsOpen((o) => !o);
                  haptics.tick();
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded: settingsOpen }}
                style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Deck settings</Text>
                {settingsOpen ? null : <CardView deck={deck} faceUp={false} width={22} />}
                <Text style={styles.chevron}>{settingsOpen ? '▴' : '▾'}</Text>
              </Pressable>
              {settingsOpen ? (
                <View style={{ gap: 8 }}>
                  <Text style={styles.label}>Name</Text>
                  <TextInput
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                    value={nameDraft ?? deck.name}
                    onChangeText={(t) => setNameDraft(titleCase(t))}
                    maxLength={MAX_NAME_LENGTH}
                    onEndEditing={(e) => {
                      const name = e.nativeEvent.text.trim();
                      if (name && name !== deck.name) decks.renameDeck(deck.id, name);
                      setNameDraft(null);
                    }}
                    style={styles.input}
                    placeholder="Deck name"
                    placeholderTextColor={colors.textMuted}
                    returnKeyType="done"
                  />

                  <Text style={[styles.label, styles.gapAbove]}>Card size</Text>
                  <CardSizePicker shape={deck.cardShape ?? { kind: 'standard' }} onChange={changeShape} />

                  <Text style={[styles.label, styles.gapAbove]}>Card back</Text>
                  <View style={styles.backRow}>
                    {/*
                      Once it has a picture, tapping it goes back to cropping that (a small crop badge on its corner
                      says so); until then, to choosing one.
                    */}
                    <View>
                      <CardView
                        deck={deck}
                        faceUp={false}
                        width={64}
                        onPress={() => {
                          setBackFor(null);
                          if (backSource) setCrop({ uris: [backSource], target: 'back' });
                          else openArtMenu('back');
                        }}
                      />
                      {backSource ? (
                        <View style={styles.cropBadge}>
                          <SymbolView name={{ ios: 'crop', android: 'crop', web: 'crop' }} size={14} weight="bold" tintColor={colors.surfaceRaised} />
                        </View>
                      ) : null}
                    </View>
                    <TourSpot id="deck.back">
                      <Button label="Choose Image" onPress={() => openDeckBackMenu()} disabled={busy} />
                    </TourSpot>
                    {deck.backImage ? <TextButton label="Reset" onPress={() => decks.setCardBack(deck.id, null)} /> : null}
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.cardsHeader}>
              <Text style={styles.sectionTitle}>
                Cards <Text style={styles.muted}>({deckSize(deck)})</Text>
              </Text>
              {choosing ? (
                <View style={styles.headerButtons}>
                  <TextButton
                    label={chosen.length === deck.cards.length ? 'Deselect All' : 'Select All'}
                    onPress={() => setChosen(chosen.length === deck.cards.length ? [] : deck.cards.map((c) => c.id))}
                  />
                  <TextButton label="Done" strong onPress={stopChoosing} />
                </View>
              ) : (
                <View style={styles.headerButtons}>
                  {deck.cards.length > 1 && !tour ? <TextButton label="Select" onPress={() => setChoosing(true)} disabled={busy} /> : null}
                  <TourSpot id="deck.addCards">
                    <Button label="+ Add" variant="primary" onPress={() => openArtMenu('cards')} disabled={busy} style={styles.addButton} />
                  </TourSpot>
                </View>
              )}
            </View>
            {deck.cards.length === 0 ? <Text style={styles.muted}>No cards yet. Tap + Add to make some.</Text> : null}
          </View>
        }        renderItem={(item) => (
          <View>
            <CardView deck={deck} card={item} width={cardWidth} />
            {choosing ? (
              <View style={[styles.tick, chosen.includes(item.id) && styles.ticked]}>
                {chosen.includes(item.id) ? <Text style={styles.tickMark}>✓</Text> : null}
              </View>
            ) : null}
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
          </View>
        }
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {choosing ? (
          <Button
            label={chosen.length ? `Delete ${chosen.length} ${chosen.length === 1 ? 'card' : 'cards'}` : 'Tap cards to choose them'}
            variant="danger"
            disabled={!chosen.length}
            onPress={deleteChosen}
          />
        ) : (
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
        )}
      </View>

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : null}

      <ActionSheet
        visible={deckMenuOpen}
        title={deck.name}
        onClose={() => setDeckMenuOpen(false)}
        actions={[
          // To keep a copy somewhere safe, move it to another phone, or give it to a friend.
          // Deck files are part of Pro: shown for everyone, opening Pro without it.
          ...(deck.cards.length
            ? [
                { label: 'Share deck', pro: !pro, opensModal: pro, onPress: pro ? () => shareWithNotice({ name: deck.name, decks: [deck] }) : () => openPro('files') },
                { label: 'Back up deck', pro: !pro, opensModal: pro, onPress: pro ? () => backUpWithNotice({ name: deck.name, decks: [deck] }) : () => openPro('files') },
              ]
            : []),
          // Apart from the deck files section above it.
          {
            label: 'Delete deck',
            destructive: true,
            opensModal: true,
            groupStart: true,
            onPress: () => {
              confirmDelete();
              // After a couple of times: swiping a deck's row on the home screen deletes it quicker.
              offerTipAfterUses('home-swipe', 2, 1500);
            },
          },
        ]}
      />

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
                  maxLength={2}
                  selectTextOnFocus
                  style={styles.copiesInput}
                  accessibilityLabel="Copies in deck"
                />
              </View>
            </View>
          ) : null
        }
        actions={cardActions}
        // Its copies are kept as they're typed: closing it is being done, not cancelling.
        closeLabel="Done"
        onClose={() => setSheetOpen(false)}
      />

      <ActionSheet visible={menu !== null} {...menuProps} onClose={() => setMenu(null)} />

      <CardScanModal
        uri={scan?.uri ?? null}
        cardRatio={cardRatio(deck)}
        onDone={(card) => {
          // Already exactly card shaped: it's its own original, should the card size change.
          if (scan?.target === 'back') setBack(card, card);
          else addNewCards([card], [card]);
          setScan(null);
        }}
        onCropByHand={(uri) => {
          if (scan) setCropNext({ uris: [uri], target: scan.target });
          setScan(null);
        }}
        onCancel={() => setScan(null)}
        onClosed={() => {
          if (cropNext) setCrop(cropNext);
          setCropNext(null);
        }}
      />

      <CropModal uris={crop?.uris ?? []} ratio={cardRatio(deck)} roundness={deck.roundness}
        onRoundness={(r) => decks.setRoundness(deck.id, r)}
        onDone={saveCropped} onCancel={() => setCrop(null)} />

      <SpriteSheetModal
        uri={spriteSheet?.uri ?? null}
        pickOne={spriteSheet?.target === 'back'}
        cardRatio={cardRatio(deck)}
        onDone={(uris) => {
          const target = spriteSheet?.target;
          setSpriteSheet(null);
          // An automatic card size is the cut cards' shape.
          withBusy(async () => {
            await settleAuto(uris[0]);
            if (target === 'back') setBack(uris[0], uris[0]);
            else addNewCards(uris, uris);
          });
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
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  panel: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 14, padding: 14, gap: 12, marginBottom: 12 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  panelTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '700' },
  chevron: { color: colors.textMuted, fontSize: 16 },
  gapAbove: { marginTop: 10 },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  addButton: { paddingVertical: 8, paddingHorizontal: 14 },
  headerMenu: { color: colors.text, fontSize: 18, fontWeight: '700', paddingHorizontal: 4 },
  textButton: { color: colors.accent, fontSize: 16, fontWeight: '600', paddingVertical: 6 },
  cardsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 14, fontWeight: '400' },
  cardName: { color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' },
  // On the back's picture: tap it to crop it again.
  cropBadge: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surfaceRaised,
    pointerEvents: 'none',
  },
  // A card's tick, while choosing cards.
  tick: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticked: { backgroundColor: colors.danger, borderColor: colors.danger },
  tickMark: { color: '#fff', fontSize: 14, fontWeight: '800' },
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

/** A plain text button, lighter than `Button`, for small actions beside a heading. */
function TextButton({ label, onPress, disabled, strong }: { label: string; onPress: () => void; disabled?: boolean; strong?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      style={({ pressed }) => (pressed || disabled) && { opacity: disabled ? 0.4 : 0.6 }}>
      <Text style={[styles.textButton, strong && { fontWeight: '800' }]}>{label}</Text>
    </Pressable>
  );
}