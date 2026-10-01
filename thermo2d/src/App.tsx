import { useCallback, useEffect, useRef, useState } from 'react';
import { parseProject } from '@thermo2d/core';
import type { Vec2 } from '@thermo2d/core';
import { useStore, type Panel } from './state/store.js';
import { useT } from './i18n/useT.js';
import { TopBar } from './panels/TopBar.js';
import { Toolbar } from './panels/Toolbar.js';
import { MessageStrip } from './panels/MessageStrip.js';
import { StartDialog } from './panels/StartDialog.js';
import { LibraryDialog } from './panels/LibraryDialog.js';
import { ModelPanel } from './panels/ModelPanel.js';
import { MaterialsPanel } from './panels/MaterialsPanel.js';
import { ExposurePanel } from './panels/ExposurePanel.js';
import { SeriesPanel, ImportSeriesDialog } from './panels/SeriesPanel.js';
import { ReinforcementPanel } from './panels/ReinforcementPanel.js';
import { ProbesPanel } from './panels/ProbesPanel.js';
import { AnalysisPanel } from './panels/AnalysisPanel.js';
import { ScenariosPanel } from './panels/ScenariosPanel.js';
import { TransformDialog } from './panels/TransformDialog.js';
import { ImportGeometryDialog } from './panels/ImportGeometryDialog.js';
import { Canvas, svgToPngBlob } from './editor/Canvas.js';
import { Button, Dialog, SelectField, Tabs } from './components/ui.js';
import { downloadBlob, fileNameFor, readAutosave, clearAutosave } from './state/persistence.js';
import { resultKey } from './worker/protocol.js';
import { ResultsView } from './results/index.js';
import type { StringKey } from './i18n/index.js';
import { HelpDrawer } from './help/HelpDrawer.js'; // [C]
import { Tour } from './help/Tour.js'; // [C]
import { AgentIndicator } from './agent/AgentIndicator.js'; // [C]

const PANELS: { id: Panel; key: StringKey }[] = [
  { id: 'model', key: 'panelModel' },
  { id: 'materials', key: 'panelMaterials' },
  { id: 'exposure', key: 'panelExposure' },
  { id: 'series', key: 'panelSeries' },
  { id: 'rebar', key: 'panelRebar' },
  { id: 'probes', key: 'panelProbes' },
  { id: 'analysis', key: 'panelAnalysis' },
  { id: 'scenarios', key: 'panelScenarios' },
];

export function App() {
  const t = useT();
  const ui = useStore((s) => s.ui);
  const showStart = useStore((s) => s.showStart);
  const { setUi } = useStore.getState();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [restore, setRestore] = useState<ReturnType<typeof readAutosave>>(null);

  // Autosave restore prompt (once)
  useEffect(() => {
    const a = readAutosave();
    if (a) setRestore(a);
  }, []);

  // Global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      const st = useStore.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (typing) return;
        e.preventDefault();
        st.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        if (typing) return;
        e.preventDefault();
        st.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void st.saveProject(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void st.run();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && st.ui.mode === 'model') {
        const sel = st.ui.selection;
        if (!sel.length) return;
        e.preventDefault();
        const regionIds = sel.filter((s) => s.collection === 'regions').map((s) => s.id);
        const cmds = [] as Parameters<typeof st.dispatch>[0];
        if (regionIds.length) cmds.push({ type: 'region.delete', ids: regionIds, dependents: 'delete' });
        const others = sel.filter((s) => s.collection === 'rebars' || s.collection === 'probes' || s.collection === 'lineProbes').map((s) => s.id);
        if (others.length) cmds.push({ type: 'entities.delete', ids: others });
        for (const s of sel.filter((x) => x.collection === 'rebarSets')) cmds.push({ type: 'rebarSet.delete', id: s.id });
        for (const s of sel.filter((x) => x.collection === 'boundaryConditions')) cmds.push({ type: 'bc.delete', id: s.id });
        if (cmds.length) st.dispatch(cmds);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.documentElement.lang = ui.lang;
  }, [ui.lang]);

  const exportPng = useCallback(async () => {
    if (!svgRef.current) return;
    try {
      const blob = await svgToPngBlob(svgRef.current);
      downloadBlob(fileNameFor(useStore.getState().project).replace(/\.thermo\.json$/, '.png'), blob);
    } catch (e) {
      useStore.getState().pushMessage({ severity: 'error', code: 'runtime:export', message: (e as Error).message });
    }
  }, []);

  const dialog = ui.dialog;
  return (
    <div className="app">
      <TopBar onExportPng={() => void exportPng()} />
      {ui.mode === 'model' ? (
        <>
          <Toolbar />
          <Canvas svgRef={(el) => (svgRef.current = el)} />
          <div className="sidepanel">
            <Tabs value={ui.panel} tabs={PANELS.map((p) => ({ id: p.id, label: t(p.key) }))} onChange={(panel) => setUi({ panel })} />
            <div className="panel-body">
              {ui.panel === 'model' && <ModelPanel />}
              {ui.panel === 'materials' && <MaterialsPanel />}
              {ui.panel === 'exposure' && <ExposurePanel />}
              {ui.panel === 'series' && <SeriesPanel />}
              {ui.panel === 'rebar' && <ReinforcementPanel />}
              {ui.panel === 'probes' && <ProbesPanel />}
              {ui.panel === 'analysis' && <AnalysisPanel />}
              {ui.panel === 'scenarios' && <ScenariosPanel />}
            </div>
          </div>
        </>
      ) : (
        <>
          <Toolbar />
          <ResultsMode />
        </>
      )}
      <MessageStrip />
      <HelpDrawer /> {/* [C] */}
      <Tour /> {/* [C] */}
      <AgentIndicator /> {/* [C] */}
      {showStart && <StartDialog />}
      {dialog?.kind === 'library' && <LibraryDialog forRegionIds={dialog.forRegionIds} onClose={() => setUi({ dialog: null })} />}
      {dialog?.kind === 'importSeries' && <ImportSeriesDialog onClose={() => setUi({ dialog: null })} />}
      {dialog?.kind === 'transform' && <TransformDialog op={dialog.op} onClose={() => setUi({ dialog: null })} />}
      {dialog?.kind === 'importGeometry' && <ImportGeometryDialog onClose={() => setUi({ dialog: null })} />}
      {restore && (
        <Dialog
          title={t('restore')}
          onClose={() => setRestore(null)}
          width={420}
          footer={
            <>
              <Button
                onClick={() => {
                  clearAutosave();
                  setRestore(null);
                }}
              >
                {t('discard')}
              </Button>
              <Button
                primary
                onClick={() => {
                  try {
                    const p = parseProject(JSON.parse(restore.json));
                    useStore.getState().loadProject(p, { dirty: true, handle: null });
                  } catch (e) {
                    useStore.getState().pushMessage({ severity: 'error', code: 'runtime:restore', message: (e as Error).message });
                  }
                  setRestore(null);
                }}
              >
                {t('restore')}
              </Button>
            </>
          }
        >
          <p>
            {t('restorePrompt')} <b>{restore.name}</b> · {new Date(restore.savedAt).toLocaleString()}
          </p>
        </Dialog>
      )}
    </div>
  );
}

function ResultsMode() {
  const t = useT();
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const results = useStore((s) => s.results);
  const stale = useStore((s) => s.resultsStale);
  const { setUi, dispatch } = useStore.getState();
  const key = resultKey(ui.activeAnalysisId, ui.activeScenarioId);
  const result = results[key] ?? Object.values(results)[0] ?? null;
  const labelOf = (k: string) => {
    const [aid, sid] = k.split('|');
    const a = project.analyses.find((x) => x.id === aid)?.name ?? aid;
    const s = sid ? (project.scenarios.find((x) => x.id === sid)?.name ?? sid) : t('baseModel');
    return `${a} · ${s}`;
  };
  const compare = ui.compareKeys.filter((k) => results[k]).map((k) => ({ label: labelOf(k), result: results[k] }));
  const options = Object.keys(results).map((k) => ({ value: k, label: labelOf(k) }));

  const onAddProbe = useCallback((p: { position: Vec2; name?: string }) => {
    dispatch([{ type: 'probe.add', probe: { name: p.name ?? `P${useStore.getState().project.probes.length + 1}`, position: p.position, kind: 'click' } }]);
  }, [dispatch]);
  const onUpdateProbe = useCallback((id: string, position: Vec2) => dispatch([{ type: 'probe.update', id, patch: { position, kind: 'manual', linkedRebarId: undefined } }]), [dispatch]);
  const onAddLineProbe = useCallback((from: Vec2, to: Vec2) => dispatch([{ type: 'lineProbe.add', lineProbe: { name: `L${useStore.getState().project.lineProbes.length + 1}`, from, to, samples: 50 } }]), [dispatch]);

  return (
    <div className="results-mode">
      <div className="results-toolbar">
        <span>{t('results')}</span>
        {options.length > 1 && (
          <SelectField
            value={options.some((o) => o.value === key) ? key : options[0].value}
            options={options}
            onChange={(k) => {
              const [aid, sid] = k.split('|');
              setUi({ activeAnalysisId: aid, activeScenarioId: sid || null });
            }}
          />
        )}
        {stale && <span className="badge" title={t('staleHint')}>{t('stale')}</span>}
        {compare.length > 1 && <span className="pill">{t('compare')}: {compare.length}</span>}
        <span className="spacer" style={{ flex: 1 }} />
        <Button small onClick={() => useStore.getState().setMode('model')}>
          ← {t('modeModel')}
        </Button>
      </div>
      <div className="results-body">
        {result ? (
          <ResultsView project={project} result={result} results={compare.length > 1 ? compare : undefined} stale={stale} lang={ui.lang} onAddProbe={onAddProbe} onUpdateProbe={onUpdateProbe} onAddLineProbe={onAddLineProbe} />
        ) : (
          <p className="empty" style={{ padding: 20 }}>
            {t('noResults')}
          </p>
        )}
      </div>
    </div>
  );
}
