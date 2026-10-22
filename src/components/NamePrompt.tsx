import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { answerName, MAX_NAME_LENGTH, titleCase, useNameRequest } from '../lib/names';
import { colors } from '../theme';
import { Button } from './Button';
import { MAX_TEXT_SCALE, Text } from './Text';

/**
 * The app's prompt for a name (see `askName`), over every screen: a title, a field that keeps what's typed in
 * title case, and Cancel and Save.
 */
export function NamePrompt() {
  const request = useNameRequest();
  const [draft, setDraft] = useState('');
  // A new request starts from its own name.
  const [shown, setShown] = useState<typeof request>(null);
  // A name is title-cased as it's typed; a number or a time is kept as typed, with the number keyboard.
  const kind = shown?.kind ?? 'name';
  const asTyped = (t: string) => (kind === 'name' ? titleCase(t) : t);
  if (request !== shown) {
    setShown(request);
    setDraft(request ? ((request.kind ?? 'name') === 'name' ? titleCase(request.current) : request.current) : '');
  }
  const save = () => answerName(draft);

  return (
    <Modal visible={!!request} transparent animationType="fade" onRequestClose={() => answerName(null)}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => answerName(null)} accessibilityLabel="Cancel" />
        <View style={styles.box}>
          <Text style={styles.title}>{shown?.title}</Text>
          <TextInput
            autoFocus
            selectTextOnFocus
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            value={draft}
            maxLength={MAX_NAME_LENGTH}
            onChangeText={(t) => setDraft(asTyped(t))}
            autoCapitalize={kind === 'name' ? 'words' : 'none'}
            // Digits only for a count; with a minus sign, or a colon for a time, the keyboard that has them.
            keyboardType={kind === 'number' ? 'number-pad' : kind === 'name' ? 'default' : 'numbers-and-punctuation'}
            returnKeyType="done"
            onSubmitEditing={save}
            style={styles.input}
            placeholderTextColor={colors.textMuted}
            placeholder={kind === 'name' ? 'Name' : kind === 'time' ? '1:30' : '0'}
          />
          <View style={styles.buttons}>
            <Button label="Cancel" onPress={() => answerName(null)} style={{ flex: 1 }} />
            <Button label="Save" variant="primary" onPress={save} disabled={!draft.trim()} style={{ flex: 1 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', padding: 24 },
  box: { width: '100%', maxWidth: 340, backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 14 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  input: {
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  buttons: { flexDirection: 'row', gap: 10 },
});
