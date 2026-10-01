import { describe, expect, it } from 'vitest';
import { helpPages, tourSteps, helpUi } from './strings.js';
import { parseBlocks } from './HelpDrawer.js';

describe('help content', () => {
  it('has the same pages and tour steps in both languages', () => {
    const nb = helpPages('nb');
    const en = helpPages('en');
    expect(nb.map((p) => p.id)).toEqual(en.map((p) => p.id));
    expect(nb.map((p) => p.id)).toEqual(['start', 'climate', 'bc', 'rebar', 'probes', 'glossary', 'agents']);
    expect(tourSteps('nb')).toHaveLength(8);
    expect(tourSteps('en')).toHaveLength(8);
    expect(helpUi('nb').stepOf(2, 8)).toMatch(/2/);
  });
  it('parses the block markup into headings, lists, notes and tables', () => {
    const blocks = parseBlocks('# Heading\nPara one\nstill one\n\n- a\n- b\n> note\n| x | y | z\n| 1 | 2 | 3');
    expect(blocks.map((b) => b.kind)).toEqual(['h', 'p', 'ul', 'note', 'table']);
    expect((blocks[2] as { items: string[] }).items).toEqual(['a', 'b']);
    expect((blocks[4] as { rows: string[][] }).rows).toHaveLength(2);
    const glossary = helpPages('nb').find((p) => p.id === 'glossary')!;
    const rows = (parseBlocks(glossary.body)[0] as { rows: string[][] }).rows;
    expect(rows.length).toBeGreaterThan(15);
    for (const r of rows) expect(r).toHaveLength(3);
  });
});
