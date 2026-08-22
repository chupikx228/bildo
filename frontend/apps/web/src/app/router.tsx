import { Suspense, type ReactNode } from "react";
import { createBrowserRouter } from "react-router";
import { ROUTES } from "@/shared/config";
import { EditorPage, HomePage, PublicPreviewPage } from "./lazyPages";
import { RouteFallback } from "./RouteFallback";

function lazyRoute(element: ReactNode): ReactNode {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  { path: ROUTES.home, element: lazyRoute(<HomePage />) },
  { path: ROUTES.editor(":id"), element: lazyRoute(<EditorPage />) },
  { path: ROUTES.publicPreview(":id"), element: lazyRoute(<PublicPreviewPage />) },
]);
