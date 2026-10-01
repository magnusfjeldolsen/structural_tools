import { useState } from 'react';
import type { Override, Scenario } from '@thermo2d/core';
import { useStore } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import { Button, Checkbox, Empty, NumberField, Section, SelectField, TextField } from '../components/ui.js';
import { resultKey } from '../worker/protocol.js';

type OverrideKind = 'material' | 'series' | 'cover' | 'template' | 'field';

export function ScenariosPanel() {
  const t = useT();
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const results = useStore((s) => s.results);
  const running = useStore((s) => s.running);
  const { dispatch, setUi, run, runAllScenarios } = useStore.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const sc = project.scenarios.find((s) => s.id === editing) ?? null;
  const keyOf = (id: string | null) => resultKey(ui.activeAnalysisId, id);

  return (
    <>
      <Section
        title={t('panelScenarios')}
        actions={
          <Button
            small
            onClick={() => {
              const res = dispatch([{ type: 'scenario.add', scenario: { name: `${t('scenario')} ${project.scenarios.length + 1}`, overrides: [] } }]);
              const id = res?.createdIds[0]?.[0];
              if (id) setEditing(id);
            }}
          >
            + {t('newScenario')}
          </Button>
        }
      >
        <ul className="tree">
          <li className={editing === null && ui.activeScenarioId === null ? 'selected' : ''} onClick={() => (setEditing(null), setUi({ activeScenarioId: null }))}>
            <span className="grow">{t('baseModel')}</span>
            {results[keyOf(null)] && <span className="badge ok">✓</span>}
            <Checkbox label="" checked={ui.compareKeys.includes(keyOf(null))} onChange={(v) => setUi({ compareKeys: v ? [...ui.compareKeys, keyOf(null)] : ui.compareKeys.filter((k) => k !== keyOf(null)) })} />
          </li>
          {project.scenarios.map((s) => (
            <li key={s.id} className={editing === s.id ? 'selected' : ''} onClick={() => (setEditing(s.id), setUi({ activeScenarioId: s.id }))}>
              <span className="grow">{s.name}</span>
              <span className="muted">{s.overrides.length}</span>
              {results[keyOf(s.id)] && <span className="badge ok">✓</span>}
              <Checkbox label="" checked={ui.compareKeys.includes(keyOf(s.id))} onChange={(v) => setUi({ compareKeys: v ? [...ui.compareKeys, keyOf(s.id)] : ui.compareKeys.filter((k) => k !== keyOf(s.id)) })} />
            </li>
          ))}
        </ul>
        <div className="row">
          <Button small primary disabled={!!running || project.scenarios.length === 0} onClick={() => void runAllScenarios()}>
            ▶ {t('runAll')}
          </Button>
          <Button small disabled={ui.compareKeys.filter((k) => results[k]).length < 2} onClick={() => useStore.getState().setMode('results')}>
            {t('compare')}
          </Button>
        </div>
      </Section>
      {sc && <ScenarioEditor scenario={sc} onRun={() => void run(ui.activeAnalysisId, sc.id)} onDelete={() => (setEditing(null), setUi({ activeScenarioId: null }), dispatch([{ type: 'scenario.delete', id: sc.id }]))} />}
    </>
  );
}

function ScenarioEditor(props: { scenario: Scenario; onRun: () => void; onDelete: () => void }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const running = useStore((s) => s.running);
  const dispatch = useStore((s) => s.dispatch);
  const { scenario } = props;
  const [kind, setKind] = useState<OverrideKind>('material');
  const [regionId, setRegionId] = useState(project.regions[0]?.id ?? '');
  const [materialId, setMaterialId] = useState(project.materials[0]?.id ?? '');
  const [seriesId, setSeriesId] = useState(project.timeSeries[0]?.id ?? '');
  const [seriesId2, setSeriesId2] = useState(project.timeSeries[1]?.id ?? project.timeSeries[0]?.id ?? '');
  const [setId, setSetId] = useState(project.rebarSets[0]?.id ?? '');
  const [cover, setCover] = useState(45);
  const [paramKey, setParamKey] = useState('');
  const [paramVal, setParamVal] = useState(0);
  const [collection, setCollection] = useState<Override['collection']>('regions');
  const [entityId, setEntityId] = useState('');
  const [field, setField] = useState('');
  const [fieldVal, setFieldVal] = useState('');
  const patch = (overrides: Override[]) => dispatch([{ type: 'scenario.update', id: scenario.id, patch: { overrides } }]);

  const add = () => {
    let o: Override | null = null;
    if (kind === 'material' && regionId && materialId) o = { collection: 'regions', id: regionId, patch: { materialId } };
    if (kind === 'series' && seriesId && seriesId2) {
      const src = project.timeSeries.find((s) => s.id === seriesId2);
      if (src) o = { collection: 'timeSeries', id: seriesId, patch: { points: src.points, interpolation: src.interpolation, afterEnd: src.afterEnd, name: src.name } };
    }
    if (kind === 'cover' && setId) o = { collection: 'rebarSets', id: setId, patch: { cover } };
    if (kind === 'template' && regionId && paramKey) {
      const r = project.regions.find((x) => x.id === regionId);
      if (r?.template) o = { collection: 'regions', id: regionId, patch: { template: { ...r.template, params: { ...r.template.params, [paramKey]: paramVal } } } };
    }
    if (kind === 'field' && field) {
      let v: unknown = fieldVal;
      try {
        v = JSON.parse(fieldVal);
      } catch {
        /* keep string */
      }
      o = { collection, id: entityId || undefined, patch: { [field]: v } };
    }
    if (o) patch([...scenario.overrides, o]);
  };
  const describe = (o: Override) => {
    const ent = o.id ? ((project[o.collection as 'regions'] as { id: string; name?: string }[] | undefined)?.find((x) => x.id === o.id)?.name ?? o.id) : o.collection;
    return `${ent}: ${Object.entries(o.patch)
      .map(([k, v]) => `${k} = ${typeof v === 'object' ? '…' : String(v)}`)
      .join(', ')}`;
  };
  const tplRegion = project.regions.find((r) => r.id === regionId);

  return (
    <Section title={scenario.name}>
      <TextField label={t('name')} value={scenario.name} onCommit={(name) => dispatch([{ type: 'scenario.update', id: scenario.id, patch: { name } }])} />
      <h3>{t('overrides')}</h3>
      {scenario.overrides.length === 0 && <Empty>–</Empty>}
      <ul className="tree">
        {scenario.overrides.map((o, i) => (
          <li key={i}>
            <span className="grow">{describe(o)}</span>
            <button className="icon-btn" onClick={() => patch(scenario.overrides.filter((_, j) => j !== i))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <Section title={t('addOverride')} collapsible>
        <SelectField
          value={kind}
          options={[
            { value: 'material', label: t('overrideMaterial') },
            { value: 'series', label: t('overrideSeries') },
            { value: 'cover', label: t('overrideCover') },
            { value: 'template', label: t('overrideTemplate') },
            { value: 'field', label: t('overrideField') },
          ]}
          onChange={setKind}
        />
        {(kind === 'material' || kind === 'template') && <SelectField label={t('hostRegion')} value={regionId} options={project.regions.map((r) => ({ value: r.id, label: r.name }))} onChange={setRegionId} />}
        {kind === 'material' && <SelectField label={t('material')} value={materialId} options={project.materials.map((m) => ({ value: m.id, label: m.name }))} onChange={setMaterialId} />}
        {kind === 'series' && (
          <>
            <SelectField label={t('series')} value={seriesId} options={project.timeSeries.map((s) => ({ value: s.id, label: s.name }))} onChange={setSeriesId} />
            <SelectField label={`→`} value={seriesId2} options={project.timeSeries.map((s) => ({ value: s.id, label: s.name }))} onChange={setSeriesId2} />
          </>
        )}
        {kind === 'cover' && (
          <>
            <SelectField label={t('rebarSets')} value={setId} options={project.rebarSets.map((s) => ({ value: s.id, label: s.name }))} onChange={setSetId} />
            <NumberField label={t('cover')} unit="mm" value={cover} onCommit={setCover} />
          </>
        )}
        {kind === 'template' && tplRegion?.template && (
          <>
            <SelectField label={t('parameter')} value={paramKey} options={[{ value: '', label: '–' }, ...Object.keys(tplRegion.template.params).map((k) => ({ value: k, label: k }))]} onChange={setParamKey} />
            <NumberField label={t('value')} value={paramVal} onCommit={setParamVal} />
          </>
        )}
        {kind === 'field' && (
          <>
            <SelectField
              label={t('entity')}
              value={collection}
              options={(['regions', 'materials', 'boundaryConditions', 'timeSeries', 'rebarSets', 'heatSources', 'analyses', 'settings', 'mesh'] as Override['collection'][]).map((c) => ({ value: c, label: c }))}
              onChange={setCollection}
            />
            <TextField label="id" value={entityId} onCommit={setEntityId} />
            <TextField label={t('field')} value={field} onCommit={setField} />
            <TextField label={t('value')} value={fieldVal} onCommit={setFieldVal} />
          </>
        )}
        <div className="row right">
          <Button small onClick={add}>
            {t('add')}
          </Button>
        </div>
      </Section>
      <div className="row">
        <Button small primary disabled={!!running} onClick={props.onRun}>
          ▶ {t('run')}
        </Button>
        <Button small danger onClick={props.onDelete}>
          {t('delete')}
        </Button>
      </div>
    </Section>
  );
}
