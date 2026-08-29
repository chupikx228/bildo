import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useApiClient } from "../context";
import { appDocumentSchema } from "./model";

export const chatRoleSchema = z.enum(["user", "assistant"]);
export type ChatRole = z.infer<typeof chatRoleSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  role: chatRoleSchema,
  content: z.string(),
  proposedDocument: appDocumentSchema.nullable(),
  accepted: z.boolean().nullable(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const taskStatusValueSchema = z.enum(["deferred", "queued", "in_progress", "complete", "not_found"]);
export type TaskStatusValue = z.infer<typeof taskStatusValueSchema>;

export const taskStatusSchema = z.object({
  id: z.string(),
  status: taskStatusValueSchema,
  result: z.unknown().nullable(),
  error: z.string().nullable(),
});
export type TaskStatus = z.infer<typeof taskStatusSchema>;

const sendChatResponseSchema = z.object({ taskId: z.string() });
const decisionResponseSchema = z.object({ ok: z.literal(true), message: chatMessageSchema });

export const chatKeys = {
  all: ["chat"] as const,
  messages: (appId: string) => [...chatKeys.all, appId, "messages"] as const,
  task: (taskId: string) => ["tasks", taskId] as const,
};

const RUNNING: TaskStatusValue[] = ["deferred", "queued", "in_progress"];

export function useChatMessages(appId: string) {
  const client = useApiClient();
  return useQuery({
    queryKey: chatKeys.messages(appId),
    queryFn: async () => {
      const data = await client.get<{ messages: unknown[] }>(`/apps/${appId}/chat/messages`);
      return chatMessageSchema.array().parse(data.messages);
    },
    enabled: Boolean(appId),
  });
}

export function useSendChatMessage(appId: string) {
  const client = useApiClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const data = await client.post<unknown>(`/apps/${appId}/chat/messages`, { content });
      return sendChatResponseSchema.parse(data);
    },
  });
}

export function useChatDecision(appId: string) {
  const client = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { messageId: string; accepted: boolean }) => {
      const data = await client.post<unknown>(`/apps/${appId}/chat/messages/${input.messageId}/decision`, {
        accepted: input.accepted,
      });
      return decisionResponseSchema.parse(data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(appId) });
    },
  });
}

export function useTaskStatus(taskId: string | null) {
  const client = useApiClient();
  return useQuery({
    queryKey: chatKeys.task(taskId ?? ""),
    queryFn: async () => {
      const data = await client.get<unknown>(`/tasks/${taskId}`);
      return taskStatusSchema.parse(data);
    },
    enabled: Boolean(taskId),
    refetchInterval: (query) => (query.state.data && RUNNING.includes(query.state.data.status) ? 800 : false),
  });
}
