import { motion } from "framer-motion";
import { APP_STAGE_HEIGHT, APP_STAGE_WIDTH } from "@bildo/api";

const BEZEL = 11;
const RADIUS_OUTER = 50;
const RADIUS_INNER = 40;
const TOP_H = 46;
const HOME_H = 20;

const pulse = (delay: number) => ({
  animate: { opacity: [0.5, 0.8, 0.5] },
  transition: { duration: 2.6, repeat: Infinity, ease: "easeInOut" as const, delay },
});

export function BuildPhone() {
  return (
    <div
      aria-hidden
      className="relative box-border bg-[linear-gradient(155deg,#f0f0f3_0%,#d8d8de_32%,#b9b9c2_62%,#e6e6eb_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7),0_0_0_1px_rgba(16,16,20,0.1),0_24px_56px_rgba(16,16,20,0.16),0_6px_16px_rgba(16,16,20,0.08)]"
      style={{
        width: APP_STAGE_WIDTH + BEZEL * 2,
        height: TOP_H + APP_STAGE_HEIGHT + HOME_H + BEZEL * 2,
        borderRadius: RADIUS_OUTER,
        padding: BEZEL,
      }}
    >
      <div
        className="relative overflow-hidden bg-panel shadow-[inset_0_0_0_1px_rgba(16,16,20,0.1)]"
        style={{
          width: APP_STAGE_WIDTH,
          height: TOP_H + APP_STAGE_HEIGHT + HOME_H,
          borderRadius: RADIUS_INNER,
        }}
      >
        <div
          aria-hidden
          className="absolute left-1/2 top-2.5 z-[3] h-[34px] w-[118px] -translate-x-1/2 rounded-[18px] bg-ink"
        />

        <span
          className="anim-scan pointer-events-none absolute left-3 right-3 z-[2] h-16 rounded-full"
          style={{
            background:
              "linear-gradient(180deg,transparent,rgba(92,108,245,0.10)_42%,rgba(92,108,245,0.28)_54%,transparent)",
          }}
        />

        <div className="relative flex flex-col gap-3.5 px-4 pb-4" style={{ paddingTop: TOP_H + 16 }}>
          <div className="flex items-center gap-3">
            <motion.div className="loader-skeleton h-9 w-9 rounded-full" {...pulse(0)} />
            <div className="flex-1 space-y-2">
              <motion.div className="loader-skeleton h-2.5 w-1/2 rounded-full" {...pulse(0.06)} />
              <motion.div className="loader-skeleton h-2 w-1/3 rounded-full" {...pulse(0.12)} />
            </div>
          </div>

          <motion.div className="loader-skeleton h-24 rounded-[18px]" {...pulse(0.2)} />

          <motion.div className="loader-skeleton mt-1 h-2.5 w-24 rounded-full" {...pulse(0.3)} />

          <div className="grid grid-cols-2 gap-2.5">
            {[0.4, 0.48, 0.56, 0.64].map((d) => (
              <motion.div key={d} className="loader-skeleton h-[62px] rounded-[14px]" {...pulse(d)} />
            ))}
          </div>
        </div>

        <div className="absolute inset-x-4 z-[2]" style={{ bottom: HOME_H + 10 }}>
          <motion.div className="loader-skeleton h-11 rounded-[16px]" {...pulse(0.8)} />
        </div>
      </div>
    </div>
  );
}
