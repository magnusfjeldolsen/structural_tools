import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../state/store.js';
import { helpPages, helpUi, type HelpPage } from './strings.js';
import { tourStore } from './tourStore.js';
import './help.css';

/** Floating «Hjelp» button plus a right-side drawer with the help pages. Self-contained; mounted once in App. */
export function HelpDrawer() {
  const lang = useStore((s) => s.ui.lang);
  const ui = helpUi(lang);
  const pages = useMemo(() => helpPages(lang), [lang]);
  const open = tourStore((s) => s.helpOpen);
  const requested = tourStore((s) => s.helpPage);
  const [pageId, setPageId] = useState(pages[0].id);
  useEffect(() => {
    if (requested) setPageId(requested);
  }, [requested]);
  const page = pages.find((p) => p.id === pageId) ?? pages[0];
  const completed = tourStore((s) => s.completed);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tourStore.getState().closeHelp();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button className="help-fab" type="button" onClick={() => tourStore.getState().openHelp()} aria-label={ui.help} data-tour="help">
        ? {ui.help}
      </button>
      {open && (
        <>
          <div className="help-backdrop" onMouseDown={() => tourStore.getState().closeHelp()} />
          <aside className="help-drawer" role="dialog" aria-label={ui.help}>
            <header className="help-head">
              <h2>{ui.help}</h2>
              <button className="help-btn" type="button" onClick={() => tourStore.getState().closeHelp()}>
                {ui.close}
              </button>
            </header>
            <nav className="help-nav">
              {pages.map((p) => (
                <button key={p.id} type="button" className={p.id === page.id ? 'active' : ''} onClick={() => setPageId(p.id)}>
                  {p.title}
                </button>
              ))}
            </nav>
            <div className="help-body">
              <HelpBody page={page} glossaryHead={ui.glossaryHead} />
            </div>
            <footer className="help-foot">
              <button
                className="help-btn primary"
                type="button"
                onClick={() => {
                  tourStore.getState().closeHelp();
                  tourStore.getState().start();
                }}
              >
                {ui.startTour}
              </button>
              {completed && <span className="help-muted">✓ {ui.tourDone}</span>}
              <span className="spacer" />
              <a className="help-btn" href="agent.md" target="_blank" rel="noreferrer">
                {ui.agentsLink}
              </a>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}

/** Renders the tiny block markup used in strings.ts. */
export function HelpBody({ page, glossaryHead }: { page: HelpPage; glossaryHead: string[] }) {
  const blocks = parseBlocks(page.body);
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h':
            return <h3 key={i}>{b.text}</h3>;
          case 'note':
            return (
              <blockquote key={i}>
                <Inline text={b.text} />
              </blockquote>
            );
          case 'ul':
            return (
              <ul key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inline text={it} />
                  </li>
                ))}
              </ul>
            );
          case 'table':
            return (
              <table key={i} className="help-table">
                <thead>
                  <tr>
                    {glossaryHead.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td key={k}>{k === 0 ? <b>{c}</b> : c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          default:
            return (
              <p key={i}>
                <Inline text={b.text} />
              </p>
            );
        }
      })}
    </>
  );
}

type Block = { kind: 'h' | 'p' | 'note'; text: string } | { kind: 'ul'; items: string[] } | { kind: 'table'; rows: string[][] };

export function parseBlocks(body: string): Block[] {
  const out: Block[] = [];
  const lines = body.split('\n');
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join(' ') });
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.startsWith('# ')) {
      flush();
      out.push({ kind: 'h', text: line.slice(2) });
    } else if (line.startsWith('> ')) {
      flush();
      out.push({ kind: 'note', text: line.slice(2) });
    } else if (line.startsWith('- ')) {
      flush();
      const last = out[out.length - 1];
      if (last && last.kind === 'ul') last.items.push(line.slice(2));
      else out.push({ kind: 'ul', items: [line.slice(2)] });
    } else if (line.startsWith('| ')) {
      flush();
      const cells = line.slice(2).split(' | ');
      const last = out[out.length - 1];
      if (last && last.kind === 'table') last.rows.push(cells);
      else out.push({ kind: 'table', rows: [cells] });
    } else para.push(line);
  }
  flush();
  return out;
}

/** `code` spans only; everything else is plain text. */
function Inline({ text }: { text: string }): ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith('`') && p.endsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : <span key={i}>{p}</span>))}
    </>
  );
}
