import type { Diff } from "../lib/planner";
import { DIFF_CHIP, DIFF_CLASS, DIFF_ROW } from "./classes";

export function DiffChips({ diff }: { diff: Diff[] }) {
  return (
    <div className={DIFF_ROW}>
      {diff.map((d) => (
        <span key={d.label} className={`${DIFF_CHIP} ${DIFF_CLASS[d.tone]}`}>
          {d.label}
        </span>
      ))}
    </div>
  );
}
