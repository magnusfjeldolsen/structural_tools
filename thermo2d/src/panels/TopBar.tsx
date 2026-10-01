import { useEffect, useRef, useState } from 'react';
import { encodeResults, serializeProject } from '@thermo2d/core';
import { useStore } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import { Button, NumberField, TextField } from '../components/ui.js';
import { downloadBlob, fileNameFor } from '../state/persistence.js';
import { resultKey } from '../worker/protocol.js';

export function TopBar(props: { onExportPng: () => void }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const running = useStore((s) => s.running);
  const stale = useStore((s) => s.resultsStale);
  const hasResults = useStore((s) => Object.keys(s.results).length > 0);
  const dirty = useStore((s) => s.dirty);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const { dispatch, undo, redo, openProject, saveProject, run, cancelRun, setLang, setMode } = useStore.getState();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  const analysis = project.analyses.find((a) => a.id === ui.activeAnalysisId) ?? project.analyses[0];
  const fraction = running?.progress.fraction ?? 0;

  const exportResults = () => {
    const r = useStore.getState().results[resultKey(ui.activeAnalysisId, ui.activeScenarioId)];
    if (!r) return;
    const bytes = encodeResults(r);
    downloadBlob(fileNameFor(project).replace(/\.thermo\.json$/, '.thermo.results'), new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
  };

  return (
    <div className="topbar">
      <span className="brand" title={t('tagline')}>
        {t('appName')}
      </span>
      <TextField className="name" value={project.name} onCommit={(name) => dispatch([{ type: 'project.rename', name }])} placeholder={t('projectName')} />
      {dirty && <span className="pill" title={t('unsavedWarning')}>●</span>}
      <div className="group">
        <Button small onClick={() => useStore.setState({ showStart: true })} title={t('new')}>
          {t('new')}
        </Button>
        <Button small onClick={() => void openProject()}>
          {t('open')}
        </Button>
        <Button small onClick={() => void saveProject(false)} title="Ctrl+S">
          {t('save')}
        </Button>
        <Button small onClick={() => void saveProject(true)}>
          {t('saveAs')}
        </Button>
        <div className="menu" ref={menuRef}>
          <Button small onClick={() => setMenu(!menu)}>
            {t('export')} ▾
          </Button>
          {menu && (
            <div className="menu-items">
              <Button small onClick={() => (setMenu(false), props.onExportPng())}>
                {t('exportPng')}
              </Button>
              <Button small onClick={() => (setMenu(false), downloadBlob(fileNameFor(project), new Blob([serializeProject(project)], { type: 'application/json' })))}>
                {t('exportProject')}
              </Button>
              <Button small disabled={!hasResults} onClick={() => (setMenu(false), exportResults())}>
                {t('exportResults')}
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="group">
        <Button small disabled={!canUndo} onClick={undo} title="Ctrl+Z">
          ↶ {t('undo')}
        </Button>
        <Button small disabled={!canRedo} onClick={redo} title="Ctrl+Y">
          ↷ {t('redo')}
        </Button>
      </div>
      <div className="group">
        <Button small active={ui.mode === 'model'} onClick={() => setMode('model')}>
          {t('modeModel')}
        </Button>
        <Button small active={ui.mode === 'results'} onClick={() => setMode('results')} disabled={!hasResults} title={stale ? t('staleHint') : undefined}>
          {t('modeResults')}
          {hasResults && stale && <span className="badge">{t('stale')}</span>}
        </Button>
      </div>
      <span className="spacer" />
      {analysis && analysis.mode !== 'steady' && (
        <div className="group">
          <NumberField
            label={t('duration')}
            value={analysis.duration / 60}
            unit={t('minutes')}
            min={0.1}
            step={5}
            width={64}
            onCommit={(v) => dispatch([{ type: 'analysis.update', id: analysis.id, patch: { duration: v * 60 } }])}
          />
          <NumberField
            label={t('timeStep')}
            value={analysis.dt}
            unit={t('seconds')}
            min={0.01}
            step={1}
            width={56}
            onCommit={(v) => dispatch([{ type: 'analysis.update', id: analysis.id, patch: { dt: v } }])}
          />
        </div>
      )}
      {running ? (
        <div className="group">
          <span className="progress-text">
            {running.purpose === 'mesh-check' ? t('checkMesh') : t('running')} {Math.round(fraction * 100)}%
          </span>
          <Button className="run" onClick={cancelRun}>
            <span className="bar" style={{ width: `${fraction * 100}%` }} />
            {t('cancel')}
          </Button>
        </div>
      ) : (
        <Button className="run" primary onClick={() => void run()} title="Ctrl+Enter">
          ▶ {t('run')}
        </Button>
      )}
      <select className="field" value={ui.lang} onChange={(e) => setLang(e.target.value as 'nb' | 'en')} title={t('language')}>
        <option value="nb">NB</option>
        <option value="en">EN</option>
      </select>
    </div>
  );
}
