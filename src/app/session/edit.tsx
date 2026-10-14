import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { CardView } from '../../components/CardView';
import { useDecks } from '../../lib/DecksContext';
import { deckSize } from '../../lib/types';
import { colors } from '../../theme';

/** Create a session (no `id`) or edit one: a name plus the decks to swipe between, in the order they were picked. */
export default function EditSessionScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { decks, getSession, createSession, updateSession, deleteSession, sessions } = useDecks();
  const insets = useSafeAreaInsets();
  const existing = id ? getSession(id) : undefined;
  const [name, setName] = useState(existing?.name ?? `Session ${sessions.length + 1}`);
  const [picked, setPicked] = useState<string[]>(existing?.deckIds ?? []);

  const toggle = (deckId: string) =>
    setPicked((p) => (p.includes(deckId) ? p.filter((d) => d !== deckId) : [...p, deckId]));

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
        data={decks}
        keyExtractor={(d) => d.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 8, marginBottom: 6 }}>
            <Text style={styles.label}>Session name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              style={styles.input}
              placeholder="e.g. Zombicide"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Decks</Text>
            <Text style={styles.help}>Tap decks in the order you want to swipe through them.</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.help}>Create some decks first, then come back to group them.</Text>}
        renderItem={({ item }) => {
          const position = picked.indexOf(item.id);
          const on = position !== -1;
          return (
            <Pressable
              onPress={() => toggle(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && { opacity: 0.75 }]}>
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
