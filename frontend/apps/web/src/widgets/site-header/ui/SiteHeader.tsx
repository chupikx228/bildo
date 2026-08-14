import type { ReactNode } from "react";
import { BildoLogo } from "@/shared/ui";
import { ROUTES } from "@/shared/config";
import styles from "./SiteHeader.module.css";

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className={styles.header}>
      <BildoLogo size="md" href={ROUTES.home} />
      {children}
    </header>
  );
}
