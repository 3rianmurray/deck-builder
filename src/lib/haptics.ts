// The app's haptics, by what they mean rather than how they feel, so the same moment always feels the same.
// They never throw: the phone may have haptics off, be in Low Power Mode, or have none at all.
import * as Haptics from 'expo-haptics';

const run = (p: Promise<void>) => {
  p.catch(() => {});
};

/** Picking something up: a card or a stack lifts off the table, or a row lifts out of a list. */
export const lift = () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
/** Picking up a whole stack at once: a little weightier than one card. */
export const liftHeavy = () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
/** Putting something down where it'll stay. */
export const drop = () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
/** A small, crisp tick: stepping between choices, snapping onto a target, a card turning over. */
export const tick = () => run(Haptics.selectionAsync());
/** A card dealt or revealed from the deck. */
export const deal = () => run(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
/** Something finished well: a deck copied, the table reset. */
export const success = () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
/** About to do something that can't be undone, such as a delete prompt. */
export const warn = () => run(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
