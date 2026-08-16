import type { Commit, Diff, Proposal } from "./planner";

const PROPOSAL_BASE = "w-full rounded-[14px] border shadow-md overflow-hidden";
const QUIET_BTN =
  "border border-line-strong rounded-lg px-2.5 py-1.5 bg-panel text-muted text-xs font-medium cursor-pointer hover:bg-accent-wash hover:border-accent-line hover:text-accent-strong";
const DIFF_CHIP =
  "inline-flex items-center gap-1 px-[7px] py-[3px] rounded-md text-[11px] font-medium leading-none font-ui tabular-nums";
const PREVIEW_BASE = "w-[76px] h-[76px] rounded-[10px] border border-line-strong shrink-0 overflow-hidden grid";

const DIFF_CLASS: Record<Diff["tone"], string> = {
  add: "bg-ok-soft text-ok-strong",
  mod: "bg-warn-soft text-warn-strong",
  del: "bg-danger-soft text-danger-strong",
};

function DiffChips({ diff }: { diff: Diff[] }) {
  return (
    <div className="flex flex-wrap gap-[5px]">
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
      <div
        className={`${PREVIEW_BASE} place-items-center bg-[radial-gradient(circle_at_30%_25%,#eef0ff,#dde0f7_45%,#c9cdef_100%)]`}
      >
        <div className="w-11 h-11 rounded-full bg-[radial-gradient(circle_at_32%_28%,#ffffff_0%,#8b98ff_38%,#4a55c9_78%,#2a2f7a_100%)] shadow-[0_6px_14px_rgba(74,85,201,0.35),inset_0_-3px_8px_rgba(0,0,0,0.18)]" />
      </div>
    );
  }

  if (proposal.kind === "theme") {
    return (
      <div className={`${PREVIEW_BASE} grid-cols-2 gap-0 place-items-stretch bg-surface`}>
        {(proposal.swatches ?? []).map((c) => (
          <div key={c} style={{ background: c }} />
        ))}
      </div>
    );
  }

  if (proposal.kind === "screen") {
    return (
      <div className={`${PREVIEW_BASE} place-items-center bg-panel`}>
        <div className="w-10 h-[60px] rounded-md border border-line-strong p-[5px] flex flex-col gap-1">
          <div className="h-3 rounded-[3px] bg-surface-hover" />
          <div className="h-[5px] rounded-[2px] bg-surface-hover" />
          <div className="h-[5px] rounded-[2px] bg-surface-hover" style={{ width: "70%" }} />
          <div className="mt-auto h-2 rounded-[3px] bg-accent-soft border border-accent-line" />
        </div>
      </div>
    );
  }

  return (
    <div className={`${PREVIEW_BASE} place-items-center bg-panel`}>
      <div className="px-3 py-1.5 rounded-lg bg-accent text-ink-fg text-[10px] font-semibold">Кнопка</div>
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
    <div className={`${PROPOSAL_BASE} border-line-strong bg-panel animate-proposal-in`}>
      <div className="flex gap-3 p-3">
        <ProposalPreview proposal={proposal} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-[13px] font-semibold text-text mb-[3px]">{proposal.title}</div>
          <p className="m-0 mb-2 text-xs leading-[1.45] text-muted">{proposal.note}</p>
          {proposal.assetName && (
            <code className="inline-block mb-2 text-[11px] text-muted bg-surface border border-line-strong rounded-md px-1.5 py-0.5">
              {proposal.assetName}
            </code>
          )}
          <DiffChips diff={proposal.diff} />
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-[9px] border-t border-line bg-[#fcfcfd]">
        <span className="text-[11px] text-subtle flex-1 min-w-0">{proposal.files.length} файл(ов) в изменении</span>
        <button type="button" onClick={onReject} className={QUIET_BTN}>
          Отклонить
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="border-0 rounded-lg px-[13px] py-[7px] bg-[linear-gradient(180deg,#6b7bff,var(--color-accent-strong))] text-ink-fg text-xs font-semibold cursor-pointer shadow-[0_4px_12px_rgba(92,108,245,0.26)] hover:brightness-105"
        >
          Применить
        </button>
      </div>
    </div>
  );
}

export function CommitCard({ commit }: { commit: Commit }) {
  return (
    <div className={`${PROPOSAL_BASE} border-[rgba(22,163,74,0.35)] bg-[#fcfdfc] animate-proposal-in`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="w-[18px] h-[18px] rounded-full bg-ok-soft text-ok grid place-items-center shrink-0">
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
        <span className="text-[12.5px] font-semibold text-text min-w-0 flex-1">{commit.title}</span>
        <code className="text-[10.5px] text-subtle bg-surface border border-line-strong rounded-[5px] px-1.5 py-0.5">
          {commit.hash}
        </code>
      </div>

      <div className="px-3 pb-2.5 flex flex-col gap-1">
        {commit.files.map((f) => (
          <div key={f.path} className="flex items-center gap-2 text-[11px]">
            <span className="text-muted overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0">{f.path}</span>
            <span className="text-ok tabular-nums shrink-0">{f.stat}</span>
          </div>
        ))}
        <div style={{ marginTop: 4 }}>
          <DiffChips diff={commit.diff} />
        </div>
      </div>
    </div>
  );
}
