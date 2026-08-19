import { BildoLogo } from "@/shared/ui";
import { useSearchFlag } from "@/shared/lib";
import { CreateAppFlow } from "@/features/create-app-from-prompt";
import { SiteHeader } from "@/widgets/site-header";
import { AppsModal } from "@/widgets/apps-modal";
import { LandingBackground } from "./LandingBackground";

export function HomePage() {
  const appsModal = useSearchFlag("apps");

  return (
    <div className="relative isolate min-h-[100dvh] flex flex-col overflow-hidden text-text bg-panel">
      <LandingBackground />

      <SiteHeader>
        <button
          type="button"
          onClick={appsModal.setOn}
          className="text-muted no-underline text-[13px] bg-transparent border-0 cursor-pointer hover:text-accent-strong"
        >
          Мои приложения
        </button>
      </SiteHeader>

      <main className="relative z-[1] flex-1 flex flex-col items-center justify-center pt-10 px-5 pb-20 max-w-[720px] mx-auto w-full box-border">
        <div className="mb-8">
          <BildoLogo size="hero" />
        </div>
        <CreateAppFlow />
      </main>

      <AppsModal open={appsModal.on} onClose={appsModal.setOff} />
    </div>
  );
}
