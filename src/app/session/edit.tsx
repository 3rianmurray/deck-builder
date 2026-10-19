import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { DeckPicker, pickerStyles as styles } from '../../components/DeckPicker';
import { useDecks } from '../../lib/DecksContext';
import { titleCase } from '../../lib/names';
import { colors } from '../../theme';
import { MAX_TEXT_SCALE, Text } from '../../components/Text';

/** Create a session (no `id`) or edit one: a name plus the decks to swipe between, in the order they were picked. */
export default function EditSessionScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { getSession, createSession, updateSession, deleteSession, sessions } = useDecks();
  const insets = useSafeAreaInsets();
  const existing = id ? getSession(id) : undefined;
  const [name, setName] = useState(existing?.name ?? `Session ${sessions.length + 1}`);
  const [picked, setPicked] = useState<string[]>(existing?.deckIds ?? []);

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
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: existing ? 'Edit Session' : 'New Session' }} />
      <DeckPicker
        picked={picked}
        onChange={setPicked}
        header={
          <View style={{ gap: 8, marginBottom: 6 }}>
            <Text style={styles.label}>Session name</Text>
            <TextInput
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              value={name}
              onChangeText={(t) => setName(titleCase(t))}
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
        footer={
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
