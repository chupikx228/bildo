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
}: {
  document: AppDocument;
  screen: AppScreen;
  editMode?: boolean;
  onSelectScreen?: (id: string) => void;
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
      style={{
        width: outerW,
        height: outerH,
        borderRadius: RADIUS_OUTER,
        padding: BEZEL,
        background: "linear-gradient(155deg, #F0F0F3 0%, #D8D8DE 32%, #B9B9C2 62%, #E6E6EB 100%)",
        boxShadow: `
          inset 0 0 0 1px rgba(255,255,255,0.7),
          0 0 0 1px rgba(16,16,20,0.10),
          0 24px 56px rgba(16,16,20,0.16),
          0 6px 16px rgba(16,16,20,0.08)
        `,
        position: "relative",
        boxSizing: "border-box",
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif',
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
          style={{
            position: "absolute",
            ...(b.side === "left" ? { left: -2 } : { right: -2 }),
            top: b.top,
            width: 3,
            height: b.h,
            borderRadius: 2,
            background: "linear-gradient(90deg, #C7C7D0, #A9A9B4)",
          }}
        />
      ))}

      <div
        style={{
          width: APP_STAGE_WIDTH,
          height: TOP_H + APP_STAGE_HEIGHT + tabH + HOME_H,
          borderRadius: RADIUS_INNER,
          overflow: "hidden",
          background: screenBg,
          position: "relative",
          boxShadow: "inset 0 0 0 1px rgba(16,16,20,0.10)",
        }}
      >
        <div style={{ height: TOP_H, position: "relative", background: screenBg, flexShrink: 0 }}>
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
              width: 118,
              height: 34,
              borderRadius: 18,
              background: "#0A0A0C",
              zIndex: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingRight: 13,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: "radial-gradient(circle at 35% 35%, #1c3d4d 0%, #0a1520 60%, #000 100%)",
                boxShadow: "inset 0 0 0 1px rgba(80,140,180,0.28)",
              }}
            />
          </div>
        </div>

        <div style={{ width: APP_STAGE_WIDTH, height: APP_STAGE_HEIGHT, position: "relative" }}>
          <Canvas document={document} screen={screen} editMode={editMode} onNavigateRoute={navigateRoute} />
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
