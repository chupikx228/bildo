export const RAIL =
  "h-full min-h-0 flex flex-col bg-panel bg-[linear-gradient(180deg,rgba(92,108,245,0.06)_0%,rgba(92,108,245,0)_220px)]";
export const HEAD = "flex items-center gap-2 h-12 pl-3.5 pr-2.5 border-b border-line shrink-0";
export const HEAD_TITLE = "text-[12.5px] font-semibold text-text";
export const PENDING_BADGE =
  "text-[10px] font-semibold text-accent-strong bg-accent-soft rounded-full px-[7px] py-0.5 whitespace-nowrap";

const QUIET_BTN_BASE =
  "border border-line-strong rounded-lg bg-panel text-muted text-xs font-medium cursor-pointer hover:bg-accent-wash hover:border-accent-line hover:text-accent-strong";
export const QUIET_BTN = `${QUIET_BTN_BASE} px-2.5 py-1.5`;
export const ICON_BTN = `${QUIET_BTN_BASE} w-[26px] h-[26px] p-0 grid place-items-center`;

export const TRANSCRIPT = "flex-1 min-h-0 overflow-y-auto overscroll-contain";
export const TRANSCRIPT_INNER = "flex flex-col gap-3 px-3 pt-3.5 pb-4";

export const MSG = "flex flex-col gap-1.5 max-w-[92%] animate-msg-in";
export const MSG_USER = "self-end items-end";
export const MSG_AI = "self-start items-start";
export const MSG_WIDE = "max-w-full w-full";

const BUBBLE_BASE = "rounded-[14px] px-3 py-[9px] text-[13px] leading-[1.45] border border-transparent";
export const BUBBLE_USER = `${BUBBLE_BASE} bg-ink text-ink-fg rounded-br-[5px]`;
export const BUBBLE_AI = `${BUBBLE_BASE} bg-surface text-text-soft border-line rounded-bl-[5px]`;

export const NOTE = "self-center text-[11px] text-subtle px-2 py-0.5";
export const TYPING = "inline-flex items-center gap-1 h-4";
export const TYPING_DOT = "w-[5px] h-[5px] rounded-full bg-faint animate-typing";

export const EMPTY_STATE = "px-0.5 pt-2.5 pb-1";
export const EMPTY_TEXT = "m-0 mb-3 text-[12.5px] leading-[1.5] text-muted";
export const EXAMPLES = "flex flex-col gap-1.5";
export const EXAMPLE =
  "text-left px-2.5 py-2 rounded-control border border-line-strong bg-panel text-muted text-xs cursor-pointer transition-[border-color,color] duration-[.16s] ease-[ease] hover:border-accent-line hover:text-text";

export const FOOTER = "shrink-0 border-t border-line bg-panel";
export const COMPOSER = "flex items-end gap-2 p-2.5 shrink-0";
export const FIELD =
  "flex-1 min-w-0 flex items-center gap-2 rounded-[11px] border border-line-strong bg-panel px-2.5 py-2 transition-[border-color,box-shadow] duration-[.16s] ease-[ease] focus-within:border-[#b9c0fa] focus-within:shadow-[0_0_0_3px_rgba(92,108,245,0.12)]";
export const FIELD_ICON = "shrink-0 text-subtle";
export const TEXTAREA =
  "flex-1 min-w-0 resize-none border-0 outline-0 bg-transparent text-text font-ui font-normal text-[13px] leading-[18px] max-h-[108px] placeholder:text-faint";
export const SEND =
  "w-9 h-9 shrink-0 grid place-items-center border-0 rounded-[11px] bg-[linear-gradient(180deg,#6b7bff,var(--color-accent-strong))] text-ink-fg cursor-pointer shadow-[0_4px_12px_rgba(92,108,245,0.28)] transition-[background,opacity,transform,box-shadow] duration-[.16s] ease-[ease] disabled:opacity-[.28] disabled:cursor-not-allowed disabled:shadow-none enabled:hover:bg-[linear-gradient(180deg,#7c8aff,#4450c4)] enabled:hover:shadow-[0_6px_16px_rgba(92,108,245,0.36)] enabled:active:scale-[0.94]";
export const ATTACH = "relative shrink-0";
export const CLIP =
  "w-9 h-9 grid place-items-center border border-transparent rounded-[11px] bg-transparent text-subtle cursor-pointer p-0 transition-[background,color,border-color] duration-[.14s] ease-[ease] hover:bg-accent-wash hover:border-accent-line hover:text-accent-strong";
export const CLIP_OPEN = "bg-accent-wash border-accent-line text-accent-strong";
export const CLIP_MENU =
  "fixed w-[236px] p-1.5 rounded-[14px] border border-line-strong bg-[rgba(255,255,255,0.98)] backdrop-blur-[18px] shadow-lg z-[90] animate-clip-in [&_button]:flex [&_button]:items-center [&_button]:gap-2.5 [&_button]:w-full [&_button]:px-2.5 [&_button]:py-[9px] [&_button]:border-0 [&_button]:rounded-control [&_button]:bg-transparent [&_button]:text-text-soft [&_button]:font-ui [&_button]:text-[13px] [&_button]:text-left [&_button]:cursor-pointer [&_button:hover]:bg-accent-wash [&_button_svg]:shrink-0 [&_button_svg]:text-accent";

export const COLLAPSED = "flex-1 min-h-0 flex flex-col items-center gap-3 pt-2.5";
export const COLLAPSED_BTN =
  "relative w-[34px] h-[34px] rounded-[10px] border border-line-strong bg-panel text-muted grid place-items-center cursor-pointer p-0";
export const COLLAPSED_BADGE =
  "absolute -top-[3px] -right-[3px] min-w-[15px] h-[15px] rounded-full bg-accent text-ink-fg text-[9px] font-bold grid place-items-center border-2 border-panel";
export const COLLAPSED_LABEL =
  "[writing-mode:vertical-rl] text-[11px] font-semibold tracking-[0.06em] text-subtle select-none";

const PROPOSAL_BASE = "w-full rounded-[14px] border shadow-md overflow-hidden";
export const PROPOSAL = `${PROPOSAL_BASE} border-line-strong bg-panel animate-proposal-in`;
export const COMMIT = `${PROPOSAL_BASE} border-[rgba(22,163,74,0.35)] bg-[#fcfdfc] animate-proposal-in`;
export const PROPOSAL_BODY = "flex gap-3 p-3";
export const PROPOSAL_TITLE = "text-[13px] font-semibold text-text mb-[3px]";
export const PROPOSAL_NOTE = "m-0 mb-2 text-xs leading-[1.45] text-muted";
export const ASSET_NAME =
  "inline-block mb-2 text-[11px] text-muted bg-surface border border-line-strong rounded-md px-1.5 py-0.5";
export const DIFF_ROW = "flex flex-wrap gap-[5px]";
export const DIFF_CHIP =
  "inline-flex items-center gap-1 px-[7px] py-[3px] rounded-md text-[11px] font-medium leading-none font-ui tabular-nums";
export const DIFF_CLASS: Record<"add" | "mod" | "del", string> = {
  add: "bg-ok-soft text-ok-strong",
  mod: "bg-warn-soft text-warn-strong",
  del: "bg-danger-soft text-danger-strong",
};
export const PROPOSAL_FOOT = "flex items-center gap-2 px-3 py-[9px] border-t border-line bg-[#fcfcfd]";
export const PROPOSAL_FOOT_TEXT = "text-[11px] text-subtle flex-1 min-w-0";
export const APPLY_BTN =
  "border-0 rounded-lg px-[13px] py-[7px] bg-[linear-gradient(180deg,#6b7bff,var(--color-accent-strong))] text-ink-fg text-xs font-semibold cursor-pointer shadow-[0_4px_12px_rgba(92,108,245,0.26)] hover:brightness-105";

export const PREVIEW_BASE = "w-[76px] h-[76px] rounded-[10px] border border-line-strong shrink-0 overflow-hidden grid";
export const PREVIEW_ASSET =
  "place-items-center bg-[radial-gradient(circle_at_30%_25%,#eef0ff,#dde0f7_45%,#c9cdef_100%)]";
export const PREVIEW_ORB =
  "w-11 h-11 rounded-full bg-[radial-gradient(circle_at_32%_28%,#ffffff_0%,#8b98ff_38%,#4a55c9_78%,#2a2f7a_100%)] shadow-[0_6px_14px_rgba(74,85,201,0.35),inset_0_-3px_8px_rgba(0,0,0,0.18)]";
export const PREVIEW_SWATCHES = "grid-cols-2 gap-0 place-items-stretch bg-surface";
export const PREVIEW_SCREEN = "place-items-center bg-panel";
export const PREVIEW_SCREEN_INNER = "w-10 h-[60px] rounded-md border border-line-strong p-[5px] flex flex-col gap-1";
export const PREVIEW_BAR = "h-[5px] rounded-[2px] bg-surface-hover";
export const PREVIEW_BAR_TALL = "h-3 rounded-[3px] bg-surface-hover";
export const PREVIEW_CTA = "mt-auto h-2 rounded-[3px] bg-accent-soft border border-accent-line";
export const PREVIEW_BUTTON = "px-3 py-1.5 rounded-lg bg-accent text-ink-fg text-[10px] font-semibold";

export const COMMIT_HEAD = "flex items-center gap-2 px-3 py-2.5";
export const COMMIT_CHECK = "w-[18px] h-[18px] rounded-full bg-ok-soft text-ok grid place-items-center shrink-0";
export const COMMIT_TITLE = "text-[12.5px] font-semibold text-text min-w-0 flex-1";
export const COMMIT_HASH = "text-[10.5px] text-subtle bg-surface border border-line-strong rounded-[5px] px-1.5 py-0.5";
export const COMMIT_FILES = "px-3 pb-2.5 flex flex-col gap-1";
export const COMMIT_FILE = "flex items-center gap-2 text-[11px]";
export const COMMIT_FILE_PATH = "text-muted overflow-hidden text-ellipsis whitespace-nowrap flex-1 min-w-0";
export const COMMIT_FILE_STAT = "text-ok tabular-nums shrink-0";
