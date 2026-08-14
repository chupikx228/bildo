export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ApiClientConfig {
  baseUrl: string;
  getAuthToken?: () => string | null | undefined;
}

interface ErrorResponseBody {
  error?: string;
}

export function createApiClient(config: ApiClientConfig) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = config.getAuthToken?.();

    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ErrorResponseBody | null;
      throw new ApiError(body?.error ?? response.statusText, response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  return {
    baseUrl: config.baseUrl,
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    put: <T>(path: string, body?: unknown) =>
      request<T>(path, {
        method: "PUT",
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
