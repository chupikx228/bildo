import styles from "./LandingBackground.module.css";

export function LandingBackground() {
  return (
    <div className={styles.aurora} aria-hidden="true">
      <span className={[styles.orb, styles.orbA].join(" ")} />
      <span className={[styles.orb, styles.orbB].join(" ")} />
      <span className={[styles.orb, styles.orbC].join(" ")} />
      <span className={styles.veil} />
      <span className={styles.grain} />
    </div>
  );
}
