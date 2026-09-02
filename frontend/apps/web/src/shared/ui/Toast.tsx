export type ToastTone = "success" | "warning";

const TONES: Record<ToastTone, string> = {
  success: "bg-ok-soft text-ok-strong",
  warning: "bg-warn-soft text-warn-strong",
};

export function Toast({ message, tone = "success" }: { message: string | null; tone?: ToastTone }) {
  if (!message) return null;

  return (
    <div
      role="status"
      className={`animate-insert-pop pointer-events-none rounded-card px-3.5 py-2.5 text-[13px] font-medium shadow-md ${TONES[tone]}`}
    >
      {message}
    </div>
  );
}
