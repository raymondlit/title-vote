/** Full-width ASCII (e.g. Chinese IME "ａｂｃ１２３") to half-width; strip invisible/whitespace chars. */
export function normalizePassword(raw: string) {
  return raw
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .trim();
}

export function hasFullWidth(raw: string) {
  return /[\uFF01-\uFF5E\u3000]/.test(raw);
}

/** Transient transport failures worth an automatic retry (not wrong passwords). */
export function isTransientLoginError(error: { status?: number | undefined; message?: string | undefined; name?: string | undefined }) {
  return (
    error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504 ||
    /network|fetch|timeout|AuthRetryableFetchError/i.test(`${error.name ?? ""} ${error.message ?? ""}`)
  );
}
