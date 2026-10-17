import { Stack, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { AccessibilityActionEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '../components/ActionSheet';
import { Button } from '../components/Button';
import { CardView } from '../components/CardView';
import { LIFT_HOLD_MS, ReorderableList } from '../components/ReorderableList';
import { SwipeRow } from '../components/SwipeRow';
import type { SwipeSide } from '../components/SwipeRow';
import { useDecks } from '../lib/DecksContext';
import { DeckFileError } from '../lib/deckFile';
import { pickDeckFile, shareDecks } from '../lib/deckExport';
import { deleteDeckWarning } from '../lib/deckInUse';
import * as haptics from '../lib/haptics';
import { buildRows, dropDeck, dropGroup } from '../lib/groups';
import type { Row } from '../lib/groups';
import { createSandbox, deleteSandbox, useSandboxes } from '../lib/sandboxStore';
import { loadSettings, saveSettings } from '../lib/storage';
import { startTour, tourEvent, useTourStep } from '../lib/tour';
import { deckSize } from '../lib/types';
import { colors } from '../theme';
import { Text } from '../components/Text';
import { TourSpot } from '../components/TourSpot';

/** What the walkthrough's deck is called. */
const SAMPLE_DECK = 'Sample Deck';

/** A press this far from a row's right edge is on its Play or ••• button, so it doesn't pick the row up. */
const BUTTON_ZONE = 100;

export default function HomeScreen() {
  const {
    decks,
    createDeck,
    deleteDeck,
    resetDeck,
    importDecks,
    duplicateDeck,
    sessions,
    deleteSession,
    getDeck,
    groups,
    createGroup,
    renameGroup,
    deleteGroup,
    toggleGroup,
    setGroupOrder,
    arrangeDecks,
  } = useDecks();
  const insets = useSafeAreaInsets();
  const sandboxes = useSandboxes();

  // The walkthrough starts by itself the first time the app opens; after that, from the help button.
  useEffect(() => {
    const settings = loadSettings();
    if (settings.welcomed) return;
    saveSettings({ ...settings, welcomed: true });
    startTour();
  }, []);

  const [groupMenu, setGroupMenu] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  /**
   * The row swiped open (`deck:…`, `group:…` or `session:…`) and which of its buttons is showing: Delete on
   * the right, or a deck's Duplicate on the left. One at a time.
   */
  const [openRow, setOpenRow] = useState<{ key: string; side: SwipeSide } | null>(null);

  /** Props that let a row be swiped open, keyed so opening one closes the others. */
  const swipe = (key: string, onDelete: () => void, onDuplicate?: () => void) => ({
    open: openRow?.key === key ? openRow.side : null,
    onOpenChange: (side: SwipeSide | null) => setOpenRow((cur) => (side ? { key, side } : cur?.key === key ? null : cur)),
    onDelete,
    onDuplicate,
  });
  const closeRows = () => setOpenRow(null);

  const copyDeck = (id: string) => {
    closeRows();
    if (duplicateDeck(id)) haptics.success();
  };

  // Decks and sessions take things with them, so ask first. A group's decks are kept, so it just goes.
  const confirmDeleteDeck = (id: string, name: string) => {
    haptics.warn();
    Alert.alert(`Delete "${name}"?`, deleteDeckWarning(id, sessions), [
      { text: 'Cancel', style: 'cancel', onPress: closeRows },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDeck(id) },
    ]);
  };
  const confirmDeleteSession = (id: string, name: string) => {
    haptics.warn();
    Alert.alert(`Delete "${name}"?`, 'The decks themselves are kept.', [
      { text: 'Cancel', style: 'cancel', onPress: closeRows },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSession(id) },
    ]);
  };

  const rows = buildRows(decks, groups);
  const menuGroup = groups.find((g) => g.id === groupMenu);

  const tour = useTourStep();
  const newDeck = () => {
    // In the walkthrough, it's the Sample Deck: the one from last time, started again, if it's still here.
    if (tour?.step.until === 'deck-created') {
      const settings = loadSettings();
      const old = settings.sampleDeckId ? getDeck(settings.sampleDeckId) : undefined;
      const id = old ? old.id : createDeck(SAMPLE_DECK).id;
      if (old) resetDeck(old.id, SAMPLE_DECK);
      else saveSettings({ ...settings, sampleDeckId: id });
      router.push({ pathname: '/deck/[id]', params: { id } });
      tourEvent('deck-created');
      return;
    }
    const deck = createDeck(`Deck ${decks.length + 1}`);
    router.push({ pathname: '/deck/[id]', params: { id: deck.id } });
    tourEvent('deck-created');
  };

  // Naming uses the system prompt, which only iOS has; elsewhere groups get a numbered name to rename later.
  const askName = (title: string, current: string, done: (name: string) => void) => {
    if (Platform.OS !== 'ios') return done(current);
    Alert.prompt(title, undefined, (name) => name.trim() && done(name.trim()), 'plain-text', current);
  };

  // Decks to and from files: a backup of them all to keep somewhere safe, and adding the decks in a file.
  const backUpAll = async () => {
    try {
      await shareDecks(decks);
    } catch (e) {
      Alert.alert('Couldn’t back up your decks', e instanceof Error ? e.message : String(e));
    }
  };
  const importFromFile = async () => {
    try {
      const found = await pickDeckFile();
      if (!found) return;
      const added = importDecks(found);
      haptics.success();
      Alert.alert(
        added.length === 1 ? `Added "${added[0].name}"` : `Added ${added.length} decks`,
        added.length === 1 ? 'It’s at the top of your decks.' : 'They’re at the top of your decks.',
      );
    } catch (e) {
      haptics.warn();
      Alert.alert('Couldn’t open that file', e instanceof DeckFileError ? e.message : 'Something went wrong reading it.');
    }
  };

  const newGroup = () => askName('New group', `Group ${groups.length + 1}`, (name) => createGroup(name));

  const drop = (row: Row, at: number) => {
    if (row.kind === 'deck') {
      const { order, groupOf } = dropDeck(decks, groups, row.id, at);
      arrangeDecks(order, groupOf);
    } else {
      setGroupOrder(dropGroup(decks, groups, row.id, at));
    }
  };

  /**
   * A row is one button to VoiceOver, so the buttons inside it (Play, •••) and its swipe buttons can't be reached
   * one by one. They're offered as the row's actions instead: swipe up or down on it to pick one.
   */
  const rowActions = (actions: { name: string; label: string; run: () => void }[]) => ({
    accessibilityActions: actions.map(({ name, label }) => ({ name, label })),
    onAccessibilityAction: (e: AccessibilityActionEvent) => actions.find((a) => a.name === e.nativeEvent.actionName)?.run(),
  });

  const renderRow = (row: Row, lifted = false) => {
    if (row.kind === 'group') {
      const group = groups.find((g) => g.id === row.id);
      if (!group) return null;
      const count = decks.filter((d) => d.groupId === group.id).length;
      const groupRow = (
        <Pressable
          onPress={() => {
            toggleGroup(group.id);
            haptics.tick();
          }}
          // Matches the list's hold-to-lift, so letting go after lifting doesn't also toggle the group.
          onLongPress={() => {}}
          delayLongPress={LIFT_HOLD_MS}
          accessibilityRole="button"
          accessibilityLabel={`${group.name}, group of ${count} ${count === 1 ? 'deck' : 'decks'}, ${group.collapsed ? 'collapsed' : 'expanded'}`}
          {...rowActions([
            { name: 'options', label: 'Options', run: () => setGroupMenu(group.id) },
            { name: 'delete', label: 'Delete group', run: () => deleteGroup(group.id) },
          ])}
          style={[styles.groupRow, lifted && styles.liftedRow]}>
          <Text style={styles.chevron}>{group.collapsed ? '▸' : '▾'}</Text>
          <Text style={styles.groupName} numberOfLines={1}>
            {group.name}
          </Text>
          <Text style={styles.groupCount}>{count}</Text>
          <Pressable onPress={() => setGroupMenu(group.id)} hitSlop={12} accessibilityRole="button" accessibilityLabel={`${group.name} options`}>
            <Text style={styles.groupMenu}>•••</Text>
          </Pressable>
        </Pressable>
      );
      return lifted ? (
        <View style={styles.groupGap}>{groupRow}</View>
      ) : (
        <SwipeRow style={styles.groupGap} radius={10} {...swipe(`group:${group.id}`, () => deleteGroup(group.id))}>
          {groupRow}
        </SwipeRow>
      );
    }
    const deck = getDeck(row.id);
    if (!deck) return null;
    const deckRow = (
      <Pressable
        style={({ pressed }) => [styles.row, lifted && styles.liftedRow, pressed && { opacity: 0.75 }]}
        onPress={() => router.push({ pathname: '/deck/[id]', params: { id: deck.id } })}
        // Matches the list's hold-to-lift, so letting go after lifting doesn't also open the deck.
        onLongPress={() => {}}
        delayLongPress={LIFT_HOLD_MS}
        accessibilityRole="button"
        accessibilityLabel={`${deck.name}, ${deckSize(deck)} ${deckSize(deck) === 1 ? 'card' : 'cards'}`}
        accessibilityHint="Opens the deck to edit it."
        {...rowActions([
          ...(deck.cards.length
            ? [{ name: 'play', label: 'Play', run: () => router.push({ pathname: '/play/[id]', params: { id: deck.id } }) }]
            : []),
          { name: 'duplicate', label: 'Duplicate', run: () => copyDeck(deck.id) },
          { name: 'delete', label: 'Delete', run: () => confirmDeleteDeck(deck.id, deck.name) },
        ])}>
        <CardView deck={deck} card={deck.cards[0]} faceUp={!deck.backImage && !!deck.cards[0]} width={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {deck.name}
          </Text>
          <Text style={styles.meta}>
            {deckSize(deck)} {deckSize(deck) === 1 ? 'card' : 'cards'}
          </Text>
        </View>
        <Button
          label="Play"
          variant="primary"
          disabled={deck.cards.length === 0}
          onPress={() => router.push({ pathname: '/play/[id]', params: { id: deck.id } })}
        />
      </Pressable>
    );
    const indent = deck.groupId ? styles.inGroup : undefined;
    return lifted ? (
      <View style={indent}>{deckRow}</View>
    ) : (
      <SwipeRow
        style={indent}
        {...swipe(`deck:${deck.id}`, () => confirmDeleteDeck(deck.id, deck.name), () => copyDeck(deck.id))}>
        {deckRow}
      </SwipeRow>
    );
  };

  // Free Play tables (sandboxes in the code): big open tables to bring decks onto, Tabletop Simulator style.
  const newSandboxTable = () => {
    const table = createSandbox(`Free Play ${sandboxes.length + 1}`);
    router.push({ pathname: '/sandbox/[id]', params: { id: table.id } });
  };
  const confirmDeleteSandbox = (id: string, name: string) => {
    haptics.warn();
    Alert.alert(`Delete "${name}"?`, 'Its decks are kept; just this table goes.', [
      { text: 'Cancel', style: 'cancel', onPress: closeRows },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSandbox(id) },
    ]);
  };
  const sandboxSection = sandboxes.length ? (
    <View style={{ gap: 10, marginBottom: 16 }}>
      <Text style={styles.section}>Free Play</Text>
      {sandboxes.map((t) => {
        const onTable = t.stacks.reduce((n, s) => n + s.cards.length, 0);
        const inHands = t.hands.reduce((n, h) => n + h.length, 0);
        const open = () => router.push({ pathname: '/sandbox/[id]', params: { id: t.id } });
        return (
          <SwipeRow key={t.id} {...swipe(`sandbox:${t.id}`, () => confirmDeleteSandbox(t.id, t.name))}>
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
              onPress={open}
              accessibilityRole="button"
              accessibilityLabel={`${t.name}, free play table`}
              {...rowActions([{ name: 'delete', label: 'Delete', run: () => confirmDeleteSandbox(t.id, t.name) }])}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {t.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {onTable || inHands ? `${onTable} on the table · ${inHands} in hands` : 'Empty table'}
                </Text>
              </View>
              <Button label="Open" variant="primary" onPress={open} />
            </Pressable>
          </SwipeRow>
        );
      })}
    </View>
  ) : null;

  const sessionsSection = sessions.length ? (
    <View style={{ gap: 10, marginBottom: 16 }}>
      <Text style={styles.section}>Sessions</Text>
      {sessions.map((s) => {
        const names = s.deckIds.flatMap((d) => getDeck(d)?.name ?? []);
        return (
          <SwipeRow key={s.id} {...swipe(`session:${s.id}`, () => confirmDeleteSession(s.id, s.name))}>
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
              onPress={() => router.push({ pathname: '/session/edit', params: { id: s.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${s.name}, session: ${names.length ? names.join(', ') : 'no decks'}`}
              accessibilityHint="Opens the session to choose its decks."
              {...rowActions([
                ...(names.length
                  ? [{ name: 'play', label: 'Play', run: () => router.push({ pathname: '/session/[id]', params: { id: s.id } }) }]
                  : []),
                { name: 'delete', label: 'Delete', run: () => confirmDeleteSession(s.id, s.name) },
              ])}>
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
          </SwipeRow>
        );
      })}
    </View>
  ) : null;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={startTour}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="How to use Shufflevale"
              style={({ pressed }) => pressed && { opacity: 0.6 }}>
              <SymbolView
                name={{ ios: 'questionmark.circle', android: 'help', web: 'help' }}
                size={22}
                tintColor={colors.accent}
              />
            </Pressable>
          ),
        }}
      />
      <ReorderableList
        rows={rows}
        keyOf={(r) => `${r.kind}:${r.id}`}
        renderRow={(r) => <View style={styles.rowWrap}>{renderRow(r)}</View>}
        renderLifted={(r) => <View style={styles.liftedWrap}>{renderRow(r, true)}</View>}
        // A row swiped open can't be picked up: a press on it closes it instead.
        canLift={(r, x, width) => openRow?.key !== `${r.kind}:${r.id}` && x < width - BUTTON_ZONE}
        onDrop={drop}
        bottomInset={insets.bottom + 72}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        header={
          <>
            {sessionsSection}
            {sandboxSection}
            <View style={styles.sectionRow}>
              <Text style={styles.section}>Decks</Text>
              <Pressable
                onPress={() => setAddMenuOpen(true)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Add, import or back up decks"
                style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.7 }]}>
                <Text style={styles.addButtonText}>+</Text>
              </Pressable>
            </View>
            {decks.length || groups.length ? null : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No decks yet</Text>
                <Text style={styles.emptyBody}>
                  Create a deck, add your own card art from Photos, then take it to the table to draw, shuffle and play.
                </Text>
              </View>
            )}
          </>
        }
        footer={
          decks.length > 1 || groups.length ? (
            <Text style={styles.hint}>Hold a deck or group to drag it. Drop a deck under a group to file it there.</Text>
          ) : null
        }
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TourSpot id="home.newDeck" style={{ flex: 1 }}>
          <Button label="+ New Deck" variant="primary" onPress={newDeck} />
        </TourSpot>
        <Button
          label="+ New Session"
          onPress={() => router.push('/session/edit')}
          disabled={decks.length === 0}
          style={{ flex: 1 }}
        />
      </View>

      <ActionSheet
        visible={addMenuOpen}
        title="Decks"
        onClose={() => setAddMenuOpen(false)}
        actions={[
          { label: 'New Deck', onPress: newDeck },
          // The name prompt is another modal, which iOS can only show once this menu has gone.
          { label: 'New Group', opensModal: true, onPress: newGroup },
          { label: 'New Free Play Table', onPress: newSandboxTable },
          // The file picker and share sheet are system screens too.
          { label: 'Import decks from a file…', opensModal: true, onPress: importFromFile },
          ...(decks.length ? [{ label: 'Back up all decks…', opensModal: true, onPress: backUpAll }] : []),
        ]}
      />

      <ActionSheet
        visible={!!menuGroup}
        title={menuGroup?.name}
        onClose={() => setGroupMenu(null)}
        actions={
          menuGroup
            ? [
                ...(Platform.OS === 'ios'
                  ? [
                      {
                        label: 'Rename group',
                        opensModal: true,
                        onPress: () => askName('Rename group', menuGroup.name, (name) => renameGroup(menuGroup.id, name)),
                      },
                    ]
                  : []),
                {
                  label: 'Delete group (keeps its decks)',
                  destructive: true,
                  onPress: () => deleteGroup(menuGroup.id),
                },
              ]
            : []
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  addButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: { color: colors.accentText, fontSize: 22, fontWeight: '700', lineHeight: 24 },
  rowWrap: { paddingBottom: 10 },
  liftedWrap: { paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
  },
  // Decks in a group sit slightly indented under its header.
  inGroup: { marginLeft: 14 },
  liftedRow: { backgroundColor: colors.surfaceRaised },
  // Outside the row itself, so a swiped-open group's Delete button is only as tall as the group row.
  groupGap: { marginTop: 6 },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(224,179,84,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(224,179,84,0.35)',
  },
  chevron: { color: colors.accent, fontSize: 16, width: 14 },
  groupName: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
  groupCount: { color: colors.textMuted, fontSize: 14 },
  groupMenu: { color: colors.accent, fontSize: 16, fontWeight: '700', paddingLeft: 8 },
  name: { color: colors.text, fontSize: 17, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 16, gap: 10 },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  emptyBody: { color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  section: { color: colors.textMuted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
