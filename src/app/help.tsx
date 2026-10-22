import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { Text } from '../components/Text';
import { useExamples } from '../lib/examples';
import { startTour } from '../lib/tour';
import { colors } from '../theme';

/**
 * Gestures and tips, a section per part of the app: only what can't be seen on screen (swipes, holds, double taps,
 * second fingers, and things that happen by themselves). What a button or menu does, it shows when it's tapped.
 */
const TIPS: { title: string; tips: [string, string][] }[] = [
  {
    title: 'Home',
    tips: [
      ['Swipe a row', 'Right to duplicate it, left to delete it.'],
      ['Hold and drag a row', 'Reorder it within its section. Drop a deck under a group to file it there.'],
    ],
  },
  {
    title: 'Edit Deck',
    tips: [
      ['Hold and drag a card', 'Reorder the deck. Tap other cards with a second finger to carry them too.'],
      ['Hold a ticked card', 'While selecting, moves every ticked card together.'],
      ['Sprite sheets', 'Slide a finger across a number to change it. Tap or drag across cards to leave them out.'],
    ],
  },
  {
    title: 'Playing a deck or session',
    tips: [
      ['Drag the top card', 'Onto the discard pile to turn it over, or onto the trash can to take it out of the game.'],
      ['Swipe sideways', 'In a session, move between its decks.'],
      ['Hold a card', 'See it full size: the top of the discard pile, or the deck’s back.'],
    ],
  },
  {
    title: 'Tables',
    tips: [
      ['Move around', 'Slide with one finger. Pinch and twist with two to zoom and turn.'],
      ['Two-finger double tap', 'Tap twice with two fingers: everything on the table fitted in view.'],
      ['Drag a stack', 'Takes its top card. Hold it a moment first to move the whole stack.'],
      ['Tap a card', 'Picks it out. Tap it again for its options.'],
      ['Double-tap a card', 'Flips it. Flipped onto a stack facing the same way, it joins it.'],
      ['Double-tap, then hold the table', 'Draw a loop round cards to pick them all out. Do it again to add more.'],
      ['Gone too far with the lasso', 'Trace back over the line: it rubs out, and lets go of what it caught.'],
      ['Start the selection over', 'Tap an empty spot on the table to let go of every picked-out card.'],
      ['Drag a picked-out card', 'Moves all of them together.'],
      ['Second finger, while carrying', 'Tap other cards to pick them up too, tap the flip button to turn them over, or twist to turn them.'],
      ['Drag into a hand', 'Cards gather into a pile and slip into the hand when you let go.'],
      ['Searching a stack', 'Hold a card, then tap Close with another finger to take it out onto the table.'],
      ['Fold the hand away', 'Its cards turn face down while it’s folded, so the phone can be passed round.'],
      ['Hold a hand’s tab', 'Rename that hand.'],
      ['Hold the tools tab', 'Then drag it up or down its edge, or across to the other side.'],
    ],
  },
];
/** Help: the walkthrough again, the app's examples back, and every gesture and tip. */
export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const { confirmRestore } = useExamples();

  const replayTutorial = () => {
    // The walkthrough starts on the home screen.
    router.back();
    startTour();
  };


  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.actions}>
        <Button label="Replay the Tutorial" variant="primary" onPress={replayTutorial} />
        <Button label="Restore Examples" onPress={confirmRestore} />
        <Text style={styles.note}>Puts the Playing Cards deck, its Solitaire table and the Playground back as new: brought back if deleted, reset if changed.</Text>
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
