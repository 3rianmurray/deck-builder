import { useRef } from 'react';
import type { ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme';

export interface SheetAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  /** Set when the action opens another modal; iOS can only present it once this sheet has dismissed. */
  opensModal?: boolean;
}

interface Props {
  visible: boolean;
  title?: string;
  /** Optional content shown above the actions, e.g. a large card preview. */
  header?: ReactNode;
  actions: SheetAction[];
  onClose: () => void;
}

/** A bottom sheet of actions. Each action closes the sheet when pressed. */
export function ActionSheet({ visible, title, header, actions, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const pending = useRef<(() => void) | null>(null);

  const run = (a: SheetAction) => {
    if (a.opensModal && Platform.OS === 'ios') {
      pending.current = a.onPress;
      onClose();
    } else {
      onClose();
      a.onPress();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={() => {
        const next = pending.current;
        pending.current = null;
        next?.();
      }}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
        <ScrollView bounces={false} contentContainerStyle={styles.content}>
          {header}
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={() => run(a)}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
              <Text style={[styles.actionText, a.destructive && { color: colors.danger }]}>{a.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={({ pressed }) => [styles.action, styles.cancel, pressed && styles.pressed]}>
            <Text style={[styles.actionText, { fontWeight: '600' }]}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
  },
  content: { padding: 12, gap: 6 },
  title: { color: colors.textMuted, textAlign: 'center', fontSize: 13, marginVertical: 6 },
  action: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancel: { marginTop: 6 },
  pressed: { opacity: 0.7 },
  actionText: { color: colors.text, fontSize: 16 },
});
