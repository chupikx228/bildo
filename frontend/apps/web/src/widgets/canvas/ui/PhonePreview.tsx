import { APP_STAGE_HEIGHT, APP_STAGE_WIDTH, type AppDocument, type AppScreen } from "@bildo/api";
import { BEZEL, HOME_H, RADIUS_INNER, RADIUS_OUTER, TAB_H, TOP_H, hasTabs, phoneFrameSize } from "../lib/phoneFrame";
import { Canvas } from "./Canvas";

const TAB_ICONS: Record<string, string> = {
  home: "⌂",
  feed: "☰",
  search: "⌕",
  user: "○",
  today: "✓",
  chart: "▦",
  gear: "⚙",
  shop: "▣",
  cart: "▭",
  apps: "▣",
  form: "✎",
  check: "✓",
  info: "i",
};

export function PhonePreview({
  document,
  screen,
  editMode = true,
  onSelectScreen,
  onSetVar,
}: {
  document: AppDocument;
  screen: AppScreen;
  editMode?: boolean;
  onSelectScreen?: (id: string) => void;
  onSetVar?: (name: string, value: string | number | boolean) => void;
}) {
  const showTabs = hasTabs(document);
  const tabH = showTabs ? TAB_H : 0;
  const { width: outerW, height: outerH } = phoneFrameSize(document);

  function navigateRoute(route: string) {
    const target = document.screens.find((s) => s.route === route || s.route === route.replace(/^\//, ""));
    if (target) onSelectScreen?.(target.id);
  }

  const screenBg = document.theme.colorBg;

  return (
    <div
      className="relative box-border bg-[linear-gradient(155deg,#f0f0f3_0%,#d8d8de_32%,#b9b9c2_62%,#e6e6eb_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7),0_0_0_1px_rgba(16,16,20,0.1),0_24px_56px_rgba(16,16,20,0.16),0_6px_16px_rgba(16,16,20,0.08)] font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Text','Segoe_UI',system-ui,sans-serif]"
      style={{
        width: outerW,
        height: outerH,
        borderRadius: RADIUS_OUTER,
        padding: BEZEL,
      }}
    >
      {[
        { side: "left" as const, top: 118, h: 26 },
        { side: "left" as const, top: 160, h: 50 },
        { side: "left" as const, top: 218, h: 50 },
        { side: "right" as const, top: 176, h: 70 },
      ].map((b, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute w-[3px] rounded-[2px] bg-[linear-gradient(90deg,#c7c7d0,#a9a9b4)]"
          style={{
            ...(b.side === "left" ? { left: -2 } : { right: -2 }),
            top: b.top,
            height: b.h,
          }}
        />
      ))}

      <div
        className="relative overflow-hidden shadow-[inset_0_0_0_1px_rgba(16,16,20,0.1)]"
        style={{
          width: APP_STAGE_WIDTH,
          height: TOP_H + APP_STAGE_HEIGHT + tabH + HOME_H,
          borderRadius: RADIUS_INNER,
          background: screenBg,
        }}
      >
        <div style={{ height: TOP_H, position: "relative", background: screenBg, flexShrink: 0 }}>
          <div
            aria-hidden
            className="absolute top-2.5 left-1/2 -translate-x-1/2 w-[118px] h-[34px] rounded-[18px] bg-[#0a0a0c] z-[3] flex items-center justify-end pr-[13px]"
          >
            <span
              aria-hidden
              className="w-[9px] h-[9px] rounded-full bg-[radial-gradient(circle_at_35%_35%,#1c3d4d_0%,#0a1520_60%,#000_100%)] shadow-[inset_0_0_0_1px_rgba(80,140,180,0.28)]"
            />
          </div>
        </div>

        <div style={{ width: APP_STAGE_WIDTH, height: APP_STAGE_HEIGHT, position: "relative" }}>
          <Canvas
            document={document}
            screen={screen}
            editMode={editMode}
            onNavigateRoute={navigateRoute}
            onSetVar={onSetVar}
          />
        </div>

        {showTabs && (
          <div
            style={{
              height: tabH,
              display: "flex",
              borderTop: `1px solid ${document.theme.colorBorder}`,
              background: document.theme.colorSurface,
            }}
          >
            {document.navigation.roots.map((id) => {
              const sc = document.screens.find((s) => s.id === id);
              if (!sc) return null;
              const active = sc.id === screen.id;
              const icon = TAB_ICONS[sc.icon ?? ""] ?? "•";
              return (
                <button
                  key={id}
                  type="button"
                  aria-label={sc.name}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSelectScreen?.(id)}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    fontSize: 10,
                    color: active ? document.theme.colorPrimary : document.theme.colorTextMuted,
                    fontWeight: active ? 600 : 400,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    padding: 0,
                  }}
                >
                  <span style={{ fontSize: 14, lineHeight: 1 }} aria-hidden>
                    {icon}
                  </span>
                  <span>{sc.name}</span>
                </button>
              );
            })}
          </div>
        )}

        <div
          style={{
            height: HOME_H,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            background: showTabs ? document.theme.colorSurface : screenBg,
            paddingTop: 5,
          }}
        >
          <div
            aria-hidden
            style={{ width: 128, height: 5, borderRadius: 100, background: document.theme.colorText, opacity: 0.22 }}
          />
        </div>
      </div>
    </div>
  );
}
