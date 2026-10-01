import { MESH_PRESETS, resolveMeshSettings } from '@thermo2d/core';
import type { Analysis, MeshSettings } from '@thermo2d/core';
import { useStore } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import { Button, Checkbox, NumberField, Section, SelectField, TextField } from '../components/ui.js';

export function AnalysisPanel() {
  const t = useT();
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const meshPreview = useStore((s) => s.meshPreview);
  const meshError = useStore((s) => s.meshPreviewError);
  const running = useStore((s) => s.running);
  const { dispatch, setUi, refreshMeshPreview, checkMesh } = useStore.getState();
  const analysis = project.analyses.find((a) => a.id === ui.activeAnalysisId) ?? project.analyses[0];
  if (!analysis) return null;
  const patch = (p: Partial<Analysis>) => dispatch([{ type: 'analysis.update', id: analysis.id, patch: p }]);
  const meshPatch = (p: Partial<MeshSettings>) => dispatch([{ type: 'project.setMesh', patch: p }]);
  const size = resolveMeshSettings(project.mesh);
  const presets = MESH_PRESETS;

  return (
    <>
      <Section
        title={t('analysis')}
        actions={
          project.analyses.length > 1 ? (
            <SelectField value={analysis.id} options={project.analyses.map((a) => ({ value: a.id, label: a.name }))} onChange={(v) => setUi({ activeAnalysisId: v })} />
          ) : undefined
        }
      >
        <TextField label={t('name')} value={analysis.name} onCommit={(name) => patch({ name })} />
        <SelectField label={t('mode')} value={analysis.mode} options={[{ value: 'transient', label: t('modeTransient') }, { value: 'steady', label: t('modeSteady') }, { value: 'periodic', label: t('modePeriodic') }]} onChange={(mode) => patch({ mode, ...(mode === 'periodic' && !analysis.periodic ? { periodic: { maxCycles: 10, tolerance: 0.05 } } : {}) })} />
        {analysis.mode !== 'steady' && (
          <>
            <NumberField label={`${t('duration')}`} unit="min" value={analysis.duration / 60} min={0.1} onCommit={(v) => patch({ duration: v * 60 })} />
            <NumberField label={t('timeStep')} unit="s" value={analysis.dt} min={0.01} onCommit={(v) => patch({ dt: v })} />
            <NumberField label={t('outputInterval')} unit="s" value={analysis.outputInterval} min={1} onCommit={(v) => patch({ outputInterval: v })} />
          </>
        )}
        <NumberField label={t('initialTemperature')} unit="°C" value={analysis.initialTemperature} onCommit={(v) => patch({ initialTemperature: v })} />
        <NumberField label={t('ambientTemperature')} unit="°C" value={project.settings.ambientTemperature} onCommit={(v) => dispatch([{ type: 'project.setSettings', patch: { ambientTemperature: v } }])} />
        <div className="row">
          <Button small onClick={() => dispatch([{ type: 'analysis.add', analysis: { ...analysis, id: undefined, name: `${analysis.name} (2)` } as never }])}>
            + {t('analysis')}
          </Button>
          {project.analyses.length > 1 && (
            <Button small danger onClick={() => (setUi({ activeAnalysisId: project.analyses.find((a) => a.id !== analysis.id)!.id }), dispatch([{ type: 'analysis.delete', id: analysis.id }]))}>
              {t('delete')}
            </Button>
          )}
        </div>
      </Section>

      <Section title={t('mesh')}>
        <div className="row">
          {(['coarse', 'normal', 'fine'] as const).map((p) => (
            <Button key={p} small active={project.mesh.preset === p} onClick={() => meshPatch({ preset: p, boundarySize: undefined, interiorSize: undefined, rebarSize: undefined, growth: undefined })}>
              {t(p === 'coarse' ? 'meshCoarse' : p === 'normal' ? 'meshNormal' : 'meshFine')}
            </Button>
          ))}
        </div>
        <div className="row">
          <Checkbox label={t('meshPreview')} checked={ui.meshPreviewOn} onChange={(v) => (setUi({ meshPreviewOn: v, showMesh: v }), v && void refreshMeshPreview())} />
          <Checkbox label={t('showMesh')} checked={ui.showMesh} onChange={(v) => setUi({ showMesh: v })} />
          <span className="pill">
            {meshPreview ? `${meshPreview.stats.elementCount} ${t('elements')} · ${meshPreview.stats.nodeCount} ${t('nodes')} · ${meshPreview.stats.minAngleDeg.toFixed(0)}°` : meshError ? meshError : '–'}
          </span>
        </div>
        <div className="row">
          <Button small disabled={!!running} onClick={() => void checkMesh()} title={t('checkMeshHint')}>
            {t('checkMesh')}
          </Button>
        </div>
        <Section title={t('advanced')} collapsible defaultOpen={project.mesh.preset === 'custom'}>
          <NumberField label={t('boundarySize')} unit="mm" value={size.boundarySize} min={0.2} onCommit={(v) => meshPatch({ preset: 'custom', boundarySize: v })} />
          <NumberField label={t('interiorSize')} unit="mm" value={size.interiorSize} min={0.5} onCommit={(v) => meshPatch({ preset: 'custom', interiorSize: v })} />
          <NumberField label={t('growth')} value={size.growth} min={1.01} max={3} step={0.05} onCommit={(v) => meshPatch({ preset: 'custom', growth: v })} />
          <NumberField label={t('rebarSize')} unit="mm" value={size.rebarSize} min={0.2} onCommit={(v) => meshPatch({ preset: 'custom', rebarSize: v })} />
          <NumberField label={t('rebarSegments')} value={size.rebarSegments} min={8} max={64} step={2} onCommit={(v) => meshPatch({ preset: 'custom', rebarSegments: Math.round(v) })} />
          <NumberField label={t('minAngle')} unit="°" value={size.minAngle} min={10} max={33} onCommit={(v) => meshPatch({ preset: 'custom', minAngle: v })} />
          <NumberField label={t('maxElements')} value={size.maxElements} min={100} step={10000} onCommit={(v) => meshPatch({ preset: 'custom', maxElements: Math.round(v) })} />
          <p className="hint">
            {t('meshNormal')}: {presets.normal.boundarySize} / {presets.normal.interiorSize} mm
          </p>
        </Section>
      </Section>

      <Section title={t('advanced')} collapsible defaultOpen={false}>
        <NumberField label={t('residualTol')} value={analysis.tolerance.residual} decimals={8} onCommit={(v) => patch({ tolerance: { ...analysis.tolerance, residual: v } })} />
        <NumberField label={t('deltaTol')} unit="K" value={analysis.tolerance.deltaTheta} decimals={4} onCommit={(v) => patch({ tolerance: { ...analysis.tolerance, deltaTheta: v } })} />
        <NumberField label={t('maxNewton')} value={analysis.maxNewtonIterations} min={1} step={1} onCommit={(v) => patch({ maxNewtonIterations: Math.round(v) })} />
        <SelectField label={t('timeIntegration')} value={analysis.timeIntegration} options={[{ value: 'backward-euler', label: 'Backward Euler' }, { value: 'crank-nicolson', label: 'Crank–Nicolson' }]} onChange={(v) => patch({ timeIntegration: v })} />
        <SelectField label={t('capacity')} value={analysis.capacity} options={[{ value: 'lumped', label: t('lumped') }, { value: 'consistent', label: t('consistent') }]} onChange={(v) => patch({ capacity: v })} />
        <Checkbox label={t('adaptive')} checked={analysis.adaptive.enabled} onChange={(v) => patch({ adaptive: { ...analysis.adaptive, enabled: v } })} />
        <NumberField label={t('maxDeltaPerStep')} unit="K" value={analysis.adaptive.maxDeltaPerStep} onCommit={(v) => patch({ adaptive: { ...analysis.adaptive, maxDeltaPerStep: v } })} />
        <NumberField label={t('minDt')} unit="s" value={analysis.adaptive.minDt} min={0.001} onCommit={(v) => patch({ adaptive: { ...analysis.adaptive, minDt: v } })} />
        {analysis.mode === 'periodic' && (
          <>
            <NumberField label={t('periodicCycles')} value={analysis.periodic?.maxCycles ?? 10} min={1} step={1} onCommit={(v) => patch({ periodic: { maxCycles: Math.round(v), tolerance: analysis.periodic?.tolerance ?? 0.05 } })} />
            <NumberField label={t('periodicTol')} unit="K" value={analysis.periodic?.tolerance ?? 0.05} onCommit={(v) => patch({ periodic: { maxCycles: analysis.periodic?.maxCycles ?? 10, tolerance: v } })} />
          </>
        )}
      </Section>
    </>
  );
}
