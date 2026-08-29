import type { CSSProperties } from "react";
import { ICON_REGISTRY, type IconDef, type IconName } from "./registry";

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  mono?: boolean;
}

export function Icon({ name, size = 16, className, style, mono = false }: IconProps) {
  const def: IconDef = ICON_REGISTRY[name];
  const brandStyle: CSSProperties | undefined = def.brandColor && !mono ? { color: def.brandColor, ...style } : style;

  return (
    <svg width={size} height={size} viewBox={def.viewBox} className={className} style={brandStyle} aria-hidden>
      {def.body}
    </svg>
  );
}
