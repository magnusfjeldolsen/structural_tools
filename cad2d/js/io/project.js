/**
 * project.js — dokumentet inn og ut: DXF inn i et dokument, et
 * `structural-tools-section`-polygon inn som former, og tverrsnittet ut.
 *
 * Ingen DOM. DXF-delen er flyttet fra geometry_workspace/js/ui.js (#93), så
 * GW og csc importerer DXF på nøyaktig samme måte.
 */

import { CadDocument } from '../core/document.js';
import { conversionFactor } from '../core/units.js';
import {
  importDxf,
  importDxfLines,
  describeImport,
  describeLineImport,
  resolveDxfUnit,
  shapeList,
  INSUNITS_TO_UNIT,
} from './dxf.js';
import { exportSection, SECTION_FORMAT } from './section-export.js';

/**
 * Leser DXF-tekst inn i dokumentet som ETT angresteg.
 *
 * @param {CadDocument} doc
 * @param {string} text
 * @param {{mode?: 'auto'|'lines', unitChoice?: 'auto'|'mm'|'cm'|'m'}} [opts]
 *   `auto`: lukkede konturer blir former og hull. `lines`: alt blir linjearbeid.
 * @returns {{ok: boolean, added: number, msg: string, ms: number}}
 *   `ms` er hvor lenge meldingen bør stå (lange meldinger lenger).
 */
export function importDxfText(doc, text, { mode = 'auto', unitChoice = 'auto' } = {}) {
  let used;
  const scale = (insunits) => {
    used = resolveDxfUnit(unitChoice, insunits);
    return conversionFactor(used.unit, doc.state.unit);
  };
  if (mode === 'lines') {
    let res;
    try {
      res = importDxfLines(String(text), { scale });
    } catch (err) {
      return { ok: false, added: 0, msg: `DXF-import feilet: ${err.message}`, ms: 6000 };
    }
    if (!res.paths.length) return { ok: false, added: 0, msg: `${describeLineImport(res)} Ingen linjer å importere.`, ms: 8000 };
    doc.addLines(res.paths, { reason: 'import' });
    if (!doc.state.linesVisible) doc.setLinesVisible(true);
    return {
      ok: true,
      added: res.paths.length,
      msg: `${describeLineImport(res)} Enhet ${used.unit}${used.fromFile ? ' fra fila' : ''}.`,
      ms: 9000,
    };
  }
  let res;
  try {
    res = importDxf(String(text), { scale });
  } catch (err) {
    return { ok: false, added: 0, msg: `DXF-import feilet: ${err.message}`, ms: 6000 };
  }
  const n0 = doc.state.shapes.filter((s) => /^DXF \d+$/.test(s.name)).length;
  // Dypeste regioner og hull øverst, så 'sum', 'priority' og nettoarealet er
  // enige også for en øy i et hull.
  const list = shapeList(res, { start: n0 + 1 });
  let msg = describeImport(res);
  const fileUnit = INSUNITS_TO_UNIT[res.insunits];
  if (used.fromFile) msg += ` Enhet ${used.unit} fra fila.`;
  else if (unitChoice === 'auto') msg += ' Fila oppgir ikke enhet; antatt mm.';
  else if (fileUnit && fileUnit !== used.unit) msg += ` Fila sier ${fileUnit}, men ${used.unit} er valgt og brukt.`;
  if (!list.length) return { ok: false, added: 0, msg: `${msg} Ingen lukkede konturer å importere.`, ms: 8000 };
  doc.addShapes(list, { reason: 'import' });
  return { ok: true, added: list.length, msg, ms: 8000 };
}

/**
 * Tverrsnittet dokumentet beskriver, på `structural-tools-section` v1 i mm:
 * faste former minus alle hull (hullregelen), som ett ytre polygon med hull.
 *
 * @returns {{ok: boolean, section?: object, error?: string, warnings: string[]}}
 */
export function sectionOf(doc, { selection = [] } = {}) {
  return exportSection(doc.state.shapes, { unit: doc.state.unit, selection });
}

/**
 * Et polygon med hull (`{outer, holes}` eller et helt `structural-tools-section`-
 * dokument, mm, y vannrett og z opp) som former i et nytt dokument: én fast
 * form og ett hull per indre ring. Brukes når en modul har et polygon, men
 * ingen tegning (csc: et snitt lastet fra fil).
 *
 * @param {{outer: number[][], holes?: number[][][], units?: string}} section
 * @param {object} [opts] sendes til `CadDocument`
 * @returns {CadDocument}
 */
export function documentFromSection(section, opts = {}) {
  const doc = new CadDocument(opts);
  const scale = section && section.units ? conversionFactor(section.units, doc.state.unit) : 1;
  const ring = (r) => (r || []).map((p) => [Number(p[0]) * scale, Number(p[1]) * scale]);
  const outer = ring(section && section.outer);
  if (outer.length >= 3) {
    const holes = ((section && section.holes) || []).map(ring).filter((h) => h.length >= 3);
    doc.addShapes([
      ...holes.map((h, i) => ({ points: h, role: 'void', name: `Hull ${i + 1}` })),
      { points: outer, role: 'solid', name: 'Tverrsnitt' },
    ]);
    doc.select([]);
  }
  doc.undoStack.length = 0;
  return doc;
}

export { SECTION_FORMAT };
