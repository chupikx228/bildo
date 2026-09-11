import { Suspense, type ReactNode } from "react";
import { createBrowserRouter } from "react-router";
import { ROUTES } from "@/shared/config";
import { HomePage, PublicPreviewPage } from "./lazyPages";
import { EditorRoute } from "./EditorRoute";
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
  { path: ROUTES.editor(":id"), element: lazyRoute(<EditorRoute />) },
  { path: ROUTES.publicPreview(":id"), element: lazyRoute(<PublicPreviewPage />) },
]);
