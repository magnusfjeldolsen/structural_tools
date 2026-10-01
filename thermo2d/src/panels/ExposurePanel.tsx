import { useState } from 'react';
import { BUILTIN_LIBRARY } from '@thermo2d/core';
import type { BoundaryCondition, Command, ExposureFace, ExposureKind, ExposureSide, WithOptionalId } from '@thermo2d/core';
import { useStore, selectedIds } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import { Button, Checkbox, Empty, Help, NumberField, Section, SelectField, TextField } from '../components/ui.js';
import type { StringKey } from '../i18n/index.js';

const SIDES: { id: ExposureSide; key: StringKey }[] = [
  { id: 'bottom', key: 'faceBottom' },
  { id: 'top', key: 'faceTop' },
  { id: 'left', key: 'faceLeft' },
  { id: 'right', key: 'faceRight' },
];
const KINDS: { id: ExposureKind; key: StringKey }[] = [
  { id: 'fire', key: 'kindFire' },
  { id: 'fire-unexposed', key: 'kindUnexposed' },
  { id: 'ambient', key: 'kindAmbient' },
  { id: 'insulated', key: 'kindInsulated' },
  { id: 'indoor', key: 'kindIndoor' },
  { id: 'outdoor', key: 'kindOutdoor' },
];

const PRESETS: { key: StringKey; faces: Record<ExposureSide, ExposureKind | null> }[] = [
  { key: 'exposurePresetThreeSides', faces: { bottom: 'fire', left: 'fire', right: 'fire', top: 'fire-unexposed', all: null, exterior: null } },
  { key: 'exposurePresetBottom', faces: { bottom: 'fire', left: 'insulated', right: 'insulated', top: 'fire-unexposed', all: null, exterior: null } },
  { key: 'exposurePresetAll', faces: { bottom: 'fire', left: 'fire', right: 'fire', top: 'fire', all: null, exterior: null } },
  { key: 'exposurePresetIndoorOutdoor', faces: { bottom: 'outdoor', left: 'insulated', right: 'insulated', top: 'indoor', all: null, exterior: null } },
];

/**
 * Film coefficient on the unexposed face: EN 1991-1-2 §3.1(5) gives 4 W/m²K without radiation,
 * §3.1(6) 9 W/m²K with radiation to the surroundings included. Custom for anything else.
 */
function UnexposedAlpha(props: { value: number; onChange: (v: number) => void }) {
  const t = useT();
  const isPreset = props.value === 4 || props.value === 9;
  const [custom, setCustom] = useState(!isPreset);
  return (
    <div className="field-row">
      <label className="label">
        {t('unexposedAlpha')}
        <Help text={t('unexposedHelp')} />
      </label>
      <div className="row">
        <span className="segmented">
          <Button small active={!custom && props.value === 4} onClick={() => (setCustom(false), props.onChange(4))}>
            {t('unexposedAlpha4')}
          </Button>
          <Button small active={!custom && props.value === 9} onClick={() => (setCustom(false), props.onChange(9))}>
            {t('unexposedAlpha9')}
          </Button>
          <Button small active={custom} onClick={() => setCustom(true)}>
            {t('unexposedCustom')}
          </Button>
        </span>
        {custom && <NumberField unit="W/m²K" value={props.value} min={0} width={90} onCommit={props.onChange} />}
      </div>
    </div>
  );
}

export function ExposurePanel() {
  const t = useT();
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const { dispatch, select } = useStore.getState();
  const [faces, setFaces] = useState<Record<ExposureSide, ExposureKind | null>>(PRESETS[0].faces);
  const [unexposedAlpha, setUnexposedAlpha] = useState(4);
  const fireCurves = (BUILTIN_LIBRARY ?? []).filter((i) => i.category === 'fire-curve');
  const climate = (BUILTIN_LIBRARY ?? []).filter((i) => i.category === 'climate-series');
  const [fireCurve, setFireCurve] = useState<string>(fireCurves.find((c) => /iso/i.test(c.id + c.name))?.id ?? fireCurves[0]?.id ?? '');
  const [climateSeries, setClimateSeries] = useState<string>(project.timeSeries.find((s) => s.unit === '°C' && !/fire|brann|iso/i.test(s.name))?.id ?? '');
  const regionIds = selectedIds(ui, 'regions');
  const selectedBc = project.boundaryConditions.find((b) => ui.selection.some((s) => s.collection === 'boundaryConditions' && s.id === b.id)) ?? null;
  const usesUnexposed = SIDES.some((s) => faces[s.id] === 'fire-unexposed' || faces[s.id] === 'ambient');

  const applyGuided = () => {
    const list: ExposureFace[] = [];
    for (const s of SIDES) {
      const k = faces[s.id];
      if (!k) continue;
      const f: ExposureFace = { side: s.id, kind: k };
      if ((k === 'indoor' || k === 'outdoor') && climateSeries) f.seriesId = climateSeries;
      if (k === 'fire-unexposed' || k === 'ambient') f.params = { alpha: unexposedAlpha };
      list.push(f);
    }
    dispatch([{ type: 'exposure.apply', regionIds: regionIds.length ? regionIds : undefined, faces: list, fireCurve: fireCurve || undefined }]);
  };

  return (
    <>
      <Section title={t('exposureGuided')}>
        <div className="row">
          {PRESETS.map((p) => (
            <Button key={p.key} small onClick={() => setFaces(p.faces)}>
              {t(p.key)}
            </Button>
          ))}
        </div>
        {SIDES.map((s) => (
          <SelectField
            key={s.id}
            label={`${t('face')}: ${t(s.key)}`}
            value={faces[s.id] ?? ''}
            options={[{ value: '', label: '–' }, ...KINDS.map((k) => ({ value: k.id, label: t(k.key) }))]}
            onChange={(v) => setFaces({ ...faces, [s.id]: (v || null) as ExposureKind | null })}
          />
        ))}
        {fireCurves.length > 0 && <SelectField label={t('fireCurve')} value={fireCurve} options={fireCurves.map((c) => ({ value: c.id, label: ui.lang === 'nb' && c.nameNb ? c.nameNb : c.name }))} onChange={setFireCurve} />}
        {usesUnexposed && <UnexposedAlpha value={unexposedAlpha} onChange={setUnexposedAlpha} />}
        <SelectField
          label={t('climateSeries')}
          value={climateSeries}
          options={[{ value: '', label: `${t('ambientTemperature')} (${project.settings.ambientTemperature} °C)` }, ...project.timeSeries.map((s) => ({ value: s.id, label: s.name })), ...climate.map((c) => ({ value: `lib:${c.id}`, label: `${c.name} (bibliotek)` }))]}
          onChange={setClimateSeries}
        />
        <div className="row right">
          <span className="hint">{regionIds.length ? t('selectedCount', { n: regionIds.length }) : t('faceExterior')}</span>
          <Button primary small onClick={applyGuided}>
            {t('applyExposure')}
          </Button>
        </div>
      </Section>

      <Section
        title={t('exposureAdvanced')}
        collapsible
        actions={
          <Button small onClick={() => addBc(dispatch, project.timeSeries[0]?.id, t)}>
            + {t('add')}
          </Button>
        }
      >
        {project.boundaryConditions.length === 0 && <Empty>–</Empty>}
        <ul className="tree">
          {project.boundaryConditions.map((b) => (
            <li key={b.id} className={selectedBc?.id === b.id ? 'selected' : ''} onClick={() => select([{ collection: 'boundaryConditions', id: b.id }])}>
              <span className="swatch" style={{ background: b.color ?? '#9ca3af' }} />
              <span className="grow">{b.name}</span>
              {ui.paintBcId === b.id && <span className="paint-on">🖌</span>}
              <span className="muted">
                {b.edgeRefs.length} {t('edgesAssigned')}
              </span>
            </li>
          ))}
        </ul>
        {selectedBc && <BcEditor bc={selectedBc} />}
      </Section>
    </>
  );
}

function addBc(dispatch: (c: Command[]) => unknown, seriesId: string | undefined, t: (k: StringKey) => string): void {
  const bc: WithOptionalId<BoundaryCondition> = seriesId
    ? { name: t('bcConvection'), edgeRefs: [], type: 'convection', airSeriesId: seriesId, alpha: 4 }
    : { name: t('bcInsulated'), edgeRefs: [], type: 'insulated' };
  dispatch([{ type: 'bc.add', bc }]);
}

function BcEditor(props: { bc: BoundaryCondition }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const edgeSel = useStore((s) => s.ui.edgeSelection);
  const paintBcId = useStore((s) => s.ui.paintBcId);
  const { dispatch, setUi, setTool } = useStore.getState();
  const { bc } = props;
  const painting = paintBcId === bc.id;
  const patch = (p: Record<string, unknown>) => dispatch([{ type: 'bc.update', id: bc.id, patch: p }]);
  const seriesOpts = project.timeSeries.map((s) => ({ value: s.id, label: s.name }));
  const firstSeries = project.timeSeries[0]?.id ?? '';
  const changeType = (type: BoundaryCondition['type']) => {
    const base: Record<string, unknown> = { type };
    if (type === 'fixed') base.temperatureSeriesId = firstSeries;
    if (type === 'convection') Object.assign(base, { airSeriesId: firstSeries, alpha: 4 });
    if (type === 'convection-radiation') Object.assign(base, { gasSeriesId: firstSeries, alphaC: 25, phi: 1, epsF: 1 });
    if (type === 'flux') base.fluxSeriesId = firstSeries;
    patch(base);
  };
  const setPainting = (on: boolean) => {
    setUi({ paintBcId: on ? bc.id : null });
    if (on) setTool('edge');
  };
  const insertPoint = () => {
    const e = edgeSel[0];
    if (!e) return;
    dispatch([{ type: 'region.insertVertex', id: e.regionId, ring: e.ring, edgeIndex: e.edgeIndex }]);
  };
  return (
    <div>
      <TextField label={t('name')} value={bc.name} onCommit={(name) => patch({ name })} />
      <SelectField
        label={t('bcType')}
        value={bc.type}
        options={[
          { value: 'insulated', label: t('bcInsulated') },
          { value: 'fixed', label: t('bcFixed') },
          { value: 'convection', label: t('bcConvection') },
          { value: 'convection-radiation', label: t('bcConvRad') },
          { value: 'flux', label: t('bcFlux') },
        ]}
        onChange={changeType}
      />
      {bc.type === 'fixed' && <SelectField label={t('series')} value={bc.temperatureSeriesId} options={seriesOpts} onChange={(v) => patch({ temperatureSeriesId: v })} />}
      {bc.type === 'convection' && (
        <>
          <SelectField label={t('series')} value={bc.airSeriesId} options={seriesOpts} onChange={(v) => patch({ airSeriesId: v })} />
          <UnexposedAlpha value={bc.alpha ?? (bc.surfaceResistance ? 1 / bc.surfaceResistance : 4)} onChange={(v) => patch({ alpha: v, surfaceResistance: undefined })} />
          <NumberField label={t('surfaceResistance')} value={bc.surfaceResistance ?? (bc.alpha ? 1 / bc.alpha : undefined)} decimals={4} onCommit={(v) => patch({ surfaceResistance: v, alpha: undefined })} />
        </>
      )}
      {bc.type === 'convection-radiation' && (
        <>
          <SelectField label={t('series')} value={bc.gasSeriesId} options={seriesOpts} onChange={(v) => patch({ gasSeriesId: v })} />
          <NumberField label={t('alphaC')} value={bc.alphaC} onCommit={(v) => patch({ alphaC: v })} />
          <NumberField label={t('phi')} value={bc.phi} min={0} max={1} onCommit={(v) => patch({ phi: v })} />
          <NumberField label={`${t('epsM')} (${t('fromMaterial')})`} value={bc.epsM} placeholder="auto" min={0} max={1} onCommit={(v) => patch({ epsM: v })} />
          <NumberField label={t('epsF')} value={bc.epsF} min={0} max={1} onCommit={(v) => patch({ epsF: v })} />
        </>
      )}
      {bc.type === 'flux' && <SelectField label={t('series')} value={bc.fluxSeriesId} options={seriesOpts} onChange={(v) => patch({ fluxSeriesId: v })} />}

      <div className="row">
        <Checkbox label={t('paintEdges')} checked={painting} onChange={setPainting} />
        <Help text={t('paintEdgesHelp')} />
      </div>
      <div className="row">
        <Button small disabled={edgeSel.length === 0} onClick={() => dispatch([{ type: 'bc.assignEdges', id: bc.id, edgeRefs: edgeSel, mode: 'add' }])} title={edgeSel.length ? '' : t('selectEdgesFirst')}>
          {t('assignSelectedEdges')} ({edgeSel.length})
        </Button>
        <Button small disabled={edgeSel.length === 0} onClick={() => dispatch([{ type: 'bc.assignEdges', id: bc.id, edgeRefs: edgeSel, mode: 'remove' }])}>
          −
        </Button>
        <Button small disabled={edgeSel.length === 0} onClick={insertPoint} title={edgeSel.length ? '' : t('selectEdgeFirst')}>
          {t('insertEdgePoint')}
        </Button>
        <Help text={t('insertEdgePointHelp')} />
        <Button small danger onClick={() => dispatch([{ type: 'bc.delete', id: bc.id }])}>
          {t('delete')}
        </Button>
      </div>
    </div>
  );
}
