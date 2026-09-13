import type { AccessLevel } from "../../lib/status/access";
import { accessChipClass, accessLabel } from "../../lib/status/labels";

export function AccessChip({ level }: { level: AccessLevel }) {
  const label = accessLabel(level);
  if (!label) return null;
  return <span className={`chip ${accessChipClass(level)}`}>{label}</span>;
}
