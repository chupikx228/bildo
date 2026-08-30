import { z } from "zod";

export const appNavTypeSchema = z.enum(["tabs", "stack", "drawer"]);
export type AppNavType = z.infer<typeof appNavTypeSchema>;

export const appComponentTypeSchema = z.enum([
  "View",
  "Text",
  "Button",
  "Image",
  "TextInput",
  "ScrollView",
  "FlatList",
  "Spacer",
]);
export type AppComponentType = z.infer<typeof appComponentTypeSchema>;

export const appThemeTokensSchema = z.object({
  colorBg: z.string(),
  colorSurface: z.string(),
  colorBorder: z.string(),
  colorText: z.string(),
  colorTextMuted: z.string(),
  colorPrimary: z.string(),
  colorPrimaryFg: z.string(),
  radiusBase: z.string(),
  fontBody: z.string(),
  fontHeading: z.string(),
});
export type AppThemeTokens = z.infer<typeof appThemeTokensSchema>;

export const appNodeLayoutSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  zIndex: z.number().optional(),
});
export type AppNodeLayout = z.infer<typeof appNodeLayoutSchema>;

export const appNodeAnimationSchema = z.enum(["float", "pulse", "breathe", "shimmer", "rise", "drift"]);
export type AppNodeAnimation = z.infer<typeof appNodeAnimationSchema>;

export const appNodeStyleSchema = z.object({
  flex: z.number().optional(),
  flexDirection: z.enum(["row", "column"]).optional(),
  alignItems: z.enum(["flex-start", "center", "flex-end", "stretch"]).optional(),
  justifyContent: z.enum(["flex-start", "center", "flex-end", "space-between", "space-around"]).optional(),
  gap: z.number().optional(),
  padding: z.number().optional(),
  paddingHorizontal: z.number().optional(),
  paddingVertical: z.number().optional(),
  margin: z.number().optional(),
  marginTop: z.number().optional(),
  marginBottom: z.number().optional(),
  backgroundColor: z.string().optional(),
  backgroundGradient: z.string().optional(),
  color: z.string().optional(),
  fontSize: z.number().optional(),
  fontWeight: z.enum(["400", "500", "600", "700"]).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  letterSpacing: z.number().optional(),
  lineHeight: z.number().optional(),
  borderRadius: z.number().optional(),
  borderWidth: z.number().optional(),
  borderColor: z.string().optional(),
  shadow: z.string().optional(),
  width: z.union([z.number(), z.literal("100%")]).optional(),
  height: z.number().optional(),
  opacity: z.number().optional(),
  animation: appNodeAnimationSchema.optional(),
});
export type AppNodeStyle = z.infer<typeof appNodeStyleSchema>;

export const appActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), route: z.string() }),
  z.object({
    type: z.literal("setVar"),
    name: z.string(),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
  z.object({ type: z.literal("toast"), message: z.string() }),
  z.object({ type: z.literal("openUrl"), url: z.string() }),
]);
export type AppAction = z.infer<typeof appActionSchema>;

export const appNodePropsSchema = z.object({
  text: z.string().optional(),
  placeholder: z.string().optional(),
  source: z.string().optional(),
  href: z.string().optional(),
  data: z.array(z.string()).optional(),
  textBind: z.string().optional(),
  valueBind: z.string().optional(),
  onPress: z.array(appActionSchema).optional(),
  onChange: z.array(appActionSchema).optional(),
});
export type AppNodeProps = z.infer<typeof appNodePropsSchema>;

export interface AppNode {
  id: string;
  type: AppComponentType;
  name?: string;
  props?: AppNodeProps;
  style?: AppNodeStyle;
  layout?: AppNodeLayout;
  field?: number;
  groupId?: string;
  hidden?: boolean;
  locked?: boolean;
  children?: AppNode[];
}

export const appNodeSchema: z.ZodType<AppNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: appComponentTypeSchema,
    name: z.string().optional(),
    props: appNodePropsSchema.optional(),
    style: appNodeStyleSchema.optional(),
    layout: appNodeLayoutSchema.optional(),
    field: z.number().optional(),
    groupId: z.string().optional(),
    hidden: z.boolean().optional(),
    locked: z.boolean().optional(),
    children: z.array(appNodeSchema).optional(),
  }),
);

export const appScreenSchema = z.object({
  id: z.string(),
  name: z.string(),
  route: z.string(),
  icon: z.string().optional(),
  root: appNodeSchema,
});
export type AppScreen = z.infer<typeof appScreenSchema>;

export const appNavigationSchema = z.object({
  type: appNavTypeSchema,
  roots: z.array(z.string()),
});
export type AppNavigation = z.infer<typeof appNavigationSchema>;

export const appDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
  prompt: z.string().optional(),
  theme: appThemeTokensSchema,
  navigation: appNavigationSchema,
  screens: z.array(appScreenSchema),
  state: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AppDocument = z.infer<typeof appDocumentSchema>;

export const appSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string().optional(),
  updatedAt: z.string(),
});
export type AppSummary = z.infer<typeof appSummarySchema>;

export const generationStatusSchema = z.enum(["pending", "ready", "failed"]);
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

export const appDetailSchema = z.object({
  document: appDocumentSchema,
  generationStatus: generationStatusSchema,
  generationError: z.string().nullable(),
});
export type AppDetail = z.infer<typeof appDetailSchema>;

export const modelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  pro: z.boolean(),
});
export type ModelInfo = z.infer<typeof modelInfoSchema>;

export const createAppRequestSchema = z.object({
  prompt: z.string().min(3),
  name: z.string().optional(),
  model: z.string().optional(),
});
export type CreateAppRequest = z.infer<typeof createAppRequestSchema>;

export const APP_STAGE_WIDTH = 370;
export const APP_STAGE_HEIGHT = 640;

export const DEFAULT_APP_THEME: AppThemeTokens = {
  colorBg: "#09090B",
  colorSurface: "#18181B",
  colorBorder: "#27272A",
  colorText: "#FAFAFA",
  colorTextMuted: "#A1A1AA",
  colorPrimary: "#5C6CF5",
  colorPrimaryFg: "#FFFFFF",
  radiusBase: "12px",
  fontBody: "System",
  fontHeading: "System",
};

export const DEFAULT_NODE_SIZE: Record<AppComponentType, { width: number; height: number }> = {
  View: { width: 320, height: 120 },
  Text: { width: 280, height: 36 },
  Button: { width: 200, height: 48 },
  Image: { width: 320, height: 160 },
  TextInput: { width: 320, height: 48 },
  ScrollView: { width: APP_STAGE_WIDTH, height: APP_STAGE_HEIGHT },
  FlatList: { width: 320, height: 200 },
  Spacer: { width: 320, height: 16 },
};
