import { useState } from 'react';
import type { Material, MaterialTableRow } from '@thermo2d/core';
import { useStore, selectedIds } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import { Button, Empty, Help, NumberField, Section, SelectField, TextField, Checkbox } from '../components/ui.js';
import { qualityKey } from './LibraryDialog.js';
import { downloadLibraryItem, materialToLibraryItem, saveToMyLibrary } from '../state/library.js';

function parseTable(text: string): MaterialTableRow[] {
  const rows: MaterialTableRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line
      .trim()
      .split(/[;\t]|,(?=\s)|\s{2,}|\s+/)
      .map((s) => Number(s.replace(',', '.')))
      .filter((n) => Number.isFinite(n));
    if (parts.length >= 4) rows.push({ theta: parts[0], lambda: parts[1], cp: parts[2], rho: parts[3] });
  }
  return rows.sort((a, b) => a.theta - b.theta);
}

export function MaterialsPanel() {
  const t = useT();
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const { dispatch, setUi } = useStore.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const regionIds = selectedIds(ui, 'regions');
  const usedBy = (m: Material) => project.regions.filter((r) => r.materialId === m.id).map((r) => r.name).concat(project.rebars.filter((b) => b.materialId === m.id).length ? [t('rebars')] : []);
  const edit = project.materials.find((m) => m.id === editing) ?? null;

  const clone = (m: Material) => {
    const copy: Omit<Material, 'id'> & { id?: string } = { ...structuredClone(m), origin: 'user', quality: 'user', name: `${m.name} (${t('edit').toLowerCase()})`, libraryHash: undefined };
    delete (copy as { id?: string }).id;
    const res = dispatch([{ type: 'material.add', material: copy }]);
    const id = res?.createdIds[0]?.[0];
    if (id) setEditing(id);
  };

  return (
    <>
      <Section
        title={t('panelMaterials')}
        actions={
          <>
            <Button small onClick={() => setUi({ dialog: { kind: 'library', forRegionIds: regionIds.length ? regionIds : undefined } })}>
              + {t('addFromLibrary')}
            </Button>
            <Button
              small
              onClick={() => {
                const res = dispatch([
                  {
                    type: 'material.add',
                    material: { name: t('newMaterial'), category: 'custom', model: { kind: 'constant', lambda: 1, cp: 1000, rho: 1000 }, emissivity: 0.9, validRange: [-50, 1200], source: { text: '' }, quality: 'user', tags: [], origin: 'user' },
                  },
                ]);
                const id = res?.createdIds[0]?.[0];
                if (id) setEditing(id);
              }}
            >
              + {t('newMaterial')}
            </Button>
          </>
        }
      >
        <Help text={t('libraryHelp')} />
        {project.materials.length === 0 && <Empty>{t('addFromLibrary')}</Empty>}
        <ul className="tree">
          {project.materials.map((m) => (
            <li key={m.id} className={editing === m.id ? 'selected' : ''} onClick={() => setEditing(m.id)}>
              <span className="swatch" style={{ background: m.color ?? '#9ca3af' }} />
              <span className="grow">{m.name}</span>
              <span className="muted">{t(qualityKey(m.quality))}</span>
              <span className="muted">{usedBy(m).length ? `${t('usedBy')}: ${usedBy(m).join(', ')}` : ''}</span>
            </li>
          ))}
        </ul>
      </Section>
      {edit && (
        <Section title={edit.name}>
          {edit.origin === 'builtin' && <p className="hint">{t('builtinReadOnly')}</p>}
          <div className="row">
            {regionIds.length > 0 && (
              <Button small onClick={() => dispatch([{ type: 'region.setMaterial', ids: regionIds, materialId: edit.id }])}>
                {t('assignToSelected')}
              </Button>
            )}
            <Button small onClick={() => clone(edit)}>
              {t('clone')}
            </Button>
            {edit.origin === 'user' && (
              <>
                <Button small onClick={() => (saveToMyLibrary(materialToLibraryItem(edit)), setSavedNote(edit.id))}>
                  {t('saveToMyLibrary')}
                </Button>
                <Button small onClick={() => downloadLibraryItem(materialToLibraryItem(edit))}>
                  {t('exportToCompanyLibrary')}
                </Button>
              </>
            )}
            <Button small danger disabled={usedBy(edit).length > 0} onClick={() => (setEditing(null), dispatch([{ type: 'material.delete', id: edit.id }]))}>
              {t('delete')}
            </Button>
          </div>
          {savedNote === edit.id && <p className="hint">{t('savedToMyLibrary')}</p>}
          <p className="hint">
            {t('source')}: {edit.source.text} · {t('validRange')}: {edit.validRange[0]}–{edit.validRange[1]} °C
          </p>
          <MaterialEditor m={edit} readOnly={edit.origin === 'builtin'} />
          {edit.origin !== 'builtin' && (
            <Section title={t('pasteTable')} collapsible defaultOpen={false}>
              <textarea className="field" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'20; 1.5; 900; 2300\n100; 1.4; 950; 2300'} />
              <Button
                small
                disabled={parseTable(pasted).length < 2}
                onClick={() => dispatch([{ type: 'material.update', id: edit.id, patch: { model: { kind: 'table', rows: parseTable(pasted) }, validRange: [parseTable(pasted)[0].theta, parseTable(pasted).slice(-1)[0].theta] } }])}
              >
                {t('apply')}
              </Button>
            </Section>
          )}
        </Section>
      )}
    </>
  );
}

function MaterialEditor(props: { m: Material; readOnly: boolean }) {
  const t = useT();
  const dispatch = useStore((s) => s.dispatch);
  const { m, readOnly } = props;
  const patch = (p: Partial<Material>) => dispatch([{ type: 'material.update', id: m.id, patch: p }]);
  const model = m.model;
  return (
    <>
      <TextField label={t('name')} value={m.name} disabled={readOnly} onCommit={(name) => patch({ name })} />
      <NumberField label={t('emissivity')} value={m.emissivity} min={0} max={1} step={0.05} disabled={readOnly} onCommit={(v) => patch({ emissivity: v })} />
      {model.kind === 'constant' && (
        <>
          <NumberField label={t('conductivity')} unit="W/mK" value={model.lambda} disabled={readOnly} onCommit={(v) => patch({ model: { ...model, lambda: v } })} />
          <NumberField label={t('specificHeat')} unit="J/kgK" value={model.cp} disabled={readOnly} onCommit={(v) => patch({ model: { ...model, cp: v } })} />
          <NumberField label={t('density')} unit="kg/m³" value={model.rho} disabled={readOnly} onCommit={(v) => patch({ model: { ...model, rho: v } })} />
        </>
      )}
      {model.kind === 'concrete-en1992-1-2' && (
        <>
          <SelectField label={t('aggregate')} value={model.aggregate} disabled={readOnly} options={[{ value: 'siliceous', label: t('siliceous') }, { value: 'calcareous', label: t('calcareous') }]} onChange={(v) => patch({ model: { ...model, aggregate: v } })} />
          <NumberField label={t('moisture')} unit="%" value={model.moisture} min={0} max={10} step={0.5} disabled={readOnly} onCommit={(v) => patch({ model: { ...model, moisture: v } })} />
          <SelectField label={t('conductivityBound')} value={model.conductivity} disabled={readOnly} options={[{ value: 'lower', label: t('lower') }, { value: 'upper', label: t('upper') }]} onChange={(v) => patch({ model: { ...model, conductivity: v } })} />
          <NumberField label={`${t('density')} (20 °C)`} unit="kg/m³" value={model.rho20} disabled={readOnly} onCommit={(v) => patch({ model: { ...model, rho20: v } })} />
        </>
      )}
      {model.kind === 'steel-en1993-1-2' && <NumberField label={t('density')} unit="kg/m³" value={model.rho} disabled={readOnly} onCommit={(v) => patch({ model: { ...model, rho: v } })} />}
      {model.kind === 'timber-en1995-1-2' && (
        <>
          <NumberField label={`${t('density')} (ρ₀)`} unit="kg/m³" value={model.rho0} disabled={readOnly} onCommit={(v) => patch({ model: { ...model, rho0: v } })} />
          <NumberField label={t('moisture')} unit="%" value={model.moisture} disabled={readOnly} onCommit={(v) => patch({ model: { ...model, moisture: v } })} />
        </>
      )}
      {model.kind === 'table' && (
        <table className="grid">
          <thead>
            <tr>
              <th>θ</th>
              <th>λ</th>
              <th>cₚ</th>
              <th>ρ</th>
            </tr>
          </thead>
          <tbody>
            {model.rows.slice(0, 40).map((r, i) => (
              <tr key={i}>
                <td className="num">{r.theta}</td>
                <td className="num">{r.lambda}</td>
                <td className="num">{r.cp}</td>
                <td className="num">{r.rho}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {model.kind === 'air-layer-iso6946' && (
        <>
          <NumberField label={t('width')} unit="mm" value={model.thickness} disabled={readOnly} onCommit={(v) => patch({ model: { ...model, thickness: v } })} />
          <Checkbox label="ventilert" checked={model.ventilation === 'slightly'} disabled={readOnly} onChange={(v) => patch({ model: { ...model, ventilation: v ? 'slightly' : 'unventilated' } })} />
        </>
      )}
    </>
  );
}
