import { createBrowserRouter } from "react-router";
import { HomePage } from "@/pages/home";
import { EditorPage } from "@/pages/editor";
import { PublicPreviewPage } from "@/pages/public-preview";
import { ROUTES } from "@/shared/config";

export const router = createBrowserRouter([
  { path: ROUTES.home, element: <HomePage /> },
  { path: ROUTES.editor(":id"), element: <EditorPage /> },
  { path: ROUTES.publicPreview(":id"), element: <PublicPreviewPage /> },
]);
