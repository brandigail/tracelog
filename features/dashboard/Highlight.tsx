import { splitMatches } from "@/lib/highlight";

/** Text with every match of the search term wrapped in <mark>. The query is plain text, never a pattern. */
export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  return (
    <>
      {splitMatches(text, query).map((segment, i) => (segment.match ? <mark key={i}>{segment.text}</mark> : <span key={i}>{segment.text}</span>))}
    </>
  );
}
