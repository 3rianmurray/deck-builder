import type { ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { CardView } from './CardView';
import { useDecks } from '../lib/DecksContext';
import { buildRows } from '../lib/groups';
import { deckSize } from '../lib/types';
import { colors } from '../theme';
import { Text } from './Text';

interface Props {
  /** The decks picked, in the order they were picked. */
  picked: string[];
  onChange: (picked: string[]) => void;
  header?: ReactElement;
  footer?: ReactElement | null;
}

/**
 * The player's decks, grouped as on the home screen (every group open), to tick in order: each picked deck shows
 * its place in the order, and ticking a group picks all its decks. Used to start a session or a table.
 */
export function DeckPicker({ picked, onChange, header, footer }: Props) {
  const { decks, getDeck, groups } = useDecks();

  const toggle = (deckId: string) =>
    onChange(picked.includes(deckId) ? picked.filter((d) => d !== deckId) : [...picked, deckId]);

  const rows = buildRows(decks, groups.map((g) => ({ ...g, collapsed: false })));
  const groupDecks = (groupId: string) => decks.filter((d) => d.groupId === groupId).map((d) => d.id);
  /** Picks every deck in a group (in its order, after anything already picked), or unpicks them all if they all are. */
  const toggleGroup = (groupId: string) => {
    const ids = groupDecks(groupId);
    onChange(
      ids.every((d) => picked.includes(d))
        ? picked.filter((d) => !ids.includes(d))
        : [...picked, ...ids.filter((d) => !picked.includes(d))],
    );
  };

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => `${r.kind}:${r.id}`}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      ListEmptyComponent={<Text style={styles.help}>Create some decks first, then come back to pick them.</Text>}
      ListFooterComponent={footer}
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
              <Text style={styles.meta}>{ids.length ? `${count} of ${ids.length}` : 'Empty'}</Text>
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
    />
  );
}

export const pickerStyles = StyleSheet.create({
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
  footer: { paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});

const styles = StyleSheet.create({
  help: pickerStyles.help,
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
});
