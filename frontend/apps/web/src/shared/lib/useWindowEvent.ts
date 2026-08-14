import { useEffect, useRef } from "react";

export function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const listener = (event: WindowEventMap[K]) => {
      handlerRef.current(event);
    };
    window.addEventListener(type, listener, options);
    return () => {
      window.removeEventListener(type, listener, options);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);
}
