import { useRef, type RefObject } from "react";
import { useWindowEvent } from "./useWindowEvent";

export function useOutsideClick<T extends HTMLElement>(active: boolean, onOutside: () => void): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useWindowEvent("pointerdown", (event) => {
    if (!active) return;
    if (!ref.current?.contains(event.target as Node)) onOutside();
  });

  useWindowEvent("keydown", (event) => {
    if (!active) return;
    if (event.key === "Escape") onOutside();
  });

  return ref;
}
