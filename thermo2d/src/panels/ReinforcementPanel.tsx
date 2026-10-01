import { useState } from 'react';
import { BUILTIN_LIBRARY, searchLibrary } from '@thermo2d/core';
import type { RebarSet, RebarSetKind } from '@thermo2d/core';
import { useStore, selectedIds } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import { Button, Checkbox, Empty, NumberField, Section, SelectField, TextField } from '../components/ui.js';
import { kindKey } from './ModelPanel.js';

const KINDS: RebarSetKind[] = ['edge', 'corner', 'stirrup', 'grid', 'ring'];

function ensureSteel(): string | null {
  const st = useStore.getState();
  const existing = st.project.materials.find((m) => m.category === 'metal' && /armering|reinforc|rebar/i.test(m.name + m.tags.join(' ')));
  if (existing) return existing.id;
  try {
    const hit = searchLibrary({ text: 'reinforcing', category: 'material' }, BUILTIN_LIBRARY)[0] ?? searchLibrary({ text: 'armering', category: 'material' }, BUILTIN_LIBRARY)[0];
    if (!hit) return null;
    const res = st.dispatch([{ type: 'material.addFromLibrary', libraryId: hit.id, id: 'mat_rebar' }]);
    return res?.createdIds[0]?.[0] ?? null;
  } catch {
    return null;
  }
}

export function ReinforcementPanel() {
  const t = useT();
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const { dispatch, select } = useStore.getState();
  const regionIds = selectedIds(ui, 'regions');
  const [kind, setKind] = useState<RebarSetKind>('edge');
  const [dia, setDia] = useState(20);
  const [count, setCount] = useState(4);
  const [spacing, setSpacing] = useState(0);
  const [cover, setCover] = useState(35);
  const [gridX, setGridX] = useState(150);
  const [gridY, setGridY] = useState(150);
  const [corners, setCorners] = useState('');
  const [manual, setManual] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const regionId = regionIds[0] ?? project.regions[0]?.id;
  const edgeRef = ui.edgeSelection[0];
  const selectedSet = project.rebarSets.find((s) => ui.selection.some((x) => x.collection === 'rebarSets' && x.id === s.id)) ?? null;
  const steelOpts = project.materials.filter((m) => m.category === 'metal');

  const addSet = () => {
    const materialId = ensureSteel();
    if (!materialId || !regionId) return;
    const hostRegion = project.regions.find((r) => r.id === regionId);
    const set: Omit<RebarSet, 'id'> = {
      name: `${t(kindKey(kind))} Ø${dia}`,
      kind,
      regionId,
      diameter: dia,
      materialId,
      cover,
      ...(kind === 'edge' ? { edgeRef: edgeRef && edgeRef.regionId === regionId ? edgeRef : { regionId, ring: 0, edgeIndex: 0 }, ...(spacing > 0 ? { spacing } : { count }) } : {}),
      ...(kind === 'corner' ? { corners: corners.trim() ? corners.split(/[,\s;]+/).map(Number).filter(Number.isFinite) : (hostRegion?.polygon.outer.map((_, i) => i) ?? []) } : {}),
      ...(kind === 'grid' ? { spacingX: gridX, spacingY: gridY } : {}),
      ...(kind === 'ring' ? { count } : {}),
      ...(kind === 'stirrup' ? { meshed: false } : {}),
    };
    const res = dispatch([{ type: 'rebarSet.add', set }]);
    const id = res?.createdIds[0]?.[0];
    if (id) select([{ collection: 'rebarSets', id }]);
  };
  const addManual = () => {
    const materialId = ensureSteel();
    if (!materialId) return;
    dispatch([{ type: 'rebar.add', rebar: { name: '', centre: [manual.x, manual.y], diameter: dia, materialId } }]);
  };

  return (
    <>
      <Section title={t('addRebarSet')}>
        <SelectField label={t('setKind')} value={kind} options={KINDS.map((k) => ({ value: k, label: t(kindKey(k)) }))} onChange={setKind} />
        <SelectField label={t('hostRegion')} value={regionId ?? ''} options={project.regions.map((r) => ({ value: r.id, label: r.name }))} onChange={(v) => select([{ collection: 'regions', id: v }])} />
        {kind === 'edge' && (
          <p className="hint">
            {t('hostEdge')}: {edgeRef && edgeRef.regionId === regionId ? `#${edgeRef.edgeIndex}` : t('pickEdgeHint')}
          </p>
        )}
        <NumberField label={t('diameter')} unit="mm" value={dia} min={4} onCommit={setDia} />
        <NumberField label={t('cover')} unit="mm" value={cover} min={0} onCommit={setCover} />
        {(kind === 'edge' || kind === 'ring') && <NumberField label={t('count')} value={count} min={1} step={1} onCommit={setCount} />}
        {kind === 'edge' && <NumberField label={`${t('spacing')} (0 = ${t('count').toLowerCase()})`} unit="mm" value={spacing} min={0} onCommit={setSpacing} />}
        {kind === 'grid' && (
          <>
            <NumberField label={t('spacingX')} unit="mm" value={gridX} min={10} onCommit={setGridX} />
            <NumberField label={t('spacingY')} unit="mm" value={gridY} min={10} onCommit={setGridY} />
          </>
        )}
        {kind === 'corner' && <TextField label={t('corners')} value={corners} placeholder="0, 1, 2, 3" onCommit={setCorners} />}
        <div className="row right">
          <Button primary small disabled={!regionId} onClick={addSet}>
            {t('add')}
          </Button>
        </div>
      </Section>

      <Section title={t('rebarSets')}>
        {project.rebarSets.length === 0 && <Empty>–</Empty>}
        <ul className="tree">
          {project.rebarSets.map((s) => (
            <li key={s.id} className={selectedSet?.id === s.id ? 'selected' : ''} onClick={() => select([{ collection: 'rebarSets', id: s.id }])}>
              <span className="grow">{s.name}</span>
              <span className="muted">
                {project.rebars.filter((b) => b.setId === s.id).length} × Ø{s.diameter}
              </span>
            </li>
          ))}
        </ul>
        {selectedSet && <SetEditor set={selectedSet} steelOpts={steelOpts.map((m) => ({ value: m.id, label: m.name }))} />}
      </Section>

      <Section title={t('manualBar')} collapsible defaultOpen={false}>
        <NumberField label={t('x')} unit="mm" value={manual.x} onCommit={(x) => setManual({ ...manual, x })} />
        <NumberField label={t('y')} unit="mm" value={manual.y} onCommit={(y) => setManual({ ...manual, y })} />
        <div className="row right">
          <Button small onClick={addManual}>
            {t('addBar')}
          </Button>
        </div>
      </Section>

      <Section title={t('advanced')} collapsible defaultOpen={false}>
        <SelectField
          label={t('coverReference')}
          value={project.settings.coverReference}
          options={[{ value: 'surface', label: t('coverSurface') }, { value: 'centre', label: t('coverCentre') }]}
          onChange={(v) => dispatch([{ type: 'project.setSettings', patch: { coverReference: v } }])}
        />
        <Checkbox label={t('meshStirrup')} checked={project.settings.meshStirrups} onChange={(v) => dispatch([{ type: 'project.setSettings', patch: { meshStirrups: v } }])} />
      </Section>
    </>
  );
}

function SetEditor(props: { set: RebarSet; steelOpts: { value: string; label: string }[] }) {
  const t = useT();
  const dispatch = useStore((s) => s.dispatch);
  const edgeRef = useStore((s) => s.ui.edgeSelection[0]);
  const { set } = props;
  const patch = (p: Partial<RebarSet>) => dispatch([{ type: 'rebarSet.update', id: set.id, patch: p }]);
  return (
    <div>
      <TextField label={t('name')} value={set.name} onCommit={(name) => patch({ name })} />
      <NumberField label={t('diameter')} unit="mm" value={set.diameter} min={4} onCommit={(v) => patch({ diameter: v })} />
      <NumberField label={t('cover')} unit="mm" value={set.cover} min={0} onCommit={(v) => patch({ cover: v })} />
      {(set.kind === 'edge' || set.kind === 'ring') && <NumberField label={t('count')} value={set.count} min={1} step={1} onCommit={(v) => patch({ count: v, spacing: undefined })} />}
      {set.kind === 'edge' && (
        <>
          <NumberField label={t('spacing')} unit="mm" value={set.spacing} min={0} onCommit={(v) => patch(v > 0 ? { spacing: v, count: undefined } : { spacing: undefined })} />
          <NumberField label={`${t('from')} (offset)`} unit="mm" value={set.startOffset} onCommit={(v) => patch({ startOffset: v })} />
          <NumberField label={`${t('to')} (offset)`} unit="mm" value={set.endOffset} onCommit={(v) => patch({ endOffset: v })} />
          <div className="row">
            <span className="hint">
              {t('hostEdge')}: #{set.edgeRef?.edgeIndex}
            </span>
            {edgeRef && edgeRef.regionId === set.regionId && (
              <Button small onClick={() => patch({ edgeRef })}>
                {t('apply')} #{edgeRef.edgeIndex}
              </Button>
            )}
          </div>
        </>
      )}
      {set.kind === 'grid' && (
        <>
          <NumberField label={t('spacingX')} unit="mm" value={set.spacingX} onCommit={(v) => patch({ spacingX: v })} />
          <NumberField label={t('spacingY')} unit="mm" value={set.spacingY} onCommit={(v) => patch({ spacingY: v })} />
        </>
      )}
      {set.kind === 'stirrup' && <Checkbox label={t('meshStirrup')} checked={!!set.meshed} onChange={(v) => patch({ meshed: v })} />}
      {props.steelOpts.length > 0 && <SelectField label={t('steelMaterial')} value={set.materialId} options={props.steelOpts} onChange={(v) => patch({ materialId: v })} />}
      <div className="row">
        <Button small onClick={() => dispatch([{ type: 'rebarSet.delete', id: set.id, keepBars: true }])}>
          {t('detach')}
        </Button>
        <Button small danger onClick={() => dispatch([{ type: 'rebarSet.delete', id: set.id }])}>
          {t('delete')}
        </Button>
      </div>
    </div>
  );
}
