import { useMemo, useState } from 'react';
import { BUILTIN_LIBRARY, TEMPLATES, buildTemplate, searchLibrary } from '@thermo2d/core';
import type { Command, Polygon } from '@thermo2d/core';
import { useStore } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import { Button, Checkbox, Dialog, NumberField, SelectField } from '../components/ui.js';
import { ringBoundsOf } from '../editor/geometryTools.js';

type Params = Record<string, number | string | boolean>;

export function findLibraryId(text: string, category: 'material' | 'fire-curve' | 'climate-series'): string | null {
  try {
    const hits = searchLibrary({ text, category }, BUILTIN_LIBRARY);
    return hits[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** Commands that turn a fresh project into a ready-to-run fire case (concrete + ISO 834 + three-sided fire). */
export function fireDefaultCommands(regionIds: string[]): Command[] {
  const cmds: Command[] = [];
  const concrete = findLibraryId('C30/37', 'material') ?? findLibraryId('concrete', 'material');
  if (concrete) {
    cmds.push({ type: 'material.addFromLibrary', libraryId: concrete, id: 'mat_concrete' });
    cmds.push({ type: 'region.setMaterial', ids: regionIds, materialId: 'mat_concrete' });
  }
  const iso = findLibraryId('ISO 834', 'fire-curve');
  cmds.push({
    type: 'exposure.apply',
    regionIds,
    faces: [
      { side: 'bottom', kind: 'fire' },
      { side: 'left', kind: 'fire' },
      { side: 'right', kind: 'fire' },
      { side: 'top', kind: 'fire-unexposed' },
    ],
    fireCurve: iso ?? undefined,
  });
  return cmds;
}

function TemplatePreview(props: { polygons: Polygon[] }) {
  const rings = props.polygons.flatMap((p) => [p.outer, ...p.holes]);
  const b = ringBoundsOf(rings);
  if (!b) return <svg className="template-preview" width={220} height={160} />;
  const w = b.maxX - b.minX || 1;
  const h = b.maxY - b.minY || 1;
  const s = Math.min(200 / w, 140 / h);
  const path = props.polygons
    .map((p) =>
      [p.outer, ...p.holes]
        .map((r) => r.map((pt, i) => `${i ? 'L' : 'M'}${((pt[0] - b.minX) * s + 10).toFixed(1)} ${(150 - (pt[1] - b.minY) * s).toFixed(1)}`).join(' ') + ' Z')
        .join(' '),
    )
    .join(' ');
  return (
    <svg className="template-preview" width={220} height={160}>
      <path d={path} fill="#9ca3af" fillOpacity={0.5} stroke="currentColor" strokeWidth={1} fillRule="evenodd" />
    </svg>
  );
}

export function StartDialog() {
  const t = useT();
  const lang = useStore((s) => s.ui.lang);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [params, setParams] = useState<Params>({});
  const [addDefaults, setAddDefaults] = useState(true);
  const templates = TEMPLATES ?? [];
  const tpl = templates.find((x) => x.id === templateId) ?? null;
  const effective: Params = useMemo(() => {
    const p: Params = {};
    for (const d of tpl?.params ?? []) p[d.key] = params[d.key] ?? d.default;
    return p;
  }, [tpl, params]);
  const preview = useMemo(() => {
    if (!tpl) return null;
    try {
      return buildTemplate(tpl.id, effective);
    } catch {
      return null;
    }
  }, [tpl, effective]);

  const close = () => useStore.setState({ showStart: false });
  const create = () => {
    const st = useStore.getState();
    st.newProject();
    if (tpl) {
      const res = st.dispatch([{ type: 'template.create', templateId: tpl.id, params: effective }]);
      const ids = res?.createdIds[0] ?? [];
      const regionIds = ids.filter((id) => st.project.regions.some((r) => r.id === id) || useStore.getState().project.regions.some((r) => r.id === id));
      if (addDefaults && regionIds.length) useStore.getState().dispatch(fireDefaultCommands(regionIds));
      useStore.setState({ past: [], future: [], dirty: false });
    }
    close();
  };

  return (
    <Dialog
      title={t('startTitle')}
      onClose={close}
      width={720}
      footer={
        <>
          <Button onClick={close}>{t('close')}</Button>
          <Button primary onClick={create}>
            {t('create')}
          </Button>
        </>
      }
    >
      <div className="start-templates">
        <Button active={templateId === null} onClick={() => setTemplateId(null)}>
          ◻ {t('startBlank')}
        </Button>
        {templates.map((x) => (
          <Button key={x.id} active={templateId === x.id} onClick={() => (setTemplateId(x.id), setParams({}))}>
            {lang === 'nb' ? x.nameNb : x.name}
          </Button>
        ))}
      </div>
      {tpl && (
        <div className="two-col">
          <div>
            <h3>{t('templateParams')}</h3>
            {tpl.params.map((d) =>
              d.kind === 'number' ? (
                <NumberField
                  key={d.key}
                  label={`${lang === 'nb' ? d.labelNb : d.label}`}
                  unit={d.unit}
                  value={Number(effective[d.key])}
                  min={d.min}
                  max={d.max}
                  onCommit={(v) => setParams({ ...params, [d.key]: v })}
                />
              ) : d.kind === 'select' ? (
                <SelectField
                  key={d.key}
                  label={lang === 'nb' ? d.labelNb : d.label}
                  value={String(effective[d.key])}
                  options={(d.options ?? []).map((o) => ({ value: o, label: o }))}
                  onChange={(v) => setParams({ ...params, [d.key]: v })}
                />
              ) : (
                <Checkbox key={d.key} label={lang === 'nb' ? d.labelNb : d.label} checked={Boolean(effective[d.key])} onChange={(v) => setParams({ ...params, [d.key]: v })} />
              ),
            )}
            <Checkbox label={t('startDefaults')} checked={addDefaults} onChange={setAddDefaults} />
          </div>
          <div>
            <h3>{t('preview')}</h3>
            <TemplatePreview polygons={preview?.regions.map((r) => r.polygon) ?? []} />
          </div>
        </div>
      )}
      {!tpl && <p className="hint">{t('startTemplate')}: {templates.length}</p>}
    </Dialog>
  );
}
