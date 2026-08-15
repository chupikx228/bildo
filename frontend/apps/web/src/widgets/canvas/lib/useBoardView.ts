import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { clamp } from "@/shared/lib";

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 3;

export interface View {
  x: number;
  y: number;
  zoom: number;
}

export const clampZoom = (z: number) => clamp(z, MIN_ZOOM, MAX_ZOOM);

export function useRefit(
  hostRef: RefObject<HTMLDivElement | null>,
  touchedRef: RefObject<boolean>,
  fitRef: RefObject<(() => void) | null>,
  screensLength: number,
) {
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!touchedRef.current) fitRef.current?.();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!touchedRef.current) fitRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screensLength]);
}

export function useBoardWheel(
  hostRef: RefObject<HTMLDivElement | null>,
  running: boolean,
  touchedRef: RefObject<boolean>,
  setView: Dispatch<SetStateAction<View>>,
) {
  useEffect(() => {
    const el = hostRef.current;
    if (!el || running) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      touchedRef.current = true;
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        setView((v) => {
          const zoom = clampZoom(v.zoom * Math.exp(-e.deltaY * 0.0022));
          const k = zoom / v.zoom;
          return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
        });
        return;
      }
      setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hostRef, running, touchedRef, setView]);
}
