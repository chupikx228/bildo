import type { AppScreen, AppThemeTokens } from "@bildo/api";
import { ColorPicker, Switch } from "@/shared/ui";
import { Field } from "./Field";
import { PanelHeader } from "./PanelHeader";
import { Row } from "./Row";
import { Section } from "./Section";
import { INPUT, PANEL, SCROLL } from "./classes";

export function ScreenInspector({
  screen,
  theme,
  tabsNav,
  inTabs,
  canLeaveTabs,
  onRename,
  onTheme,
  onToggleTab,
}: {
  screen: AppScreen;
  theme: AppThemeTokens;
  tabsNav: boolean;
  inTabs: boolean;
  canLeaveTabs: boolean;
  onRename: (name: string) => void;
  onTheme: (patch: Partial<AppThemeTokens>) => void;
  onToggleTab: (next: boolean) => void;
}) {
  return (
    <div className={PANEL}>
      <PanelHeader typeLabel="Экран" title={screen.name} />
      <div className={SCROLL}>
        <Section title="Содержание">
          <Field label="Имя">
            <input value={screen.name} onChange={(e) => onRename(e.target.value)} className={INPUT} />
          </Field>
          {tabsNav && (
            <Row label="Вкладка">
              <Switch
                checked={inTabs}
                disabled={inTabs && !canLeaveTabs}
                onChange={onToggleTab}
                label="Показывать экран как вкладку"
              />
            </Row>
          )}
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
