/**
 * charts.js — moment–krumning og M–N-diagram, som SVG-strenger.
 *
 * Seks ting som er verdt å lese før noe endres her:
 *
 *  1. **FORTEGNSREGELEN er RÅ over hele fila, med ÉN bevisst unntatt funksjon
 *     (planens endringsrunde 4, §1 og §5):**
 *
 *       - `dom.n` og `dom.m` er RÅ — motorens eget fortegn, samme som EC2 6.1
 *         og `structuralcodes` bruker: sagging (trykk i overkant) er NEGATIV,
 *         hogging er POSITIV. Se `combinations[i].M_Ed` for samme regel.
 *       - `momentCurvatureSvg` er UNNTAKET: `mc.kappa`/`mc.moment` vises som
 *         STØRRELSER, fordi M–κ bare har én gren og fortegnet der bare er
 *         konvensjon, ikke informasjon (§5.1). Det er den ENESTE `abs`-bruken
 *         i denne fila — se kommentaren i selve funksjonen for hvorfor.
 *
 *     Med rå `m` er hele `nm_domain`-randen én ekte lukket sløyfe rundt
 *     origo: feltkapasiteten i −M, støttekapasiteten i +M. Fortegnet på
 *     `M_Ed` er dermed ikke pynt — det er nøyaktig det som avgjør hvilken gren
 *     lasten prøves mot. **Ta aldri `Math.abs()` på `dom.m`, `dom.M_Ed`,
 *     `cb.M_Ed` eller argumentet `M_Ed` inn i `radialUtilisation`** — se
 *     punkt 5 for hva som skjer hvis man gjør det likevel.
 *
 *  2. **Enhetene konverteres HER.** Motoren snakker N og Nmm (§5.1 i den
 *     opprinnelige planen); aksene skal stå i kN og kNm. `radialUtilisation()`
 *     tar derimot `N_Ed`/`M_Ed` i kN/kNm, fordi den er en ren funksjon andre
 *     skal kunne kalle uten å kjenne payload-enhetene. Blandes disse to, er
 *     feilen en faktor 1000 og ser ut som en modellfeil.
 *
 *  3. **`radialUtilisation` velger MINSTE positive λ, aldri «første treff i
 *     arrayet».** Punktrekkefølgen følger EC2-feltene 1→6 og har ingen
 *     sammenheng med strålegeometri. Omhyllingen er dessuten ikke-konveks rundt
 *     balansepunktet, så én stråle kan krysse flere ganger. «Første treff»
 *     ville gitt et tilfeldig av dem.
 *
 *  4. **Radiell λ er et SEKUNDÆRT tall.** Hovedutnyttelsen er den vertikale,
 *     `M_Ed / M_Rd(N_Ed)`, og den regnes i motoren. Diagrammet merker derfor
 *     strålen som «lastvei» — samme snitt og last skal ikke kunne vise to
 *     ulike η i to faner.
 *
 *  5. **HVORFOR `dom.m` MÅ være rå — den dyrekjøpte lærdommen, gjenoppstått i
 *     endringsrunde 4.** `m` er det KOMPLETTE domenet: ~69 punkter som går
 *     hele veien rundt, gjennom BEGGE momentretninger. Blir `m` noensinne
 *     brettet sammen med `abs()` igjen — her eller i motoren — havner
 *     støttegrenen i det samme halvplanet som feltgrenen. For et enkeltarmert
 *     snitt er støttegrenen bitteliten, og «minste positive λ» plukker
 *     systematisk den brettede støttegrenen i stedet for feltgrenen lasten
 *     faktisk går mot: `radialUtilisation(DOM_BEAM, -500, -150)` skal gi
 *     η ≈ 0,41 mot feltgrenen; med `abs()` et sted i kjeden blir svaret
 *     i stedet η ≈ 3,7 mot en gren lasten aldri nærmer seg. Samme feil kan
 *     smyge seg inn via `report.js` sitt kall til `radialUtilisation` — se
 *     kommentaren der.
 *
 *     Det er også derfor testene her påstår at nettopp (−500 kN, −150 kNm)
 *     treffer feltgrenen (negativ M). Brettes `m` sammen igjen en gang i
 *     framtida, feiler den testen høylytt i stedet for å gi et plausibelt
 *     galt tall.
 *
 *  6. **Bare presentasjonsattributter** (§2.3 krav 4 i den opprinnelige
 *     planen), og samme «rapport-millimeter»-viewBox som `section-draw.js`:
 *     alle strekbredder og skriftstørrelser ganges med `u = width / 174`,
 *     slik at figuren ser lik ut på 174 mm papir og på 600 px skjerm.
 */

/* ------------------------------------------------------------------ *
 * Papir, tema og småting — holdt likt med section-draw.js
 * ------------------------------------------------------------------ */

const REPORT_WIDTH = 174;
const DEFAULT_HEIGHT = 110;

/** Marginer i rapport-mm. Venstremargen må romme en aksetekst på høykant. */
const PAD = Object.freeze({ left: 22, right: 10, top: 9, bottom: 17 });

const THEMES = Object.freeze({
  print: {
    bg: '#ffffff', axis: '#52525b', grid: '#e4e4e7', text: '#18181b',
    curve: '#1d4ed8', envelope: '#1d4ed8', load: '#b91c1c', ray: '#b91c1c',
    yield: '#047857', ed: '#b91c1c',
  },
  dark: {
    bg: '#0f172a', axis: '#94a3b8', grid: '#1e293b', text: '#e2e8f0',
    curve: '#60a5fa', envelope: '#60a5fa', load: '#f87171', ray: '#f87171',
    yield: '#34d399', ed: '#f87171',
  },
});

const FONT = 'Helvetica, Arial, sans-serif';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function r(v) {
  return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '0';
}

/** Engelsk desimalpunktum, som i rapporten ellers. */
function fmt(v, decimals = 1) {
  if (!Number.isFinite(v)) return '–';
  return v.toFixed(decimals);
}

function resolveOpts(opts = {}) {
  const width = Number.isFinite(opts.width) && opts.width > 0 ? opts.width : REPORT_WIDTH;
  const height = Number.isFinite(opts.height) && opts.height > 0 ? opts.height : DEFAULT_HEIGHT;
  const u = width / REPORT_WIDTH;
  return {
    width, u,
    unit: opts.unit === 'px' ? 'px' : 'mm',
    paperH: height * u,
    theme: opts.theme === 'dark' ? 'dark' : 'print',
  };
}

/**
 * «Pene» akseverdier. 1/2/5·10ⁿ, ~5 stykker. Uten dette får en akse fra 0 til
 * 364,25 merkelappene 0 / 72,85 / 145,7 …, som ingen leser av på en figur.
 */
function niceTicks(lo, hi, target = 5) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return [lo];
  const raw = (hi - lo) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) {
    out.push(Math.abs(t) < step * 1e-9 ? 0 : t);
  }
  return out;
}

/** Antall desimaler en akse trenger for at to nabomerkelapper skal bli ulike. */
function tickDecimals(step) {
  if (!Number.isFinite(step) || step <= 0) return 0;
  return Math.max(0, Math.min(3, Math.ceil(-Math.log10(step) + 0.2)));
}

/* ------------------------------------------------------------------ *
 * Felles rammeverk for begge plottene
 * ------------------------------------------------------------------ */

function frame(o) {
  const pad = {
    left: PAD.left * o.u, right: PAD.right * o.u,
    top: PAD.top * o.u, bottom: PAD.bottom * o.u,
  };
  const x0 = pad.left;
  const y0 = pad.top;
  const w = Math.max(1e-6, o.width - pad.left - pad.right);
  const h = Math.max(1e-6, o.paperH - pad.top - pad.bottom);
  return { x0, y0, w, h, x1: x0 + w, y1: y0 + h };
}

/**
 * Akser, rutenett og aksetekster. Returnerer SVG-en pluss `px`/`py` slik at
 * kallerne aldri trenger å regne på rammen selv.
 */
function axes(o, f, xLo, xHi, yLo, yHi, xTitle, yTitle) {
  const c = THEMES[o.theme];
  const sw = 0.25 * o.u;
  const fs = 2.2 * o.u;
  const px = (x) => f.x0 + ((x - xLo) / (xHi - xLo)) * f.w;
  const py = (y) => f.y1 - ((y - yLo) / (yHi - yLo)) * f.h;

  const xt = niceTicks(xLo, xHi);
  const yt = niceTicks(yLo, yHi);
  const xd = tickDecimals(xt.length > 1 ? xt[1] - xt[0] : 1);
  const yd = tickDecimals(yt.length > 1 ? yt[1] - yt[0] : 1);

  let g = `<g data-role="grid" stroke="${c.grid}" stroke-width="${r(sw)}">`;
  for (const t of xt) g += `<line x1="${r(px(t))}" y1="${r(f.y0)}" x2="${r(px(t))}" y2="${r(f.y1)}"/>`;
  for (const t of yt) g += `<line x1="${r(f.x0)}" y1="${r(py(t))}" x2="${r(f.x1)}" y2="${r(py(t))}"/>`;
  g += `</g>`;

  g += `<g data-role="axes" stroke="${c.axis}" stroke-width="${r(sw * 1.6)}" fill="none">`;
  g += `<rect x="${r(f.x0)}" y="${r(f.y0)}" width="${r(f.w)}" height="${r(f.h)}"/>`;
  // Nullinjene er egne streker: i M–N-diagrammet ligger n = 0 midt i ruta, og
  // uten den ser man ikke hvor strekk slutter og trykk begynner.
  if (yLo < 0 && yHi > 0) g += `<line x1="${r(f.x0)}" y1="${r(py(0))}" x2="${r(f.x1)}" y2="${r(py(0))}"/>`;
  if (xLo < 0 && xHi > 0) g += `<line x1="${r(px(0))}" y1="${r(f.y0)}" x2="${r(px(0))}" y2="${r(f.y1)}"/>`;
  g += `</g>`;

  g += `<g data-role="ticks" font-family="${FONT}" font-size="${r(fs)}" fill="${c.text}">`;
  for (const t of xt) {
    g += `<text x="${r(px(t))}" y="${r(f.y1 + 3.6 * o.u)}" text-anchor="middle">${esc(fmt(t, xd))}</text>`;
  }
  for (const t of yt) {
    g += `<text x="${r(f.x0 - 1.4 * o.u)}" y="${r(py(t) + fs * 0.35)}" text-anchor="end">${esc(fmt(t, yd))}</text>`;
  }
  g += `</g>`;

  g += `<text x="${r(f.x0 + f.w / 2)}" y="${r(f.y1 + 8.2 * o.u)}" text-anchor="middle" ` +
       `font-family="${FONT}" font-size="${r(fs * 1.1)}" fill="${c.text}">${esc(xTitle)}</text>`;
  const ly = f.y0 + f.h / 2;
  const lx = f.x0 - 15 * o.u;
  g += `<text x="${r(lx)}" y="${r(ly)}" text-anchor="middle" transform="rotate(-90 ${r(lx)} ${r(ly)})" ` +
       `font-family="${FONT}" font-size="${r(fs * 1.1)}" fill="${c.text}">${esc(yTitle)}</text>`;

  return { svg: g, px, py };
}

function wrap(o, body, label) {
  const c = THEMES[o.theme];
  const widthAttr = o.unit === 'px' ? `${r(o.width)}px` : `${r(o.width)}mm`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthAttr}" ` +
         `viewBox="0 0 ${r(o.width)} ${r(o.paperH)}" role="img" aria-label="${esc(label)}">` +
         `<rect x="0" y="0" width="${r(o.width)}" height="${r(o.paperH)}" fill="${c.bg}"/>` +
         body + `</svg>`;
}

/**
 * Lastpunktmarkør: sirkel pluss kryss. Sirkelen alene forsvinner i kurven.
 *
 * `filled` skiller GOVERNING kombinasjonen (fylt sirkel) fra de øvrige (§7:
 * `fill="none"`, samme strek). `role` setter `data-role`, slik at testene og
 * en eventuell rapportleser kan skille governing fra resten uten å telle piksler.
 */
/**
 * Usynlige treffflater for pekeren. `ui.js` leser `data-*` og viser en boble.
 *
 * HVORFOR EGNE SIRKLER OG IKKE MARKØRENE SELV
 * Kurvepunktene er 1,2–1,5 enheter store; et treffmål på den størrelsen er
 * uråd å treffe med mus. Disse er 3 enheter og `fill="transparent"`, som gir
 * treff uten å tegne noe. `stroke="none"` er ikke nok alene — et element uten
 * fyll får ikke pekerhendelser i sitt indre.
 *
 * De er harmløse på papir: gjennomsiktig fyll tegner ingenting, og
 * `print.css` skjuler dem uansett.
 */
function hitDots(items, o) {
  if (!items.length) return '';
  const rr = r(3 * o.u);
  return `<g data-role="hits" fill="transparent" stroke="none" pointer-events="all">`
    + items.map((it) => {
      const attrs = Object.entries(it.data)
        .map(([k, v]) => `data-${k}="${esc(String(v))}"`).join(' ');
      return `<circle cx="${r(it.px)}" cy="${r(it.py)}" r="${rr}" ${attrs}/>`;
    }).join('')
    + `</g>`;
}

function loadMarker(px, py, color, u, { filled = false, role = 'load-point' } = {}) {
  const a = 1.8 * u;
  return `<g data-role="${role}" stroke="${color}" stroke-width="${r(0.4 * u)}">` +
         `<circle cx="${r(px)}" cy="${r(py)}" r="${r(a)}" fill="${filled ? color : 'none'}"/>` +
         `<line x1="${r(px - a * 1.7)}" y1="${r(py)}" x2="${r(px + a * 1.7)}" y2="${r(py)}"/>` +
         `<line x1="${r(px)}" y1="${r(py - a * 1.7)}" x2="${r(px)}" y2="${r(py + a * 1.7)}"/>` +
         `</g>`;
}

/* ------------------------------------------------------------------ *
 * Moment–krumning
 * ------------------------------------------------------------------ */

/**
 * `momentCurvatureSvg(mc, opts) -> string`
 *
 * `mc` er `result.moment_curvature`. Motoren sender `kappa`/`moment` RÅ, i
 * motorens eget fortegn (sagging negativ, hogging positiv — punkt 1 i
 * hodekommentaren). **Denne funksjonen tar likevel `Math.abs()` på begge, med
 * vilje, og det er den ENESTE plassen i hele fila det skjer.**
 *
 * Hvorfor: M–κ har bare én gren — motsatt av `nm_domain`, som er en lukket
 * sløyfe med to grener og trenger fortegnet for å skille dem. Her finnes det
 * ingen andre gren å forveksle med, så fortegnet bærer ingen informasjon,
 * bare konvensjon. Å bygge en tredje kvadrant for å vise det rå fortegnet
 * ville bare flyttet halve kurven ut i et tomt hjørne uten å legge til noe en
 * leser trenger. Aksetitlene sier derfor uttrykkelig `|κ|`/`|M|`, og en linje
 * under figuren minner om at fortegnet likevel finnes i dataene.
 *
 * Krumningsaksen står i 10⁻⁶/mm. Rå 1/mm gir merkelapper som `0,0000407`, og
 * «1/km» — som er samme tall — er ikke en enhet noen leser av et betongsnitt.
 *
 * Figuren tegner selv BÅDE kurven, flytpunktet og M_Ed-linja. Å la rapporten
 * legge på M_Ed etterpå ville betydd to steder som må bli enige om samme
 * akseskalering.
 */
export function momentCurvatureSvg(mc, opts = {}) {
  const o = resolveOpts(opts);
  const c = THEMES[o.theme];
  const f = frame(o);

  // Den bevisste unntaks-`abs()`-en (se hodekommentaren over): M–κ har bare
  // én gren, og fortegnet på et rått datasett ville bare sendt kurven ut i
  // −κ/−M, utenfor akser som starter i 0, uten en eneste feilmelding.
  const kappa = (mc?.kappa || []).map((v) => Math.abs(Number(v))).filter(Number.isFinite);
  const moment = (mc?.moment || []).map((v) => Math.abs(Number(v))).filter(Number.isFinite);
  const n = Math.min(kappa.length, moment.length);

  const kx = kappa.slice(0, n).map((v) => v * 1e6);        // 1/mm -> 10^-6/mm
  const my = moment.slice(0, n).map((v) => v / 1e6);       // Nmm  -> kNm
  const mEd = Math.abs(Number(mc?.M_Ed) || 0) / 1e6;        // samme unntak

  const xHi = Math.max(...kx, 1e-9) * 1.05;
  const yHi = Math.max(...my, mEd, 1e-9) * 1.1;
  const ax = axes(o, f, 0, xHi, 0, yHi, '|κ| [10⁻⁶/mm]', '|M| [kNm]');

  let body = ax.svg;
  // Treffflatene samles her og legges SIST i figuren. Ligger de tidligere,
  // havner M_Ed-linja og markørene oppå dem, og da treffer pekeren en `<line>`
  // i stedet for punktet — målt i nettleseren, ikke antatt.
  let hits = '';

  if (n > 1) {
    const pts = kx.map((x, i) => `${r(ax.px(x))},${r(ax.py(my[i]))}`).join(' ');
    body += `<polyline data-role="curve" points="${pts}" fill="none" stroke="${c.curve}" ` +
            `stroke-width="${r(0.6 * o.u)}" stroke-linejoin="round"/>`;
    hits = hitDots(kx.map((x, i) => ({
      px: ax.px(x), py: ax.py(my[i]),
      data: { hit: 'mc', i, kappa: x, moment: my[i] },
    })), o);
  }

  // M_Ed-linja. Tegnes også når M_Ed = 0 ville vært meningsløst — da hoppes den
  // over, slik at en ren kapasitetskurve ikke får en falsk lastlinje på null.
  if (mEd > 0) {
    body += `<g data-role="med-line">` +
            `<line x1="${r(f.x0)}" y1="${r(ax.py(mEd))}" x2="${r(f.x1)}" y2="${r(ax.py(mEd))}" ` +
            `stroke="${c.ed}" stroke-width="${r(0.4 * o.u)}" ` +
            `stroke-dasharray="${r(3 * o.u)} ${r(1.6 * o.u)}"/>` +
            `<text x="${r(f.x1 - 1.5 * o.u)}" y="${r(ax.py(mEd) - 1.4 * o.u)}" text-anchor="end" ` +
            `font-family="${FONT}" font-size="${r(2.2 * o.u)}" fill="${c.ed}">` +
            `M_Ed = ${esc(fmt(mEd, 1))} kNm</text></g>`;
  }

  const yi = mc?.yield_index;
  if (Number.isInteger(yi) && yi >= 0 && yi < n) {
    body += `<g data-role="yield-point">` +
            `<circle cx="${r(ax.px(kx[yi]))}" cy="${r(ax.py(my[yi]))}" r="${r(1.5 * o.u)}" ` +
            `fill="${c.yield}"/>` +
            `<text x="${r(ax.px(kx[yi]) + 2.4 * o.u)}" y="${r(ax.py(my[yi]) + 3.2 * o.u)}" ` +
            `font-family="${FONT}" font-size="${r(2.2 * o.u)}" fill="${c.yield}">` +
            `yield: ${esc(fmt(my[yi], 1))} kNm</text></g>`;
  }

  if (mc?.truncated) {
    body += `<text data-role="truncated" x="${r(f.x0 + 1.5 * o.u)}" y="${r(f.y0 - 2 * o.u)}" ` +
            `font-family="${FONT}" font-size="${r(2.2 * o.u)}" fill="${c.ed}">` +
            `truncated: no convergence</text>`;
  }

  // Den lovede opplysningsplikten (§5.1): aksene viser størrelser, men dataene
  // bak er fortegnsatt. Tegnes alltid, uavhengig av datasettet, fordi den sier
  // noe om KONVENSJONEN, ikke om denne ene kurven.
  body += `<text data-role="caption" x="${r(f.x0)}" y="${r(o.paperH - 2 * o.u)}" ` +
          `font-family="${FONT}" font-size="${r(1.9 * o.u)}" fill="${c.axis}">` +
          `Magnitudes shown; sagging moment is negative.</text>`;

  return wrap(o, body + hits, 'Moment–curvature');
}

/* ------------------------------------------------------------------ *
 * Radiell utnyttelse
 * ------------------------------------------------------------------ */

const EPS = 1e-12;

/**
 * `radialUtilisation(dom, N_Ed, M_Ed) -> {eta, lambda, hitN, hitM}`
 *
 * `dom` er `result.nm_domain` i MOTORENS enheter (N og Nmm). `N_Ed` og `M_Ed`
 * er i **kN og kNm** — som `hitN` og `hitM`. Den asymmetrien er bevisst: dette
 * er den ene funksjonen her som skal kunne kalles av kode som ikke bryr seg om
 * payload-enhetene, og da er kN/kNm det eneste rimelige grensesnittet.
 *
 * λ er faktoren lastvektoren (N_Ed, M_Ed) må ganges med for å nå randen;
 * `eta = 1/λ`. Både `dom.m` og `M_Ed` er FORTEGNSATT (punkt 1 og 5 i
 * hodekommentaren), så randen er en ekte lukket sløyfe rundt origo: feltgrenen
 * i −M, støttegrenen i +M. **Fortegnet på `M_Ed` er ikke en detalj — det er
 * nøyaktig det som velger hvilken gren lasten prøves mot. Ikke ta `abs()`
 * verken på `dom.m` eller på `M_Ed`-argumentet her.**
 *
 * **Lukkekjeden langs M = 0 er en SIKRING mot gapet ved trykkenden, ikke
 * fasiten.** `n_min`/`n_max` er rene aksialkapasiteter og er IKKE punkter i
 * domenet: referansebjelken har `n_min = -4010,4 kN`, mens domenets ytterste
 * punkt ligger på `n = -3977,0 kN`. Randen lukkes derfor som en KJEDE:
 * ytterpunktet med minst `n` → `(N_min, 0)` → `(N_max, 0)` → ytterpunktet med
 * størst `n`. Uten den kunne en stråle for nesten ren trykklast smette gjennom
 * gapet, ikke finne noen kryssing, og gi `eta = 0` for en last som i
 * virkeligheten er nær kapasiteten.
 *
 * Men kjeden skal **aldri overstyre omhyllingen**, og det er en ekte felle her:
 * `n_min = -4010,4 kN` er aksialkapasiteten ved UNIFORM tøyning, og for et
 * enkeltarmert snitt bærer den et moment. Omhyllingen krysser `m = 0` allerede
 * ved `n = -3567,1 kN`. Returnerte `M_Ed = 0` bare `n_min` direkte, ville
 * svaret vært 12 % på USIKKER side. Aksialgrensa legges derfor inn som én
 * KANDIDAT blant kryssingene, og «minste positive λ» avgjør — som overalt
 * ellers i denne funksjonen.
 *
 * To ting som er lette å gjøre feil:
 *
 *  - **MINSTE positive λ.** Punktrekkefølgen følger EC2-feltene 1→6 og sier
 *    ingenting om hvor strålen treffer først. Omhyllingen er ikke-konveks rundt
 *    balansepunktet, så en stråle kan krysse flere ganger, og bare den nærmeste
 *    er kapasiteten.
 *
 *  - **Ren aksial last (`M_Ed = 0`).** Strålen blir kollineær med strekket
 *    langs M = 0, som derfor faller ut av determinanten av seg selv. Resten av
 *    randen skjæres helt vanlig, og aksialgrensa legges til som kandidat. Det
 *    gir ingen degenerert determinant, og `M_Ed = 0` og `M_Ed = 10⁻⁶` gir
 *    praktisk talt samme λ — noe en egen test påstår.
 */
export function radialUtilisation(dom, N_Ed, M_Ed) {
  const none = { eta: 0, lambda: Infinity, hitN: null, hitM: null };

  const nEd = Number(N_Ed) || 0;
  const mEd = Number(M_Ed) || 0;   // FORTEGNSATT — se hodekommentaren, ikke abs()
  // Lastpunktet i origo: ingen lastvei å følge, og ingen stråle å tegne.
  // MÅ sjekke |mEd|, ikke mEd: siden mEd nå kan være negativ (sagging), ville
  // `mEd < EPS` uten abs() gitt sant for ENHVER negativ last, uansett hvor
  // stor — en ny, stille feil av nøyaktig samme sort denne runden fjerner.
  if (Math.abs(nEd) < EPS && Math.abs(mEd) < EPS) return none;

  const nArr = Array.isArray(dom?.n) ? dom.n : [];
  const mArr = Array.isArray(dom?.m) ? dom.m : [];
  const count = Math.min(nArr.length, mArr.length);

  const nMin = Number.isFinite(Number(dom?.N_min)) ? Number(dom.N_min) / 1000 : null;
  const nMax = Number.isFinite(Number(dom?.N_max)) ? Number(dom.N_max) / 1000 : null;

  const pts = [];
  for (let i = 0; i < count; i++) {
    const n = Number(nArr[i]) / 1000;
    // FORTEGNSATT, rå — ingen abs her. Polariteten er snudd i forhold til den
    // forrige runden: feltgrenen ligger nå i −M, støttegrenen i +M (§1.1).
    const m = Number(mArr[i]) / 1e6;
    if (Number.isFinite(n) && Number.isFinite(m)) pts.push([n, m]);
  }
  if (pts.length < 2) return none;

  const segs = [];
  for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
  // Sløyfa lukkes bare hvis dataene ikke allerede gjør det selv.
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (Math.hypot(last[0] - first[0], last[1] - first[1]) > 1e-9) segs.push([last, first]);

  // Lukkekjeden. Ytterpunktene velges med LAVEST m blant dem som deler samme
  // ytterste n, slik at beinet ned til aksen blir kortest mulig og ikke skjærer
  // tvers gjennom domenet.
  //
  // FLAGGET, IKKE RETTET (planens §5.2-merknad): denne tiebreaken er
  // vilkårlig i fortegn — «lavest m» er ikke geometrisk motivert, bare en
  // konsekvent regel. Speiles `m` om (−m i stedet for m) en gang i framtida,
  // ville riktig tiebreak blitt «høyest m», og dagens fixturer ville IKKE
  // fanget det — de har ingen ytterpunkter som deler samme ytterste n. Så
  // lenge det er sant, er speilinvariansen her tilfeldig, ikke strukturell.
  if (nMin !== null && nMax !== null) {
    const extreme = (cmp) => pts.reduce((best, p) =>
      cmp(p[0], best[0]) || (p[0] === best[0] && p[1] < best[1]) ? p : best, pts[0]);
    const loEnd = extreme((a, b) => a < b);
    const hiEnd = extreme((a, b) => a > b);
    segs.push([loEnd, [nMin, 0]]);
    segs.push([[nMin, 0], [nMax, 0]]);
    segs.push([[nMax, 0], hiEnd]);
  }

  const dN = nEd;
  const dM = mEd;
  let best = Infinity;
  let hit = null;

  /** Én kandidat. Bare den minste positive λ overlever. */
  const consider = (lambda, n, m) => {
    if (!(lambda > EPS) || !Number.isFinite(lambda) || lambda >= best) return;
    best = lambda;
    hit = [n, m];
  };

  for (const [a, b] of segs) {
    const eN = b[0] - a[0];
    const eM = b[1] - a[1];
    const den = dM * eN - dN * eM;
    if (Math.abs(den) < 1e-15) continue;             // parallell eller degenerert
    const lambda = (eN * a[1] - eM * a[0]) / den;
    const t = (dN * a[1] - dM * a[0]) / den;
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    consider(lambda, a[0] + t * eN, a[1] + t * eM);
  }

  // Ren aksial last: strekket langs M = 0 er kollineært med strålen og faller
  // ut av determinanten over. Aksialgrensa legges inn som KANDIDAT, ikke som
  // svar — omhyllingen krysser gjerne M = 0 nærmere origo enn n_min gjør.
  if (Math.abs(mEd) < EPS) {     // samme rettelse som guarden i toppen av funksjonen
    const bound = nEd < 0 ? nMin : nMax;
    if (bound !== null && Math.abs(bound) > EPS) consider(bound / nEd, bound, 0);
  }

  if (!hit) return none;
  return { eta: 1 / best, lambda: best, hitN: hit[0], hitM: hit[1] };
}

/* ------------------------------------------------------------------ *
 * M–N-diagram
 * ------------------------------------------------------------------ */

/**
 * `nmDomainSvg(dom, opts) -> string`
 *
 * `dom` er `result.nm_domain`: `n` i N og `m` i Nmm, BEGGE rå og fortegnsatt
 * i motorens egen konvensjon (sagging negativ, hogging positiv — punkt 1 i
 * hodekommentaren). Aksene står i kNm (vannrett) og kN (loddrett), og
 * momentaksen spenner over begge fortegn: −M er feltgrenen, +M er
 * støttegrenen. Det er hele poenget med at omhyllingen er én sløyfe rundt
 * origo i stedet for to grener brettet oppå hverandre.
 *
 * **N vender oppover med sitt eget fortegn**, altså trykk NEDOVER, og aksen sier
 * det uttrykkelig. Mange lærebøker snur aksen så trykk peker opp; gjør man det
 * stille, leser en bruker av feil fortegn på `N_Ed` uten å ane det.
 *
 * Figuren tegner selv omhyllingen, lastpunktet OG strålen fra origo ut til
 * treffpunktet, med λ og η påskrevet. Strålen er merket «load path» fordi den
 * radielle utnyttelsen er sekundær — hovedtallet er den vertikale.
 *
 * **Endringsrunde 2, §7 — flere lastpunkter.** Finnes `dom.combinations` og er
 * ikke-tom, tegnes ETT punkt per kombinasjon med `within_limits: true`:
 * governing fylt og merket med navn/id, resten tomme sirkler uten etikett.
 * Strålen følger fortsatt bare governing — det er allerede sikret ved at
 * `dom.N_Ed`/`dom.M_Ed` på toppnivå speiler governing (motorens §4.3), så
 * `rad` under trenger ingen egen logikk for det.
 *
 * **Endringsrunde 4, §5.2 — `dom.domain_theta` og `cb.theta` er IKKE lenger
 * en del av denne funksjonen.** Den forrige runden holdt omhyllingen i den
 * ANALYSERTE retningen (`+M` alltid), og måtte derfor speile hver
 * kombinasjon som pekte motsatt vei (`cb.theta ≠ dom.domain_theta`) for å
 * havne i riktig halvplan. Nå som `dom.m` OG `cb.M_Ed` begge er rå i samme
 * konvensjon, er de allerede konsistente med hverandre — hver kombinasjon
 * plottes rett og slett på sin egen `Number(cb.M_Ed)`, uten sammenligning,
 * uten fallback til `abs()`. Et felt som `domain_theta` kan fortsatt finnes
 * i responsen (motoren sender den som en INFORMASJONSVERDI, ikke som noe
 * denne funksjonen trenger — se `engine.py`), men leses ikke her lenger.
 *
 * Mangler `dom.combinations` (eller er den tom), er dette en ren no-op: koden
 * faller tilbake til det ENE lastpunktet i `dom.N_Ed`/`dom.M_Ed`, nøyaktig som
 * før kombinasjoner fantes — nå RÅTT, av samme grunn som resten av fila.
 */
export function nmDomainSvg(dom, opts = {}) {
  const o = resolveOpts(opts);
  const c = THEMES[o.theme];
  const f = frame(o);

  const nArr = (dom?.n || []).map((v) => Number(v) / 1000);
  const mArr = (dom?.m || []).map((v) => Number(v) / 1e6);      // FORTEGNSATT, rå
  const count = Math.min(nArr.length, mArr.length);
  const pts = [];
  for (let i = 0; i < count; i++) {
    if (Number.isFinite(nArr[i]) && Number.isFinite(mArr[i])) pts.push([nArr[i], mArr[i]]);
  }

  const nEd = (Number(dom?.N_Ed) || 0) / 1000;
  const mEd = Number(dom?.M_Ed) / 1e6 || 0;   // RÅTT — ingen abs (§5.2)
  const rad = radialUtilisation(dom, nEd, mEd);

  // §7: samme /1000 og /1e6 som over. `within_limits` filtreres her, ikke i
  // motoren — motoren sender dem alle, figuren velger hvem som får et punkt.
  const comboPoints = (Array.isArray(dom?.combinations) ? dom.combinations : [])
    .filter((cb) => cb && cb.within_limits === true)
    .map((cb) => ({
      n: (Number(cb.N_Ed) || 0) / 1000,
      // RÅTT (§5.2): `cb.M_Ed` er i samme fortegnskonvensjon som `dom.m`,
      // så punktet plottes direkte — ingen sammenligning mot en
      // omhyllingsretning, ingen `abs()`-reserve. Se hodekommentaren.
      m: (Number(cb.M_Ed) || 0) / 1e6,
      governing: cb.id === dom?.governing,
      label: cb.name || cb.id,
    }));

  const nVals = pts.map((p) => p[0]).concat([nEd, 0]);
  const mVals = pts.map((p) => p[1]).concat([mEd, 0]);
  if (rad.hitN !== null) { nVals.push(rad.hitN); mVals.push(rad.hitM); }
  // §7: ALLE kombinasjonspunktene inn i autoskaleringen, med det FORTEGNSATTE
  // `p.m` — ellers strekker ikke aksen seg til en hogging-kombinasjon på −M,
  // og en kombinasjon utenfor omhyllingen kan havne off-canvas uten varsel.
  for (const p of comboPoints) { nVals.push(p.n); mVals.push(p.m); }

  const nLo = Math.min(...nVals);
  const nHi = Math.max(...nVals);
  // Momentaksen må dekke BEGGE fortegn: støttegrenen ligger i −M, og en akse
  // som starter i 0 ville klippet bort halve omhyllingen uten å si fra.
  const mLo = Math.min(...mVals);
  const mHi = Math.max(...mVals);
  const nPad = (nHi - nLo) * 0.06 || 1;
  const mPad = (mHi - mLo) * 0.06 || 1;
  const ax = axes(o, f, mLo - mPad, mHi + mPad, nLo - nPad, nHi + nPad,
    'M [kNm]', 'N [kN]  (compression negative)');

  let body = ax.svg;
  // Som i M–κ: treffflatene sist, ellers ligger markørenes kryss og strålen
  // oppå dem og stjeler pekeren.
  let hits = '';

  if (pts.length > 1) {
    const poly = pts.map((p) => `${r(ax.px(p[1]))},${r(ax.py(p[0]))}`).join(' ');
    body += `<polyline data-role="envelope" points="${poly}" fill="none" ` +
            `stroke="${c.envelope}" stroke-width="${r(0.6 * o.u)}" stroke-linejoin="round"/>`;
    // EC2-feltnummeret følger med når motoren har det: det er den ene opplysningen
    // som forklarer HVORFOR omhyllingen skifter form akkurat der.
    const fields = Array.isArray(dom?.field_num) ? dom.field_num : [];
    hits += hitDots(pts.map((pt, i) => ({
      px: ax.px(pt[1]), py: ax.py(pt[0]),
      data: {
        hit: 'env', i, n: pt[0], m: pt[1],
        ...(fields[i] === undefined ? {} : { field: fields[i] }),
      },
    })), o);
  }

  if (rad.hitN !== null) {
    body += `<g data-role="ray">` +
            `<line x1="${r(ax.px(0))}" y1="${r(ax.py(0))}" ` +
            `x2="${r(ax.px(rad.hitM))}" y2="${r(ax.py(rad.hitN))}" ` +
            `stroke="${c.ray}" stroke-width="${r(0.35 * o.u)}" ` +
            `stroke-dasharray="${r(2.4 * o.u)} ${r(1.6 * o.u)}"/>` +
            `<circle data-role="ray-hit" cx="${r(ax.px(rad.hitM))}" cy="${r(ax.py(rad.hitN))}" ` +
            `r="${r(1.2 * o.u)}" fill="${c.ray}"/></g>`;
    body += `<text data-role="ray-label" x="${r(f.x0 + 1.8 * o.u)}" y="${r(f.y0 - 2.2 * o.u)}" ` +
            `font-family="${FONT}" font-size="${r(2.2 * o.u)}" fill="${c.ray}">` +
            // NAVNENE ER BRUKERVENDTE, IKKE FELTNAVNENE. Internt i denne fila er
            // `rad.lambda` faktoren som skalerer lasten ut til omhyllingen (>1 =
            // reserve) og `rad.eta` den radielle utnyttelsen 1/λ. Utad heter den
            // radielle utnyttelsen λ (`RADIAL_UTILISATION_LABEL`), mens η ALLTID
            // er den vertikale M_Ed/M_Rd(N_Ed) i resultatboksen. Skrev figuren
            // «λ = 1,24, η = 0,81» sto det to ulike betydninger av begge symbolene
            // innenfor samme skjermbilde — bildeteksten under figuren sa samtidig
            // «λ = 0,81» og resultatboksen «η = 0,78».
            `load path (secondary): λ = ${esc(fmt(rad.eta, 2))} ` +
            `(boundary at ×${esc(fmt(rad.lambda, 2))})</text>`;
  }

  if (comboPoints.length) {
    hits += hitDots(comboPoints.map((p) => ({
      px: ax.px(p.m), py: ax.py(p.n),
      data: {
        hit: 'load', combo: p.label, n: p.n, m: p.m,
        governing: p.governing ? '1' : '0',
      },
    })), o);
    for (const p of comboPoints) {
      if (p.governing) {
        body += loadMarker(ax.px(p.m), ax.py(p.n), c.load, o.u,
          { filled: true, role: 'load-point-governing' });
        body += `<text x="${r(ax.px(p.m) + 3.4 * o.u)}" y="${r(ax.py(p.n) + 0.8 * o.u)}" ` +
                `font-family="${FONT}" font-size="${r(2.2 * o.u)}" fill="${c.load}">` +
                `${esc(p.label)}</text>`;
      } else {
        body += loadMarker(ax.px(p.m), ax.py(p.n), c.load, o.u,
          { filled: false, role: 'load-point' });
      }
    }
  } else if (Math.abs(nEd) > EPS || Math.abs(mEd) > EPS) {
    // Reserve (§7): ingen `dom.combinations` — oppfør deg nøyaktig som før.
    // `Math.abs(mEd)`, ikke `mEd`: siden `mEd` nå er rått og kan være
    // negativt (sagging), ville `mEd > EPS` uten abs() aldri vist et rent
    // sagging-lastpunkt (`N_Ed = 0, M_Ed < 0`) — samme feilklasse som guardene
    // i `radialUtilisation`.
    body += loadMarker(ax.px(mEd), ax.py(nEd), c.load, o.u, { filled: false, role: 'load-point' });
    body += `<text x="${r(ax.px(mEd) + 3.4 * o.u)}" y="${r(ax.py(nEd) + 0.8 * o.u)}" ` +
            `font-family="${FONT}" font-size="${r(2.2 * o.u)}" fill="${c.load}">` +
            `(${esc(fmt(mEd, 1))} kNm; ${esc(fmt(nEd, 1))} kN)</text>`;
  }

  return wrap(o, body + hits, 'N–M interaction domain');
}
