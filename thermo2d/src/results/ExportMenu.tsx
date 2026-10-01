import { useEffect, useRef, useState } from 'react';
import type { Project, RunResult } from '@thermo2d/core';
import * as figures from '@thermo2d/figures';
import { downloadBlob, safeFileName, toCsv } from './format.js';
import type { TFn } from './i18n.js';
import type { ContourCanvasHandle } from './ContourCanvas.js';

export interface ExportMenuProps {
  project: Project;
  result: RunResult;
  results: { label: string; result: RunResult }[];
  field: Float32Array;
  t: number;
  tr: TFn;
  canvas: React.RefObject<ContourCanvasHandle | null>;
}

/** Export menu: PNG of the canvas, SVG/CSV/interactive HTML through the figure kit, JSON of the probe curves. Fails soft. */
export function ExportMenu({ project, result, results, field, t, tr, canvas }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const base = safeFileName(project.name);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const run = async (name: string, fn: () => Promise<void> | void) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(`${tr('exportFailed')}: ${name} (${(e as Error).message ?? e})`);
    } finally {
      setOpen(false);
    }
  };

  const fig = figures as unknown as Record<string, ((...a: unknown[]) => unknown) | undefined>;

  const png = () =>
    run('PNG', async () => {
      const blob = await canvas.current?.toBlob();
      if (!blob) throw new Error('canvas');
      downloadBlob(`${base}_felt.png`, blob);
    });

  const svg = () =>
    run('SVG', () => {
      const f = fig.fieldFigure;
      if (!f) throw new Error('figure kit');
      const s = f({ mesh: result.mesh, field, title: `${project.name} – t = ${Math.round(t / 60)} min`, isotherms: [500], theme: 'light', width: 800, height: 600 }) as string;
      downloadBlob(`${base}_felt.svg`, s, 'image/svg+xml;charset=utf-8');
    });

  const csv = () =>
    run('CSV', () => {
      const f = fig.probesToCsv;
      let text: string;
      if (f) text = f(result, project, project.settings.csv) as string;
      else {
        const names = new Map(project.probes.map((p) => [p.id, p.name]));
        const header = ['t (s)', ...result.probes.map((p) => names.get(p.id) ?? p.id)];
        const rows: (string | number)[][] = [header];
        for (let i = 0; i < result.probeTimes.length; i++) rows.push([result.probeTimes[i], ...result.probeValues.map((v) => v[i])]);
        text = toCsv(rows, project.settings.csv, 2);
      }
      downloadBlob(`${base}_kurver.csv`, text, 'text/csv;charset=utf-8');
    });

  const html = () =>
    run('HTML', () => {
      const f = fig.interactiveHtml;
      if (!f) throw new Error('figure kit');
      const s = f({ project, results: results.length ? results : [{ label: project.name, result }] }) as string;
      downloadBlob(`${base}_interaktiv.html`, s, 'text/html;charset=utf-8');
    });

  const json = () =>
    run('JSON', () => {
      const names = new Map(project.probes.map((p) => [p.id, p.name]));
      const data = {
        project: project.name,
        analysisId: result.analysisId,
        scenarioId: result.scenarioId,
        stamp: result.stamp ?? null,
        times: Array.from(result.probeTimes),
        probes: result.probes.map((p, i) => ({ id: p.id, name: names.get(p.id) ?? p.id, x: p.position[0], y: p.position[1], values: Array.from(result.probeValues[i]) })),
      };
      downloadBlob(`${base}_kurver.json`, JSON.stringify(data), 'application/json');
    });

  return (
    <div className="t2d-menu" ref={ref}>
      <button onClick={() => setOpen((o) => !o)}>{tr('export')} ▾</button>
      {open && (
        <div className="t2d-menu-list">
          <button onClick={png}>{tr('exportPng')}</button>
          <button onClick={svg}>{tr('exportSvg')}</button>
          <button onClick={csv}>{tr('exportCsv')}</button>
          <button onClick={html}>{tr('exportHtml')}</button>
          <button onClick={json}>{tr('exportJson')}</button>
        </div>
      )}
      {error && <span className="t2d-warnings">{error}</span>}
    </div>
  );
}
