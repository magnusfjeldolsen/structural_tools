/** Small, dependency-free UI primitives. */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function NumberField(props: {
  value: number | undefined;
  onCommit: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  width?: number;
  decimals?: number;
}) {
  const { value, onCommit, decimals = 3 } = props;
  const fmt = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? '' : String(Number(v.toFixed(decimals))));
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = () => {
    const n = Number(text.replace(',', '.'));
    if (Number.isFinite(n) && n !== value) {
      let v = n;
      if (props.min !== undefined) v = Math.max(props.min, v);
      if (props.max !== undefined) v = Math.min(props.max, v);
      onCommit(v);
      setText(fmt(v));
    } else setText(fmt(value));
  };
  const input = (
    <span className="field-wrap">
      <input
        className="field num"
        type="text"
        inputMode="decimal"
        value={text}
        disabled={props.disabled}
        placeholder={props.placeholder}
        style={props.width ? { width: props.width } : undefined}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(fmt(value));
            (e.target as HTMLInputElement).blur();
          }
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && props.step) {
            e.preventDefault();
            const n = Number(text.replace(',', '.')) || 0;
            const v = n + (e.key === 'ArrowUp' ? 1 : -1) * props.step * (e.shiftKey ? 10 : 1);
            setText(fmt(v));
            onCommit(v);
          }
        }}
      />
      {props.unit && <span className="unit">{props.unit}</span>}
    </span>
  );
  return props.label ? <Labeled label={props.label}>{input}</Labeled> : input;
}

export function TextField(props: { value: string; onCommit: (v: string) => void; label?: string; placeholder?: string; disabled?: boolean; className?: string }) {
  const [text, setText] = useState(props.value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(props.value);
  }, [props.value]);
  const input = (
    <input
      className={`field ${props.className ?? ''}`}
      type="text"
      value={text}
      disabled={props.disabled}
      placeholder={props.placeholder}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        if (text !== props.value) props.onCommit(text);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(props.value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
  return props.label ? <Labeled label={props.label}>{input}</Labeled> : input;
}

export function SelectField<T extends string>(props: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string; disabled?: boolean }) {
  const sel = (
    <select className="field" value={props.value} disabled={props.disabled} onChange={(e) => props.onChange(e.target.value as T)}>
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  return props.label ? <Labeled label={props.label}>{sel}</Labeled> : sel;
}

export function Checkbox(props: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}

export function Labeled(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="labeled" title={props.hint}>
      <span className="label">{props.label}</span>
      {props.children}
    </label>
  );
}

export function Row(props: { children: ReactNode; className?: string; gap?: number }) {
  return (
    <div className={`row ${props.className ?? ''}`} style={props.gap !== undefined ? { gap: props.gap } : undefined}>
      {props.children}
    </div>
  );
}

export function Section(props: { title: string; children: ReactNode; collapsible?: boolean; defaultOpen?: boolean; actions?: ReactNode }) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);
  return (
    <section className="section">
      <header className="section-head" onClick={props.collapsible ? () => setOpen(!open) : undefined} style={props.collapsible ? { cursor: 'pointer' } : undefined}>
        {props.collapsible && <span className="chev">{open ? '▾' : '▸'}</span>}
        <h3>{props.title}</h3>
        {props.actions && <span className="section-actions" onClick={(e) => e.stopPropagation()}>{props.actions}</span>}
      </header>
      {open && <div className="section-body">{props.children}</div>}
    </section>
  );
}

export function Button(props: { onClick?: () => void; children: ReactNode; primary?: boolean; danger?: boolean; small?: boolean; disabled?: boolean; title?: string; active?: boolean; type?: 'button' | 'submit'; className?: string }) {
  const cls = ['btn', props.primary && 'primary', props.danger && 'danger', props.small && 'small', props.active && 'active', props.className].filter(Boolean).join(' ');
  return (
    <button type={props.type ?? 'button'} className={cls} onClick={props.onClick} disabled={props.disabled} title={props.title}>
      {props.children}
    </button>
  );
}

export function Dialog(props: { title: string; onClose: () => void; children: ReactNode; width?: number; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="dialog" style={{ width: props.width ?? 560 }} role="dialog" aria-label={props.title}>
        <header className="dialog-head">
          <h2>{props.title}</h2>
          <button className="btn small" onClick={props.onClose} aria-label="close">
            ✕
          </button>
        </header>
        <div className="dialog-body">{props.children}</div>
        {props.footer && <footer className="dialog-foot">{props.footer}</footer>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>(props: { value: T; tabs: { id: T; label: string }[]; onChange: (id: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {props.tabs.map((t) => (
        <button key={t.id} role="tab" className={`tab ${t.id === props.value ? 'active' : ''}`} onClick={() => props.onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Empty(props: { children: ReactNode }) {
  return <p className="empty">{props.children}</p>;
}

export function Sparkline(props: { points: [number, number][]; width?: number; height?: number }) {
  const w = props.width ?? 120;
  const h = props.height ?? 28;
  const pts = props.points;
  if (pts.length < 2) return <svg width={w} height={h} />;
  let minT = Infinity, maxT = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [t, v] of pts) {
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }
  const dt = maxT - minT || 1;
  const dv = maxV - minV || 1;
  const step = Math.max(1, Math.floor(pts.length / 200));
  const d = pts
    .filter((_, i) => i % step === 0 || i === pts.length - 1)
    .map(([t, v], i) => `${i ? 'L' : 'M'}${(((t - minT) / dt) * (w - 2) + 1).toFixed(1)},${(h - 1 - ((v - minV) / dv) * (h - 2)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="sparkline">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.2} />
    </svg>
  );
}

export function fmtNum(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return v.toFixed(decimals);
}

/** A small "(?)" button that toggles an inline explanation. Keyboard accessible; no external library. */
export function Help(props: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="help">
      <button type="button" className="help-btn" aria-expanded={open} aria-label={props.label ?? 'Forklaring'} title={props.label ?? 'Forklaring'} onClick={() => setOpen((o) => !o)}>
        ?
      </button>
      {open && <span className="help-text" role="note">{props.text}</span>}
    </span>
  );
}
