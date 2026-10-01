import { useEffect, useState } from 'react';
import { useStore, type AppState } from '../state/store.js';
import { helpUi, tourSteps } from './strings.js';
import { tourStore } from './tourStore.js';
import './help.css';

/**
 * Eight-step guided tour. Each step highlights a target found by text or data
 * attribute and advances by itself when the model shows the step was done.
 * Auto-starts the first time a project is created from a template.
 */
interface StepDef {
  /** Return the element to spotlight, or null for a generic card. */
  target(): Element | null;
  /** True when the user has done the step (auto-advance). */
  done(s: AppState): boolean;
}

const btn = (re: RegExp) => Array.from(document.querySelectorAll('button')).find((b) => re.test(b.textContent?.trim() ?? '')) ?? null;
const tab = (re: RegExp) => Array.from(document.querySelectorAll('.sidepanel button, .sidepanel [role=tab]')).find((b) => re.test(b.textContent?.trim() ?? '')) ?? null;

const STEPS: StepDef[] = [
  { target: () => btn(/^(Ny|New)$/), done: (s) => s.project.regions.length > 0 },
  { target: () => tab(/^(Materialer|Materials)$/), done: (s) => s.project.regions.length > 0 && s.project.regions.every((r) => !!r.materialId) },
  { target: () => tab(/^(Eksponering|Exposure)$/), done: (s) => s.project.boundaryConditions.some((b) => b.type === 'convection-radiation' && b.edgeRefs.length > 0) },
  { target: () => tab(/^(Armering|Reinforcement)$/), done: (s) => s.project.rebars.length > 0 },
  { target: () => tab(/^(Målepunkter|Probes)$/), done: (s) => s.project.probes.length > 0 },
  { target: () => document.querySelector('[data-tour="run"]') ?? btn(/Kjør|Run/), done: (s) => Object.keys(s.results).length > 0 },
  { target: () => document.querySelector('.results-body canvas'), done: (s) => s.project.probes.some((p) => p.kind === 'click') },
  { target: () => Array.from(document.querySelectorAll('.results-body button')).find((b) => /^(Brann|Fire)$/.test(b.textContent?.trim() ?? '')) ?? null, done: () => false },
];

export function Tour() {
  const lang = useStore((s) => s.ui.lang);
  const active = tourStore((s) => s.active);
  const step = tourStore((s) => s.step);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ui = helpUi(lang);
  const texts = tourSteps(lang);

  // Auto-start once: the start dialog closed with a template and the tour was never completed.
  useEffect(() => {
    // `newProject()` closes the dialog before the template is dispatched, so watch for the first region
    // appearing while the dialog is closed instead of the dialog's own transition.
    let prevRegions = useStore.getState().project.regions.length;
    return useStore.subscribe((s) => {
      const n = s.project.regions.length;
      if (!s.showStart && prevRegions === 0 && n > 0 && !tourStore.getState().completed && !tourStore.getState().active) {
        tourStore.getState().start();
      }
      prevRegions = n;
    });
  }, []);

  // Auto-advance on model changes; track target position.
  useEffect(() => {
    if (!active) return;
    const def = STEPS[step];
    if (!def) {
      tourStore.getState().stop(true);
      return;
    }
    const check = () => {
      const s = useStore.getState();
      if (def.done(s) && step < STEPS.length - 1) tourStore.getState().next();
      const el = def.target();
      setRect(el ? el.getBoundingClientRect() : null);
    };
    check();
    const unsub = useStore.subscribe(check);
    const timer = setInterval(check, 600);
    window.addEventListener('resize', check);
    return () => {
      unsub();
      clearInterval(timer);
      window.removeEventListener('resize', check);
    };
  }, [active, step]);

  if (!active || !STEPS[step]) return null;
  const text = texts[step];
  const pad = 6;
  const cardStyle: React.CSSProperties = rect
    ? rect.left > window.innerWidth / 2
      ? { top: Math.min(rect.top, window.innerHeight - 220), right: Math.max(8, window.innerWidth - rect.left + 12) }
      : { top: Math.min(rect.bottom + 12, window.innerHeight - 220), left: Math.max(8, Math.min(rect.left, window.innerWidth - 340)) }
    : { top: 80, left: '50%', transform: 'translateX(-50%)' };
  const last = step === STEPS.length - 1;
  return (
    <>
      {rect && <div className="tour-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad }} />}
      <div className="tour-card" role="dialog" aria-label={text.title} style={cardStyle}>
        <div className="tour-step">{ui.stepOf(step + 1, STEPS.length)}</div>
        <h3>{text.title}</h3>
        <div>{text.body}</div>
        {!last && <div className="tour-wait">{ui.waiting}</div>}
        <div className="tour-actions">
          <button className="help-btn" type="button" onClick={() => tourStore.getState().stop(false)}>
            {ui.skip}
          </button>
          <span className="spacer" />
          <button className="help-btn" type="button" disabled={step === 0} onClick={() => tourStore.getState().back()}>
            {ui.back}
          </button>
          {last ? (
            <button className="help-btn primary" type="button" onClick={() => tourStore.getState().stop(true)}>
              {ui.finish}
            </button>
          ) : (
            <button className="help-btn primary" type="button" onClick={() => tourStore.getState().next()}>
              {ui.next}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
