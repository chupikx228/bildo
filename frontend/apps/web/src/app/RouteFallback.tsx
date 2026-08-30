import { AppGeneratingScreen, LOADING_LABEL } from "@/shared/ui";

export function RouteFallback() {
  return <AppGeneratingScreen label={LOADING_LABEL} />;
}
