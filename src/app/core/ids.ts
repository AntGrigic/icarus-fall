const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Firestore-style id: 20 alphanumeric characters, safe to use as a map key or field path. */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let id = '';
  for (const b of bytes) id += ALPHABET[b % ALPHABET.length];
  return id;
}
