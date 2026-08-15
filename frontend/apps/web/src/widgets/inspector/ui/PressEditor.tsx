import type { AppAction, AppScreen } from "@bildo/api";
import styles from "./Inspector.module.css";

export function PressEditor({
  actions,
  screens,
  onChange,
}: {
  actions: AppAction[];
  screens: AppScreen[];
  onChange: (a: AppAction[]) => void;
}) {
  const primary = actions[0];
  const kind =
    primary?.type === "navigate"
      ? `nav:${primary.route}`
      : primary?.type === "toast"
        ? "toast"
        : primary?.type === "openUrl"
          ? "url"
          : "none";

  return (
    <div className={styles.pressEditor}>
      <select
        value={kind}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "none") onChange([]);
          else if (v === "toast") onChange([{ type: "toast", message: "Готово" }]);
          else if (v === "url") onChange([{ type: "openUrl", url: "https://" }]);
          else if (v.startsWith("nav:")) onChange([{ type: "navigate", route: v.slice(4) }]);
        }}
        className={styles.input}
      >
        <option value="none">Нет действия</option>
        <option value="toast">Показать сообщение</option>
        <option value="url">Открыть ссылку</option>
        {screens.map((s) => (
          <option key={s.id} value={`nav:${s.route}`}>
            Перейти → {s.name}
          </option>
        ))}
      </select>
      {primary?.type === "toast" && (
        <input
          value={primary.message}
          onChange={(e) => onChange([{ type: "toast", message: e.target.value }])}
          placeholder="Текст сообщения"
          className={styles.input}
        />
      )}
      {primary?.type === "openUrl" && (
        <input
          value={primary.url}
          onChange={(e) => onChange([{ type: "openUrl", url: e.target.value }])}
          placeholder="https://"
          className={styles.input}
        />
      )}
    </div>
  );
}
