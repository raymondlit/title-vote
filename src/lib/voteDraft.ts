export type DraftChoice = "recommend" | "not_recommend" | "abstain";
export type DraftSaveResult = { status: "saved"; savedAt: string } | { status: "empty" } | { status: "error" };

/** Never report durability until the browser write succeeds. */
export function saveVoteDraft(storage: Pick<Storage, "setItem" | "removeItem">, key: string, choices: Record<string, DraftChoice>): DraftSaveResult {
  try {
    if (Object.keys(choices).length === 0) {
      storage.removeItem(key);
      return { status: "empty" };
    }
    const savedAt = new Date().toISOString();
    storage.setItem(key, JSON.stringify({ choices, savedAt }));
    return { status: "saved", savedAt };
  } catch {
    return { status: "error" };
  }
}