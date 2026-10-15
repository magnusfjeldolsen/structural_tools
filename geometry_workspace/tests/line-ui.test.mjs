/**
 * line-ui.test.mjs — linjeberegningen hele veien fra tegnet modell (#63).
 *
 *   node geometry_workspace/tests/line-ui.test.mjs
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.window = globalThis;
const vendor = await readFile(fileURLToPath(new URL('../vendor/polygon-clipping.umd.js', import.meta.url)), 'utf8');
await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(vendor, 'utf8').toString('base64'));
const url = (p) => pathToFileURL(fileURLToPath(new URL(p, import.meta.url))).href;
const { computeReinforcement } = await import(url('../js/reinforcement-ui.js'));
const { computeLine, aiPrompt, lineConventionHtml, lineZones, qTableTsv, resolveZones, splitZone, deleteZone, moveBoundary, endZones, setZoneField, suggestFor, splitZoneAt } = await import(url('../js/line-ui.js'));

let failed = 0;
function ok(label, cond, extra = '') {
  if (cond) console.log(`  ok  ${label}`);
  else { failed++; console.log(`  FEIL ${label}${extra ? ` — ${extra}` : ''}`); }
}
const close = (a, b, rel = 3e-3) => Number.isFinite(a) && Math.abs(a - b) <= rel * Math.abs(b);

const R = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
const shape = (id, pts, stage, E) => ({ id, name: id, points: pts, stage, include: true, factor: 1, role: 'solid', material: { name: '', E } });
const joint = (id, a, b) => ({ id, name: id, a, b, share: null, qT: 0, connector: { rows: 2, spacing: 100, Kser: 2990 } });
const model = (shapes, joints, line) => ({
  unit: 'mm', shapes, joints, analysis: 'line',
  loads: { before: { Vy: 0, Vx: 0, N: 0, Mx: 0, My: 0 }, after: { Vy: 0, Vx: 0, N: 0, Mx: 0, My: 0 }, L: 1000 },
  line: { table: 'z\tN\tMx\tMy\n0\t60\t0\t0\n12\t60\t0\t0', za: null, zb: null, endA: 'loose', endB: 'loose', nAt: 'composite', restraint: 'xy', epsExisting: 0, epsNew: 0, ...line },
});
const run = (st) => computeLine(st, computeReinforcement(st));

console.log('SMath-caset fra tegningen');
{
  const st = model([shape('gurt', R(0, 0, 50, 130), 'existing', 11000), shape('ny', R(50, 0, 48, 198), 'new', 11000)], [joint('j', [50, 0], [50, 130])], {});
  const lr = run(st);
  ok('regnes', lr.ok, lr.blocked.join(' | '));
  if (lr.ok) {
    // N₂∞ = 60 000·1,04544e8/1,75694e8; λ = √(59,8·(1/7,15e7 + 1/1,04544e8)); q_max ≈ N₂∞·λ (lang del)
    const Ninf = (60000 * 1.04544e8) / (7.15e7 + 1.04544e8);
    const lam = Math.sqrt(59.8 * (1 / 7.15e7 + 1 / 1.04544e8));
    ok('q_max ≈ 42,3 kN/m (K_ser)', close(Math.abs(lr.summary.qMax.ser), Ninf * lam * Math.tanh((lam * 12000) / 2)), lr.summary.qMax.ser);
    ok('F_v ≈ 2,11 kN', close(lr.summary.Fv.ser, (Ninf * lam * 100) / 2 / 1000), lr.summary.Fv.ser);
    ok('1/λ ≈ 843 mm', close(lr.summary.Lc.ser, 1 / lam, 1e-9), lr.summary.Lc.ser);
    ok('K_u gir lengre 1/λ: ×√(3/2)', close(lr.summary.Lc.u / lr.summary.Lc.ser, Math.sqrt(1.5), 1e-9));
    ok('N₁ = 60 kN i løs ende', close(lr.summary.N1max.u, 60, 1e-9), lr.summary.N1max.u);
  }
}

console.log('Sperrer');
{
  const base = [shape('gurt', R(0, 0, 50, 130), 'existing', 11000), shape('ny', R(50, 0, 48, 198), 'new', 11000)];
  ok('uten valg av angrepspunkt', run(model(base, [joint('j', [50, 0], [50, 130])], { nAt: null })).blocked.some((b) => /angriper/.test(b)));
  ok('uten valg av fastholding', run(model(base, [joint('j', [50, 0], [50, 130])], { restraint: null })).blocked.some((b) => /fastholding/.test(b)));
  ok('uten tabell', run(model(base, [joint('j', [50, 0], [50, 130])], { table: '' })).blocked.some((b) => /Lim inn/.test(b)));
  // Uten tegnet skjøt finner verktøyet den felles kanten selv (#61) …
  const auto = run(model(base, [], {}));
  ok('automatisk skjøt brukes når ingen er tegnet', auto.ok && auto.pick.joints[0].auto === true, auto.blocked.join(' | '));
  // … men delene må berøre hverandre.
  const apart = [base[0], shape('ny', R(51, 0, 48, 198), 'new', 11000)];
  ok('uten kontakt: ingen skjøt', run(model(apart, [], {})).blocked.some((b) => /Tegn skjøten/.test(b)));
  const gap = joint('j', [50, 0], [50, 130]);
  gap.connector = { rows: 2, spacing: 100, stiffSource: 'ec5', ec5Fastener: 'screw', ec5D: 8, ec5Contact: 'gap' };
  ok('glippe sperrer', run(model(base, [gap], {})).blocked.some((b) => /ingen kontakt/.test(b)));
}

console.log('To like, speilede nye deler');
{
  // Eksisterende 50×130 i midten, to like 48×130 på hver side.
  const st = model(
    [shape('gurt', R(0, 0, 50, 130), 'existing', 11000), shape('v', R(-48, 0, 48, 130), 'new', 11000), shape('h', R(50, 0, 48, 130), 'new', 11000)],
    [joint('jv', [0, 0], [0, 130]), joint('jh', [50, 0], [50, 130])],
    { restraint: 'free' },
  );
  const lr = run(st);
  ok('regnes som et par', lr.ok && lr.pick.pair, lr.blocked.join(' | '));
  if (lr.ok) {
    // To skjøter ⟹ k = 2·59,8; nye EA = 2·11000·6240; e = 0, så fri = fastholdt.
    const EA1 = 11000 * 6500, EA2 = 2 * 11000 * 6240;
    const lam = Math.sqrt(2 * 59.8 * (1 / EA1 + 1 / EA2));
    ok('1/λ fra summen av stivhetene, e = 0', close(lr.summary.Lc.ser, 1 / lam, 1e-6), `${lr.summary.Lc.ser} mot ${1 / lam}`);
    const Ninf = (60000 * EA2) / (EA1 + EA2);
    ok('q per skjøt = halvparten', close(Math.abs(lr.summary.qMax.ser), (Ninf * lam * Math.tanh((lam * 12000) / 2)) / 2), lr.summary.qMax.ser);
  }
  // Ulike deler: nektes.
  const st2 = model(
    [shape('gurt', R(0, 0, 50, 130), 'existing', 11000), shape('v', R(-36, 0, 36, 130), 'new', 11000), shape('h', R(50, 0, 48, 130), 'new', 11000)],
    [joint('jv', [0, 0], [0, 130]), joint('jh', [50, 0], [50, 130])],
    {},
  );
  ok('to ulike nye deler nektes', run(st2).blocked.some((b) => /to ulike/.test(b)));
}

console.log('Felttabell og q(z)');
{
  // Fagverksgurt med hopp ved 4 m og 8 m.
  const st = model([shape('gurt', R(0, 0, 50, 130), 'existing', 11000), shape('ny', R(50, 0, 48, 198), 'new', 11000)], [],
    { table: '0 40\n4 40\n4 90\n8 90\n8 30\n12 30' });
  const lr = run(st);
  ok('regnes', lr.ok, lr.blocked.join(' | '));
  const zones = lineZones(lr);
  ok('tre felt: 0–4, 4–8, 8–12', zones.length === 3 && zones[1].z0 === 4 && zones[1].z1 === 8, JSON.stringify(zones.map((z) => [z.z0, z.z1])));
  const qAll = Math.max(...lr.res.ser.q.map(Math.abs));
  ok('største felttopp = største q', Math.abs(Math.max(...zones.map((z) => z.qSer)) - qAll) < 1e-9);
  ok('F_v per felt = |q|·a/rader', zones.every((z) => Math.abs(z.FvSer - (z.qSer * lr.summary.a) / lr.summary.rows / 1000) < 1e-12));
  const tsv = qTableTsv(lr).split('\n');
  ok('overskrift med enheter', /^z \[m\]\t\|q\| K_ser \[kN\/m\]/.test(tsv[0]));
  const zsCol = tsv.slice(1).map((l) => Number(l.split('\t')[0]));
  ok('hoppene er med som egne rader', zsCol.includes(4) && zsCol.includes(8));
  ok('fra 0 til 12 m, stigende', zsCol[0] === 0 && zsCol[zsCol.length - 1] === 12 && zsCol.every((z, i) => i === 0 || z >= zsCol[i - 1]));
}

console.log('Skruesoner (#71)');
{
  const shapes = [shape('gurt', R(0, 0, 50, 130), 'existing', 11000), shape('ny', R(50, 0, 48, 198), 'new', 11000)];
  const j = joint('j', [50, 0], [50, 130]); // 2 rader, a = 100, K = 2990
  const base = { rows: 2, a: 100, K: 2990 };
  // Uniform glissen: a = 200 overalt.
  const sparse = run(model(shapes, [j], { zones: [{ zEnd: null, a: 200 }] }));
  // Tette endesoner a = 60 over 1,5 m, a = 200 i midten.
  const zoned = run(model(shapes, [j], { zones: [{ zEnd: 1.5, a: 60 }, { zEnd: 10.5, a: 200 }, { zEnd: null, a: 60 }] }));
  ok('begge regnes', sparse.ok && zoned.ok, [...sparse.blocked, ...zoned.blocked].join(' | '));
  if (sparse.ok && zoned.ok) {
    ok('tre soner', zoned.zones.length === 3 && zoned.zones[1].z0 === 1.5 && zoned.zones[2].z0 === 10.5);
    ok('tette endesoner gir lavere kraft per skrue', zoned.summary.Fv.ser < sparse.summary.Fv.ser, `${zoned.summary.Fv.ser} mot ${sparse.summary.Fv.ser}`);
    // Kraft per skrue er kontinuerlig over grensen (samme skrue), q hopper.
    const r = zoned.res.ser;
    const ib = r.z.findIndex((z) => Math.abs(z - 1500) < 1e-6);
    ok('kraft per skrue kontinuerlig ved 1,5 m', ib > 0 && Math.abs(r.F[ib - 1] - r.F[ib + 1]) < 0.02 * Math.max(r.F[ib - 1], 1), `${r.F[ib - 1]} / ${r.F[ib + 1]}`);
    ok('q hopper ved 1,5 m (tett → glissen)', Math.abs(r.q[ib - 1]) > 2 * Math.abs(r.q[ib + 1]));
    // Antall (tabellen går til 12 m), lengde/a + 1 per rad: 1500/60 + 9000/200 + 1500/60 + 1 = 96 per rad, 2 rader = 192
    ok('skruer totalt', zoned.summary.count === 192, String(zoned.summary.count));
  }

  // Hjelperne: aldri hull eller overlapp.
  const one = resolveZones({ zones: [] }, 0, 12, base);
  const split = resolveZones({ zones: splitZone(one, 0, base) }, 0, 12, base);
  ok('del: to soner som møtes på midten', split.length === 2 && split[0].z1 === 6 && split[1].z0 === 6 && split[1].z1 === 12);
  const moved = resolveZones({ zones: moveBoundary(split, 0, 20, base) }, 0, 12, base);
  ok('flytt grense: holdes innenfor naboen', moved[0].z1 < 12 && moved[1].z0 === moved[0].z1 && moved[1].z1 === 12);
  const merged = resolveZones({ zones: deleteZone(split, 1, base) }, 0, 12, base);
  ok('slett: naboen tar over hele lengden', merged.length === 1 && merged[0].z0 === 0 && merged[0].z1 === 12);
  const ends = resolveZones({ zones: endZones(one, 0, 12, 1.5, 60, base) }, 0, 12, base);
  ok('endesoner: 0–1,5 / 1,5–10,5 / 10,5–12, a = 60 i endene', ends.length === 3 && ends[0].z1 === 1.5 && ends[2].z0 === 10.5 && ends[0].a === 60 && ends[2].a === 60 && ends[1].a === 100);
  ok('endesoner for lange nektes', endZones(one, 0, 12, 7, 60, base) === null);
  const field = resolveZones({ zones: setZoneField(split, 1, 'rows', 3, base) }, 0, 12, base);
  ok('rader per sone', field[1].rows === 3 && field[0].rows === 2);
  const kz = resolveZones({ zones: setZoneField(split, 0, 'Kser', 4000, base) }, 0, 12, base);
  ok('K_ser per sone', kz[0].K === 4000 && kz[1].K === 2990);
}

console.log('Foreslå soner gjennom broen (#73)');
{
  // Fagverksgurt med hopp — hoppene må komme fram i riktig enhet.
  const shapes = [shape('gurt', R(0, 0, 50, 130), 'existing', 11000), shape('ny', R(50, 0, 48, 198), 'new', 11000)];
  const st = model(shapes, [joint('j', [50, 0], [50, 130])], { table: '0 40\n4 40\n4 90\n8 90\n8 30\n12 30' });
  const lr = run(st);
  const r = suggestFor(lr, { target: 1300, spacings: [50, 75, 100, 150, 200], minLen: 500 });
  ok('forslaget holder målet', r && r.ok && r.Fmax <= 1300 + 1e-6, JSON.stringify(r && { ok: r.ok, Fmax: r.Fmax, worst: r.worst }));
  // Kontroll: legg forslaget inn og regn på nytt gjennom hele broen.
  const lr2 = run(model(shapes, [joint('j', [50, 0], [50, 130])], { table: '0 40\n4 40\n4 90\n8 90\n8 30\n12 30', zones: r.zones }));
  ok('uavhengig kontroll gjennom broen: F maks ≤ mål', lr2.ok && lr2.summary.Fv.ser <= 1.3 + 1e-6, String(lr2.summary && lr2.summary.Fv.ser));
  ok('rader og skrue beholdt', lr2.zones.every((z) => z.rows === 2 && z.K === 2990));
  const one = resolveZones({ zones: [] }, 0, 12, { rows: 2, a: 100, K: 2990 });
  const at = resolveZones({ zones: splitZoneAt(one, 0, 3.25, { rows: 2, a: 100, K: 2990 }) }, 0, 12, { rows: 2, a: 100, K: 2990 });
  ok('del ved z: grensen der man klikket', at.length === 2 && at[0].z1 === 3.25);
}

console.log('Endeavstand a₃ gjennom broen (#75)');
{
  const shapes = [shape('gurt', R(0, 0, 50, 130), 'existing', 11000), shape('ny', R(50, 0, 48, 198), 'new', 11000)];
  shapes.forEach((s) => (s.material = { name: 'C24', E: 11000 }));
  const ec5 = joint('j', [50, 0], [50, 130]);
  ec5.connector = { rows: 2, spacing: 100, stiffSource: 'ec5', ec5Fastener: 'dowel', ec5D: 10, ec5Contact: 'timber-timber' };
  // Strekk i den nye delen ved enden ⟹ belastet ende: a₃,t = max(7·10; 80) = 80 mm.
  const lr = run(model(shapes, [ec5], { a3a: 50, a3b: 120 }));
  ok('regnes', lr.ok, lr.blocked.join(' | '));
  if (lr.ok) {
    ok('EC5-minimum ved z_a: 80 mm (belastet ende)', lr.a3min.a && lr.a3min.a.value === 80 && /belastet/.test(lr.a3min.a.label), JSON.stringify(lr.a3min.a));
    ok('varsel når a₃ < minimum', lr.warnings.some((w) => /a₃ ved z_a = 50 mm < 80 mm/.test(w.short)));
    ok('ingen varsel ved z_b (120 ≥ 80)', !lr.warnings.some((w) => /a₃ ved z_b/.test(w.short)));
    ok('ingen påminnelse om a₃ = 0', !lr.warnings.some((w) => /a₃ = 0/.test(w.short)));
    // Forbundet lengde 12 000 − 50 − 120 = 11 830 mm ⟹ 118 + 1 = 119 per rad, 2 rader.
    ok('antall skruer av forbundet lengde', lr.summary.count === 238, String(lr.summary.count));
  }
  const none = run(model(shapes, [ec5], {}));
  ok('påminnelse når a₃ = 0', none.ok && none.warnings.some((w) => /a₃ = 0/.test(w.short)));
  const tooLong = run(model(shapes, [ec5], { a3a: 6000, a3b: 6000 }));
  ok('sperre når a₃ spiser hele delen', tooLong.blocked.some((b) => /ingen skruer igjen/.test(b)));
  // Én påminnelse når bare den ene enden har a₃ = 0, med EC5-minimum i teksten.
  const half = run(model(shapes, [ec5], { a3a: 100 }));
  const rem = half.warnings.filter((w) => /a₃ = 0/.test(w.short));
  ok('én påminnelse for z_b, med minimum', rem.length === 1 && /z_b \(min 80 mm\)/.test(rem[0].short), rem.map((w) => w.short).join(' | '));
  // Trykk i den nye delen ⟹ ubelastet ende: a₃,c = 4d = 40 mm, likt i begge ender.
  const comp = run(model(shapes, [ec5], { table: 'z N Mx My\n0 -60 0 0\n12 -60 0 0', a3a: 50, a3b: 50 }));
  ok('trykk: ubelastet ende i begge ender', comp.ok && comp.a3min.a.value === 40 && comp.a3min.b.value === 40, JSON.stringify(comp.a3min));
  // En sone som ligger helt inne i a₃: ingen skruer, og λ/L_c følger riktig sone.
  const b0 = { rows: 2, a: 100, K: lr.zones[0].K };
  const tiny = splitZoneAt(resolveZones({ zones: [] }, 0, 12, b0), 0, 0.03, b0);
  const inA3 = run(model(shapes, [ec5], { a3a: 50, a3b: 50, zones: tiny }));
  ok('sone inne i a₃: 0 skruer', inA3.ok && inA3.zoneStats[0].count === 0 && inA3.zoneStats[1].count > 0, inA3.zoneStats && inA3.zoneStats.map((z) => z.count).join(','));
  ok('sone inne i a₃: L_c lik for like soner', inA3.ok && Math.abs(inA3.zoneStats[0].Lc - inA3.zoneStats[1].Lc) < 1e-6);
  // Tabelleksporten tar med første skrue, der toppen sitter.
  const tsv = qTableTsv(lr).split('\n').slice(1).map((l) => l.split('\t').map(Number));
  ok('q-tabellen har en rad ved første skrue (z = 0,050)', tsv.some((r) => Math.abs(r[0] - 0.05) < 1e-9 && r[3] > 0));
  const peak = Math.max(...tsv.map((r) => r[3]));
  ok('toppen i tabellen = F maks', Math.abs(peak - lr.summary.Fv.ser) < 1e-3, `${peak} vs ${lr.summary.Fv.ser}`);
}

console.log('Prompten til brukerens AI');
{
  const st = model([shape('Gurt 50x130', R(0, 0, 50, 130), 'existing', 11000), shape('Ny 48x198', R(50, 0, 48, 198), 'new', 11000)], [], { nAt: 'existing', restraint: 'y', endB: 'fixed' });
  const p = aiPrompt(st);
  ok('tabellformatet med kolonnene i rekkefølge', p.includes('z [m]\tN [kN]\tM_x [kNm]\tM_y [kNm]\tN_før [kN]'));
  ok('hopp forklart som to rader med samme z', /TO rader med samme z/.test(p));
  ok('fortegn: strekk positiv, M_y-advarsel', /Strekk positiv/.test(p) && /snu fortegnet/.test(p));
  ok('alle innstillingene forklart', ['UTSTREKNING', 'Løs ende', 'Festet i knutepunkt', 'N ANGRIPER I', 'SIDEVEIS FASTHOLDING', 'FRI TØYNING', 'SKJØTEDATA'].every((k) => p.includes(k)));
  ok('delene fra tegningen', p.includes('Eksisterende: Gurt 50x130') && p.includes('Ny: Ny 48x198'));
  ok('det som er valgt så langt', /festet ved z_b/.test(p) && /eksisterende tyngdepunktet/.test(p) && /fastholdt om y-aksen/.test(p));
  ok('ber om begrunnelse og antakelser', /begrunnelse/.test(p) && /antakelser/.test(p));
  ok('fortegnstabellen', /Strekk positiv/.test(lineConventionHtml()) && /strekk i overkant/.test(lineConventionHtml()));
}

console.log(failed ? `\n${failed} feil` : '\nAlle tester bestått');
process.exit(failed ? 1 : 0);
