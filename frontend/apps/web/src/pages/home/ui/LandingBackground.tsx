const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function LandingBackground() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <span className="absolute rounded-full blur-[80px] will-change-[transform,opacity] w-[min(72vw,640px)] h-[min(72vw,640px)] top-[-22%] left-[-14%] bg-[radial-gradient(circle_at_40%_40%,rgba(92,108,245,0.2)_0%,rgba(92,108,245,0.06)_45%,transparent_70%)] animate-orb-a" />
      <span className="absolute rounded-full blur-[80px] will-change-[transform,opacity] w-[min(68vw,560px)] h-[min(68vw,560px)] top-[4%] right-[-18%] bg-[radial-gradient(circle_at_50%_50%,rgba(167,139,250,0.18)_0%,rgba(99,102,241,0.07)_40%,transparent_68%)] animate-orb-b" />
      <span className="absolute rounded-full blur-[80px] will-change-[transform,opacity] w-[min(80vw,720px)] h-[min(52vw,480px)] bottom-[-26%] left-[16%] bg-[radial-gradient(circle_at_50%_40%,rgba(56,189,248,0.14)_0%,rgba(92,108,245,0.06)_42%,transparent_70%)] animate-orb-c" />
      <span className="absolute inset-[-20%] bg-[conic-gradient(from_180deg_at_50%_40%,rgba(92,108,245,0.05),rgba(14,165,233,0.03),rgba(139,92,246,0.04),transparent,rgba(92,108,245,0.04))] blur-[48px] opacity-90 animate-veil" />
      <span
        className="absolute inset-0 opacity-[0.022]"
        style={{ backgroundImage: GRAIN_URL, backgroundSize: "180px 180px" }}
      />
    </div>
  );
}
