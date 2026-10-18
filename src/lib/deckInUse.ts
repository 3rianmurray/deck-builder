import type { SandboxTable } from './sandbox';
import type { Session } from './types';

/** Names as a list in words: "A", "A and B", "A, B and C". */
const listOf = (names: string[]) =>
  names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * What deleting a deck would do, for its "are you sure" prompt: it takes its card images with it; if any
 * sessions play it, it's taken out of those too (their tables for it are lost); and if any of its cards are on
 * tables (or in their hands), they leave those tables.
 */
export function deleteDeckWarning(deckId: string, sessions: Session[], tables: SandboxTable[] = []): string {
  const base = 'This removes the deck and all of its card images from this device.';
  const inSessions = sessions.filter((s) => s.deckIds.includes(deckId)).map((s) => `"${s.name}"`);
  const onTables = tables
    .filter((t) => t.stacks.some((s) => s.cards.some((c) => c.deckId === deckId)) || t.hands.some((h) => h.some((c) => c.deckId === deckId)))
    .map((t) => `"${t.name}"`);
  const notes: string[] = [];
  if (inSessions.length) {
    const where = inSessions.length === 1 ? 'the session' : 'the sessions';
    notes.push(`It's in use in ${where} ${listOf(inSessions)}, and will be taken out along with its cards on the table there.`);
  }
  if (onTables.length) {
    const where = onTables.length === 1 ? 'the table' : 'the tables';
    notes.push(`Its cards are on ${where} ${listOf(onTables)}, and will be taken off.`);
  }
  return [base, ...notes].join('\n\n');
}
