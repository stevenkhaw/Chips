/** "K7QXM2PA" → "K7QX-M2PA" for display. The server accepts any case, spaces or hyphens. */
export function formatJoinCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
