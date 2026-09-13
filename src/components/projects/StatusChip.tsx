import type { ProjectStatus } from "../../lib/status/aggregate";
import { statusChipClass, statusLabel } from "../../lib/status/labels";

export function StatusChip({ status }: { status: ProjectStatus }) {
  return <span className={`chip ${statusChipClass(status)}`}>{statusLabel(status)}</span>;
}
