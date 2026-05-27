/**
 * Minimal UUID v4 generator. Avoids adding the 'uuid' package as a dep
 * since Node 20 provides crypto.randomUUID natively.
 */
export function v4(): string {
  // Node 20+ has globalThis.crypto.randomUUID
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for older Node builds
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
