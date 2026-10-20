import React from 'react';
import Button from '../Buttons';

export interface FilterField {
  key: string;
  label: string;
  type: 'select' | 'date';
  /** For selects: options supplied by the caller (from the API), never hardcoded here. */
  options?: { label: string; value: string }[];
}

export interface FilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  fields?: FilterField[];
  values: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
  onApply: () => void;
  onReset: () => void;
}

const inputStyle: React.CSSProperties = { height: 36, padding: '0 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: '0.85rem', background: '#fff' };

/** Search + status/date filters with Apply / Reset. Pair with useList. */
export const FilterBar: React.FC<FilterBarProps> = ({
  searchValue, onSearchChange, searchPlaceholder = 'Search…', fields = [], values, onFieldChange, onApply, onReset,
}) => (
  <form
    onSubmit={(e) => { e.preventDefault(); onApply(); }}
    style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}
  >
    <input
      type="search"
      value={searchValue}
      onChange={(e) => onSearchChange(e.target.value)}
      placeholder={searchPlaceholder}
      aria-label="Search"
      style={{ ...inputStyle, minWidth: 220 }}
    />
    {fields.map((f) => (
      <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.7rem', fontWeight: 600, color: '#64748B' }}>
        {f.label}
        {f.type === 'select' ? (
          <select value={values[f.key] ?? ''} onChange={(e) => onFieldChange(f.key, e.target.value)} style={inputStyle}>
            <option value="">All</option>
            {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input type="date" value={values[f.key] ?? ''} onChange={(e) => onFieldChange(f.key, e.target.value)} style={inputStyle} />
        )}
      </label>
    ))}
    <Button title="Apply" size="sm" onClick={onApply} />
    <Button title="Reset" variant="secondary" size="sm" onClick={onReset} />
  </form>
);

export default FilterBar;
