// Reusable length / width / capacity inputs, shared by the admin fleet and the
// agent vehicle forms. Values are kept as strings (raw input); callers convert
// to numbers on submit.

export default function VehicleDimensionFields({
  length,
  width,
  capacity,
  onLength,
  onWidth,
  onCapacity,
}: {
  length: string;
  width: string;
  capacity: string;
  onLength: (v: string) => void;
  onWidth: (v: string) => void;
  onCapacity: (v: string) => void;
}) {
  return (
    <div>
      <label className="ct-label">Dimensions &amp; capacity (optional)</label>
      <div className="grid grid-cols-3 gap-2">
        <Field
          aria="Length in metres"
          placeholder="Length"
          suffix="m"
          value={length}
          onChange={onLength}
        />
        <Field
          aria="Width in metres"
          placeholder="Width"
          suffix="m"
          value={width}
          onChange={onWidth}
        />
        <Field
          aria="Capacity in kilograms"
          placeholder="Capacity"
          suffix="kg"
          value={capacity}
          onChange={onCapacity}
        />
      </div>
    </div>
  );
}

function Field({
  aria,
  placeholder,
  suffix,
  value,
  onChange,
}: {
  aria: string;
  placeholder: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        min="0"
        step="0.1"
        inputMode="decimal"
        aria-label={aria}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ct-input pr-8"
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted2">
        {suffix}
      </span>
    </div>
  );
}
