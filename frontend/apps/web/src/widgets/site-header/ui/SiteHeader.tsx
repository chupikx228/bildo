import type { ReactNode } from "react";
import { BildoLogo } from "@/shared/ui";
import { ROUTES } from "@/shared/config";

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="relative z-[1] flex items-center justify-between gap-3 h-[68px] px-7 py-5 box-border">
      <BildoLogo size="md" href={ROUTES.home} />
      {children}
    </header>
  );
}
