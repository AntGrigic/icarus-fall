import type { FirebaseOptions } from 'firebase/app';

/**
 * Loads the Firebase web config from `public/firebase-config.json`.
 *
 * That file is git-ignored, so the keys never land in the repository:
 * - locally it sits in `public/` (see README),
 * - on GitHub the deploy workflow writes it from the FIREBASE_CONFIG repository secret.
 *
 * Without the file the app runs in DEMO MODE and keeps all data in this browser only.
 */
export async function loadFirebaseConfig(): Promise<FirebaseOptions | null> {
  try {
    const response = await fetch('firebase-config.json');
    if (!response.ok) return null;
    const config = (await response.json()) as FirebaseOptions;
    return config.apiKey && config.projectId ? config : null;
  } catch {
    return null; // missing file, or the dev server answered with the HTML page
  }
}
