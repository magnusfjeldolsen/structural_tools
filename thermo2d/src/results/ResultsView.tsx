import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project, RunResult, Vec2 } from '@thermo2d/core';
import { ContourCanvas, type ContourCanvasHandle, type ProbeMarker } from './ContourCanvas.js';
import { TimeControls } from './TimeControls.js';
import { ProbeChartPanel } from './ProbeChartPanel.js';
import { ResultTable } from './ResultTable.js';
import { FirePanel } from './FirePanel.js';
import { PhysicsPanel } from './PhysicsPanel.js';
import { ComparePanel } from './ComparePanel.js';
import { ProfilePanel } from './ProfilePanel.js';
import { ExportMenu } from './ExportMenu.js';
import { DEFAULT_BANDS, sanitizeBands, type BandScale } from './colorScale.js';
import { differenceField, fieldAt, makeLocator, probeValueAt, rebarProbeIds, withProjectProbes } from './fieldUtils.js';
import { defaultReportTimes } from './format.js';
import { makeT } from './i18n.js';
import './results.css';

export interface ResultsViewProps {
  project: Project;
  result: RunResult;
  results?: { label: string; result: RunResult }[];
  stale: boolean;
  lang: 'nb' | 'en';
  onAddProbe(p: { position: Vec2; name?: string }): void;
  onUpdateProbe(id: string, position: Vec2): void;
  onAddLineProbe(from: Vec2, to: Vec2): void;
  onSelectTime?(t: number): void;
}

type Tab = 'probes' | 'table' | 'profile' | 'fire' | 'physics' | 'compare';

/** The results mode: contour canvas + time controls on the left, tabbed panels on the right. */
export function ResultsView(props: ResultsViewProps) {
  const { project, result: baseResult, results = [], stale, lang, onAddProbe, onUpdateProbe, onAddLineProbe, onSelectTime } = props;
  // Probes added after the run are sampled from the snapshots (spec §11: no rerun needed).
  const result = useMemo(() => withProjectProbes(baseResult, project), [baseResult, project]);
  const tr = useMemo(() => makeT(lang), [lang]);
  const canvasRef = useRef<ContourCanvasHandle>(null);

  const tEnd = result.times.length ? result.times[result.times.length - 1] : 0;
  const [time, setTimeState] = useState(tEnd);
  const [tab, setTab] = useState<Tab>('probes');
  const [bands, setBands] = useState<BandScale>(DEFAULT_BANDS);
  const [fill, setFillState] = useState<'isobands' | 'element'>(() => {
    try {
      return localStorage.getItem('thermo2d.results.fill') === 'element' ? 'element' : 'isobands';
    } catch {
      return 'isobands';
    }
  });
  const setFill = (f: 'isobands' | 'element') => {
    setFillState(f);
    try {
      localStorage.setItem('thermo2d.results.fill', f);
    } catch {
      /* private mode */
    }
  };
  const [showIso, setShowIso] = useState(true);
  const [showMesh, setShowMesh] = useState(false);
  const [show500, setShow500] = useState(project.rebars.length > 0);
  const [lineMode, setLineMode] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [variant, setVariant] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(result.probes.map((p) => p.id)));
  const [times, setTimes] = useState<number[]>(() => defaultReportTimes(tEnd));

  // New run: jump to its end, refresh probe selection and report times.
  useEffect(() => {
    setTimeState(tEnd);
    setTimes(defaultReportTimes(tEnd));
    setSelected((prev) => {
      const ids = result.probes.map((p) => p.id);
      const kept = ids.filter((id) => prev.has(id));
      return new Set(kept.length ? kept : ids);
    });
  }, [result, tEnd]);

  const setTime = useCallback(
    (t: number) => {
      const c = Math.max(0, Math.min(tEnd, t));
      setTimeState(c);
      onSelectTime?.(c);
    },
    [tEnd, onSelectTime],
  );

  const field = useMemo(() => fieldAt(result, time), [result, time]);
  const locator = useMemo(() => makeLocator(result), [result]);

  const compareable = results.length >= 2;
  const variantIdx = Math.min(Math.max(1, variant), Math.max(1, results.length - 1));
  const diff = useMemo(() => {
    if (!compareable || !showDiff) return null;
    return differenceField(results[0].result, results[variantIdx].result, time);
  }, [compareable, showDiff, results, variantIdx, time]);

  const rebarIds = useMemo(() => rebarProbeIds(project), [project]);
  const markers = useMemo<ProbeMarker[]>(
    () =>
      result.probes
        .filter((p) => p.found)
        .map((p) => {
          const pr = project.probes.find((q) => q.id === p.id);
          return { id: p.id, name: pr?.name ?? p.id, x: pr?.position[0] ?? p.position[0], y: pr?.position[1] ?? p.position[1], value: probeValueAt(result, p.id, time), isRebar: rebarIds.has(p.id) };
        }),
    [result, project.probes, time, rebarIds],
  );

  const drawResult = diff ? results[0].result : result;
  const drawField = diff ? diff.field : field;
  const lines = project.lineProbes.map((l) => ({ id: l.id, from: l.from, to: l.to }));

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'probes', label: tr('tabProbes'), show: true },
    { id: 'table', label: tr('tabTable'), show: true },
    { id: 'profile', label: tr('tabProfile'), show: true },
    { id: 'fire', label: tr('tabFire'), show: true },
    { id: 'physics', label: tr('tabPhysics'), show: true },
    { id: 'compare', label: tr('tabCompare'), show: compareable },
  ];

  return (
    <div className="t2d-results">
      {stale && <div className="t2d-stale">{tr('stale')}</div>}
      <div style={{ gridColumn: 1, gridRow: 2, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="t2d-row">
          <label>
            {tr('scale')} {tr('min')} <input type="number" value={bands.min} step={bands.step} onChange={(e) => setBands(sanitizeBands(parseFloat(e.target.value), bands.max, bands.step))} />
          </label>
          <label>
            {tr('max')} <input type="number" value={bands.max} step={bands.step} onChange={(e) => setBands(sanitizeBands(bands.min, parseFloat(e.target.value), bands.step))} />
          </label>
          <label>
            {tr('step')} <input type="number" value={bands.step} min={0.01} onChange={(e) => setBands(sanitizeBands(bands.min, bands.max, parseFloat(e.target.value)))} />
          </label>
          <button onClick={() => setBands(DEFAULT_BANDS)}>{tr('reset')}</button>
          <span className="t2d-seg" role="group" aria-label={tr('fillMode')}>
            <button className={fill === 'isobands' ? 'active' : undefined} onClick={() => setFill('isobands')} title={tr('isobandsHint')}>
              {tr('isobands')}
            </button>
            <button className={fill === 'element' ? 'active' : undefined} onClick={() => setFill('element')} title={tr('perElementHint')}>
              {tr('perElement')}
            </button>
          </span>
          <label>
            <input type="checkbox" checked={showIso} onChange={(e) => setShowIso(e.target.checked)} /> {tr('isolines')}
          </label>
          <label>
            <input type="checkbox" checked={showMesh} onChange={(e) => setShowMesh(e.target.checked)} /> {tr('mesh')}
          </label>
          <button onClick={() => canvasRef.current?.fit()}>{tr('fit')}</button>
          <button className={lineMode ? 'active' : undefined} onClick={() => setLineMode((v) => !v)}>
            {tr('lineProbeMode')}
          </button>
          <span style={{ flex: 1 }} />
          <ExportMenu project={project} result={result} results={results} field={field} t={time} tr={tr} canvas={canvasRef} />
        </div>
        <div style={{ flex: 1, minHeight: 280 }}>
          <ContourCanvas
            ref={canvasRef}
            project={project}
            result={drawResult}
            field={drawField}
            mode={diff ? 'difference' : 'temperature'}
            bands={bands}
            diffLimit={diff?.limit}
            fill={fill}
            showIsolines={showIso && !diff}
            showMesh={showMesh}
            show500={show500 && !diff}
            locator={locator}
            probes={markers}
            t={tr}
            lineMode={lineMode}
            onLineDone={(a, b) => {
              onAddLineProbe(a, b);
              setLineMode(false);
              setTab('profile');
            }}
            onLineCancel={() => setLineMode(false)}
            onPin={onAddProbe}
            onProbeMove={onUpdateProbe}
            lines={lines}
          />
        </div>
      </div>
      <TimeControls times={result.times} t={time} onChange={setTime} tr={tr} />
      <div className="t2d-side">
        <div className="t2d-tabs">
          {tabs
            .filter((x) => x.show)
            .map((x) => (
              <button key={x.id} className={tab === x.id ? 'active' : undefined} onClick={() => setTab(x.id)}>
                {x.label}
              </button>
            ))}
        </div>
        <div className="t2d-panel">
          {tab === 'probes' && <ProbeChartPanel project={project} result={result} t={time} onSelectTime={setTime} tr={tr} selected={selected} onSelectedChange={setSelected} refLines={project.rebars.length ? [{ value: 500, label: '500 °C' }] : undefined} />}
          {tab === 'table' && <ResultTable project={project} result={result} times={times} onTimesChange={setTimes} tr={tr} />}
          {tab === 'profile' && (
            <ProfilePanel
              project={project}
              result={result}
              field={field}
              tr={tr}
              lineMode={lineMode}
              onLineMode={setLineMode}
              others={compareable ? results.slice(1).map((r) => ({ label: r.label, result: r.result, field: fieldAt(r.result, time) })) : []}
            />
          )}
          {tab === 'fire' && <FirePanel project={project} result={result} field={field} t={time} tr={tr} show500={show500} onShow500={setShow500} times={times} />}
          {tab === 'physics' && <PhysicsPanel project={project} result={result} field={field} t={time} tr={tr} />}
          {tab === 'compare' && compareable && (
            <ComparePanel project={project} results={results} t={time} onSelectTime={setTime} tr={tr} selectedProbes={selected} showDiff={showDiff} onShowDiff={setShowDiff} variant={variantIdx} onVariant={setVariant} />
          )}
          <RunInfo result={result} tr={tr} />
        </div>
      </div>
    </div>
  );
}

function RunInfo({ result, tr }: { result: RunResult; tr: ReturnType<typeof makeT> }) {
  const s = result.stats;
  return (
    <div className="t2d-hint" style={{ marginTop: 'auto', fontSize: 11 }}>
      {tr('runInfo')}: {s.nodeCount} {tr('nodes')}, {s.elementCount} {tr('elements')}, {s.steps} {tr('steps')}, {(s.wallTimeMs / 1000).toFixed(1)} s · {tr('energyBalance')}: {(result.energy.relativeImbalance * 100).toFixed(2)} %
      {result.warnings.length > 0 && (
        <div className="t2d-warnings">
          {tr('warnings')}: {result.warnings.join(' · ')}
        </div>
      )}
    </div>
  );
}
