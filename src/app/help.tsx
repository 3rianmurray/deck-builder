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
      ['Tap a table', 'Open, rename, duplicate or delete it.'],
    ],
  },
  {
    title: 'Edit Deck',
    tips: [
      ['Tap a card', 'Rename it, set its copies, re-crop its art, or give it its own back.'],
      ['Hold and drag a card', 'Reorder the deck. Tap other cards with a second finger to carry them too.'],
      ['Select', 'Tick cards to delete several at once. Hold a ticked card to move them all together.'],
      ['Deck settings', 'Name, card size and back. Auto works the size out from your first art.'],
      ['Cropping a card', 'Drag and pinch the picture to fit. The Corners slider rounds every card in the deck, shown on the frame as you slide.'],
      ['Sprite sheets', 'Slide a finger across a number to change it. Tap or drag across cards to leave them out.'],
      ['••• (top right)', 'Share, back up or delete the deck.'],
    ],
  },
  {
    title: 'Playing a deck or session',
    tips: [
      ['Tap the deck', 'Turn the next card over onto the discard pile.'],
      ['Drag the top card', 'Drop it on the discard pile to turn it over, or on the trash can to take it out of the game.'],
      ['Hold the deck', 'Search it.'],
      ['Swipe sideways', 'In a session, move between its decks.'],
      ['Tap the deck’s name', 'Shuffle the discard pile back in, look in the trash, or reset.'],
    ],
  },  {
    title: 'Tables',
    tips: [
      ['One finger on the table', 'Slide the view.'],
      ['Two fingers', 'Zoom and turn the table. It snaps square near each quarter turn.'],
      ['Drag a stack', 'Takes its top card. Hold it a moment first to move the whole stack.'],
      ['Tap a card', 'Picks it out: its buttons show. Tap it again for its options.'],
      ['Double-tap a card', 'Flip it. Flipped onto a stack facing the same way, it joins it.'],
      ['Twist with a second finger', 'Turn what you carry, or a whole selection. It snaps every 45°.'],
      ['Double-tap, then hold the table', 'Draw a loop around cards to select them. Do it again to add more.'],
      ['With cards selected', 'Flip them, or gather them into one stack, with the buttons; ••• to turn, lock or take them off the table. Drag any of them to move them all.'],
      ['Drag into a hand', 'Cards gather into a pile and slip into the hand when you let go.'],
      ['A card’s options', 'Flip, draw, shuffle and search up top; deal, turn, fan out, lock in place, never stack and more in the list below.'],
      ['Search a stack', 'Every card, face up. Tap one for its options; hold one to move it within the stack. While holding, tap Close to take it out onto the table.'],
      ['Table menu', 'Add a whole deck or chosen cards, reset the view, change the table color.'],
      ['Tools tab (left edge)', 'Snap to grid, and lock the camera.'],
      ['Hold a hand’s tab', 'Rename that hand.'],    ],
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
