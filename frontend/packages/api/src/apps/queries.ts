import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useApiClient } from "../context";
import {
  appDetailSchema,
  appDocumentSchema,
  appSummarySchema,
  type AppDetail,
  type AppDocument,
  type AppSummary,
  type GenerationStatus,
} from "./model";

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
      const data = await client.get<{
        id: string;
        name: string;
        slug?: string;
        document: AppDocument;
        generationStatus: GenerationStatus;
        generationError?: string | null;
      }>(`/apps/${id}`);
      return appDetailSchema.parse({
        document: data.document,
        generationStatus: data.generationStatus,
        generationError: data.generationError ?? null,
      });
    },
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.generationStatus === "pending" ? 800 : false),
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
      queryClient.setQueryData<AppDetail>(appsKeys.detail(id), (prev) =>
        prev ? { ...prev, document } : { document, generationStatus: "ready", generationError: null },
      );
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
