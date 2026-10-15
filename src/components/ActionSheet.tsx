import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
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

/** How long the sheet takes to come up, and to go. */
const IN_MS = 260;
const OUT_MS = 200;

/**
 * A bottom sheet of actions. Each action closes the sheet when pressed. The dimmed backdrop fades in and out
 * over the screen while the sheet itself slides up from the bottom (and back down).
 */
export function ActionSheet({ visible, title, header, actions, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const pending = useRef<(() => void) | null>(null);
  // 0 is closed, 1 open: the backdrop's opacity, and how far up the sheet has slid.
  const [progress] = useState(() => new Animated.Value(0));
  const [sheetHeight, setSheetHeight] = useState(600);
  // The modal stays up after `visible` goes false until the sheet has slid away.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      Animated.timing(progress, { toValue: 1, duration: IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
        ({ finished }) => finished && setMounted(false),
      );
    }
  }, [visible, progress]);

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
      visible={mounted}
      transparent
      // Animated here instead: the system's slide would carry the backdrop up with the sheet.
      animationType="none"
      onRequestClose={onClose}
      // After the slide away has finished and the modal has gone: iOS can now show another one.
      onDismiss={() => {
        const next = pending.current;
        pending.current = null;
        next?.();
      }}>
      {/* Lifts the sheet above the keyboard when the header contains a text field. */}
      <KeyboardAvoidingView style={styles.screen} behavior="padding">
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 8 },
            { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] }) }] },
          ]}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
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
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // The sheet sits at the bottom, over a backdrop that covers the whole screen.
  screen: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },
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
