import type { Commit, Diff, Proposal } from "../lib/planner";
import styles from "./Assistant.module.css";

const DIFF_CLASS: Record<Diff["tone"], string> = {
  add: styles.diffAdd!,
  mod: styles.diffMod!,
  del: styles.diffDel!,
};

function DiffChips({ diff }: { diff: Diff[] }) {
  return (
    <div className={styles.diffRow}>
      {diff.map((d) => (
        <span key={d.label} className={[styles.diffChip, DIFF_CLASS[d.tone]].join(" ")}>
          {d.label}
        </span>
      ))}
    </div>
  );
}

function ProposalPreview({ proposal }: { proposal: Proposal }) {
  if (proposal.kind === "asset3d") {
    return (
      <div className={[styles.preview, styles.previewAsset].join(" ")}>
        <div className={styles.previewOrb} />
      </div>
    );
  }

  if (proposal.kind === "theme") {
    return (
      <div className={[styles.preview, styles.previewSwatches].join(" ")}>
        {(proposal.swatches ?? []).map((c) => (
          <div key={c} style={{ background: c }} />
        ))}
      </div>
    );
  }

  if (proposal.kind === "screen") {
    return (
      <div className={[styles.preview, styles.previewScreen].join(" ")}>
        <div className={styles.previewScreenInner}>
          <div className={styles.previewBarTall} />
          <div className={styles.previewBar} />
          <div className={styles.previewBar} style={{ width: "70%" }} />
          <div className={styles.previewCta} />
        </div>
      </div>
    );
  }

  return (
    <div className={[styles.preview, styles.previewScreen].join(" ")}>
      <div className={styles.previewButton}>Кнопка</div>
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
    <div className={styles.proposal}>
      <div className={styles.proposalBody}>
        <ProposalPreview proposal={proposal} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.proposalTitle}>{proposal.title}</div>
          <p className={styles.proposalNote}>{proposal.note}</p>
          {proposal.assetName && <code className={styles.assetName}>{proposal.assetName}</code>}
          <DiffChips diff={proposal.diff} />
        </div>
      </div>

      <div className={styles.proposalFoot}>
        <span className={styles.proposalFootText}>{proposal.files.length} файл(ов) в изменении</span>
        <button type="button" onClick={onReject} className={styles.quietBtn}>
          Отклонить
        </button>
        <button type="button" onClick={onAccept} className={styles.applyBtn}>
          Применить
        </button>
      </div>
    </div>
  );
}

export function CommitCard({ commit }: { commit: Commit }) {
  return (
    <div className={styles.commit}>
      <div className={styles.commitHead}>
        <span className={styles.commitCheck}>
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
        <span className={styles.commitTitle}>{commit.title}</span>
        <code className={styles.commitHash}>{commit.hash}</code>
      </div>

      <div className={styles.commitFiles}>
        {commit.files.map((f) => (
          <div key={f.path} className={styles.commitFile}>
            <span className={styles.commitFilePath}>{f.path}</span>
            <span className={styles.commitFileStat}>{f.stat}</span>
          </div>
        ))}
        <div style={{ marginTop: 4 }}>
          <DiffChips diff={commit.diff} />
        </div>
      </div>
    </div>
  );
}
