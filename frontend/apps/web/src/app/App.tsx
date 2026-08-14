import { ApiClientProvider } from "@bildo/api";
import { RouterProvider } from "react-router";
import { apiClient } from "@/shared/api";
import { QueryProvider } from "./providers/QueryProvider";
import { router } from "./router";

export function App() {
  return (
    <ApiClientProvider client={apiClient}>
      <QueryProvider>
        <RouterProvider router={router} />
      </QueryProvider>
    </ApiClientProvider>
  );
}
