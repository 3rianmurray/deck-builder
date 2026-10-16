import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { CardView } from '../../components/CardView';
import { useDecks } from '../../lib/DecksContext';
import { buildRows } from '../../lib/groups';
import { deckSize } from '../../lib/types';
import { colors } from '../../theme';
import { MAX_TEXT_SCALE, Text } from '../../components/Text';

/** Create a session (no `id`) or edit one: a name plus the decks to swipe between, in the order they were picked. */
export default function EditSessionScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { decks, getDeck, groups, getSession, createSession, updateSession, deleteSession, sessions } = useDecks();
  const insets = useSafeAreaInsets();
  const existing = id ? getSession(id) : undefined;
  const [name, setName] = useState(existing?.name ?? `Session ${sessions.length + 1}`);
  const [picked, setPicked] = useState<string[]>(existing?.deckIds ?? []);

  const toggle = (deckId: string) =>
    setPicked((p) => (p.includes(deckId) ? p.filter((d) => d !== deckId) : [...p, deckId]));

  // Decks listed as on the home screen, grouped, but with every group open so all its decks can be picked.
  const rows = buildRows(decks, groups.map((g) => ({ ...g, collapsed: false })));
  const groupDecks = (groupId: string) => decks.filter((d) => d.groupId === groupId).map((d) => d.id);
  /** Picks every deck in a group (in its order, after anything already picked), or unpicks them all if they all are. */
  const toggleGroup = (groupId: string) => {
    const ids = groupDecks(groupId);
    setPicked((p) =>
      ids.every((d) => p.includes(d)) ? p.filter((d) => !ids.includes(d)) : [...p, ...ids.filter((d) => !p.includes(d))],
    );
  };

  const save = () => {
    const trimmed = name.trim() || 'Session';
    if (existing) {
      updateSession(existing.id, { name: trimmed, deckIds: picked });
      router.back();
    } else {
      const session = createSession(trimmed, picked);
      router.replace({ pathname: '/session/[id]', params: { id: session.id } });
    }
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert(`Delete "${existing.name}"?`, 'The decks themselves are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteSession(existing.id);
          router.dismissTo('/');
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: existing ? 'Edit Session' : 'New Session' }} />
      <FlatList
        data={rows}
        keyExtractor={(r) => `${r.kind}:${r.id}`}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 8, marginBottom: 6 }}>
            <Text style={styles.label}>Session name</Text>
            <TextInput
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              value={name}
              onChangeText={setName}
              style={styles.input}
              placeholder="e.g. Zombicide"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Decks</Text>
            <Text style={styles.help}>
              Tap decks in the order you want to swipe through them, or tick a group to add all its decks.
            </Text>
            {existing ? (
              <Text style={styles.help}>
                Taking a deck out keeps its game. Add it back later to pick up where you left off.
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={<Text style={styles.help}>Create some decks first, then come back to group them.</Text>}
        renderItem={({ item: row }) => {
          if (row.kind === 'group') {
            const group = groups.find((g) => g.id === row.id);
            const ids = groupDecks(row.id);
            const count = ids.filter((d) => picked.includes(d)).length;
            const all = ids.length > 0 && count === ids.length;
            const some = count > 0 && !all;
            return (
              <Pressable
                onPress={() => toggleGroup(row.id)}
                disabled={ids.length === 0}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: all ? true : some ? 'mixed' : false, disabled: ids.length === 0 }}
                accessibilityLabel={`${group?.name}, ${ids.length} ${ids.length === 1 ? 'deck' : 'decks'}`}
                style={({ pressed }) => [styles.groupRow, pressed && { opacity: 0.75 }]}>
                <Text style={styles.groupName} numberOfLines={1}>
                  {group?.name}
                </Text>
                <Text style={styles.meta}>
                  {ids.length ? `${count} of ${ids.length}` : 'Empty'}
                </Text>
                <View style={[styles.check, (all || some) && styles.checkOn]}>
                  {all ? <Text style={styles.checkText}>✓</Text> : some ? <Text style={styles.checkText}>–</Text> : null}
                </View>
              </Pressable>
            );
          }
          const item = getDeck(row.id);
          if (!item) return null;
          const position = picked.indexOf(item.id);
          const on = position !== -1;
          return (
            <Pressable
              onPress={() => toggle(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => [styles.row, item.groupId && styles.inGroup, on && styles.rowOn, pressed && { opacity: 0.75 }]}>
              <CardView deck={item} card={item.cards[0]} faceUp={!item.backImage && !!item.cards[0]} width={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.meta}>
                  {deckSize(item)} {deckSize(item) === 1 ? 'card' : 'cards'}
                </Text>
              </View>
              <View style={[styles.check, on && styles.checkOn]}>
                {on ? <Text style={styles.checkText}>{position + 1}</Text> : null}
              </View>
            </Pressable>
          );
        }}
        ListFooterComponent={
          existing ? (
            <View style={{ marginTop: 24 }}>
              <Button label="Delete session" variant="danger" onPress={confirmDelete} />
            </View>
          ) : null
        }
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          label={picked.length === 0 ? 'Pick at least one deck' : existing ? 'Save' : `Start session · ${picked.length} ${picked.length === 1 ? 'deck' : 'decks'}`}
          variant="primary"
          disabled={picked.length === 0}
          onPress={save}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  help: { color: colors.textMuted, fontSize: 14 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 17,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rowOn: { borderColor: colors.accent },
  // Decks in a group sit slightly indented under its header, as on the home screen.
  inGroup: { marginLeft: 14 },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(224,179,84,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(224,179,84,0.35)',
  },
  groupName: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' },
  name: { color: colors.text, fontSize: 17, fontWeight: '600' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkText: { color: colors.accentText, fontWeight: '800' },
  footer: { paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
