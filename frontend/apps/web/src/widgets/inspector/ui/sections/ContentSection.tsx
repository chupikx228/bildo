import type { AppNode } from "@bildo/api";
import { Field, Section } from "../controls";
import { INPUT, TEXTAREA } from "../classes";

export function ContentSection({
  node,
  typeLabel,
  isTextual,
  showLayerName,
  onText,
  onPatch,
}: {
  node: AppNode;
  typeLabel: string;
  isTextual: boolean;
  showLayerName: boolean;
  onText: (t: string) => void;
  onPatch: (patch: Partial<AppNode>) => void;
}) {
  return (
    <Section title="Содержание">
      {showLayerName && (
        <Field label="Имя слоя">
          <input
            value={node.name ?? ""}
            placeholder={typeLabel}
            onChange={(e) => onPatch({ name: e.target.value })}
            className={INPUT}
          />
        </Field>
      )}
      {isTextual && (
        <Field label="Текст">
          <textarea
            rows={3}
            value={node.props?.text ?? ""}
            onChange={(e) => onText(e.target.value)}
            className={TEXTAREA}
          />
        </Field>
      )}
      {node.type === "TextInput" && (
        <Field label="Подсказка">
          <input
            value={node.props?.placeholder ?? ""}
            onChange={(e) => onPatch({ props: { placeholder: e.target.value } })}
            className={INPUT}
          />
        </Field>
      )}
      {node.type === "Image" && (
        <Field label="URL изображения">
          <input
            value={node.props?.source ?? ""}
            placeholder="https://…"
            onChange={(e) => onPatch({ props: { source: e.target.value } })}
            className={INPUT}
          />
        </Field>
      )}
      {node.type === "FlatList" && (
        <Field label="Элементы (по строке)">
          <textarea
            rows={3}
            value={(node.props?.data ?? []).join("\n")}
            onChange={(e) => onPatch({ props: { data: e.target.value.split("\n").filter(Boolean) } })}
            className={TEXTAREA}
          />
        </Field>
      )}
    </Section>
  );
}
