"use client";

import ColorPicker from "./ColorPicker";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

/** Theme color row: label → hex value → clickable swatch (portaled picker). */
export default function ThemeColorField({ label, value, onChange }: Props) {
  return (
    <div className="color-field">
      <span className="color-field-label">{label}</span>
      <span className="color-field-right">
        <span className="color-field-value">{value}</span>
        <ColorPicker value={value} onChange={onChange} />
      </span>
    </div>
  );
}