import type { Commit, Diff, Proposal } from "../lib/planner";
import {
  APPLY_BTN,
  ASSET_NAME,
  COMMIT,
  COMMIT_CHECK,
  COMMIT_FILE,
  COMMIT_FILE_PATH,
  COMMIT_FILE_STAT,
  COMMIT_FILES,
  COMMIT_HASH,
  COMMIT_HEAD,
  COMMIT_TITLE,
  DIFF_CHIP,
  DIFF_CLASS,
  DIFF_ROW,
  PREVIEW_ASSET,
  PREVIEW_BAR,
  PREVIEW_BAR_TALL,
  PREVIEW_BASE,
  PREVIEW_BUTTON,
  PREVIEW_CTA,
  PREVIEW_ORB,
  PREVIEW_SCREEN,
  PREVIEW_SCREEN_INNER,
  PREVIEW_SWATCHES,
  PROPOSAL,
  PROPOSAL_BODY,
  PROPOSAL_FOOT,
  PROPOSAL_FOOT_TEXT,
  PROPOSAL_NOTE,
  PROPOSAL_TITLE,
  QUIET_BTN,
} from "./classes";

function DiffChips({ diff }: { diff: Diff[] }) {
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

function ProposalPreview({ proposal }: { proposal: Proposal }) {
  if (proposal.kind === "asset3d") {
    return (
      <div className={`${PREVIEW_BASE} ${PREVIEW_ASSET}`}>
        <div className={PREVIEW_ORB} />
      </div>
    );
  }

  if (proposal.kind === "theme") {
    return (
      <div className={`${PREVIEW_BASE} ${PREVIEW_SWATCHES}`}>
        {(proposal.swatches ?? []).map((c) => (
          <div key={c} style={{ background: c }} />
        ))}
      </div>
    );
  }

  if (proposal.kind === "screen") {
    return (
      <div className={`${PREVIEW_BASE} ${PREVIEW_SCREEN}`}>
        <div className={PREVIEW_SCREEN_INNER}>
          <div className={PREVIEW_BAR_TALL} />
          <div className={PREVIEW_BAR} />
          <div className={PREVIEW_BAR} style={{ width: "70%" }} />
          <div className={PREVIEW_CTA} />
        </div>
      </div>
    );
  }

  return (
    <div className={`${PREVIEW_BASE} ${PREVIEW_SCREEN}`}>
      <div className={PREVIEW_BUTTON}>Кнопка</div>
    </div>
  );
}

export function ProposalCard({
  proposal,
  onAccept,
  onReject,
}: {
  proposal: Proposal;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className={PROPOSAL}>
      <div className={PROPOSAL_BODY}>
        <ProposalPreview proposal={proposal} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={PROPOSAL_TITLE}>{proposal.title}</div>
          <p className={PROPOSAL_NOTE}>{proposal.note}</p>
          {proposal.assetName && <code className={ASSET_NAME}>{proposal.assetName}</code>}
          <DiffChips diff={proposal.diff} />
        </div>
      </div>

      <div className={PROPOSAL_FOOT}>
        <span className={PROPOSAL_FOOT_TEXT}>{proposal.files.length} файл(ов) в изменении</span>
        <button type="button" onClick={onReject} className={QUIET_BTN}>
          Отклонить
        </button>
        <button type="button" onClick={onAccept} className={APPLY_BTN}>
          Применить
        </button>
      </div>
    </div>
  );
}

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
