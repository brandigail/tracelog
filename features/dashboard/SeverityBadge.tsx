import type { Severity } from "@/types";

const STYLE: Record<Severity, string> = {
  INFO: "bg-info/15 text-info",
  WARN: "bg-warn/15 text-warn",
  ERROR: "bg-error/15 text-error",
};

/** The level is always written out, so it never relies on colour alone. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`inline-block w-14 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[11px] font-bold ${STYLE[severity]}`}>{severity}</span>;
}
