import type { Commit } from "../lib/planner";
import {
  COMMIT,
  COMMIT_CHECK,
  COMMIT_FILE,
  COMMIT_FILE_PATH,
  COMMIT_FILE_STAT,
  COMMIT_FILES,
  COMMIT_HASH,
  COMMIT_HEAD,
  COMMIT_TITLE,
} from "./classes";
import { DiffChips } from "./DiffChips";

export function CommitCard({ commit }: { commit: Commit }) {
  return (
    <div className={COMMIT}>
      <div className={COMMIT_HEAD}>
        <span className={COMMIT_CHECK}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M1.8 5.2l2 2 4.4-4.4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className={COMMIT_TITLE}>{commit.title}</span>
        <code className={COMMIT_HASH}>{commit.hash}</code>
      </div>

      <div className={COMMIT_FILES}>
        {commit.files.map((f) => (
          <div key={f.path} className={COMMIT_FILE}>
            <span className={COMMIT_FILE_PATH}>{f.path}</span>
            <span className={COMMIT_FILE_STAT}>{f.stat}</span>
          </div>
        ))}
        <div style={{ marginTop: 4 }}>
          <DiffChips diff={commit.diff} />
        </div>
      </div>
    </div>
  );
}
