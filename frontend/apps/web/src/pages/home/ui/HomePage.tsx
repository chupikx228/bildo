import { Link } from "react-router";
import { BildoLogo } from "@/shared/ui";
import { ROUTES } from "@/shared/config";
import { CreateAppFlow } from "@/features/create-app-from-prompt";
import { SiteHeader } from "@/widgets/site-header";
import { LandingBackground } from "./LandingBackground";
import styles from "./HomePage.module.css";

export function HomePage() {
  return (
    <div className={styles.landing}>
      <LandingBackground />

      <SiteHeader>
        <Link to={ROUTES.apps} className={styles.appsLink}>
          Мои приложения
        </Link>
      </SiteHeader>

      <main className={styles.main}>
        <div className={styles.heroLogo}>
          <BildoLogo size="hero" />
        </div>
        <CreateAppFlow />
      </main>
    </div>
  );
}
