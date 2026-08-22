import type { Proposal } from "../lib/planner";
import {
  APPLY_BTN,
  ASSET_NAME,
  PROPOSAL,
  PROPOSAL_BODY,
  PROPOSAL_FOOT,
  PROPOSAL_FOOT_TEXT,
  PROPOSAL_NOTE,
  PROPOSAL_TITLE,
  QUIET_BTN,
} from "./classes";
import { DiffChips } from "./DiffChips";
import { ProposalPreview } from "./ProposalPreview";

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
