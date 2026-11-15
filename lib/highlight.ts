export interface Segment {
  text: string;
  match: boolean;
}

/**
 * Splits text into plain and matching pieces for highlighting. Case-insensitive, and the query is treated as
 * plain text, never as a regular expression, so a search for "(" or ".*" is safe.
 */
export function splitMatches(text: string, query: string): Segment[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text, match: false }];
  const haystack = text.toLowerCase();
  const segments: Segment[] = [];
  let cursor = 0;
  let found = haystack.indexOf(needle, cursor);
  while (found !== -1) {
    if (found > cursor) segments.push({ text: text.slice(cursor, found), match: false });
    segments.push({ text: text.slice(found, found + needle.length), match: true });
    cursor = found + needle.length;
    found = haystack.indexOf(needle, cursor);
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments.length ? segments : [{ text, match: false }];
}

/** Escapes the characters that mean something to SQL LIKE, so a search is always a literal substring search. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
