// Which version of the app is running, down to the over-the-air update: the app's own version (the same for every
// update to a build) isn't enough to tell one update from the next.
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/** A short label for the running version, e.g. "Version 1.1.0 · Update Oct 18, 9:42 PM · a1b2c3". */
export function versionLabel(): string {
  const version = `Version ${Constants.expoConfig?.version ?? '?'}`;
  if (__DEV__) return `${version} · Development`;
  if (Updates.isEmbeddedLaunch || !Updates.updateId) return `${version} · Built-in`;
  const when = Updates.createdAt
    ? Updates.createdAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;
  const id = Updates.updateId.replace(/-/g, '').slice(0, 6);
  return [version, when ? `Update ${when}` : 'Update', id].join(' · ');
}
