/**
 * Workspace folder: the only place the server reads and writes. Every path is
 * resolved inside it; anything that escapes is rejected with a plain message.
 * Windows-safe (spaces, long paths, case-insensitive containment check).
 */
import { promises as fs, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export class WorkspaceError extends Error {
  constructor(message: string, public readonly code = 'workspace') {
    super(message);
    this.name = 'WorkspaceError';
  }
}

export class Workspace {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    for (const d of ['', 'figures', 'reports', 'library', 'results']) mkdirSync(path.join(this.root, d), { recursive: true });
  }

  /** Resolve a workspace-relative (or absolute-but-inside) path; throws when it escapes the workspace. */
  resolve(rel: string): string {
    const abs = path.resolve(this.root, rel);
    const a = process.platform === 'win32' ? abs.toLowerCase() : abs;
    const r = process.platform === 'win32' ? this.root.toLowerCase() : this.root;
    if (a !== r && !a.startsWith(r + path.sep)) {
      throw new WorkspaceError(`The path "${rel}" is outside the workspace folder (${this.root}). Use a name or a path inside the workspace.`, 'outside-workspace');
    }
    return abs;
  }

  relative(abs: string): string {
    return path.relative(this.root, abs).split(path.sep).join('/');
  }

  /** `<name>.thermo.json` inside the workspace; accepts a bare name, a file name or a relative path. */
  projectPath(name: string): string {
    let file = name.trim();
    if (!file) throw new WorkspaceError('A project name is required.', 'missing-name');
    if (!/\.thermo\.json$/i.test(file)) file = `${file.replace(/\.json$/i, '')}.thermo.json`;
    return this.resolve(file);
  }

  resultsPath(projectName: string, analysisId: string, scenarioId?: string | null): string {
    const base = path.basename(projectName).replace(/\.thermo\.json$/i, '');
    const safe = (s: string) => s.replace(/[^A-Za-z0-9_.-]+/g, '_');
    return this.resolve(path.join('results', `${safe(base)}.${safe(analysisId)}${scenarioId ? '.' + safe(scenarioId) : ''}.thermo.results`));
  }

  async readText(rel: string): Promise<string> {
    const abs = this.resolve(rel);
    try {
      return await fs.readFile(abs, 'utf8');
    } catch (e) {
      throw new WorkspaceError(`Could not read "${rel}": ${(e as Error).message}`, 'read-failed');
    }
  }

  async readBytes(rel: string): Promise<Uint8Array> {
    const abs = this.resolve(rel);
    return new Uint8Array(await fs.readFile(abs));
  }

  async writeText(rel: string, text: string): Promise<string> {
    const abs = this.resolve(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, text, 'utf8');
    return abs;
  }

  async writeBytes(rel: string, bytes: Uint8Array): Promise<string> {
    const abs = this.resolve(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, bytes);
    return abs;
  }

  exists(rel: string): boolean {
    try {
      return existsSync(this.resolve(rel));
    } catch {
      return false;
    }
  }

  /** Files (relative paths) under a sub folder matching one of the extensions; non-recursive. */
  async list(sub: string, extensions: string[]): Promise<string[]> {
    const dir = this.resolve(sub || '.');
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      return [];
    }
    const exts = extensions.map((e) => e.toLowerCase());
    return names
      .filter((n) => exts.some((e) => n.toLowerCase().endsWith(e)))
      .sort()
      .map((n) => (sub && sub !== '.' ? `${sub}/${n}` : n));
  }

  /** Unique file name inside `sub` for a generated artefact. */
  uniqueName(sub: string, base: string, ext: string): string {
    const safe = base.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 80) || 'file';
    let candidate = `${sub}/${safe}.${ext}`;
    let k = 1;
    while (this.exists(candidate)) candidate = `${sub}/${safe}-${++k}.${ext}`;
    return candidate;
  }
}

export function workspaceFromArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): Workspace {
  const i = argv.indexOf('--workspace');
  const fromArg = i >= 0 ? argv[i + 1] : undefined;
  const root = fromArg ?? env.THERMO2D_WORKSPACE ?? path.join(process.cwd(), 'workspace');
  return new Workspace(root);
}
