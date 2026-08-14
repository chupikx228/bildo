import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useApiClient } from "../context";
import { appDocumentSchema, appSummarySchema, type AppDocument, type AppSummary } from "./model";

const createAppResponseSchema = z.object({ id: z.string() });

export const appsKeys = {
  all: ["apps"] as const,
  list: () => [...appsKeys.all, "list"] as const,
  detail: (id: string) => [...appsKeys.all, "detail", id] as const,
};

export function useApps() {
  const client = useApiClient();
  return useQuery({
    queryKey: appsKeys.list(),
    queryFn: async () => {
      const data = await client.get<{ apps: AppSummary[] }>("/apps");
      return appSummarySchema.array().parse(data.apps);
    },
  });
}

export function useApp(id: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: appsKeys.detail(id),
    queryFn: async () => {
      const data = await client.get<{ id: string; name: string; slug?: string; document: AppDocument }>(`/apps/${id}`);
      return appDocumentSchema.parse(data.document);
    },
    enabled: Boolean(id),
  });
}

export function useCreateApp() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { prompt: string; name?: string }) => {
      const data = await client.post<unknown>("/apps", input);
      return createAppResponseSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appsKeys.list() });
    },
  });
}

export function useSaveApp(id: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (document: AppDocument) => {
      const data = await client.put<{ ok: true; document: AppDocument }>(`/apps/${id}`, document);
      return appDocumentSchema.parse(data.document);
    },
    onSuccess: (document) => {
      queryClient.setQueryData(appsKeys.detail(id), document);
    },
  });
}

export function useDeleteApp() {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.delete<{ ok: true }>(`/apps/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: appsKeys.list() });
    },
  });
}

export function getExportUrl(baseUrl: string, id: string): string {
  return `${baseUrl}/apps/${id}/export`;
}
