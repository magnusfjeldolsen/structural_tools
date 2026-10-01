import { useState } from 'react';
import { TEMPLATES } from '@thermo2d/core';
import type { Region } from '@thermo2d/core';
import { useStore, isSelected, type Selection } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import { Button, Empty, NumberField, Section, SelectField, TextField, Checkbox, fmtNum } from '../components/ui.js';
import { polygonAreaOf } from '../editor/geometryTools.js';

export function ModelPanel() {
  const t = useT();
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const { select, dispatch } = useStore.getState();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const row = (sel: Selection, label: string, extra?: React.ReactNode, swatch?: string) => (
    <li key={`${sel.collection}:${sel.id}`} className={isSelected(ui, sel.collection, sel.id) ? 'selected' : ''} onClick={(e) => select([sel], e.shiftKey)}>
      {swatch && <span className="swatch" style={{ background: swatch }} />}
      <span className="grow">{label}</span>
      {extra}
    </li>
  );
  const regionRow = (r: Region) => {
    const mat = project.materials.find((m) => m.id === r.materialId);
    return row(
      { collection: 'regions', id: r.id },
      r.name,
      <>
        <span className="muted">{mat?.name ?? t('noMaterial')}</span>
        <button className="icon-btn" title={t('visible')} onClick={(e) => (e.stopPropagation(), dispatch([{ type: 'region.update', id: r.id, patch: { visible: r.visible === false } }]))}>
          {r.visible === false ? '◌' : '◉'}
        </button>
        <button className="icon-btn" title={t('locked')} onClick={(e) => (e.stopPropagation(), dispatch([{ type: 'region.update', id: r.id, patch: { locked: !r.locked } }]))}>
          {r.locked ? '🔒' : '🔓'}
        </button>
      </>,
      mat?.color ?? r.color ?? '#9ca3af',
    );
  };

  const selRegions = project.regions.filter((r) => isSelected(ui, 'regions', r.id));
  const selRebars = project.rebars.filter((r) => isSelected(ui, 'rebars', r.id));
  const selProbes = project.probes.filter((p) => isSelected(ui, 'probes', p.id));
  const selLine = project.lineProbes.filter((p) => isSelected(ui, 'lineProbes', p.id));
  const first = selRegions[0];
  const tpl = first?.template ? TEMPLATES.find((x) => x.id === first.template!.templateId) : null;
  const hasDependents = (r: Region) => project.rebarSets.some((s) => s.regionId === r.id) || project.boundaryConditions.some((b) => b.edgeRefs.some((e) => e.regionId === r.id));

  return (
    <>
      <Section title={t('regions')} collapsible>
        {project.regions.length ? <ul className="tree">{project.regions.map(regionRow)}</ul> : <Empty>–</Empty>}
      </Section>
      {(project.rebarSets.length > 0 || project.rebars.length > 0) && (
        <Section title={t('rebars')} collapsible>
          <ul className="tree">
            {project.rebarSets.map((s) => row({ collection: 'rebarSets', id: s.id }, `${s.name} (${t(kindKey(s.kind))}, Ø${s.diameter})`, <span className="muted">{project.rebars.filter((b) => b.setId === s.id).length}</span>))}
            {project.rebars.filter((b) => !b.setId).map((b) => row({ collection: 'rebars', id: b.id }, `${b.name} Ø${b.diameter}`, <span className="muted">{fmtNum(b.centre[0], 0)}, {fmtNum(b.centre[1], 0)}</span>))}
          </ul>
        </Section>
      )}
      {project.boundaryConditions.length > 0 && (
        <Section title={t('boundaryConditions')} collapsible>
          <ul className="tree">{project.boundaryConditions.map((b) => row({ collection: 'boundaryConditions', id: b.id }, b.name, <span className="muted">{b.edgeRefs.length} {t('edgesAssigned')}</span>, b.color))}</ul>
        </Section>
      )}
      {(project.probes.length > 0 || project.lineProbes.length > 0) && (
        <Section title={t('probes')} collapsible>
          <ul className="tree">
            {project.probes.map((p) => row({ collection: 'probes', id: p.id }, p.name, <span className="muted">{fmtNum(p.position[0], 0)}, {fmtNum(p.position[1], 0)}</span>))}
            {project.lineProbes.map((p) => row({ collection: 'lineProbes', id: p.id }, `${p.name} (${t('lineProbes')})`))}
          </ul>
        </Section>
      )}

      <Section title={t('properties')}>
        {ui.selection.length === 0 && <Empty>{t('nothingSelected')}</Empty>}
        {first && (
          <>
            <TextField label={t('name')} value={first.name} onCommit={(name) => dispatch([{ type: 'region.update', id: first.id, patch: { name } }])} />
            <SelectField
              label={t('material')}
              value={first.materialId ?? ''}
              options={[{ value: '', label: t('noMaterial') }, ...project.materials.map((m) => ({ value: m.id, label: m.name }))]}
              onChange={(v) => dispatch([{ type: 'region.setMaterial', ids: selRegions.map((r) => r.id), materialId: v || null }])}
            />
            <div className="row">
              <Button small onClick={() => useStore.getState().setUi({ dialog: { kind: 'library', forRegionIds: selRegions.map((r) => r.id) } })}>
                {t('addFromLibrary')}
              </Button>
              <span className="pill">
                {t('area')}: {fmtNum(polygonAreaOf(first.polygon) / 1e6, 4)} m²
              </span>
            </div>
            {tpl && first.template && (
              <Section title={t('templateParams')} collapsible>
                {tpl.params
                  .filter((d) => d.kind === 'number')
                  .map((d) => (
                    <NumberField
                      key={d.key}
                      label={ui.lang === 'nb' ? d.labelNb : d.label}
                      unit={d.unit}
                      value={Number(first.template!.params[d.key] ?? d.default)}
                      min={d.min}
                      max={d.max}
                      onCommit={(v) => dispatch([{ type: 'template.update', regionId: first.id, params: { ...first.template!.params, [d.key]: v } }])}
                    />
                  ))}
              </Section>
            )}
            <Section title={t('vertices')} collapsible defaultOpen={false}>
              <VertexTable region={first} />
            </Section>
            <div className="row">
              <Button small onClick={() => dispatch([{ type: 'region.mergeCollinear', id: first.id }])}>
                {t('regenerate')}
              </Button>
              {hasDependents(first) ? (
                pendingDelete === first.id ? (
                  <>
                    <span className="hint">{t('confirmDeleteRegion')}</span>
                    <Button small danger onClick={() => (setPendingDelete(null), dispatch([{ type: 'region.delete', ids: selRegions.map((r) => r.id), dependents: 'delete' }]))}>
                      {t('deleteDependents')}
                    </Button>
                    <Button small onClick={() => (setPendingDelete(null), dispatch([{ type: 'region.delete', ids: selRegions.map((r) => r.id), dependents: 'detach' }]))}>
                      {t('detachDependents')}
                    </Button>
                  </>
                ) : (
                  <Button small danger onClick={() => setPendingDelete(first.id)}>
                    {t('delete')}
                  </Button>
                )
              ) : (
                <Button small danger onClick={() => dispatch([{ type: 'region.delete', ids: selRegions.map((r) => r.id) }])}>
                  {t('delete')}
                </Button>
              )}
            </div>
          </>
        )}
        {selRebars.map((b) => (
          <div key={b.id}>
            <TextField label={t('name')} value={b.name} onCommit={(name) => dispatch([{ type: 'rebar.update', id: b.id, patch: { name } }])} />
            <NumberField label={t('x')} unit="mm" value={b.centre[0]} onCommit={(v) => dispatch([{ type: 'rebar.update', id: b.id, patch: { centre: [v, b.centre[1]] } }])} />
            <NumberField label={t('y')} unit="mm" value={b.centre[1]} onCommit={(v) => dispatch([{ type: 'rebar.update', id: b.id, patch: { centre: [b.centre[0], v] } }])} />
            <NumberField label={t('diameter')} unit="mm" value={b.diameter} min={1} onCommit={(v) => dispatch([{ type: 'rebar.update', id: b.id, patch: { diameter: v } }])} />
            <Checkbox label={t('toolProbe')} checked={b.probe !== false} onChange={(v) => dispatch([{ type: 'rebar.update', id: b.id, patch: { probe: v } }])} />
            <div className="row">
              {b.setId && (
                <Button small onClick={() => dispatch([{ type: 'rebar.detach', ids: [b.id] }])}>
                  {t('detach')}
                </Button>
              )}
              <Button small danger onClick={() => dispatch([{ type: 'rebar.delete', ids: [b.id] }])}>
                {t('delete')}
              </Button>
            </div>
          </div>
        ))}
        {selProbes.map((p) => (
          <div key={p.id}>
            <TextField label={t('name')} value={p.name} onCommit={(name) => dispatch([{ type: 'probe.update', id: p.id, patch: { name } }])} />
            <NumberField label={t('x')} unit="mm" value={p.position[0]} onCommit={(v) => dispatch([{ type: 'probe.update', id: p.id, patch: { position: [v, p.position[1]], kind: 'manual' } }])} />
            <NumberField label={t('y')} unit="mm" value={p.position[1]} onCommit={(v) => dispatch([{ type: 'probe.update', id: p.id, patch: { position: [p.position[0], v], kind: 'manual' } }])} />
            <Button small danger onClick={() => dispatch([{ type: 'probe.delete', ids: [p.id] }])}>
              {t('delete')}
            </Button>
          </div>
        ))}
        {selLine.map((p) => (
          <div key={p.id}>
            <TextField label={t('name')} value={p.name} onCommit={(name) => dispatch([{ type: 'lineProbe.update', id: p.id, patch: { name } }])} />
            <NumberField label={`${t('from')} x`} value={p.from[0]} onCommit={(v) => dispatch([{ type: 'lineProbe.update', id: p.id, patch: { from: [v, p.from[1]] } }])} />
            <NumberField label={`${t('from')} y`} value={p.from[1]} onCommit={(v) => dispatch([{ type: 'lineProbe.update', id: p.id, patch: { from: [p.from[0], v] } }])} />
            <NumberField label={`${t('to')} x`} value={p.to[0]} onCommit={(v) => dispatch([{ type: 'lineProbe.update', id: p.id, patch: { to: [v, p.to[1]] } }])} />
            <NumberField label={`${t('to')} y`} value={p.to[1]} onCommit={(v) => dispatch([{ type: 'lineProbe.update', id: p.id, patch: { to: [p.to[0], v] } }])} />
            <Button small danger onClick={() => dispatch([{ type: 'lineProbe.delete', ids: [p.id] }])}>
              {t('delete')}
            </Button>
          </div>
        ))}
      </Section>
    </>
  );
}

function VertexTable(props: { region: Region }) {
  const t = useT();
  const dispatch = useStore((s) => s.dispatch);
  const vsel = useStore((s) => s.ui.vertexSelection);
  const rings = [props.region.polygon.outer, ...props.region.polygon.holes];
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>#</th>
          <th>{t('x')}</th>
          <th>{t('y')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rings.map((ring, ri) =>
          ring.map((p, i) => (
            <tr key={`${ri}-${i}`} className={vsel && vsel.regionId === props.region.id && vsel.ring === ri && vsel.index === i ? 'selected' : ''} onClick={() => useStore.getState().setUi({ vertexSelection: { regionId: props.region.id, ring: ri, index: i } })}>
              <td>
                {ri ? `h${ri}.` : ''}
                {i}
              </td>
              <td className="num">
                <NumberField value={p[0]} decimals={2} width={70} onCommit={(v) => dispatch([{ type: 'region.setVertex', id: props.region.id, ring: ri, index: i, point: [v, p[1]] }])} />
              </td>
              <td className="num">
                <NumberField value={p[1]} decimals={2} width={70} onCommit={(v) => dispatch([{ type: 'region.setVertex', id: props.region.id, ring: ri, index: i, point: [p[0], v] }])} />
              </td>
              <td>
                <button className="icon-btn" title={t('delete')} disabled={ring.length <= 3} onClick={() => dispatch([{ type: 'region.deleteVertex', id: props.region.id, ring: ri, index: i }])}>
                  ✕
                </button>
              </td>
            </tr>
          )),
        )}
      </tbody>
    </table>
  );
}

export function kindKey(k: string): 'kindEdge' | 'kindCorner' | 'kindStirrup' | 'kindGrid' | 'kindRing' | 'kindManual' {
  return k === 'edge' ? 'kindEdge' : k === 'corner' ? 'kindCorner' : k === 'stirrup' ? 'kindStirrup' : k === 'grid' ? 'kindGrid' : k === 'ring' ? 'kindRing' : 'kindManual';
}
