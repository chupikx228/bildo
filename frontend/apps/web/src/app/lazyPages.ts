import { lazy } from "react";

export const HomePage = lazy(() => import("@/pages/home").then((m) => ({ default: m.HomePage })));
export const EditorPage = lazy(() => import("@/pages/editor").then((m) => ({ default: m.EditorPage })));
export const PublicPreviewPage = lazy(() =>
  import("@/pages/public-preview").then((m) => ({ default: m.PublicPreviewPage })),
);
