import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger" | "quiet";
  on?: boolean;
}

const VARIANT: Record<NonNullable<ButtonProps["variant"]>, string | undefined> = {
  default: undefined,
  primary: styles.primary,
  danger: styles.danger,
  quiet: styles.quiet,
};

export function Button({ variant = "default", on, className, ...props }: ButtonProps) {
  const classes = [styles.button, VARIANT[variant], on && styles.on, className].filter(Boolean).join(" ");
  return <button className={classes} {...props} />;
}
