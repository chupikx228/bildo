import { APP_STAGE_HEIGHT, APP_STAGE_WIDTH, type AppDocument } from "@bildo/api";

export const BEZEL = 11;
export const RADIUS_OUTER = 50;
export const RADIUS_INNER = 40;
export const TOP_H = 46;
export const HOME_H = 20;
export const TAB_H = 52;

export function hasTabs(document: AppDocument): boolean {
  return document.navigation.type === "tabs" && document.navigation.roots.length > 1;
}

export function phoneFrameSize(document: AppDocument): { width: number; height: number } {
  const tabH = hasTabs(document) ? TAB_H : 0;
  return {
    width: APP_STAGE_WIDTH + BEZEL * 2,
    height: TOP_H + APP_STAGE_HEIGHT + tabH + HOME_H + BEZEL * 2,
  };
}
