import { useState } from 'react';
import { BUILTIN_LIBRARY, parseEpw, parseTimeSeriesText } from '@thermo2d/core';
import type { TimeSeries } from '@thermo2d/core';
import { useStore } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import { Button, Dialog, Empty, NumberField, Section, SelectField, Sparkline, TextField, fmtNum } from '../components/ui.js';
import { pickFileFallback } from '../state/persistence.js';

export function SeriesPanel() {
  const t = useT();
  const project = useStore((s) => s.project);
  const lang = useStore((s) => s.ui.lang);
  const dispatch = useStore((s) => s.dispatch);
  const [editing, setEditing] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [gen, setGen] = useState<'constant' | 'step' | 'ramp' | 'sinusoid'>('constant');
  const [genParams, setGenParams] = useState<Record<string, number>>({ value: 20, t0: 0, t1: 3600, from: 20, to: 100, mean: 5, amplitude: 10, period: 86400, phase: 0, duration: 7 * 86400 });
  const [genName, setGenName] = useState('');
  const fireCurves = (BUILTIN_LIBRARY ?? []).filter((i) => i.category === 'fire-curve' || i.category === 'climate-series');
  const [libId, setLibId] = useState(fireCurves[0]?.id ?? '');
  const edit = project.timeSeries.find((s) => s.id === editing) ?? null;
  const usedBy = (s: TimeSeries) =>
    project.boundaryConditions.filter((b) => Object.values(b).includes(s.id)).length + project.heatSources.filter((h) => h.seriesId === s.id).length;

  const generate = () => {
    const analysis = project.analyses[0];
    const duration = analysis?.duration ?? 7200;
    const p: Record<string, number> = { ...genParams, duration: gen === 'sinusoid' ? genParams.duration : duration };
    dispatch([{ type: 'series.generate', generator: gen, params: p, name: genName || `${t(genKey(gen))}`, unit: '°C' }]);
  };

  return (
    <>
      <Section
        title={t('panelSeries')}
        actions={
          <Button small onClick={() => setShowImport(true)}>
            + {t('importSeries')}
          </Button>
        }
      >
        {project.timeSeries.length === 0 && <Empty>–</Empty>}
        <ul className="tree">
          {project.timeSeries.map((s) => (
            <li key={s.id} className={editing === s.id ? 'selected' : ''} onClick={() => setEditing(s.id)}>
              <span className="grow">{s.name}</span>
              <Sparkline points={s.points} width={90} height={22} />
              <span className="muted">{s.unit}</span>
            </li>
          ))}
        </ul>
      </Section>
      {edit && (
        <Section title={edit.name}>
          <TextField label={t('name')} value={edit.name} onCommit={(name) => dispatch([{ type: 'series.update', id: edit.id, patch: { name } }])} />
          <SelectField label={t('interpolation')} value={edit.interpolation} options={[{ value: 'linear', label: t('linear') }, { value: 'step', label: t('step') }]} onChange={(v) => dispatch([{ type: 'series.update', id: edit.id, patch: { interpolation: v } }])} />
          <SelectField label={t('afterEnd')} value={edit.afterEnd} options={[{ value: 'hold', label: t('hold') }, { value: 'repeat', label: t('repeat') }, { value: 'ambient', label: t('ambient') }]} onChange={(v) => dispatch([{ type: 'series.update', id: edit.id, patch: { afterEnd: v } }])} />
          <p className="hint">
            {edit.points.length} {t('points')} · {t('range')}: {fmtNum(edit.points[0]?.[0] / 60, 0)}–{fmtNum(edit.points[edit.points.length - 1]?.[0] / 60, 0)} min · {fmtNum(Math.min(...edit.points.map((p) => p[1])), 1)}–{fmtNum(Math.max(...edit.points.map((p) => p[1])), 1)} {edit.unit}
            {edit.source.citation && <> · {edit.source.citation.text}</>}
          </p>
          <Sparkline points={edit.points} width={300} height={80} />
          <div className="row">
            <Button small danger disabled={usedBy(edit) > 0} onClick={() => (setEditing(null), dispatch([{ type: 'series.delete', id: edit.id }]))}>
              {t('delete')}
            </Button>
            {usedBy(edit) > 0 && (
              <span className="hint">
                {t('usedBy')}: {usedBy(edit)}
              </span>
            )}
          </div>
        </Section>
      )}
      <Section title={t('addFireCurve')} collapsible defaultOpen={false}>
        <SelectField value={libId} options={fireCurves.map((c) => ({ value: c.id, label: lang === 'nb' && c.nameNb ? c.nameNb : c.name }))} onChange={setLibId} />
        <div className="row right">
          <Button small disabled={!libId} onClick={() => dispatch([{ type: 'series.addFromLibrary', libraryId: libId, duration: Math.max(7200, project.analyses[0]?.duration ?? 0) }])}>
            {t('add')}
          </Button>
        </div>
      </Section>
      <Section title={t('generateSeries')} collapsible defaultOpen={false}>
        <SelectField value={gen} options={[{ value: 'constant', label: t('generatorConstant') }, { value: 'step', label: t('generatorStep') }, { value: 'ramp', label: t('generatorRamp') }, { value: 'sinusoid', label: t('generatorSinusoid') }]} onChange={setGen} />
        <TextField label={t('name')} value={genName} onCommit={setGenName} />
        {gen === 'constant' && <NumberField label={t('value')} unit="°C" value={genParams.value} onCommit={(v) => setGenParams({ ...genParams, value: v })} />}
        {(gen === 'step' || gen === 'ramp') && (
          <>
            <NumberField label={t('from')} unit="°C" value={genParams.from} onCommit={(v) => setGenParams({ ...genParams, from: v })} />
            <NumberField label={t('to')} unit="°C" value={genParams.to} onCommit={(v) => setGenParams({ ...genParams, to: v })} />
            <NumberField label={`${t('time')} ${t('from').toLowerCase()}`} unit="s" value={genParams.t0} onCommit={(v) => setGenParams({ ...genParams, t0: v })} />
            {gen === 'ramp' && <NumberField label={`${t('time')} ${t('to').toLowerCase()}`} unit="s" value={genParams.t1} onCommit={(v) => setGenParams({ ...genParams, t1: v })} />}
          </>
        )}
        {gen === 'sinusoid' && (
          <>
            <NumberField label={t('mean')} unit="°C" value={genParams.mean} onCommit={(v) => setGenParams({ ...genParams, mean: v })} />
            <NumberField label={t('amplitude')} unit="K" value={genParams.amplitude} onCommit={(v) => setGenParams({ ...genParams, amplitude: v })} />
            <NumberField label={t('period')} unit="s" value={genParams.period} onCommit={(v) => setGenParams({ ...genParams, period: v })} />
            <NumberField label={t('phase')} unit="s" value={genParams.phase} onCommit={(v) => setGenParams({ ...genParams, phase: v })} />
            <NumberField label={t('duration')} unit="s" value={genParams.duration} onCommit={(v) => setGenParams({ ...genParams, duration: v })} />
          </>
        )}
        <div className="row right">
          <Button small onClick={generate}>
            {t('add')}
          </Button>
        </div>
      </Section>
      {showImport && <ImportSeriesDialog onClose={() => setShowImport(false)} />}
    </>
  );
}

function genKey(g: string): 'generatorConstant' | 'generatorStep' | 'generatorRamp' | 'generatorSinusoid' {
  return g === 'step' ? 'generatorStep' : g === 'ramp' ? 'generatorRamp' : g === 'sinusoid' ? 'generatorSinusoid' : 'generatorConstant';
}

type Report = ReturnType<typeof parseTimeSeriesText>;

export function ImportSeriesDialog(props: { onClose: () => void }) {
  const t = useT();
  const dispatch = useStore((s) => s.dispatch);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<'°C' | 'W/m²'>('°C');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parse = (src: string, epw = false) => {
    try {
      const r = epw ? parseEpw(src) : parseTimeSeriesText(src);
      setReport(r);
      setError(null);
    } catch (e) {
      setReport(null);
      setError((e as Error).message);
    }
  };
  const pickFile = async () => {
    const f = await pickFileFallback('.csv,.txt,.tsv,.epw');
    if (!f) return;
    const src = await f.text();
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
    setText(src.slice(0, 20000));
    parse(src, /\.epw$/i.test(f.name));
  };
  const points: [number, number][] = report?.points ?? [];
  const accept = () => {
    if (!points.length) return;
    dispatch([{ type: 'series.add', series: { name: name || 'Import', points, interpolation: 'linear', afterEnd: 'hold', unit, source: { kind: 'csv' } } }]);
    props.onClose();
  };
  const r = report as (Report & { separator?: string; decimal?: string; timeUnit?: string; range?: [number, number]; step?: number; gaps?: [number, number][]; warnings?: string[] }) | null;
  return (
    <Dialog
      title={t('importSeries')}
      onClose={props.onClose}
      width={640}
      footer={
        <>
          <Button onClick={props.onClose}>{t('close')}</Button>
          <Button primary disabled={points.length < 2} onClick={accept}>
            {t('accept')}
          </Button>
        </>
      }
    >
      <p className="hint">{t('pasteOrDrop')}</p>
      <div className="row">
        <TextField label={t('name')} value={name} onCommit={setName} />
        <SelectField value={unit} options={[{ value: '°C', label: '°C' }, { value: 'W/m²', label: 'W/m²' }]} onChange={setUnit} />
        <Button small onClick={() => void pickFile()}>
          {t('open')}…
        </Button>
      </div>
      <textarea className="field" value={text} onChange={(e) => (setText(e.target.value), parse(e.target.value))} placeholder={'tid [min]; temperatur [°C]\n0; 20\n30; 842'} />
      {error && <p className="hint" style={{ color: 'var(--danger)' }}>{error}</p>}
      {r && (
        <div className="library-detail">
          <h3>{t('importReport')}</h3>
          <dl>
            <dt>{t('points')}</dt>
            <dd>{points.length}</dd>
            {r.separator && (
              <>
                <dt>{t('separator')}</dt>
                <dd>{JSON.stringify(r.separator)}</dd>
              </>
            )}
            {r.decimal && (
              <>
                <dt>{t('decimal')}</dt>
                <dd>{r.decimal}</dd>
              </>
            )}
            {r.timeUnit && (
              <>
                <dt>{t('timeUnit')}</dt>
                <dd>{r.timeUnit}</dd>
              </>
            )}
            {points.length > 1 && (
              <>
                <dt>{t('range')}</dt>
                <dd>
                  {fmtNum(points[0][0], 0)}–{fmtNum(points[points.length - 1][0], 0)} s · {fmtNum(Math.min(...points.map((p) => p[1])), 1)}–{fmtNum(Math.max(...points.map((p) => p[1])), 1)}
                </dd>
              </>
            )}
            {r.gaps && r.gaps.length > 0 && (
              <>
                <dt>{t('gaps')}</dt>
                <dd>{r.gaps.map((g) => `${fmtNum(g[0], 0)}–${fmtNum(g[1], 0)} s`).join(', ')}</dd>
              </>
            )}
            {r.warnings && r.warnings.length > 0 && (
              <>
                <dt>{t('warning')}</dt>
                <dd>{r.warnings.join('; ')}</dd>
              </>
            )}
          </dl>
          <Sparkline points={points} width={560} height={80} />
        </div>
      )}
    </Dialog>
  );
}
