import { Link } from "react-router";
import { BildoLogo } from "@/shared/ui";
import { ROUTES } from "@/shared/config";
import { CreateAppFlow } from "@/features/create-app-from-prompt";
import { SiteHeader } from "@/widgets/site-header";
import { LandingBackground } from "./LandingBackground";

export function HomePage() {
  return (
    <div className="relative isolate min-h-[100dvh] flex flex-col overflow-hidden text-text bg-panel">
      <LandingBackground />

      <SiteHeader>
        <Link to={ROUTES.apps} className="text-muted no-underline text-[13px]">
          Мои приложения
        </Link>
      </SiteHeader>

      <main className="relative z-[1] flex-1 flex flex-col items-center justify-center pt-10 px-5 pb-20 max-w-[720px] mx-auto w-full box-border">
        <div className="mb-8">
          <BildoLogo size="hero" />
        </div>
        <CreateAppFlow />
      </main>
    </div>
  );
}
