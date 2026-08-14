export const ROUTES = {
  home: "/",
  apps: "/apps",
  editor: (id: string) => `/editor/${id}`,
  publicPreview: (id: string) => `/p/${id}`,
} as const;
