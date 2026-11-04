/**
 * A panel's result can come from this browser's cache or from the automatic AI run saved on the server. The newer one wins,
 * so a cached result from an old ZIP can't sit beside the newest ZIP's verdict, and a button run after the AI still sticks.
 */
export function pickNewest<T extends { generatedAt?: string }>(local: T | null, saved: T | null | undefined): { value: T | null; fromSaved: boolean } {
  if (!saved) return { value: local, fromSaved: false };
  if (!local) return { value: saved, fromSaved: true };
  const savedAt = Date.parse(saved.generatedAt ?? '');
  const localAt = Date.parse(local.generatedAt ?? '');
  return savedAt > localAt || (Number.isNaN(localAt) && !Number.isNaN(savedAt))
    ? { value: saved, fromSaved: true }
    : { value: local, fromSaved: false };
}
