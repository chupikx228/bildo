import type { Proposal } from "../lib/planner";
import {
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
} from "./classes";

export function ProposalPreview({ proposal }: { proposal: Proposal }) {
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
