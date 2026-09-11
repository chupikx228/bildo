import { BildoLogo } from "./BildoLogo";
import { LoaderAmbient } from "./LoaderAmbient";
import { LOADING_LABEL } from "./generationStages";

export function LoadingScreen() {
  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-board">
      <LoaderAmbient />

      <div className="relative flex flex-col items-center gap-5">
        <BildoLogo size="lg" />
        <div className="relative h-1.5 w-[220px] overflow-hidden rounded-full bg-surface">
          <span className="absolute inset-y-0 left-0 w-2/5 animate-loader-bar rounded-full bg-[linear-gradient(90deg,rgba(92,108,245,0)_0%,var(--color-accent)_55%,#6b7bff_100%)] shadow-[0_0_12px_rgba(92,108,245,0.45)]" />
        </div>
        <p className="text-[13px] text-muted">{LOADING_LABEL}</p>
      </div>
    </div>
  );
}
