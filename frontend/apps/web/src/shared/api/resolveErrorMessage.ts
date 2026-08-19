import { ApiError } from "@bildo/api";

export const resolveErrorMessage = (error: unknown, fallback: string) => {
  return error instanceof ApiError ? error.message : fallback;
};
