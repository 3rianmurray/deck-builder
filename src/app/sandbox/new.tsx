import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../components/Button';
import { DeckPicker, pickerStyles as styles } from '../../components/DeckPicker';
import { useDecks } from '../../lib/DecksContext';
import { newId } from '../../lib/id';
import { titleCase } from '../../lib/names';
import { layDecks } from '../../lib/sandbox';
import { createSandboxWith, useSandboxes } from '../../lib/sandboxStore';
import { colors } from '../../theme';
import { MAX_TEXT_SCALE, Text } from '../../components/Text';

/** A new table: its name and the decks to start with (each laid on it in a face-down stack), or none. */
export default function NewTableScreen() {
  const { getDeck } = useDecks();
  const tables = useSandboxes();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(`Table ${tables.length + 1}`);
  const [picked, setPicked] = useState<string[]>([]);

  const start = () => {
    const decks = picked.flatMap((id) => getDeck(id) ?? []);
    const table = createSandboxWith(name.trim() || 'Table', (empty) => layDecks(empty, decks, newId));
    router.replace({ pathname: '/sandbox/[id]', params: { id: table.id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: 'New Table' }} />
      <DeckPicker
        picked={picked}
        onChange={setPicked}
        header={
          <View style={{ gap: 8, marginBottom: 6 }}>
            <Text style={styles.label}>Table name</Text>
            <TextInput
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              value={name}
              onChangeText={(t) => setName(titleCase(t))}
              style={styles.input}
              placeholder="e.g. Game Night"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Decks to start with</Text>
            <Text style={styles.help}>
              Each one goes on the table shuffled and face down, left to right in the order you tap them. You can bring
              more on later.
            </Text>
          </View>
        }
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          label={picked.length === 0 ? 'Start empty table' : `Start table · ${picked.length} ${picked.length === 1 ? 'deck' : 'decks'}`}
          variant="primary"
          onPress={start}
        />
      </View>
    </View>
  );
}
