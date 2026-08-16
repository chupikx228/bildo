import type { AppScreen, AppThemeTokens } from "@bildo/api";
import { ColorPicker } from "@/shared/ui";
import { Field, PanelHeader, Row, Section } from "./controls";
import { INPUT, PANEL, SCROLL } from "./classes";

export function ScreenInspector({
  screen,
  theme,
  onRename,
  onTheme,
}: {
  screen: AppScreen;
  theme: AppThemeTokens;
  onRename: (name: string) => void;
  onTheme: (patch: Partial<AppThemeTokens>) => void;
}) {
  return (
    <div className={PANEL}>
      <PanelHeader typeLabel="Экран" title={screen.name} />
      <div className={SCROLL}>
        <Section title="Содержание">
          <Field label="Имя">
            <input value={screen.name} onChange={(e) => onRename(e.target.value)} className={INPUT} />
          </Field>
        </Section>
        <Section title="Тема">
          <Row label="Фон">
            <ColorPicker value={theme.colorBg} onChange={(colorBg) => onTheme({ colorBg })} />
          </Row>
          <Row label="Акцент">
            <ColorPicker value={theme.colorPrimary} onChange={(colorPrimary) => onTheme({ colorPrimary })} />
          </Row>
          <Row label="Текст">
            <ColorPicker value={theme.colorText} onChange={(colorText) => onTheme({ colorText })} />
          </Row>
        </Section>
      </div>
    </div>
  );
}
