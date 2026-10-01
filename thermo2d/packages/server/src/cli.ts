#!/usr/bin/env node
/**
 * thermo2d CLI (Windows-friendly, no admin rights):
 *   thermo run <project.thermo.json> [--out <dir>] [--analysis <id>] [--scenario <id>] [--csv-locale nb|en] [--html]
 *   thermo validate <project.thermo.json>
 *   thermo mesh <project.thermo.json>
 *   thermo figure <project.thermo.json> <results.thermo.results> --kind <time-series|field|profile|model> --out <file.svg|.png|.html> [--time <s>]
 * Exit code 0 on success, 1 on any failure, with a plain message on stderr.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as api from './coreApi.js';
import { probesToCsv, tableToCsv, CSV_EN, CSV_NB, probeTableRows } from '@thermo2d/figures';
import { buildReport, endTime, makeInteractive, makeSvg, metricsFor, rebarRowsFor, type FigureKind } from './figures.js';

export interface CliArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): CliArgs {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else positional.push(a);
  }
  return { command, positional, flags };
}

async function loadProject(file: string) {
  const text = await fs.readFile(file, 'utf8');
  return api.parseProject(JSON.parse(text));
}

export interface RunOutput {
  outDir: string;
  files: string[];
  result: import('@thermo2d/core').RunResult;
}

/** Run one analysis of a project file and write CSV, results and summary into outDir. */
export async function runProjectFile(file: string, opts: { out?: string; analysisId?: string; scenarioId?: string | null; csvLocale?: 'nb' | 'en'; html?: boolean; report?: boolean; log?: (s: string) => void } = {}): Promise<RunOutput> {
  const log = opts.log ?? (() => undefined);
  const project = await loadProject(file);
  const analysisId = opts.analysisId ?? project.analyses[0]?.id;
  if (!analysisId) throw new Error('The project has no analysis.');
  const base = path.basename(file).replace(/\.thermo\.json$/i, '');
  const outDir = path.resolve(opts.out ?? path.join(path.dirname(path.resolve(file)), `${base}-results`));
  await fs.mkdir(outDir, { recursive: true });
  let lastPct = -1;
  const result = api.runProject(project, {
    analysisId,
    scenarioId: opts.scenarioId ?? null,
    onProgress: (p) => {
      const pct = Math.floor(p.fraction * 20) * 5;
      if (pct !== lastPct) {
        lastPct = pct;
        log(`  ${pct}% (t = ${Math.round(p.t)} s)`);
      }
    },
  });
  const loc = opts.csvLocale === 'en' ? CSV_EN : opts.csvLocale === 'nb' ? CSV_NB : { separator: project.settings.csv.separator, decimal: project.settings.csv.decimal };
  const suffix = opts.scenarioId ? `.${opts.scenarioId}` : '';
  const files: string[] = [];
  const write = async (name: string, data: string | Uint8Array) => {
    const p = path.join(outDir, name);
    await fs.writeFile(p, data);
    files.push(p);
  };
  await write(`${base}.${analysisId}${suffix}.probes.csv`, probesToCsv(result, project, loc));
  await write(`${base}.${analysisId}${suffix}.thermo.results`, api.encodeResults(result));
  const tEnd = endTime(result);
  const times = [1800, 3600, 5400, 7200].filter((t) => t < tEnd - 1).concat([tEnd]);
  const table = probeTableRows(result, times, project);
  await write(`${base}.${analysisId}${suffix}.table.csv`, tableToCsv(table.header, table.rows, loc));
  if (project.rebars.length) {
    const rows = rebarRowsFor(project, result, times);
    await write(`${base}.${analysisId}${suffix}.rebars.csv`, tableToCsv(['bar', 'diameter [mm]', 'x [mm]', 'y [mm]', ...times.flatMap((t) => [`theta @ ${Math.round(t / 60)} min [°C]`, `ks @ ${Math.round(t / 60)} min`])], rows.map((r) => [r.name, r.diameter, r.x, r.y, ...times.flatMap((_, k) => [r.temps[k], r.ks?.[k] ?? ''])]), loc));
  }
  const summary = {
    project: project.name,
    file: path.resolve(file),
    analysisId,
    scenarioId: opts.scenarioId ?? null,
    stamp: result.stamp,
    mesh: result.mesh.stats,
    stats: result.stats,
    energy: result.energy,
    probesAtEnd: Object.fromEntries(result.probes.map((p, k) => [project.probes.find((q) => q.id === p.id)?.name ?? p.id, p.found ? Math.round(result.probeValues[k][result.probeValues[k].length - 1] * 100) / 100 : null])),
    metrics: metricsFor(project, result),
    warnings: [...result.warnings, ...result.mesh.warnings.map((w) => w.message)],
  };
  await write(`${base}.${analysisId}${suffix}.summary.json`, JSON.stringify(summary, null, 2));
  if (opts.html) await write(`${base}.${analysisId}${suffix}.interactive.html`, makeInteractive(project, [{ label: project.name, result }]));
  if (opts.report) await write(`${base}.${analysisId}${suffix}.report.html`, buildReport(project, [{ label: project.name, result }], {}).html);
  return { outDir, files, result };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  const out = (s: string) => process.stdout.write(s + '\n');
  const err = (s: string) => process.stderr.write(s + '\n');
  try {
    switch (args.command) {
      case 'run': {
        const file = args.positional[0];
        if (!file) throw new Error('Usage: thermo run <project.thermo.json> [--out <dir>] [--analysis <id>] [--scenario <id>] [--csv-locale nb|en] [--html] [--report]');
        out(`Running ${file} …`);
        const r = await runProjectFile(file, { out: str(args.flags.out), analysisId: str(args.flags.analysis), scenarioId: str(args.flags.scenario) ?? null, csvLocale: str(args.flags['csv-locale']) as 'nb' | 'en' | undefined, html: !!args.flags.html, report: !!args.flags.report, log: out });
        out(`Done in ${(r.result.stats.wallTimeMs / 1000).toFixed(1)} s: ${r.result.stats.steps} steps, ${r.result.mesh.stats.nodeCount} nodes, solver ${r.result.stats.linearSolver}, energy imbalance ${(r.result.energy.relativeImbalance * 100).toFixed(2)} %`);
        for (const f of r.files) out(`  ${f}`);
        return 0;
      }
      case 'validate': {
        const file = args.positional[0];
        if (!file) throw new Error('Usage: thermo validate <project.thermo.json>');
        const project = await loadProject(file);
        const issues = api.validateProject(project);
        if (!issues.length) out('OK: no issues.');
        for (const i of issues) out(`${i.severity.toUpperCase()} ${i.code}: ${i.message}${i.entity ? ` [${i.entity.collection} ${i.entity.id}]` : ''}`);
        return issues.some((i) => i.severity === 'error') ? 1 : 0;
      }
      case 'mesh': {
        const file = args.positional[0];
        if (!file) throw new Error('Usage: thermo mesh <project.thermo.json>');
        const project = await loadProject(file);
        const m = api.mesh(api.buildMeshInput(project));
        out(JSON.stringify({ ...m.stats, regions: m.regions.map((r) => ({ id: r.id, elements: r.elementCount, area: Math.round(r.area) })), boundarySegments: m.boundary.length, warnings: m.warnings }, null, 2));
        return 0;
      }
      case 'figure': {
        const [file, resultsFile] = args.positional;
        const kind = (str(args.flags.kind) ?? 'time-series') as FigureKind | 'interactive';
        const outFile = str(args.flags.out);
        if (!file || !outFile) throw new Error('Usage: thermo figure <project.thermo.json> [<results.thermo.results>] --kind <time-series|field|profile|model|interactive> --out <file.svg|.png|.html> [--time <s>]');
        const project = await loadProject(file);
        const result = resultsFile ? api.decodeResults(new Uint8Array(await fs.readFile(resultsFile))) : undefined;
        if (kind !== 'model' && !result) throw new Error('This figure kind needs a results file.');
        const ext = path.extname(outFile).toLowerCase();
        if (kind === 'interactive' || ext === '.html') {
          if (!result) throw new Error('interactive needs a results file.');
          await fs.writeFile(outFile, makeInteractive(project, [{ label: project.name, result }]));
        } else {
          const svg = makeSvg({ kind, project, result, results: result ? [{ label: project.name, result }] : [], time: args.flags.time ? Number(args.flags.time) : undefined, mesh: result?.mesh });
          if (ext === '.png') {
            const { svgToPng } = await import('./png.js');
            await fs.writeFile(outFile, await svgToPng(svg));
          } else await fs.writeFile(outFile, svg);
        }
        out(`Wrote ${path.resolve(outFile)}`);
        return 0;
      }
      case 'help':
      default:
        out(['thermo2d CLI', '  thermo run <project.thermo.json> [--out <dir>] [--analysis <id>] [--scenario <id>] [--csv-locale nb|en] [--html] [--report]', '  thermo validate <project.thermo.json>', '  thermo mesh <project.thermo.json>', '  thermo figure <project.thermo.json> [<results>] --kind <kind> --out <file> [--time <s>]'].join('\n'));
        return args.command === 'help' ? 0 : 1;
    }
  } catch (e) {
    err(`Error: ${(e as Error).message}`);
    return 1;
  }
}

function str(v: string | boolean | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

const isMain = /cli\.(mjs|ts|js)$/i.test(process.argv[1] ?? '');
if (isMain) main().then((code) => process.exit(code));
