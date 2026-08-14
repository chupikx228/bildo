import { APP_STAGE_HEIGHT, APP_STAGE_WIDTH, type AppDocument, type AppScreen } from "@bildo/api";
import { BEZEL, HOME_H, RADIUS_INNER, RADIUS_OUTER, TAB_H, TOP_H, hasTabs, phoneFrameSize } from "../lib/phoneFrame";
import { Canvas } from "./Canvas";
import styles from "./PhonePreview.module.css";

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
      className={styles.frame}
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
          className={styles.sideButton}
          style={{
            ...(b.side === "left" ? { left: -2 } : { right: -2 }),
            top: b.top,
            height: b.h,
          }}
        />
      ))}

      <div
        className={styles.screen}
        style={{
          width: APP_STAGE_WIDTH,
          height: TOP_H + APP_STAGE_HEIGHT + tabH + HOME_H,
          borderRadius: RADIUS_INNER,
          background: screenBg,
        }}
      >
        <div style={{ height: TOP_H, position: "relative", background: screenBg, flexShrink: 0 }}>
          <div aria-hidden className={styles.island}>
            <span aria-hidden className={styles.camera} />
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
