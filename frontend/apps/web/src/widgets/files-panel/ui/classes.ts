export const PANEL = "relative min-w-0 flex flex-col overflow-hidden bg-panel border-r border-line-strong";
export const HEAD = "h-12 shrink-0 pl-3.5 pr-2 border-b border-line flex items-center gap-2";
export const HEAD_TITLE = "font-semibold text-xs leading-none font-ui text-text tracking-[0.01em]";
export const HEAD_COUNT = "text-[11px] text-subtle";
export const HEAD_BTN =
  "w-[26px] h-[26px] grid place-items-center border-0 rounded-[7px] bg-transparent text-subtle cursor-pointer p-0 shrink-0 transition-[background,color] duration-[.14s] ease-[ease] hover:bg-accent-wash hover:text-accent-strong";
export const SEARCH_WRAP = "px-2.5 py-2 shrink-0";
export const SEARCH = "flex items-center gap-[7px] h-[30px] px-[9px] rounded-lg bg-surface border border-line";
export const SEARCH_ICON = "text-subtle shrink-0";
export const SEARCH_INPUT =
  "flex-1 min-w-0 border-0 outline-0 bg-transparent text-text font-ui font-normal text-xs leading-[1.4]";
export const SEARCH_CLEAR = "border-0 bg-transparent text-subtle cursor-pointer p-0 grid place-items-center";
export const BODY = "flex-1 min-h-0 overflow-y-auto px-1.5 pb-3";

export const ROW_LAYOUT =
  "flex items-center gap-[7px] w-full h-[27px] pr-2 border-0 rounded-[7px] bg-transparent text-xs leading-none text-left transition-[background] duration-[.12s] ease-[ease]";
export const ROW_NAME = "flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left";
export const ROW_SIZE = "shrink-0 text-[10px] text-faint font-normal";
export const FILE_ROW_ACTIVE = "bg-accent-soft text-accent-strong font-semibold";
export const FILE_ROW_INACTIVE = "text-muted font-normal hover:bg-surface";
export const DIR_ROW = `${ROW_LAYOUT} cursor-pointer text-muted font-[550] hover:bg-surface`;
export const UPLOAD_ROW = `${ROW_LAYOUT} cursor-default text-muted font-normal`;

export const CHEVRON = "shrink-0 text-subtle transition-transform duration-[.14s] ease-[ease]";
export const CHEVRON_OPEN = "rotate-90";
export const FOLDER_ICON = "shrink-0 text-accent";

export const GROUP_LABEL = "flex items-center gap-2 px-2.5 pt-1.5 pb-1";
export const GROUP_LABEL_TEXT = "text-[10px] font-[650] tracking-[0.07em] uppercase text-faint";
export const GROUP_ACTION =
  "border-0 bg-transparent text-accent-strong font-ui text-[11px] font-semibold cursor-pointer p-0";

export const DROPZONE =
  "flex flex-col items-center gap-[3px] w-[calc(100%-4px)] mx-0.5 mt-1 mb-2.5 px-2.5 py-3.5 rounded-[11px] border border-dashed border-line-strong bg-transparent text-subtle cursor-pointer transition-[border-color,background,color] duration-[.14s] ease-[ease] hover:border-accent-line hover:bg-accent-wash hover:text-accent-strong";
export const DROPZONE_TITLE = "text-xs font-semibold";
export const DROPZONE_HINT = "text-[11px]";
export const REMOVE_UPLOAD =
  "shrink-0 w-[18px] h-[18px] grid place-items-center border-0 rounded-[5px] bg-transparent text-faint cursor-pointer p-0 hover:text-danger";
export const EMPTY = "mx-2.5 my-[18px] text-xs text-subtle text-center";

export const OVERLAY =
  "absolute inset-1.5 z-[5] flex flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-accent-line bg-[rgba(246,247,255,0.92)] backdrop-blur-[6px] text-accent-strong pointer-events-none";
export const OVERLAY_TITLE = "text-[13px] font-semibold";
export const OVERLAY_HINT = "text-[11px] opacity-75";
