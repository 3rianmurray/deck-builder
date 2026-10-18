import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { answerName, titleCase, useNameRequest } from '../lib/names';
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
  if (request !== shown) {
    setShown(request);
    setDraft(request ? titleCase(request.current) : '');
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
            onChangeText={(t) => setDraft(titleCase(t))}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={save}
            style={styles.input}
            placeholderTextColor={colors.textMuted}
            placeholder="Name"
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
