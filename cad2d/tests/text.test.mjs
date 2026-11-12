/**
 * text.test.mjs — én tekstkilde per språk (core/text.js), og at `lang: 'en'`
 * faktisk gir engelske meldinger fra verktøy, tastatur, DXF og tverrsnitt.
 *
 *   node cad2d/tests/text.test.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ok, section, done, load, R } from './harness.mjs';

const { TEXT, text } = await load('js/core/text.js');
const { CadDocument } = await load('js/core/document.js');
const { ToolController } = await load('js/input/tools.js');
const { createKeyHandler } = await load('js/input/keymap.js');
const { importDxfText, sectionOf } = await load('js/io/project.js');

const keys = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${pre}${k}.`) : [`${pre}${k}`])).sort();
const values = (o) => Object.values(o).flatMap((v) => (v && typeof v === 'object' ? values(v) : [v]));
const call = (v) => (typeof v === 'function' ? v('2', '3', '4', '5', '6') : v);
const nordic = /[æøåÆØÅ]/;

section('Samme nøkler i begge språk');
{
  ok('no og en har nøyaktig de samme nøklene', JSON.stringify(keys(TEXT.no)) === JSON.stringify(keys(TEXT.en)),
    keys(TEXT.no).filter((k) => !keys(TEXT.en).includes(k)).concat(keys(TEXT.en).filter((k) => !keys(TEXT.no).includes(k))).join(', '));
  const bad = values(TEXT.en).map(call).filter((s) => typeof s === 'string' && nordic.test(s));
  ok('ingen æ/ø/å i det engelske', bad.length === 0, bad.join(' | '));
  ok('ukjent språk gir norsk', text('xx') === TEXT.no);
}

section('Ingen meldingstekst spredt i lagene (alt står i core/text.js)');
{
  const root = fileURLToPath(new URL('../js/', import.meta.url));
  const offenders = [];
  for (const dir of ['input', 'io', 'editor']) {
    for (const f of await readdir(root + dir)) {
      const src = await readFile(`${root}${dir}/${f}`, 'utf8');
      src.split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '').trim();
        if (code.startsWith('*') || code.startsWith('/*')) return;
        // norske meldinger i kode = streng med æøå som går til status/msg/error
        if (/(onStatus|setStatus|status|msg:|error:|warnings\.push)\s*\(?\s*['`][^'`]*[æøå]/.test(code)) offenders.push(`${dir}/${f}:${i + 1}`);
      });
    }
  }
  ok('ingen norske meldinger utenfor text.js', offenders.length === 0, offenders.join(', '));
}

section("lang: 'en' gir engelsk");
{
  const doc = new CadDocument();
  const vp = { unitsPerPixel: 1, setPreview() {}, setHover() {}, setHoverOf() {}, hoverOf: () => null, zoomToFit() {}, snap: (p) => ({ point: p, type: 'free' }) };
  const said = [];
  const tools = new ToolController(doc, vp, { lang: 'en', onStatus: (m) => said.push(m) });
  tools.setTool('rect');
  ok('verktøyhjelp', /^Rectangle: click/.test(tools.hint()), tools.hint());
  tools.setVoidMode(true);
  ok('hull-modus', said.at(-1).startsWith('Hole mode ON'));
  const h = createKeyHandler({ doc, tools, viewport: vp, lang: 'en', hooks: { status: (m) => said.push(m) } });
  h({ key: 'Delete', code: '', target: {}, preventDefault() {} });
  ok('tastaturet', said.at(-1) === 'Nothing is selected.', said.at(-1));

  doc.add('shape', { points: R(0, 0, 100, 100) });
  doc.add('shape', { points: R(500, 0, 100, 100) });
  const s = sectionOf(doc, { lang: 'en', selectable: false });
  ok('usammenhengende deler: engelsk og uten «select»', !s.ok && /2 separate parts/.test(s.error) && /Delete the loose parts/.test(s.error) && !/select/i.test(s.error), s.error);
  const sNo = sectionOf(doc, { lang: 'no', selectable: false });
  ok('norsk variant uten markering', /Slett de løse delene/.test(sNo.error) && !/marker/.test(sNo.error), sNo.error);
  const sGw = sectionOf(doc);
  ok('GW sin melding er uendret', /marker delene som hører sammen/.test(sGw.error));

  const dxf = await readFile(fileURLToPath(new URL('../../geometry_workspace/tests/fixtures/hulldekke.dxf', import.meta.url)), 'utf8');
  const r = importDxfText(new CadDocument(), dxf, { lang: 'en' });
  ok('DXF-melding', /^DXF: 1 shape, 7 holes\. Unit mm from the file\.$/.test(r.msg), r.msg);
  const bad = importDxfText(new CadDocument(), '0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n', { lang: 'en' });
  ok('DXF-feil', bad.msg === 'DXF import failed: Invalid DXF: no ENTITIES section found.', bad.msg);
  const badNo = importDxfText(new CadDocument(), '0\nSECTION\n2\nHEADER\n0\nENDSEC\n0\nEOF\n');
  ok('DXF-feil på norsk som før', badNo.msg === 'DXF-import feilet: Ugyldig DXF: fant ingen ENTITIES-seksjon.', badNo.msg);
}

done();
