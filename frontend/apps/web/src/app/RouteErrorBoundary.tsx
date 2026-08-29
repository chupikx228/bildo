import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { ROUTES } from "@/shared/config";
import { ErrorScreen } from "@/shared/ui";
import { ErrorBoundary } from "./ErrorBoundary";

export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <ErrorBoundary
      resetKey={location.pathname}
      fallback={(error, reset) => (
        <ErrorScreen
          error={error}
          onRetry={reset}
          onGoHome={() => {
            reset();
            void navigate(ROUTES.home);
          }}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
