/** HTTP forbids response bodies on these statuses, even an empty ArrayBuffer. */
export function relayResponseHasBody(method: string, status: number): boolean {
  return method.toUpperCase() !== "HEAD" && ![204, 205, 304].includes(status);
}