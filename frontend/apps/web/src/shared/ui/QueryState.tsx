import type { ReactNode } from "react";
import { resolveErrorMessage } from "@/shared/api";

interface QueryStateProps {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  errorFallback: string;
  loading?: ReactNode;
  children: ReactNode;
}

export const QueryState = ({ isLoading, isError, error, errorFallback, loading, children }: QueryStateProps) => {
  if (isLoading) return <>{loading ?? <p className="text-[13px] text-subtle">Загрузка…</p>}</>;
  if (isError) return <p className="text-[13px] text-danger">{resolveErrorMessage(error, errorFallback)}</p>;
  return <>{children}</>;
};
