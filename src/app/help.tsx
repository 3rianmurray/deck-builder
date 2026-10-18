import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { Text } from '../components/Text';
import { useExamples } from '../lib/examples';
import * as haptics from '../lib/haptics';
import { startTour } from '../lib/tour';
import { colors } from '../theme';

/** Gestures and tips, a section per part of the app: what to do, and what it does. */
const TIPS: { title: string; tips: [string, string][] }[] = [
  {
    title: 'Home',
    tips: [
      ['Swipe a deck right', 'Duplicate it.'],
      ['Swipe a row left', 'Delete it.'],
      ['Hold and drag a deck', 'Reorder it, or drop it into a group.'],
      ['Tap a group', 'Fold it open or closed. ••• for its options, like sharing all its decks.'],
      ['Tap a Free Play table', 'Open, rename, duplicate or delete it.'],
    ],
  },
  {
    title: 'Edit Deck',
    tips: [
      ['Tap a card', 'Rename it, set its copies, re-crop its art, or give it its own back.'],
      ['Hold and drag a card', 'Reorder the deck. Tap other cards with a second finger to carry them too.'],
      ['Select', 'Tick cards to delete several at once. Hold a ticked card to move them all together.'],
      ['Deck settings', 'Name, card size, corners and back. Auto works the size out from your first art.'],
      ['Sprite sheets', 'Slide a finger across a number to change it. Tap or drag across cards to leave them out.'],
      ['••• (top right)', 'Share, back up or delete the deck.'],
    ],
  },
  {
    title: 'Playing (table and reveal mode)',
    tips: [
      ['Tap the deck', 'Draw a card (in reveal mode, turn the next one over).'],
      ['Hold the deck', 'Search it.'],
      ['Drag a card', 'Move it between the deck, table, hand and discard pile.'],
      ['Second-finger taps', 'While carrying a card, tap others to pick them up too.'],
      ['Flip while dragging', 'Tap the flip button to turn what you carry over.'],
      ['Tap the deck’s name', 'The table menu, e.g. to switch between table and reveal mode.'],
      ['Tap the hand’s tab', 'Tuck the hand away, or bring it back.'],
    ],
  },
  {
    title: 'Free Play',
    tips: [
      ['One finger on the table', 'Slide the view.'],
      ['Two fingers', 'Zoom and turn the table. It snaps square near each quarter turn.'],
      ['Drag a card or stack', 'Put it anywhere. Drag by the number to take the whole stack.'],
      ['Twist with a second finger', 'Turn what you carry. It snaps every 45°.'],
      ['Tap a card', 'See it up close, with its options (flip, shuffle, deal…).'],
      ['Double-tap a card', 'Flip it.'],
      ['Double-tap, then hold the table', 'Draw a loop around cards to select them. Do it again to add more.'],
      ['Drag a selected card', 'Move the whole selection. The stack button gathers it into one pile.'],
      ['Drag into a hand', 'Cards gather into a pile and slip into the hand when you let go.'],
      ['Tools tab (left edge)', 'Snap to grid, and lock the camera.'],
      ['Hold a hand’s tab', 'Rename that hand.'],
    ],
  },
];

/** Help: the walkthrough again, the app's examples back, and every gesture and tip. */
export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const { restore } = useExamples();
  const [busy, setBusy] = useState(false);

  const replayTutorial = () => {
    // The walkthrough starts on the home screen.
    router.back();
    startTour();
  };

  const restoreExamples = async () => {
    setBusy(true);
    try {
      const back = await restore();
      haptics.success();
      Alert.alert(
        back.length ? 'Examples restored' : 'Nothing to restore',
        back.length ? `${back.join(' and ')} ${back.length === 1 ? 'is' : 'are'} back on the home screen.` : 'The Playing Cards deck and a Solitaire table are both still there.',
      );
    } catch (e) {
      Alert.alert('Couldn’t restore the examples', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.actions}>
        <Button label="Replay the Tutorial" variant="primary" onPress={replayTutorial} />
        <Button label="Restore Examples" onPress={restoreExamples} disabled={busy} />
        <Text style={styles.note}>Brings back the Playing Cards deck and its Solitaire table, if you’ve deleted them.</Text>
      </View>

      <Text style={styles.heading}>Gestures and tips</Text>
      {TIPS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.tips.map(([what, does]) => (
            <View key={what} style={styles.tip}>
              <Text style={styles.what}>{what}</Text>
              <Text style={styles.does}>{does}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 16 },
  actions: { gap: 10 },
  note: { color: colors.textMuted, fontSize: 13 },
  heading: { color: colors.text, fontSize: 22, fontWeight: '700', marginTop: 8 },
  section: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 12 },
  sectionTitle: { color: colors.accent, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tip: { gap: 2 },
  what: { color: colors.text, fontSize: 15, fontWeight: '600' },
  does: { color: colors.textMuted, fontSize: 14 },
});
