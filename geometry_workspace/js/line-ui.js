/**
 * line-ui.js — linjeberegningen i Forsterkning-fanen (#63): broen fra
 * modellen til `line-analysis.js`, og panelene (input til venstre, resultat
 * til høyre). Mekanikken ligger i `line-analysis.js`; her er bare valg av
 * skjøt, kontroll av input, enheter og visning.
 *
 * Enheter: tabellen og z_a/z_b i m, kN, kNm; skjøtedata absolutte (a i mm,
 * K i N/mm); fri tøyning i ‰. Alt regnes om til N og mm her.
 */

import { parseLoadTable, twoLayer, lambda2, analyseLine } from './line-analysis.js';
import { lengthLabel } from './units.js';
import { n } from './derivation.js';

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ================================================================== *
 * 1. Broen
 * ================================================================== */

const RESTRAINTS = [
  { key: 'free', label: 'Fri — kan bøye om begge akser' },
  { key: 'y', label: 'Fastholdt om y-aksen (sideveis)' },
  { key: 'x', label: 'Fastholdt om x-aksen' },
  { key: 'xy', label: 'Fastholdt om begge akser' },
];

const rel = (u, v) => Math.abs(u - v) <= 1e-6 * Math.max(Math.abs(u), Math.abs(v), 1);

/**
 * Regner linjeberegningen for tilstanden, gitt snittberegningens resultat
 * (`computeReinforcement`), som allerede har gruppene og skjøtestivhetene.
 *
 * @returns {{ok: boolean, blocked: string[], warnings: Array<{short:string,text:string}>, ...}}
 */
export function computeLine(state, rf) {
  const line = state.line || {};
  const blocked = [];
  const warnings = [];
  const out = { ok: false, blocked, warnings, line };
  if (!rf) {
    blocked.push('Ingen geometri å regne på.');
    return out;
  }
  if (rf.allExisting) blocked.push('Ingen del er merket «ny». Linjeberegningen gjelder en forsterkning.');

  const table = parseLoadTable(line.table);
  out.table = table;
  for (const e of table.errors) blocked.push(e);
  if (table.rows.length < 2) blocked.push('Lim inn lastdiagrammet: minst to rader med z, N, M_x, M_y.');

  if (!line.nAt) blocked.push('Velg hvor N angriper.');
  if (!line.restraint) blocked.push('Velg sideveis fastholding.');

  const zMin = table.rows.length ? table.rows[0].z : 0;
  const zMax = table.rows.length ? table.rows[table.rows.length - 1].z : 0;
  const za = line.za == null ? zMin : line.za;
  const zb = line.zb == null ? zMax : line.zb;
  out.za = za;
  out.zb = zb;
  if (table.rows.length >= 2 && !(zb > za)) blocked.push('Utstrekningen må ha z_b > z_a.');

  // Skjøtene som berører en ny del. Én skjøtelinje, eller to like og speilede.
  const toNew = rf.joints.filter((j) => j.hasNeighbor && !j.existingOnly);
  let pick = null;
  if (!rf.allExisting && !toNew.length) blocked.push('Tegn skjøten mellom eksisterende og ny del (fanen «Geometri», G).');
  else if (toNew.length === 1) pick = { joints: toNew, groupIds: toNew[0].groupIds, pair: false };
  else if (toNew.length === 2) {
    const pair = mirroredPair(toNew, rf);
    if (pair) pick = pair;
    else blocked.push('Linjeberegningen gjelder én skjøtelinje mellom eksisterende og ny del, eller to like, speilede nye deler. Her er det to ulike.');
  } else if (toNew.length > 2) {
    blocked.push(`Linjeberegningen gjelder én skjøtelinje mellom eksisterende og ny del. Her berører ${toNew.length} skjøter en ny del — det krever et koblet system som ikke er med ennå.`);
  }
  if (pick && pick.joints.some((j) => j.overConstrained)) {
    blocked.push('Skjøten er statisk ubestemt (lukket sløyfe). Linjeberegningen gjelder en skjøt som er en bro mellom to deler.');
  }

  // Skjøtestivheten: k = rader·K_ser/a per skjøt, summert for et speilet par.
  let kSer = 0;
  if (pick) {
    for (const j of pick.joints) {
      const c = j.connector || {};
      const gap = c.stiffSource === 'ec5' && c.ec5Contact === 'gap';
      if (gap) blocked.push(`${escapeHtml(j.name)}: ingen kontakt mellom delene — tabell 7.1 gjelder ikke. Legg inn K fritt (ETA/forsøk).`);
      const K = j.slipSer && j.slipSer.valid ? j.slipSer.K : NaN;
      const rows = Number(c.rows) || 0;
      const a = Number(c.spacing) || 0;
      if (!(K > 0) || !(rows > 0) || !(a > 0)) {
        if (!gap) blocked.push(`${escapeHtml(j.name)}: skjøtedata mangler — rader, skrueavstand a og K_ser må være satt.`);
      } else kSer += (rows * K) / a;
    }
  }
  out.pick = pick;
  if (blocked.length) return out;

  const groupSet = new Set(pick.groupIds);
  const existingParts = rf.sectionParts.filter((p) => !groupSet.has(p.id));
  const newParts = rf.sectionParts.filter((p) => groupSet.has(p.id));
  const layer = twoLayer({ existingParts, newParts, restraint: line.restraint, nAt: line.nAt });
  if (!layer.valid) {
    blocked.push('Tverrsnittet er degenerert (EA eller EI ≈ 0) — sjekk geometrien.');
    return out;
  }

  const res = analyseLine({
    layer,
    rows: table.rows,
    jumps: table.jumps,
    za: za * 1000,
    zb: zb * 1000,
    endA: line.endA,
    endB: line.endB,
    kSer,
    epsExisting: (Number(line.epsExisting) || 0) / 1000,
    epsNew: (Number(line.epsNew) || 0) / 1000,
  });

  // Per skjøt: et speilet par deler q likt.
  const share = pick.pair ? 0.5 : 1;
  const j0 = pick.joints[0];
  const c0 = j0.connector || {};
  const rows0 = Number(c0.rows);
  const a0 = Number(c0.spacing);
  const perScrew = (q) => (Math.abs(q) * share * a0) / rows0 / 1000; // kN
  const qT = Number(j0.raw && j0.raw.qT) || 0;

  out.ok = true;
  out.layer = layer;
  out.res = res;
  out.kSer = kSer;
  out.share = share;
  out.summary = {
    joint: pick.pair ? `${j0.name} + ${pick.joints[1].name}` : j0.name,
    rows: rows0,
    a: a0,
    qMax: { ser: res.ser.qMax * share, u: res.u.qMax * share, z: res.ser.zAtQmax / 1000 },
    Fv: { ser: perScrew(res.ser.qMax), u: perScrew(res.u.qMax) },
    Fax: qT ? (Math.abs(qT) * a0) / rows0 : null, // kN/m · mm / rader / 1000 · 1000
    N2a: line.endA === 'fixed' ? { ser: res.ser.N2a / 1000, u: res.u.N2a / 1000 } : null,
    N2b: line.endB === 'fixed' ? { ser: res.ser.N2b / 1000, u: res.u.N2b / 1000 } : null,
    N1max: { ser: res.ser.N1max / 1000, u: res.u.N1max / 1000, z: res.u.zAtN1max / 1000 },
    eta: { ser: res.ser.eta, u: res.u.eta },
    Lc: { ser: 1 / res.ser.lambda, u: 1 / res.u.lambda },
  };
  if (out.summary.Fax != null) out.summary.Fax = (Math.abs(qT) * a0) / rows0 / 1000;

  if (res.u.eta != null && res.u.eta < 0.9) {
    warnings.push({
      short: `η = ${n(res.u.eta, 2)} (K_u): den nye delen når ikke sin fulle andel.`,
      text: 'Delen er for kort i forhold til den karakteristiske lengden 1/λ, eller skjøten for myk: den nye delen får mindre enn ved full samvirkning, og den eksisterende delen bærer resten. Kontroller N₁ i den eksisterende delen.',
    });
  }
  if (a0 > 0.5 / res.ser.lambda) {
    warnings.push({
      short: `a = ${n(a0, 0)} mm > 1/(2λ) = ${n(0.5 / res.ser.lambda, 0)} mm: enkeltskruene betyr noe.`,
      text: 'Modellen smører skruene ut langs skjøten. Når skrueavstanden er stor i forhold til den karakteristiske lengden, får de ytterste skruene mer enn den utsmurte toppen tilsier.',
    });
  }
  if (pick.pair) {
    warnings.push({
      short: 'To like, speilede nye deler: tallene gjelder hver skjøt.',
      text: 'De to nye delene er like (EA, EI) og speilet om det eksisterende tyngdepunktet. De regnes som én del med summen av skjøtestivhetene og e = 0; q og skruekraft er halvparten per skjøt.',
    });
  }
  return out;
}

/** To nye deler som er like og speilet om det eksisterende tyngdepunktet. */
function mirroredPair(toNew, rf) {
  const [ja, jb] = toNew;
  const ga = new Set(ja.groupIds);
  const gb = new Set(jb.groupIds);
  if (!ga.size || !gb.size || [...ga].some((id) => gb.has(id))) return null;
  const sum = (ids) => {
    let EA = 0, ESx = 0, ESy = 0, EIx0 = 0, EIy0 = 0;
    for (const p of rf.sectionParts) {
      if (!ids.has(p.id)) continue;
      EA += p.E * p.props.A; ESx += p.E * p.props.Sx; ESy += p.E * p.props.Sy;
      EIx0 += p.E * p.props.Ix0; EIy0 += p.E * p.props.Iy0;
    }
    const yc = ESx / EA, xc = ESy / EA;
    return { EA, xc, yc, EIx: EIx0 - EA * yc * yc, EIy: EIy0 - EA * xc * xc };
  };
  const A = sum(ga);
  const B = sum(gb);
  const rest = sum(new Set(rf.sectionParts.map((p) => p.id).filter((id) => !ga.has(id) && !gb.has(id))));
  if (!(A.EA > 0 && B.EA > 0 && rest.EA > 0)) return null;
  const same = rel(A.EA, B.EA) && rel(A.EIx, B.EIx) && rel(A.EIy, B.EIy);
  const tol = 1e-6 * Math.max(1, Math.abs(A.xc), Math.abs(A.yc));
  const mirrored = Math.abs(A.xc + B.xc - 2 * rest.xc) < tol && Math.abs(A.yc + B.yc - 2 * rest.yc) < tol;
  if (!same || !mirrored) return null;
  return { joints: [ja, jb], groupIds: [...ga, ...gb], pair: true };
}

/* ================================================================== *
 * 2. Input (venstre panel)
 * ================================================================== */

const H = (title, body, extra = '') => `
  <div>
    <div class="flex items-center justify-between gap-2 mb-1.5">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">${title}</h3>
      ${extra}
    </div>
    ${body}
  </div>`;

const sel = (key, value, options, placeholder) => `
  <select data-line="${key}" data-focus-key="line-${key}" id="line-${key}">
    ${placeholder ? `<option value="" ${value ? '' : 'selected'} disabled>${placeholder}</option>` : ''}
    ${options.map((o) => `<option value="${o.key}" ${value === o.key ? 'selected' : ''}>${o.label}</option>`).join('')}
  </select>`;

const num = (key, label, value, attrs = '') => `
  <div>
    <label class="field-label" for="line-${key}">${label}</label>
    <input id="line-${key}" data-line="${key}" data-focus-key="line-${key}" type="number" ${attrs}
           value="${value === null || value === undefined ? '' : value}" />
  </div>`;

const ENDS = [{ key: 'loose', label: 'Løs ende' }, { key: 'fixed', label: 'Festet i knutepunkt' }];

/**
 * Venstre panel i linjemodus: lastdiagram, utstrekning, randbetingelser og
 * forutsetningene. Ingen løpende tekst — forklaringene står i `title`.
 */
export function lineInputsHtml(state, lr) {
  const line = state.line || {};
  const t = lr && lr.table;
  const status = !t || !t.rows.length
    ? '<span class="text-slate-500">Ingen rader ennå.</span>'
    : t.errors.length
    ? `<span class="text-rose-300">${escapeHtml(t.errors[0])}</span>`
    : `<span class="text-slate-400">${t.rows.length} rader · z ${n(t.rows[0].z, 2)}–${n(t.rows[t.rows.length - 1].z, 2)} m${t.jumps.length ? ` · ${t.jumps.length} hopp` : ''}</span>`;
  return [
    H(
      `<span class="inline-flex items-center gap-1.5">Lastdiagram
         <button data-line-help title="Fortegn og enheter"
                 class="w-4 h-4 inline-flex items-center justify-center rounded-full border border-sky-500 text-sky-300 hover:bg-sky-900/60 text-[10px] font-bold leading-none normal-case">?</button>
       </span>`,
      `
      <textarea id="line-table" data-line="table" data-focus-key="line-table" rows="6" spellcheck="false"
        class="w-full font-mono text-[11px] leading-snug"
        title="Lim inn fra Excel eller rammeprogrammet. Kolonner: z [m], N total [kN], M_x [kNm], M_y [kNm], N_før [kN]. Hopp i N: to rader med samme z. N_før er last som sto på før forsterkningen — den blir i den eksisterende delen."
        placeholder="z [m]   N [kN]   M_x [kNm]   M_y [kNm]   N_før [kN]&#10;0       60       0           0           0&#10;3,2     60       0           0           0&#10;3,2     85       0           0           0">${escapeHtml(line.table || '')}</textarea>
      <p class="text-[10px] mt-1">${status}</p>`,
      `<button data-line-prompt title="Kopierer en instruksjon til din egen AI: den gjør om lastunderlaget ditt til tabellen her, og foreslår og begrunner innstillingene under."
               class="px-2 py-0.5 text-[11px] bg-slate-700 hover:bg-slate-600 rounded border border-slate-600 shrink-0 normal-case tracking-normal">Kopier prompt</button>`
    ),
    H('Utstrekning', `
      <div class="grid grid-cols-2 gap-1.5">
        ${num('za', 'z_a [m] (tom = tabellens start)', line.za, 'step="0.1"')}
        ${num('zb', 'z_b [m] (tom = tabellens slutt)', line.zb, 'step="0.1"')}
        <div><label class="field-label" for="line-endA">Ende ved z_a</label>${sel('endA', line.endA, ENDS)}</div>
        <div><label class="field-label" for="line-endB">Ende ved z_b</label>${sel('endB', line.endB, ENDS)}</div>
      </div>`),
    H('Forutsetninger', `
      <div class="space-y-1.5">
        <div title="I et fagverk fører knutepunktet N inn i det eksisterende profilet. Da gir N et moment om det sammensatte tyngdepunktet, med mindre delen er fastholdt.">
          <label class="field-label" for="line-nAt">N angriper i</label>
          ${sel('nAt', line.nAt, [{ key: 'existing', label: 'Det eksisterende tyngdepunktet' }, { key: 'composite', label: 'Det sammensatte tyngdepunktet' }], '— velg —')}
        </div>
        <div title="Fastholdt: omgivelsene hindrer bøyning om aksen og tar momentet. Kan endre toppkraften med en faktor 2 for en del på siden av gurten — derfor ingen standard.">
          <label class="field-label" for="line-restraint">Sideveis fastholding</label>
          ${sel('restraint', line.restraint, RESTRAINTS, '— velg —')}
        </div>
        <div class="grid grid-cols-2 gap-1.5" title="Tøyningen hver del ville fått uten last (fukt, kryp, temperatur). Skjøten holder igjen forskjellen. Negativ = krymping.">
          ${num('epsExisting', 'Fri tøyning ε_eks [‰]', line.epsExisting, 'step="0.05"')}
          ${num('epsNew', 'Fri tøyning ε_ny [‰]', line.epsNew, 'step="0.05"')}
        </div>
      </div>`),
  ].join('');
}

/** Binder input-feltene i venstre panel til store. */
export function bindLineInputs(host, store, { onHelp, onCopyPrompt } = {}) {
  const help = host.querySelector('[data-line-help]');
  if (help && onHelp) help.addEventListener('click', (e) => { e.stopPropagation(); onHelp(help); });
  const prompt = host.querySelector('[data-line-prompt]');
  if (prompt && onCopyPrompt) prompt.addEventListener('click', () => onCopyPrompt());
  host.querySelectorAll('[data-line]').forEach((el) => {
    const key = el.dataset.line;
    el.addEventListener('change', () => {
      const raw = el.value;
      if (key === 'table' || key === 'endA' || key === 'endB' || key === 'nAt' || key === 'restraint') {
        store.setLine({ [key]: raw });
      } else if (key === 'za' || key === 'zb') {
        store.setLine({ [key]: raw === '' ? null : Number(raw) });
      } else {
        store.setLine({ [key]: Number(raw) || 0 });
      }
    });
  });
}

/* ================================================================== *
 * 2b. Fortegn og AI-prompt
 * ================================================================== */

/** Det som gjelder tabellen spesielt; aksefiguren (`axisConventionHtml`) følger under. */
export function lineConventionHtml() {
  const row = (k, v) => `<tr class="border-t border-slate-700/60"><td class="py-1 pr-3 align-top font-semibold text-slate-200 whitespace-nowrap">${k}</td><td class="py-1 text-slate-300">${v}</td></tr>`;
  return `<table class="w-full text-[11px]"><tbody>
    ${row('z [m]', 'Posisjon langs den nye delen (bjelkeaksen z), stigende. Mellom radene interpoleres lineært.')}
    ${row('N [kN]', 'Total normalkraft i det sammensatte tverrsnittet. <strong>Strekk positiv</strong>, trykk negativ.')}
    ${row('M_x [kNm]', 'Moment om x-aksen (vannrett i tegningen). Positiv gir <strong>strekk i overkant</strong>.')}
    ${row('M_y [kNm]', 'Moment om y-aksen (loddrett). Positiv gir <strong>strekk på høyre side</strong> — motsatt av mange rammeprogram; snu fortegnet om nødvendig.')}
    ${row('N_før [kN]', 'Del av N som sto på før forsterkningen ble montert. Blir i den eksisterende delen. 0 hvis ubelastet ved montering.')}
    ${row('Hopp', 'To rader med samme z: verdien rett før, så rett etter (typisk ved et knutepunkt).')}
    ${row('Tall', 'Komma eller punktum som desimaltegn; tab, semikolon eller mellomrom mellom kolonnene; overskriftslinjer hoppes over.')}
  </tbody></table>`;
}

const RESTRAINT_TEXT = {
  free: 'fri — kan bøye om begge akser',
  y: 'fastholdt om y-aksen (sideveis)',
  x: 'fastholdt om x-aksen',
  xy: 'fastholdt om begge akser',
};

/**
 * Prompten brukeren gir sin egen AI: gjør om lastunderlaget til tabellen
 * her, og foreslå og begrunn innstillingene. Tar med delene i tegningen og
 * det som alt er valgt, så svaret passer modellen.
 */
export function aiPrompt(state) {
  const st = state || {};
  const unit = st.unit || 'mm';
  const shapes = (st.shapes || []).filter((x) => x && x.include !== false && x.role !== 'void');
  const list = (stage) => shapes.filter((x) => (x.stage === 'new') === (stage === 'new'))
    .map((x) => `${x.name || x.id}${x.material && x.material.name ? ` (${x.material.name})` : ''}`).join(', ') || '—';
  const line = st.line || {};
  const chosen = [
    line.za != null || line.zb != null ? `utstrekning z_a = ${line.za ?? '(tabellens start)'} m, z_b = ${line.zb ?? '(tabellens slutt)'} m` : null,
    `ender: ${line.endA === 'fixed' ? 'festet' : 'løs'} ved z_a, ${line.endB === 'fixed' ? 'festet' : 'løs'} ved z_b`,
    line.nAt ? `N angriper i ${line.nAt === 'existing' ? 'det eksisterende' : 'det sammensatte'} tyngdepunktet` : null,
    line.restraint ? `sideveis: ${RESTRAINT_TEXT[line.restraint]}` : null,
  ].filter(Boolean);

  return `Du skal hjelpe meg å gjøre om et lastunderlag til inndata for «linjeberegningen» i Geometri-workspace (structural_tools). Den regner ut kreftene i skjøten (skruer, lim, sveis) mellom en eksisterende konstruksjonsdel og en ny forsterkningsdel langs hele den nye delen, med delvis samvirke (Volkersen/Newmark).

# Det jeg vil ha tilbake
1. En TABELL, tabulatorseparert, med overskriftslinje og nøyaktig disse kolonnene i denne rekkefølgen:
   z [m]	N [kN]	M_x [kNm]	M_y [kNm]	N_før [kN]
2. Et forslag til INNSTILLINGENE nedenfor, med én–to setninger begrunnelse for hvert valg. Si tydelig fra der underlaget ikke gir svaret eller du må anta noe — ikke gjett i stillhet.
3. En kort liste over antakelser du har gjort (lastkombinasjon, fortegn du har snudd, punkter du har lagt til).

# Tabellen — regler
- z: posisjon langs den nye delen i meter, regnet fra ett endepunkt, stigende. Ta med alle punkter der lasten endrer seg: knutepunkt, punktlaster, opplegg, endene av forsterkningen. Mellom radene interpoleres lineært, så en jevnt varierende last trenger nok punkter til at kurven blir riktig (moment under jevnt fordelt last: minst 5–10 punkter per felt).
- HOPP: der N eller M endrer seg sprangvis (typisk ved et knutepunkt i et fagverk eller under en punktlast), skriv TO rader med samme z — først verdien rett før, så verdien rett etter.
- N: total normalkraft i den ferdig forsterkede delen. Strekk positiv, trykk negativ.
- M_x: moment om tverrsnittets x-akse (vannrett akse i tverrsnittstegningen, y peker opp). Positiv gir strekk i overkant.
- M_y: moment om y-aksen (loddrett akse, x peker mot høyre). Positiv gir strekk på høyre side. MERK: dette er motsatt av vanlig bjelkekonvensjon i mange rammeprogram — snu fortegnet hvis underlaget bruker M_y = −∫σ·x dA, og si at du har gjort det.
- N_før: den delen av N som allerede sto på den eksisterende delen da forsterkningen ble montert (egenvekt, permanent last som ikke avlastes). Den blir i den eksisterende delen og belaster ikke skjøten. Sett 0 hvis delen er ubelastet (avstivet/avlastet) ved montering. Moment som sto på før montering er ikke med i modellen — si fra hvis det er betydelig.
- Lastkombinasjon: én tabell per kombinasjon. For skruekreftene: bruk den dimensjonerende kombinasjonen i bruddgrensetilstand. Lag gjerne flere tabeller hvis ulike kombinasjoner gir størst N og størst M.
- Enheter: m, kN, kNm. Ingen tusenskiller.

# Innstillingene — hva de betyr og når de velges
- UTSTREKNING z_a og z_b [m]: hvor den nye delen starter og slutter, i samme z som tabellen. Står de tomme, brukes hele tabellen.
- ENDE ved z_a og ved z_b, hver for seg:
  · «Løs ende»: den nye delen er bare festet med skruer langs delen og stopper der. Kraften i den er null i enden, og hele andelen må inn gjennom skruene nær enden — dette gir de største skruekreftene.
  · «Festet i knutepunkt»: den nye delen er koblet direkte inn i knutepunktet (plater, bolter, kontakt mot knutepunktsdel), så den tar sin andel derfra. Da må knutepunktsforbindelsen dimensjoneres for kraften i den nye delen, og verktøyet oppgir den.
  · Er det usikkert, velg løs ende — det er på den sikre siden for skruene.
- N ANGRIPER I:
  · «Det eksisterende tyngdepunktet» når lasten føres inn i den eksisterende delen og den nye bare henger på langs (typisk en fagverksgurt der knutepunktet sitter på det eksisterende profilet). Det gir et moment når delene ligger eksentrisk.
  · «Det sammensatte tyngdepunktet» når lasten fordeles på begge delene, eller når kreftene i underlaget allerede er regnet på det forsterkede tverrsnittet med lasten i dets tyngdepunkt.
- SIDEVEIS FASTHOLDING — om delen kan bøye ut om en akse når N angriper eksentrisk:
  · «Fri»: ingenting hindrer bøyning om noen akse.
  · «Fastholdt om y-aksen (sideveis)»: f.eks. taktro, lekter, plater eller avstivning hindrer utbøyning sideveis.
  · «Fastholdt om x-aksen» / «om begge akser»: tilsvarende for den andre aksen eller begge.
  · Valget kan endre toppkraften i skruene med en faktor 2 for en forsterkning som ligger på siden av gurten. Begrunn det ut fra hva som faktisk holder delen.
- FRI TØYNING ε_eks og ε_ny [‰]: tøyningen hver del ville fått uten last og uten skruer — svinn eller svelling fra fuktendring (negativt = krymping), kryp under N_før, temperatur. Typisk: ny trelast som tørker inn i et tørt bygg krymper mer enn den gamle (f.eks. 1 % fuktendring ≈ 0,1 ‰ langs fibrene for nåletre — oppgi kilde/antakelse). Sett 0 hvis det ikke er grunnlag, og si fra.
- SKJØTEDATA legges inn i verktøyet per skjøt (ikke i tabellen): antall skruerader, skrueavstand a langs delen [mm] og glidningsmodul K_ser per skrue [N/mm] (EC5 tabell 7.1 eller ETA), og eventuelt q_T [kN/m] — last som henges opp gjennom skjøten vinkelrett på skjøteflaten.

# Mitt tverrsnitt (fra tegningen)
- Enhet i tegningen: ${unit}. x mot høyre, y opp; bjelkeaksen z går ut av tegningen.
- Eksisterende: ${list('existing')}
- Ny: ${list('new')}
${chosen.length ? `- Valgt så langt: ${chosen.join('; ')}.\n` : ''}
# Underlaget
[Lim inn lastunderlaget her: snittkrefter fra rammeprogrammet, tabell, skjermbilde av diagram, eller beskrivelse av system og laster.]
`;
}

/* ================================================================== *
 * 3. Resultat (høyre panel)
 * ================================================================== */

/** Plukker ut ≤ 400 punkter, men beholder alltid ytterpunktene. */
function decimate(x, ys) {
  const step = Math.max(1, Math.ceil(x.length / 400));
  const idx = [];
  for (let i = 0; i < x.length; i += step) idx.push(i);
  if (idx[idx.length - 1] !== x.length - 1) idx.push(x.length - 1);
  // Topper skal ikke forsvinne i utplukket: ta med største |y| for hver serie.
  for (const y of ys) {
    let im = 0;
    for (let i = 1; i < y.length; i++) if (Math.abs(y[i]) > Math.abs(y[im])) im = i;
    if (!idx.includes(im)) idx.push(im);
  }
  idx.sort((a, b) => a - b);
  return idx;
}

/**
 * Lite linjeplott. `series`: [{y, color, dash, label}], x i m.
 * Fargene kommer inn som verdier, så samme funksjon tegner både skjerm og
 * rapport (der det er lys bakgrunn).
 */
export function plotSvg({ title, unit, x, series, palette }) {
  const P = palette || { text: '#94a3b8', grid: '#334155', title: '#cbd5e1' };
  const W = 480, H = 156, Lm = 46, R = 8, T = 34, B = 20;
  const all = series.flatMap((s) => s.y);
  let lo = Math.min(0, ...all);
  let hi = Math.max(0, ...all);
  if (hi - lo < 1e-9) hi = lo + 1;
  const pad = (hi - lo) * 0.08;
  hi += pad;
  if (lo < 0) lo -= pad;
  const x0 = x[0];
  const x1 = x[x.length - 1];
  const X = (v) => Lm + ((v - x0) / (x1 - x0 || 1)) * (W - Lm - R);
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const idx = decimate(x, series.map((s) => s.y));
  const fmt = (v) => n(v, Math.abs(v) >= 100 ? 0 : 1);
  const out = [];
  out.push(`<text x="${Lm}" y="11" fill="${P.title}" font-size="11">${title}</text>`);
  out.push(`<text x="${W - R}" y="11" fill="${P.text}" font-size="10" text-anchor="end">${unit}</text>`);
  out.push(`<line x1="${Lm}" y1="${Y(0)}" x2="${W - R}" y2="${Y(0)}" stroke="${P.grid}" />`);
  for (const v of [hi / (1 + 0.08), lo < 0 ? lo / (1 + 0.08) : null]) {
    if (v == null) continue;
    out.push(`<text x="${Lm - 4}" y="${Y(v) + 3}" fill="${P.text}" font-size="9" text-anchor="end">${fmt(v)}</text>`);
  }
  for (let i = 0; i <= 4; i++) {
    const v = x0 + ((x1 - x0) * i) / 4;
    out.push(`<text x="${X(v)}" y="${H - 6}" fill="${P.text}" font-size="9" text-anchor="middle">${n(v, 2)}${i === 4 ? ' m' : ''}</text>`);
  }
  for (const s of series) {
    const d = idx.map((i, k) => `${k ? 'L' : 'M'}${X(x[i]).toFixed(1)} ${Y(s.y[i]).toFixed(1)}`).join(' ');
    out.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.6" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} />`);
  }
  const legend = series.filter((s) => s.label).map((s, i) =>
    `<g transform="translate(${Lm + i * 140} 25)"><line x1="0" y1="0" x2="14" y2="0" stroke="${s.color}" stroke-width="1.6" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/><text x="18" y="3" fill="${P.text}" font-size="9">${s.label}</text></g>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${title}" font-family="ui-sans-serif, system-ui, sans-serif">${out.join('')}${legend}</svg>`;
}

const SCREEN = { existing: '#60a5fa', fresh: '#fb923c', q: '#60a5fa', anchor: '#e879f9', inf: '#94a3b8' };

/** Plottene langs z: kraft i delene, og q. */
export function linePlots(lr, palette, colors = SCREEN) {
  const r = lr.res;
  const x = r.ser.z.map((z) => z / 1000);
  const kN = (a) => a.map((v) => v / 1000);
  const forces = plotSvg({
    title: 'Kraft i delene langs z',
    unit: 'kN',
    x,
    palette,
    series: [
      { y: kN(r.u.N1), color: colors.existing, label: 'N₁ eksisterende (K_u)' },
      { y: kN(r.ser.N2), color: colors.fresh, label: 'N₂ ny (K_ser)' },
      { y: kN(r.ser.Ninf), color: colors.inf, dash: '3 3', label: 'N₂∞ full samvirkning' },
    ],
  });
  const flow = plotSvg({
    title: `Kraft gjennom skjøten q${lr.share < 1 ? ' (per skjøt)' : ''}`,
    unit: 'kN/m',
    x,
    palette,
    series: [
      { y: r.ser.q.map((v) => v * lr.share), color: colors.anchor, label: 'K_ser' },
      { y: r.u.q.map((v) => v * lr.share), color: colors.anchor, dash: '4 3', label: 'K_u = ⅔·K_ser' },
    ],
  });
  return { forces, flow };
}

/** Rader i resultattabellen: [etikett, K_ser, K_u, hvilken som styrer, tooltip]. */
export function lineRows(lr) {
  const s = lr.summary;
  const rows = [
    [`q_max [kN/m]<br><span class="opacity-70">z = ${n(s.qMax.z, 2)} m</span>`, n(Math.abs(s.qMax.ser), 1), n(Math.abs(s.qMax.u), 1), 'ser', 'Største kraft gjennom skjøten per meter. Stivere skjøt gir høyere topp, så K_ser styrer.'],
    [`Ytterste skrue F_v [kN]<br><span class="opacity-70">${s.rows} rad${s.rows === 1 ? '' : 'er'}, a = ${n(s.a, 0)} mm</span>`, n(s.Fv.ser, 2), n(s.Fv.u, 2), 'ser', 'q_max·a/rader — skjær i den mest belastede skruen. Til kontroll i EC5-knutepunkt.'],
  ];
  if (s.Fax != null) rows.push(['Ytterste skrue F_ax [kN] (fra q_T)', n(s.Fax, 2), n(s.Fax, 2), null, 'q_T·a/rader — uttrekk når skruen står vinkelrett på skjøteflaten. Kombineres med F_v i EC5 8.7.3.']);
  if (s.N2a) rows.push(['N₂ inn i knutepunktet ved z_a [kN]', n(s.N2a.ser, 1), n(s.N2a.u, 1), 'ser', 'Festet ende: kraften i den nye delen går gjennom knutepunktsforbindelsen, ikke gjennom skruene.']);
  if (s.N2b) rows.push(['N₂ inn i knutepunktet ved z_b [kN]', n(s.N2b.ser, 1), n(s.N2b.u, 1), 'ser', 'Festet ende: kraften i den nye delen går gjennom knutepunktsforbindelsen, ikke gjennom skruene.']);
  rows.push([`N₁ maks, eksisterende [kN]<br><span class="opacity-70">z = ${n(s.N1max.z, 2)} m</span>`, n(s.N1max.ser, 1), n(s.N1max.u, 1), 'u', 'Kraften som blir igjen i den eksisterende delen. Mykere skjøt gir mer, så K_u styrer.']);
  rows.push(['η = N₂ / N₂∞', s.eta.ser == null ? '–' : n(s.eta.ser, 3), s.eta.u == null ? '–' : n(s.eta.u, 3), 'u', 'Hvor mye av andelen ved full samvirkning den nye delen faktisk får, der den er størst.']);
  rows.push(['Karakteristisk lengde 1/λ [mm]', n(s.Lc.ser, 0), n(s.Lc.u, 0), null, 'Kraften bygges 63 % opp over 1/λ og 95 % over 3/λ.']);
  return rows;
}

/* ------------------------------------------------------------------ *
 * Skruekraften langs skjøten
 * ------------------------------------------------------------------ */

/** Lineær interpolasjon i (xs, ys) ved x. */
function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + (ys[hi] - ys[lo]) * t;
}

/** Feltgrensene: endene og hoppene i diagrammet [mm]. */
function featureZ(lr) {
  const za = lr.za * 1000;
  const zb = lr.zb * 1000;
  const jumps = (lr.table.jumps || []).map((z) => z * 1000).filter((z) => z > za && z < zb);
  return [...new Set([za, ...jumps, zb])].sort((a, b) => a - b);
}

/**
 * Største |q| og kraft per skrue i hvert felt mellom to knutepunkt i
 * lastdiagrammet (eller endene). Det er tallene man trenger for å velge
 * skrueavstand felt for felt: toppene sitter i endene og ved hoppene.
 * @returns {Array<{z0:number, z1:number, qSer:number, qU:number, zAt:number, FvSer:number, FvU:number}>}  z i m, q i kN/m, F i kN
 */
export function lineZones(lr) {
  if (!lr || !lr.ok) return [];
  const f = featureZ(lr);
  const s = lr.summary;
  const per = (q) => (Math.abs(q) * lr.share * s.a) / s.rows / 1000;
  const peak = (run, z0, z1) => {
    let best = 0;
    let at = z0;
    for (let i = 0; i < run.z.length; i++) {
      const z = run.z[i];
      if (z < z0 - 1e-9 || z > z1 + 1e-9) continue;
      if (Math.abs(run.q[i]) > Math.abs(best)) { best = run.q[i]; at = z; }
    }
    return { q: Math.abs(best) * lr.share, at };
  };
  const out = [];
  for (let i = 0; i < f.length - 1; i++) {
    const ser = peak(lr.res.ser, f[i], f[i + 1]);
    const u = peak(lr.res.u, f[i], f[i + 1]);
    out.push({ z0: f[i] / 1000, z1: f[i + 1] / 1000, qSer: ser.q, qU: u.q, zAt: ser.at / 1000, FvSer: per(ser.q / lr.share), FvU: per(u.q / lr.share) });
  }
  return out;
}

/**
 * q(z) og kreftene langs hele delen som tabulatorseparert tekst, til Excel
 * eller videre beregning. Jevn deling (standard 0,05 m) pluss endene og
 * hoppene, så toppene alltid er med. |q| og kraft per skrue er størrelser
 * (retningen skifter langs delen); N₁ og N₂ har fortegn (strekk positiv).
 */
export function qTableTsv(lr, step = 0.05) {
  if (!lr || !lr.ok) return '';
  const s = lr.summary;
  const zs = new Set();
  for (let z = lr.za; z < lr.zb - 1e-9; z += step) zs.add(Math.round(z * 1e6) / 1e6);
  for (const zMm of featureZ(lr)) zs.add(Math.round(zMm) / 1000);
  zs.add(lr.zb);
  const sorted = [...zs].sort((a, b) => a - b);
  const r = lr.res;
  const fmt = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '');
  const lines = [
    `z [m]\t|q| K_ser [kN/m]\t|q| K_u [kN/m]\tF_v per skrue K_ser [kN]\tN1 eksisterende K_u [kN]\tN2 ny K_ser [kN]`,
  ];
  for (const z of sorted) {
    const zm = z * 1000;
    const qs = Math.abs(interp(r.ser.z, r.ser.q, zm)) * lr.share;
    const qu = Math.abs(interp(r.u.z, r.u.q, zm)) * lr.share;
    const Fv = (qs * s.a) / s.rows / 1000;
    const N1 = interp(r.u.z, r.u.N1, zm) / 1000;
    const N2 = interp(r.ser.z, r.ser.N2, zm) / 1000;
    lines.push([fmt(z, 3), fmt(qs, 2), fmt(qu, 2), fmt(Fv, 3), fmt(N1, 2), fmt(N2, 2)].join('\t'));
  }
  return lines.join('\n');
}

/** Felttabellen som HTML (panel og rapport bruker samme rader). */
export function lineZonesTable(lr, { screen = true } = {}) {
  const zones = lineZones(lr);
  if (!zones.length) return '';
  const cls = screen ? 'py-0.5 pl-2 text-right num' : 'num';
  const body = zones
    .map((z) => `<tr${screen ? ' class="border-t border-slate-700/60"' : ''}>
        <td${screen ? ' class="py-0.5 pr-2 num text-slate-300 whitespace-nowrap"' : ''}>${n(z.z0, 2)}–${n(z.z1, 2)}</td>
        <td class="${cls}">${n(z.qSer, 1)}</td>
        <td class="${cls}">${n(z.FvSer, 2)}</td>
        <td class="${cls}">${n(z.qU, 1)}</td>
        <td class="${cls}">${n(z.zAt, 2)}</td>
      </tr>`)
    .join('');
  const th = (t, tip = '') => `<th${screen ? ' class="text-right font-normal py-1 pl-2"' : ' class="num"'}${tip ? ` title="${escapeHtml(tip)}"` : ''}>${t}</th>`;
  return `<table class="${screen ? 'w-full text-[11px]' : ''}">
      <thead><tr${screen ? ' class="text-slate-500"' : ''}>
        <th${screen ? ' class="text-left font-normal py-1"' : ''}>Felt z [m]</th>
        ${th('|q| maks K_ser [kN/m]', 'Største kraft gjennom skjøten i feltet — styrende for skruene')}
        ${th(`F_v per skrue [kN]`, `|q|·a/rader med a = ${n(lr.summary.a, 0)} mm og ${lr.summary.rows} rad(er)`)}
        ${th('|q| maks K_u [kN/m]')}
        ${th('ved z [m]', 'Hvor i feltet toppen sitter (K_ser)')}
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

/** Høyre panel i linjemodus. */
export function lineOutputHtml(lr) {
  if (!lr.ok) {
    return `<div class="space-y-1">${lr.blocked
      .map((b) => `<div class="flex gap-1.5 text-[11px] text-slate-300 leading-snug"><span class="text-sky-400 shrink-0">→</span><span>${b}</span></div>`)
      .join('')}</div>`;
  }
  const warns = lr.warnings.length
    ? `<div class="space-y-1 mb-2">${lr.warnings
        .map((w) => `<div class="flex items-start gap-1.5 text-[11px] text-amber-200 leading-snug" title="${escapeHtml(w.text)}"><span class="shrink-0">⚠</span><span>${w.short}</span></div>`)
        .join('')}</div>`
    : '';
  const body = lineRows(lr)
    .map(([label, ser, u, gov, tip]) => `<tr class="border-t border-slate-700/60" title="${escapeHtml(tip)}">
        <td class="py-1 pr-2 text-slate-300 leading-tight">${label}</td>
        <td class="py-1 pl-2 text-right num ${gov === 'ser' ? 'text-white font-semibold' : 'text-slate-400'}">${ser}${gov === 'ser' ? ' ●' : ''}</td>
        <td class="py-1 pl-2 text-right num ${gov === 'u' ? 'text-white font-semibold' : 'text-slate-400'}">${u}${gov === 'u' ? ' ●' : ''}</td>
      </tr>`)
    .join('');
  const { forces, flow } = linePlots(lr);
  return `${warns}
    <p class="text-[11px] text-slate-400 mb-1 truncate">Skjøt: <span class="text-slate-200">${escapeHtml(lr.summary.joint)}</span></p>
    <table class="w-full text-[11px]">
      <thead><tr class="text-slate-500">
        <th class="text-left font-normal py-1"></th>
        <th class="text-right font-normal py-1 pl-2" title="Bruksgrensestivhet. Brukt i bruddgrense er den en øvre grense for toppkraften, ikke EC5-praksis.">K_ser</th>
        <th class="text-right font-normal py-1 pl-2" title="K_u = ⅔·K_ser, EC5 2.2.2(2).">K_u</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="text-[10px] text-slate-500 mt-1">● styrende · hold musa over en rad for forklaring · 1 N/mm = 1 kN/m</p>
    <div class="mt-3 space-y-2">${forces}${flow}</div>
    <details class="mt-2 rounded border border-slate-700 bg-slate-900/60" data-line-zones ${lr.zonesOpen ? 'open' : ''}>
      <summary class="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white flex items-center gap-1.5">
        <span class="chev text-slate-500" style="display:inline-block">›</span>
        Per felt mellom knutepunkt (${lineZones(lr).length})
      </summary>
      <div class="px-2.5 pb-2.5 pt-1">
        ${lineZonesTable(lr)}
        <p class="text-[10px] text-slate-500 mt-1">Toppene sitter i endene og ved hoppene. Bruk tabellen til å velge skrueavstand felt for felt — men merk at modellen regner med samme a langs hele delen.</p>
      </div>
    </details>`;
}

/** Detaljer i linjemodus: tallene bak λ og N₂∞, og forutsetningene. */
export function lineDetailsHtml(lr, unit) {
  if (!lr.ok) return '';
  const L = lr.layer;
  const u = lengthLabel(unit || 'mm');
  const row = (k, v) => `<div class="flex justify-between gap-2"><span class="text-slate-400">${k}</span><span class="num text-slate-200">${v}</span></div>`;
  const restr = (RESTRAINTS.find((r) => r.key === lr.line.restraint) || {}).label || '';
  return `<div class="space-y-0.5 text-[11px]">
      ${row('EA₁ eksisterende / EA₂ ny [N]', `${n(L.EA1, 0)} / ${n(L.EA2, 0)}`)}
      ${row('e = c₂ − c₁ (x, y) [mm]', `${n(L.e.x, 1)}, ${n(L.e.y, 1)}`)}
      ${row('Sideveis', escapeHtml(restr))}
      ${row('k = Σ rader·K_ser/a [N/mm²]', n(lr.kSer, 2))}
      ${row('λ (K_ser) [1/mm]', n(lr.res.ser.lambda, 6))}
      ${row('λ² = k·(1/EA₁ + 1/EA₂ + dᵀK₀⁻¹d)', n(lambda2(L, lr.kSer), 6))}
    </div>
    <ul class="list-disc list-inside space-y-1 text-[11px] text-slate-400 leading-snug mt-2">
      <li>N₂″ = λ²·(N₂ − N₂∞), N₂∞ = [N/EA₁ + dᵀK₀⁻¹(M − N·r₁) + ε_eks − ε_ny] / (λ²/k). Løst med endelige differanser; testet mot lukkede løsninger.</li>
      <li>Lineær elastisk, skruene smurt ut langs skjøten, felles krumning for delene. Eksentrisitet mellom profilene gir i tillegg bøyning og aksialkraft i skruene, som ikke er med.</li>
      <li>Langtid (k_def), fukt og midlertidig avstiving er ikke med utover fri tøyning per del. Kryp under N_før med k_def = 0,6 tilsvarer ε ≈ 0,6·N_før/EA₁.</li>
      <li>Geometri i ${u}; tabell og utstrekning i m.</li>
    </ul>`;
}
