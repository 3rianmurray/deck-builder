import type { Session } from './types';

/**
 * What deleting a deck would do, for its "are you sure" prompt: it takes its card images with it, and if any
 * sessions play it, it's taken out of those too (their tables for it are lost).
 */
export function deleteDeckWarning(deckId: string, sessions: Session[]): string {
  const using = sessions.filter((s) => s.deckIds.includes(deckId)).map((s) => `"${s.name}"`);
  const base = 'This removes the deck and all of its card images from this device.';
  if (!using.length) return base;
  const names = using.length === 1 ? using[0] : `${using.slice(0, -1).join(', ')} and ${using[using.length - 1]}`;
  const where = using.length === 1 ? 'the session' : 'the sessions';
  return `${base}\n\nIt's in use in ${where} ${names}, and will be taken out along with its cards on the table there.`;
}
