import { useSearchParams } from "react-router";

export function useSearchFlag(key: string) {
  const [params, setParams] = useSearchParams();

  return {
    on: params.has(key),
    setOn: () =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set(key, "1");
        return next;
      }),
    setOff: () =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(key);
          return next;
        },
        { replace: true },
      ),
  };
}
