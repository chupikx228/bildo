import type { AppAction, AppScreen } from "@bildo/api";
import { Field } from "../Field";
import { Section } from "../Section";
import { PressEditor } from "../PressEditor";

export function BehaviorSection({
  actions,
  screens,
  onChange,
}: {
  actions: AppAction[];
  screens: AppScreen[];
  onChange: (a: AppAction[]) => void;
}) {
  return (
    <Section title="Поведение">
      <Field label="При нажатии">
        <PressEditor actions={actions} screens={screens} onChange={onChange} />
      </Field>
    </Section>
  );
}
