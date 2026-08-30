import { Suspense, type ReactNode } from "react";
import { createBrowserRouter } from "react-router";
import { ROUTES } from "@/shared/config";
import { EditorPage, HomePage, PublicPreviewPage } from "./lazyPages";
import { RouteErrorBoundary } from "./RouteErrorBoundary";
import { RouteFallback } from "./RouteFallback";

function lazyRoute(element: ReactNode): ReactNode {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<RouteFallback />}>{element}</Suspense>
    </RouteErrorBoundary>
  );
}

export const router = createBrowserRouter([
  { path: ROUTES.home, element: lazyRoute(<HomePage />) },
  { path: ROUTES.editor(":id"), element: lazyRoute(<EditorPage />) },
  { path: ROUTES.publicPreview(":id"), element: lazyRoute(<PublicPreviewPage />) },
]);
