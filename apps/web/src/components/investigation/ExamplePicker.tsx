"use client";

import { FAILURE_EXAMPLES } from "../../lib/investigationExamples";

export function ExamplePicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor="failure-example">Try an example</label>
      <select
        id="failure-example"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose a supported example</option>
        {FAILURE_EXAMPLES.map((example) => (
          <option key={example.id} value={example.id}>
            {example.title}
          </option>
        ))}
      </select>
    </div>
  );
}
