export const ROUTES = {
  home: "/",
  editor: (id: string) => `/editor/${id}`,
  publicPreview: (id: string) => `/p/${id}`,
} as const;
