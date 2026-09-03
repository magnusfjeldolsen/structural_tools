/**
 * reinforcement.js — mekanikken bak forsterkningsverktøyet.
 *
 * Rene funksjoner. Ingen DOM, ingen store, ingen three.js. Modulen tar imot
 * ferdig utregnede arealegenskaper fra `geometry.js` og leverer tall.
 *
 * ------------------------------------------------------------------
 * KOORDINATSYSTEM (samme som geometry.js — ikke avvik fra det)
 * ------------------------------------------------------------------
 *   x mot høyre, y opp, tverrsnittet ligger i XY-planet.
 *   Bjelkeaksen er ut av planet (z). Skjærstrømmen løper langs den.
 *
 *   Sx  = ∫ y dA   (1. arealmoment om x-aksen, om GLOBALT origo)
 *   Ix0 = ∫ y² dA  (om globalt origo)
 *
 *   `V_y` er tverrkraft i y-retning og hører sammen med `Sx`/`Ix`.
 *   `V_x` er tverrkraft i x-retning og hører sammen med `Sy`/`Iy`.
 *
 * ------------------------------------------------------------------
 * ENHETER — les dette før du kaller noe
 * ------------------------------------------------------------------
 * Alt inne i denne modulen regnes i **N og mm**:
 *   E [N/mm²]   A [mm²]   EA [N]   EI [Nmm²]   ES* [Nmm]
 *   V, N, P [N]   M [Nmm]   L, b [mm]   q [N/mm]   τ [N/mm²]
 *
 * De to eneste stedene kN slipper inn er:
 *   1. `connectorCheck`, fordi `connector.FRd` er lagret i kN (§3 i planen).
 *      Konverteringen skjer på ÉN linje der, og er merket.
 *   2. Hjelperne `kNtoN`, `kNmToNmm` nederst, som UI-laget skal bruke på
 *      `loads` ({V, N, M} i kN/kNm) FØR det kaller noe annet her.
 * Ingen annen funksjon i fila tar imot kN.
 */

/** Numerisk nulltoleranse. Samme størrelsesorden som `EPS` i geometry.js. */
export const EPS = 1e-9;

/**
 * Relativ terskel for «EI_xy er merkbart forskjellig fra null» (§1.2 i
 * samvirkeplanen): |EI_xy| > 0,02·√(EI_x·EI_y).
 *
 * Hvorfor RELATIV og ikke absolutt: EI_xy er i Nmm² og kan være 1e10 for et
 * tverrsnitt som likevel er praktisk talt symmetrisk. √(EI_x·EI_y) er den
 * naturlige skalaen — Cauchy–Schwarz gir |EI_xy| ≤ √(EI_x·EI_y), så forholdet
 * ligger alltid i [0, 1] og 0,02 er dermed «2 % av det maksimalt mulige».
 */
export const SKEW_THRESHOLD = 0.02;

/* ------------------------------------------------------------------ *
 * Enhetshjelpere — den ene tydelige konverteringsplassen
 * ------------------------------------------------------------------ */

/** kN → N. @param {number} v @returns {number} */
export function kNtoN(v) {
  return v * 1000;
}

/** kNm → Nmm. @param {number} v @returns {number} */
export function kNmToNmm(v) {
  return v * 1e6;
}

/** N → kN, for visning. @param {number} v @returns {number} */
export function NtokN(v) {
  return v / 1000;
}

/* ------------------------------------------------------------------ *
 * B2.1 — E-vektede tverrsnittsdata
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} Props Arealegenskaper fra geometry.js, om globalt origo.
 * @property {number} A
 * @property {number} Sx
 * @property {number} Sy
 * @property {number} Ix0
 * @property {number} Iy0
 * @property {number} Ixy0
 */

/**
 * @typedef {Object} Part En del av tverrsnittet.
 * @property {string} [id]    Formens id, føres uendret gjennom til resultatet
 * @property {Props}  props   Fra `analyze().parts[i].props` / `multiProps(...)`
 * @property {number} E       Elastisitetsmodul [N/mm²]
 */

/**
 * @typedef {Object} SectionEA
 * @property {number} EA    Σ EᵢAᵢ [N]
 * @property {number} ESx   Σ EᵢSxᵢ om globalt origo [Nmm]
 * @property {number} ESy   Σ EᵢSyᵢ om globalt origo [Nmm]
 * @property {number} yc    E-vektet nøytralakse, y [mm]
 * @property {number} xc    E-vektet nøytralakse, x [mm]
 * @property {number} EIx   Σ EᵢIxᵢ om nøytralaksen [Nmm²]
 * @property {number} EIy   Σ EᵢIyᵢ om nøytralaksen [Nmm²]
 * @property {number} EIxy  Σ EᵢIxyᵢ om nøytralaksen [Nmm²]
 * @property {number} EIx0  Σ EᵢIx0ᵢ om globalt origo [Nmm²]
 * @property {number} EIy0  Σ EᵢIy0ᵢ om globalt origo [Nmm²]
 * @property {number} EIxy0 Σ EᵢIxy0ᵢ om globalt origo [Nmm²]
 * @property {boolean} valid Er EA ≠ 0, altså finnes det materiale her?
 * @property {number} count  Antall deler som faktisk bidro
 */

/**
 * E-vektede tverrsnittsdata for et sett former.
 *
 * UTLEDNING. Euler-Bernoulli forutsetter at tverrsnittet forblir plant, altså
 * at tøyningen er lineær: ε(y) = ε₀ + κ·(y − y_c). Spenningen er da
 * σᵢ(y) = Eᵢ·ε(y), og E varierer sprangvis mellom delene. Nøytralaksen er der
 * ren krumning ikke gir noen resultant aksialkraft:
 *
 *      ∫ σ dA = κ Σ Eᵢ ∫ (y − y_c) dA = κ (ΣEᵢSxᵢ − y_c ΣEᵢAᵢ) = 0
 *   ⟹ y_c = ESx / EA
 *
 * Dette er nøyaktig det samme som tyngdepunktet i det transformerte
 * tverrsnittet (bredder skalert med Eᵢ/E_ref) — E_ref forkorter bort.
 *
 * Bøyestivheten om denne aksen følger av Steiners sats, anvendt på hver del
 * samlet (integralene fra geometry.js er allerede om globalt origo):
 *
 *      EI_x = Σ Eᵢ ∫ (y − y_c)² dA
 *           = Σ Eᵢ Ix0ᵢ − 2 y_c Σ Eᵢ Sxᵢ + y_c² Σ Eᵢ Aᵢ
 *           = EIx0 − 2 y_c (EA·y_c) + y_c²·EA
 *           = EIx0 − EA·y_c²                              ← samme som §6
 *
 * Merk at vektfaktoren `factor` fra store.js IKKE skal inn her; den hører til
 * tyngdepunktsfanen. Overlapp/hull er allerede håndtert av `analyze()`, som er
 * grunnen til at vi tar imot ferdige `props` og ikke polygoner.
 *
 * @param {Part[]} parts
 * @returns {SectionEA}
 */
export function sectionEA(parts) {
  let EA = 0;
  let ESx = 0;
  let ESy = 0;
  let EIx0 = 0;
  let EIy0 = 0;
  let EIxy0 = 0;
  let count = 0;

  for (const part of parts || []) {
    const p = part && part.props;
    const E = part ? Number(part.E) : NaN;
    if (!p || !Number.isFinite(E)) continue;
    EA += E * p.A;
    ESx += E * p.Sx;
    ESy += E * p.Sy;
    EIx0 += E * p.Ix0;
    EIy0 += E * p.Iy0;
    EIxy0 += E * p.Ixy0;
    count++;
  }

  // Nøytralaksen er udefinert uten materiale. Vi returnerer 0 og `valid:false`
  // i stedet for NaN, slik at UI-et kan si fra i stedet for å vise «NaN mm».
  const valid = Math.abs(EA) > EPS;
  const yc = valid ? ESx / EA : 0;
  const xc = valid ? ESy / EA : 0;

  return {
    EA,
    ESx,
    ESy,
    yc,
    xc,
    EIx: EIx0 - EA * yc * yc,
    EIy: EIy0 - EA * xc * xc,
    EIxy: EIxy0 - EA * xc * yc,
    EIx0,
    EIy0,
    EIxy0,
    valid,
    count,
  };
}

/* ------------------------------------------------------------------ *
 * B2.2 — sammenligning eksisterende → sammensatt
 * ------------------------------------------------------------------ */

/** Godtar både en ferdig `SectionEA` og en `Part[]`, så C slipper å tenke på det. */
function asSection(input) {
  if (input && typeof input === 'object' && !Array.isArray(input) && 'EA' in input) {
    return /** @type {SectionEA} */ (input);
  }
  return sectionEA(/** @type {Part[]} */ (input) || []);
}

/** Forholdstall som ikke sprekker når nevneren er null. */
function ratio(after, before) {
  if (Math.abs(before) < EPS) return null;
  return after / before;
}

/**
 * @typedef {Object} StateComparison
 * @property {SectionEA} existingSection
 * @property {SectionEA} combinedSection
 * @property {number} EA0  EA for eksisterende tverrsnitt [N]
 * @property {number} EA1  EA for sammensatt tverrsnitt [N]
 * @property {number} EIx0 EIx for EKSISTERENDE tverrsnitt, om ITS EGEN nøytralakse [Nmm²]
 * @property {number} EIx1 EIx for sammensatt tverrsnitt, om den nye nøytralaksen [Nmm²]
 * @property {number} EIy0
 * @property {number} EIy1
 * @property {number} yc0  Nøytralakse før forsterkning [mm]
 * @property {number} yc1  Nøytralakse etter [mm]
 * @property {number} dEA
 * @property {number} dEIx
 * @property {number} dEIy
 * @property {number} dyc
 * @property {{EA: number|null, EIx: number|null, EIy: number|null}} ratios
 */

/**
 * Sammenligner tverrsnittet før og etter forsterkning.
 *
 * NAVNEADVARSEL: `EIx0`/`EIx1` her betyr «tilstand 0/1», altså eksisterende og
 * sammensatt — IKKE «om origo», slik `Ix0` gjør i geometry.js. Navnene er
 * bundet av §6 i planen; derfor står også `EIx0` fra `sectionEA` (som virkelig
 * er om origo) aldri i samme returobjekt som disse.
 *
 * Begge stivhetene regnes om SIN EGEN nøytralakse. Det er den fysisk riktige
 * sammenligningen: før forsterkningen bøyer den eksisterende delen seg om sin
 * egen akse, etterpå om den felles aksen.
 *
 * @param {{existing: Part[]|SectionEA, combined: Part[]|SectionEA}} arg
 * @returns {StateComparison}
 */
export function compareStates({ existing, combined }) {
  const s0 = asSection(existing);
  const s1 = asSection(combined);
  return {
    existingSection: s0,
    combinedSection: s1,
    EA0: s0.EA,
    EA1: s1.EA,
    EIx0: s0.EIx,
    EIx1: s1.EIx,
    EIy0: s0.EIy,
    EIy1: s1.EIy,
    yc0: s0.yc,
    yc1: s1.yc,
    dEA: s1.EA - s0.EA,
    dEIx: s1.EIx - s0.EIx,
    dEIy: s1.EIy - s0.EIy,
    dyc: s1.yc - s0.yc,
    ratios: {
      EA: ratio(s1.EA, s0.EA),
      EIx: ratio(s1.EIx, s0.EIx),
      EIy: ratio(s1.EIy, s0.EIy),
    },
  };
}

/* ------------------------------------------------------------------ *
 * B2.3 — fordeling av aksialkraft
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} AxialShare
 * @property {string|number} id
 * @property {number} EA_i   EᵢAᵢ [N]
 * @property {number} share  Andel av EA, 0–1 (dimensjonsløs)
 * @property {number} N_i    Aksialkraft i delen [N]
 */

/**
 * Fordeling av aksialkraft etter aksialstivhet.
 *
 * UTLEDNING. Ren aksialkraft uten bøyning gir konstant tøyning over hele
 * tverrsnittet, ε₀ = felles. Da er Nᵢ = ∫σᵢdA = Eᵢ Aᵢ ε₀, og likevekt gir
 * N = Σ Nⱼ = ε₀ Σ EⱼAⱼ. Elimineres ε₀:
 *
 *      N_i = N · (Eᵢ Aᵢ) / Σ (Eⱼ Aⱼ)
 *
 * Forutsetningen er at lasten allerede er innført i BEGGE delene, altså at
 * snittet ligger utenfor forankringssonen. Kraften som må gjennom fugen for å
 * få det til, er nettopp `ΔN` = summen av `N_i` for de nye delene.
 *
 * @param {{N: number, parts: Part[]}} arg  `N` i **N** (bruk `kNtoN` på UI-verdien)
 * @returns {{N: number, EA: number, shares: AxialShare[], valid: boolean}}
 */
export function axialSplit({ N, parts }) {
  const list = (parts || []).filter((p) => p && p.props && Number.isFinite(Number(p.E)));
  const EA = list.reduce((s, p) => s + p.E * p.props.A, 0);
  const valid = Math.abs(EA) > EPS;
  const shares = list.map((p, i) => {
    const EA_i = p.E * p.props.A;
    const share = valid ? EA_i / EA : 0;
    return {
      id: p.id !== undefined ? p.id : i,
      EA_i,
      share,
      N_i: share * N,
    };
  });
  return { N, EA, shares, valid };
}

/**
 * Summerer aksialkraften som havner i et utvalg deler — typisk de med
 * `stage: 'new'`. Det er denne `ΔN` som må leveres gjennom forbindelsen.
 *
 * @param {{N: number, parts: Part[], groupIds: Array<string|number>}} arg
 * @returns {{dN: number, EA_group: number, share: number, split: ReturnType<typeof axialSplit>}}
 */
export function axialTransfer({ N, parts, groupIds }) {
  const split = axialSplit({ N, parts });
  const want = new Set(groupIds || []);
  const picked = split.shares.filter((s) => want.has(s.id));
  return {
    dN: picked.reduce((s, p) => s + p.N_i, 0),
    EA_group: picked.reduce((s, p) => s + p.EA_i, 0),
    share: picked.reduce((s, p) => s + p.share, 0),
    split,
  };
}

/* ------------------------------------------------------------------ *
 * B2.4a — BIAKSIELL bøyning: fortegn, krumninger, N_G og skjærstrøm
 *
 * Dette er den generelle formen. Den gamle, enakslede veien (`shearFlow` med
 * `axis`) er beholdt som en tynn innpakning rundt den, men REGNER ikke lenger
 * selv — se begrunnelsen rett under.
 * ------------------------------------------------------------------ */

/**
 * FORTEGNS- OG LASTKONVENSJONER — les dette før du merker et inndatafelt.
 *
 * Koordinatsystemet er geometry.js sitt: x mot høyre, y opp, bjelkeaksen z ut
 * av tverrsnittsplanet. Alle stivheter under er om det E-VEKTEDE tyngdepunktet
 * (`sectionEA(...).xc/yc`):
 *
 *      EI_x  = ∫ E y² dA        EI_y  = ∫ E x² dA        EI_xy = ∫ E x y dA
 *
 * Momentene er definert som RENE INTEGRALER av spenningen — samme fortegn som
 * arealmomentene, slik at ligningene under blir symmetriske og uten
 * minustegn å miste:
 *
 *      M_x = ∫ σ y dA      (positiv M_x gir strekk for y > y_c)
 *      M_y = ∫ σ x dA      (positiv M_y gir strekk for x > x_c)
 *
 * Tverrkreftene er de tilhørende deriverte langs bjelkeaksen:
 *
 *      V_y = dM_x/dz       ← V_y hører sammen med M_x  (og med ES*_x, EI_x)
 *      V_x = dM_y/dz       ← V_x hører sammen med M_y  (og med ES*_y, EI_y)
 *
 * Dette er den ENESTE parringen som gjør q = dN_G/dz riktig, og den er lett å
 * bytte om: `V_y` er den LODDRETTE tverrkraften, og den hører til det momentet
 * som bøyer bjelken i det loddrette planet (`M_x`). Bølge B må merke feltene
 * slik.
 *
 * MERK at dette IKKE er den vanlige bjelkekonvensjonen der M_y defineres med
 * motsatt fortegn (M_y = −∫σx dA). Konsekvensen er bare et fortegnsbytte på
 * `M_y`/`V_x` ved innlesing; `|q|` — som er det kapasitetskontrollen bruker —
 * er upåvirket.
 *
 * ------------------------------------------------------------------
 * UTLEDNING (kontrollert, ikke kopiert)
 * ------------------------------------------------------------------
 * Plane tverrsnitt, ren bøyning om tyngdepunktet ⟹ tøyningen er lineær og
 * uten konstantledd:
 *
 *      ε(x,y) = κ_x·y + κ_y·x ,      σ = E·ε
 *
 * Settes dette inn i definisjonene av M_x og M_y:
 *
 *      M_x = κ_x·EI_x  + κ_y·EI_xy
 *      M_y = κ_x·EI_xy + κ_y·EI_y
 *
 * altså [M_x; M_y] = [[EI_x, EI_xy],[EI_xy, EI_y]]·[κ_x; κ_y]. Matrisen er
 * symmetrisk; determinanten er
 *
 *      D = EI_x·EI_y − EI_xy²
 *
 * og inversen gir
 *
 *      κ_x = (M_x·EI_y − M_y·EI_xy)/D
 *      κ_y = (M_y·EI_x − M_x·EI_xy)/D
 *
 * D > 0 for ethvert fysisk tverrsnitt: Cauchy–Schwarz på indreproduktet
 * ⟨f,g⟩ = ∫E f g dA gir (∫E xy dA)² ≤ ∫E x² dA · ∫E y² dA, med likhet BARE
 * hvis x og y er lineært avhengige over tverrsnittet — altså hvis alt
 * materialet ligger på én rett linje gjennom tyngdepunktet. Da er
 * tverrsnittet degenerert, og vi svarer `valid: false` i stedet for å dele på
 * (nesten) null.
 *
 * Aksialkraften i en gruppe G (materialet på den ene siden av en skjøt):
 *
 *      N_G = ∫_G σ dA = κ_x·ES*_x + κ_y·ES*_y
 *      ES*_x = ∫_G E (y − y_c) dA ,   ES*_y = ∫_G E (x − x_c) dA
 *
 * Skjærstrømmen følger av q = dN_G/dz med dM_x/dz = V_y og dM_y/dz = V_x
 * (ES*_x og ES*_y er rene tverrsnittsstørrelser og deriveres ikke):
 *
 *      q = [(V_y·EI_y − V_x·EI_xy)·ES*_x + (V_x·EI_x − V_y·EI_xy)·ES*_y] / D
 *
 * KONTROLL, og grunnen til at den gamle veien måtte skrives om: er EI_xy = 0
 * blir D = EI_x·EI_y og uttrykket faller sammen til
 *
 *      q = V_y·ES*_x/EI_x + V_x·ES*_y/EI_y
 *
 * — nøyaktig de to uavhengige leddene den gamle koden brukte. Den gamle
 * formen var altså BARE gyldig for EI_xy = 0. Og det er nettopp EI_xy ≠ 0
 * §1 i planen skal advare om: uten denne omskrivingen ville verktøyet advart
 * om skjev bøyning og samtidig regnet som om den ikke fantes.
 */

/**
 * @typedef {Object} StiffnessMatrix
 * @property {number} EIx
 * @property {number} EIy
 * @property {number} EIxy
 * @property {number} D      EI_x·EI_y − EI_xy² [N²mm⁴]
 * @property {boolean} valid D > 0 med god margin (ikke-degenerert tverrsnitt)
 */

/**
 * Bøyestivhetsmatrisen og determinanten for et tverrsnitt.
 *
 * `valid` bruker en RELATIV terskel (D > 1e-12·EI_x·EI_y), ikke en absolutt:
 * EI-ene er i Nmm² og kan være 1e12, så en absolutt EPS ville aldri slått til.
 *
 * @param {SectionEA|Part[]} section
 * @returns {StiffnessMatrix}
 */
export function stiffnessMatrix(section) {
  const s = asSection(section);
  const D = s.EIx * s.EIy - s.EIxy * s.EIxy;
  const scale = s.EIx * s.EIy;
  const valid = Number.isFinite(D) && D > 0 && scale > 0 && D > 1e-12 * scale;
  return { EIx: s.EIx, EIy: s.EIy, EIxy: s.EIxy, D, valid };
}

/**
 * Krumningene for et gitt momentpar. Se utledningen over.
 *
 * @param {{section: SectionEA|Part[], Mx?: number, My?: number}} arg  `Mx`,`My` i **Nmm**
 * @returns {{kx: number, ky: number, D: number, EIx: number, EIy: number, EIxy: number, valid: boolean}}
 *   `kx`,`ky` er krumninger [1/mm]
 */
export function curvatures({ section, Mx = 0, My = 0 }) {
  const m = stiffnessMatrix(section);
  if (!m.valid) return { kx: 0, ky: 0, D: m.D, EIx: m.EIx, EIy: m.EIy, EIxy: m.EIxy, valid: false };
  return {
    kx: (Mx * m.EIy - My * m.EIxy) / m.D,
    ky: (My * m.EIx - Mx * m.EIxy) / m.D,
    D: m.D,
    EIx: m.EIx,
    EIy: m.EIy,
    EIxy: m.EIxy,
    valid: true,
  };
}

/**
 * Gruppas 1. arealmomenter om det SAMMENSATTE tverrsnittets tyngdepunkt:
 *
 *      ES*_x = Σ_G Eᵢ Aᵢ (yᵢ − y_c) = Σ_G Eᵢ Sxᵢ − y_c · Σ_G Eᵢ Aᵢ
 *      ES*_y = Σ_G Eᵢ Aᵢ (xᵢ − x_c) = Σ_G Eᵢ Syᵢ − x_c · Σ_G Eᵢ Aᵢ
 *
 * Skrevet slik fordi `props` allerede er integrert om globalt origo — vi
 * slipper å kjenne hver dels eget tyngdepunkt.
 *
 * @param {Part[]} groupParts
 * @param {SectionEA|Part[]} section  HELE det sammensatte tverrsnittet
 * @returns {{ESx: number, ESy: number, EA: number, count: number}}
 */
export function groupFirstMoments(groupParts, section) {
  const sec = asSection(section);
  const grp = sectionEA(groupParts || []);
  return {
    ESx: grp.ESx - sec.yc * grp.EA,
    ESy: grp.ESy - sec.xc * grp.EA,
    EA: grp.EA,
    count: grp.count,
  };
}

/**
 * Aksialkraften i en gruppe fra biaksiell bøyning — `N_G` i §8.2.
 *
 *      N_G = κ_x·ES*_x + κ_y·ES*_y
 *
 * Dette ERSTATTER `N_G = M·ES* / EI` fra §8.2, som bare er riktig når
 * EI_xy = 0 og bare ett moment virker.
 *
 * @param {{Mx?: number, My?: number, groupParts: Part[], section: SectionEA|Part[]}} arg
 *   `Mx`,`My` i **Nmm** (bruk `kNmToNmm` på UI-verdien)
 * @returns {{NG: number, NG_kN: number, ESx: number, ESy: number, kx: number, ky: number, valid: boolean}}
 */
export function axialInGroup({ Mx = 0, My = 0, groupParts, section }) {
  const g = groupFirstMoments(groupParts, section);
  const c = curvatures({ section, Mx, My });
  const valid = c.valid && g.count > 0;
  const NG = valid ? c.kx * g.ESx + c.ky * g.ESy : 0;
  return { NG, NG_kN: NG / 1000, ESx: g.ESx, ESy: g.ESy, kx: c.kx, ky: c.ky, valid };
}

/* ------------------------------------------------------------------ *
 * B2.4 — skjærstrøm i ett grensesnitt
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} ShearFlowResult
 * @property {'y'|'x'|'biaxial'} axis  Hvilken tverrkraftretning som ble brukt
 * @property {number} V       Tverrkraften som ble brukt [N] (den enakslede veien)
 * @property {number} Vy      Loddrett tverrkraft [N] — hører til M_x
 * @property {number} Vx      Vannrett tverrkraft [N] — hører til M_y
 * @property {number} EStar   ES* om den aksen `axis` peker på [Nmm] (bakoverkompatibelt felt)
 * @property {number} ESx     ES*_x for gruppa [Nmm]
 * @property {number} ESy     ES*_y for gruppa [Nmm]
 * @property {number} EI      Bøyestivheten om samme akse som `EStar` [Nmm²]
 * @property {number} EIxy    Avviksstivheten for HELE tverrsnittet [Nmm²]
 * @property {number} D       EI_x·EI_y − EI_xy² [N²mm⁴]
 * @property {number} q       Signert skjærstrøm [N/mm]
 * @property {number} qAbs    |q| — det tallet forbinderkontrollen skal bruke
 * @property {number} qy      Bidraget fra V_y alene [N/mm]
 * @property {number} qx      Bidraget fra V_x alene [N/mm]
 * @property {boolean} coupled true hvis EI_xy er merkbart ≠ 0 (se `SKEW_THRESHOLD`)
 * @property {number} EA_group EA for gruppa [N]
 * @property {number} arm     Avstand fra nøytralaksen til gruppas E-tyngdepunkt [mm]
 * @property {boolean} valid  false hvis tverrsnittet er degenerert (D ≈ 0) eller gruppa er tom
 */

/**
 * Skjærstrøm gjennom ett grensesnitt, BIAKSIELL form.
 *
 * Se den lange utledningen over `stiffnessMatrix` for formelen, fortegnene og
 * kontrollen mot den gamle enakslede formen.
 *
 * Bidragene `qy` og `qx` er superponerte, men de er IKKE de gamle to
 * uavhengige leddene: hvert av dem inneholder EI_xy-koblingen, slik at
 * `V_y` alene også gir et bidrag via `ES*_y` når tverrsnittet er skjevt.
 *
 * @param {{Vy?: number, Vx?: number, groupParts: Part[], section: SectionEA|Part[]}} arg
 *   `Vy`,`Vx` i **N**. `section` er HELE det sammensatte tverrsnittet — ES*
 *   skal regnes om DEN nøytralaksen, ikke om gruppas egen.
 * @returns {ShearFlowResult}
 */
export function shearFlowBiaxial({ Vy = 0, Vx = 0, groupParts, section }) {
  const sec = asSection(section);
  const m = stiffnessMatrix(sec);
  const g = groupFirstMoments(groupParts, sec);

  const valid = m.valid && g.count > 0;
  // q = [(V_y·EI_y − V_x·EI_xy)·ES*_x + (V_x·EI_x − V_y·EI_xy)·ES*_y] / D
  // Delt i to ledd slik at UI-et kan vise hvert lastbidrag for seg.
  const qy = valid ? (Vy * m.EIy * g.ESx - Vy * m.EIxy * g.ESy) / m.D : 0;
  const qx = valid ? (Vx * m.EIx * g.ESy - Vx * m.EIxy * g.ESx) / m.D : 0;
  const q = qy + qx;

  const skew = Math.sqrt(Math.abs(m.EIx * m.EIy));
  return {
    axis: 'biaxial',
    V: Vy,
    Vy,
    Vx,
    EStar: g.ESx,
    ESx: g.ESx,
    ESy: g.ESy,
    EI: m.EIx,
    EIxy: m.EIxy,
    D: m.D,
    q,
    qAbs: Math.abs(q),
    qy,
    qx,
    coupled: skew > EPS && Math.abs(m.EIxy) > SKEW_THRESHOLD * skew,
    EA_group: g.EA,
    arm: Math.abs(g.EA) > EPS ? g.ESx / g.EA : 0,
    valid,
  };
}

/**
 * Skjærstrøm gjennom ett grensesnitt — ENAKSLET innpakning.
 *
 * BEHOLDT SIGNATUR, MEN REGNER IKKE SELV LENGER. Kallet settes om til
 * `shearFlowBiaxial` med den ene tverrkraftkomponenten `axis` peker på:
 *
 *      axis: 'y'  ⟹  { Vy: V, Vx: 0 }      (loddrett tverrkraft, M_x)
 *      axis: 'x'  ⟹  { Vx: V, Vy: 0 }      (vannrett tverrkraft, M_y)
 *
 * Er EI_xy = 0 gir det NØYAKTIG samme tall som før (se kontrollen i
 * utledningen over `stiffnessMatrix`, og regresjonstesten i
 * `tests/composite.test.mjs`). Er EI_xy ≠ 0 gir det det RIKTIGE tallet, som
 * den gamle formen ikke gjorde. Feltene `EStar` og `EI` peker fortsatt på
 * størrelsene for den valgte aksen, slik at eksisterende kall og tester
 * leser det samme som før.
 *
 * NY KODE BØR KALLE `shearFlowBiaxial` DIREKTE med begge komponentene — en
 * last som virker i begge plan kan ikke deles i to uavhengige kall når
 * EI_xy ≠ 0, fordi bidragene kobler.
 *
 * UTLEDNING fra grunnligningen q = dN/dx. Betrakt den delen av tverrsnittet
 * som ligger på én side av fugen (gruppa G). Fra bøyning er spenningen i del i
 *
 *      σᵢ(y) = Eᵢ · M(x) · (y − y_c) / EI
 *
 * (samme lineære tøyning som over; M/EI er krumningen κ). Aksialkraften i
 * gruppa er integralet av dette:
 *
 *      N_G(x) = ∫_G σ dA = (M(x)/EI) · Σ_{i∈G} Eᵢ ∫ (y − y_c) dA
 *             = M(x) · ES* / EI ,   ES* = Σ_{i∈G} Eᵢ Aᵢ (yᵢ − y_c)
 *
 * ES* er en ren tverrsnittsstørrelse, uavhengig av x. Deriverer vi langs
 * bjelkeaksen og bruker dM/dx = V:
 *
 *      q = dN_G/dx = (dM/dx) · ES* / EI = V · ES* / EI          [N/mm]
 *
 * KONTROLL mot klassisk formel: er E lik i hele tverrsnittet, er
 * ES* = E·Q og EI = E·I, og E forkorter: q = V·Q/I. Testen dekker dette.
 *
 * FORTEGN. `ES*` regnes med geometry.js sin konvensjon (y opp, Sx = ∫y dA).
 * En gruppe helt over nøytralaksen gir ES* > 0. Siden ES* for HELE tverrsnittet
 * per definisjon er null (det er slik y_c ble bestemt), gir de to sidene av
 * samme snitt like store ES* med motsatt fortegn — og dermed samme |q|.
 * Fortegnet sier bare hvilken vei kraften går; kapasitetskontrollen bruker
 * `qAbs`. Testen sjekker begge deler.
 *
 * Ved `axis: 'x'` (tverrkraft i x-retning, bøyning om y-aksen) byttes Sx→Sy og
 * Ix→Iy: ES* = Σ Eᵢ Aᵢ (xᵢ − x_c) og q = V_x · ES* / EI_y.
 *
 * @param {{V: number, groupParts: Part[], section: SectionEA|Part[], axis?: 'y'|'x'}} arg
 *   `V` i **N**. `section` er hele det sammensatte tverrsnittet — ES* skal
 *   regnes om DEN nøytralaksen, ikke om gruppas egen.
 * @returns {ShearFlowResult}
 */
export function shearFlow({ V, groupParts, section, axis = 'y' }) {
  const useY = axis !== 'x';
  const sec = asSection(section);
  const bi = shearFlowBiaxial({
    Vy: useY ? V : 0,
    Vx: useY ? 0 : V,
    groupParts,
    section: sec,
  });

  const EStar = useY ? bi.ESx : bi.ESy;
  const EI = useY ? sec.EIx : sec.EIy;

  return {
    ...bi,
    axis: useY ? 'y' : 'x',
    V,
    EStar,
    EI,
    arm: Math.abs(bi.EA_group) > EPS ? EStar / bi.EA_group : 0,
  };
}

/* ------------------------------------------------------------------ *
 * B2.5 — forankring av aksialkraft
 * ------------------------------------------------------------------ */

/**
 * Middelverdi av skjærstrømmen som kreves for å innføre `dN` over lengden `L`.
 *
 * UTLEDNING: samme grunnligning q = dN/dx. Antar vi at aksialkraften i den nye
 * delen vokser lineært fra 0 til ΔN over forankringslengden L, er derivasjonen
 * konstant: q = ΔN/L. Det er en MIDDELVERDI — den virkelige fordelingen har
 * topper i endene, og det er nettopp det `volkersen()` under kvantifiserer.
 *
 * @param {{dN: number, L: number}} arg  `dN` i **N**, `L` i **mm**
 * @returns {{dN: number, L: number, q: number, valid: boolean}} `q` [N/mm]
 */
export function anchorFlow({ dN, L }) {
  const valid = Number.isFinite(L) && L > EPS;
  return { dN, L, q: valid ? dN / L : 0, valid };
}

/* ------------------------------------------------------------------ *
 * B2.6 — shear lag (Volkersen)
 * ------------------------------------------------------------------ */

// cosh(u)/sinh(v) og sinh(u)/cosh(v) skrevet uten overflyt.
// Direkte cosh/sinh sprekker for λL/2 ≳ 710 (e^710 = Infinity ⟹ Inf/Inf = NaN),
// men SELVE FORHOLDET er alltid ~1. Vi ganger teller og nevner med e^-v:
//   cosh(u)/sinh(v) = (e^(u−v) + e^(−u−v)) / (1 − e^(−2v))
//   sinh(u)/cosh(v) = (e^(u−v) − e^(−u−v)) / (1 + e^(−2v))
// Med |u| ≤ v er alle eksponentene ≤ 0, så ingenting overflyter.
function coshOverSinh(u, v) {
  return (Math.exp(u - v) + Math.exp(-u - v)) / -Math.expm1(-2 * v);
}
function sinhOverCosh(u, v) {
  return (Math.exp(u - v) - Math.exp(-u - v)) / (1 + Math.exp(-2 * v));
}

/**
 * @typedef {Object} VolkersenResult
 * @property {number} lambda     λ [1/mm]
 * @property {number} lambdaL    λ·L [-], den dimensjonsløse skjøteparameteren
 * @property {number} qAvg       P/L [N/mm]
 * @property {number} qMax       maks |q| langs skjøten [N/mm]
 * @property {number} peakFactor qMax/qAvg [-]
 * @property {number} integral   ∫q dx numerisk (trapes over `profile`) [N] — skal ≈ P.
 *   MERK: bare gyldig som egenkontroll når λ·L/`samples` er liten. Er skjøten
 *   svært stiv, blir grensesjiktet 1/λ smalere enn punktavstanden, og trapesen
 *   bommer (for høyt) selv om formelen er riktig. Se test 4e.
 * @property {Array<{x: number, q: number}>} profile  x [mm] fra 0 til L, q [N/mm]
 * @property {boolean} uniform   true hvis λ≈0 og fordelingen er satt konstant
 * @property {boolean} valid
 */

/**
 * Volkersen — elastisk skjærfordeling langs en skjøt («shear lag»).
 *
 * MODELLEN. To staver med aksialstivhet α = (EA)_eks og β = (EA)_ny, koblet av
 * et kontinuerlig skjærlag med stivhet k [N/mm per mm skjøtelengde]. Forskjellen
 * i tøyning mellom de to stavene må tas opp som glidning i laget, og det gir en
 * andreordens differensialligning med løsning på cosh/sinh-form. Med
 *
 *      λ² = k · (1/α + 1/β)          [1/mm²]
 *      x' = x − L/2                  (målt fra midten av skjøten)
 *
 * er skjærstrømmen (§1 i planen)
 *
 *      q(x) = (P·λ/2) · [ cosh(λx')/sinh(λL/2)
 *                       + ((α−β)/(α+β)) · sinh(λx')/cosh(λL/2) ]
 *
 * KONTROLLENE, utledet før de ble kodet — alle tre er verifisert numerisk i
 * `tests/reinforcement.test.mjs`:
 *
 *  1) Likevekt. ∫₀^L q dx = ∫_{−L/2}^{L/2} q dx'. Første ledd:
 *     (Pλ/2)/sinh(λL/2) · [2·sinh(λL/2)/λ] = P. Andre ledd er ODDE i x' og
 *     integrerer eksakt til null. Altså ∫q dx = P uansett α/β. ✓
 *
 *  2) Myk forbindelse. λ→0: cosh(λx')→1, sinh(λL/2)→λL/2, så første ledd
 *     → (Pλ/2)/(λL/2) = P/L. Andre ledd → (Pλ/2)·r·λx' → 0 (andre orden i λ).
 *     Altså q → P/L, den jevne fordelingen `anchorFlow` antar. ✓
 *
 *  3) Balansert skjøt (α = β). Da faller det odde leddet bort og q er symmetrisk
 *     med maks i endene, x' = ±L/2:
 *        q_max = (Pλ/2)·coth(λL/2)   og  q_avg = P/L
 *     ⟹ q_max/q_avg = (λL/2)·coth(λL/2).  Merk at dette er ≥ 1 for alle λ og
 *     → 1 når λ→0, som er nøyaktig konsistent med kontroll 2. ✓
 *
 * Er α ≠ β, flytter det odde leddet toppen mot enden ved den MYKESTE staven —
 * det er der tøyningsforskjellen er størst.
 *
 * @param {{P: number, L: number, k: number, EA1: number, EA2: number, samples?: number}} arg
 *   `P` [N] er kraften som skal overføres over skjøten, `L` [mm] skjøtelengden,
 *   `k` [N/mm²] forbindelsesstivheten (se `connectorStiffness`),
 *   `EA1` = α = (EA)_eks [N], `EA2` = β = (EA)_ny [N].
 * @returns {VolkersenResult}
 */
export function volkersen({ P, L, k, EA1, EA2, samples = 101 }) {
  const n = Math.max(3, Math.round(samples));
  const qAvg = Number.isFinite(L) && L > EPS ? P / L : 0;

  const okInput =
    Number.isFinite(P) &&
    Number.isFinite(L) && L > EPS &&
    Number.isFinite(EA1) && EA1 > EPS &&
    Number.isFinite(EA2) && EA2 > EPS &&
    Number.isFinite(k) && k >= 0;

  if (!okInput) {
    return {
      lambda: 0, lambdaL: 0, qAvg, qMax: Math.abs(qAvg), peakFactor: 1,
      integral: P, profile: [], uniform: true, valid: false,
    };
  }

  const lambda = Math.sqrt(k * (1 / EA1 + 1 / EA2));
  const v = (lambda * L) / 2;

  // Grensetilfellet λ→0 er 0/0 i formelen. Vi tar det analytisk: jevn
  // fordeling P/L. Terskelen er satt der cosh/sinh-formen begynner å miste
  // signifikante siffer, ikke der den blir "liten".
  const uniform = !(v > 1e-8);
  const r = (EA1 - EA2) / (EA1 + EA2);

  const profile = [];
  let qMax = 0;
  for (let i = 0; i < n; i++) {
    const x = (L * i) / (n - 1);
    const u = lambda * (x - L / 2);
    const q = uniform
      ? qAvg
      : (P * lambda) / 2 * (coshOverSinh(u, v) + r * sinhOverCosh(u, v));
    if (Math.abs(q) > qMax) qMax = Math.abs(q);
    profile.push({ x, q });
  }

  // Trapesintegrasjon over profilen. Tas med i returen fordi den er den
  // billigste kontrollen brukeren (og agent C) kan gjøre på at tallene henger
  // sammen: den skal ligge på P.
  let integral = 0;
  for (let i = 1; i < profile.length; i++) {
    integral += ((profile[i].q + profile[i - 1].q) / 2) * (profile[i].x - profile[i - 1].x);
  }

  return {
    lambda,
    lambdaL: lambda * L,
    qAvg,
    qMax,
    peakFactor: Math.abs(qAvg) > EPS ? qMax / Math.abs(qAvg) : 1,
    integral,
    profile,
    uniform,
    valid: true,
  };
}

/**
 * Forbindelsesstivheten `k` [N/mm per mm skjøtelengde = N/mm²] som `volkersen`
 * trenger. Formlene står i §1; enhetskontrollen er verdt å skrive ut:
 *
 *   lim:   k = G_a·b/t_a   → (N/mm²)·mm/mm = N/mm²   ✓
 *   skrue: k = K_ser·rader/s → (N/mm)·(1/mm) = N/mm²  ✓
 *
 * `bondWidth` [mm] brukes bare for lim (heftbredden limet virker over).
 *
 * @param {{kind: 'screw'|'glue', Kser?: number, rows?: number, spacing?: number, Ga?: number, ta?: number}} connector
 * @param {number} [bondWidth] Heftbredde `b` [mm]
 * @returns {number} k [N/mm²], 0 hvis inndata mangler
 */
export function connectorStiffness(connector, bondWidth) {
  if (!connector) return 0;
  if (connector.kind === 'glue') {
    const Ga = Number(connector.Ga);
    const ta = Number(connector.ta);
    const b = Number(bondWidth);
    if (!(Ga > 0) || !(ta > 0) || !(b > 0)) return 0;
    return (Ga * b) / ta;
  }
  const Kser = Number(connector.Kser);
  const rows = Number(connector.rows) || 1;
  const s = Number(connector.spacing);
  if (!(Kser > 0) || !(s > 0)) return 0;
  return (Kser * rows) / s;
}

/* ------------------------------------------------------------------ *
 * B2.6b — sveisekapasitet (§4, §5.3 i skjøteplanen)
 * ------------------------------------------------------------------ */

/**
 * Kapasitet for en sveiseskjøt, uttrykt som skjærstrøm `q_Rd` [N/mm] —
 * samme størrelse som `q` fra `shearFlow`, slik at `connectorCheck` kan
 * sammenligne dem direkte uten en egen enhetsomregning.
 *
 * Er `qRd` allerede satt (brukeren har tastet inn en direkte kapasitet, eller
 * hentet den fra `weld_capacity/`-modulen), vinner den. Ellers regnes den ut
 * fra a-mål, dimensjonerende skjærfasthet og antall strenger:
 *
 *      q_Rd = n_sveiser · a · f_vw,d      [N/mm] = [-]·[mm]·[N/mm²]
 *
 * `f_vw,d` (dimensjonerende skjærfasthet i sveisesnittet) regnes IKKE ut her
 * — den hentes fra modulen `weld_capacity/`. Denne funksjonen tar den som gitt.
 *
 * @param {{qRd?: number, a_weld?: number, fvwd?: number, nWelds?: number}} connector
 * @returns {number} q_Rd [N/mm], 0 hvis inndata mangler
 */
export function weldCapacity({ qRd, a_weld, fvwd, nWelds } = {}) {
  const explicit = Number(qRd);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const n = Number(nWelds);
  const a = Number(a_weld);
  const f = Number(fvwd);
  if (!(n > 0) || !(a > 0) || !(f > 0)) return 0;
  return n * a * f;
}

/* ------------------------------------------------------------------ *
 * B2.7 — forbinderkontroll
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} ConnectorCheck
 * @property {'screw'|'glue'|'weld'} kind
 * @property {number} q          |q| som er kontrollert [N/mm]
 * @property {number|null} sReq  Nødvendig senteravstand [mm] (skrue), ellers null
 * @property {number|null} tau   Skjærspenning [N/mm²] (lim), ellers null
 * @property {number|null} util  Utnyttelse [-], null hvis kapasiteten mangler
 * @property {number|null} qRd   Kapasitet uttrykt som skjærstrøm [N/mm]
 * @property {boolean} ok        util ≤ 1
 * @property {boolean} valid
 */

/**
 * Kontroll av forbindelsen mot skjærstrømmen.
 *
 * SKRUE. Hver forbinder tar `F_Rd` [kN]. Med `rows` rader på tvers og
 * senteravstand `s` [mm] langs bjelkeaksen er kapasiteten per lengdeenhet
 * q_Rd = rows·F_Rd·1000/s [N/mm] (1000 er den ENE kN→N-konverteringen i fila).
 * Setter vi q_Rd = q får vi nødvendig senteravstand:
 *
 *      s_req = rows·F_Rd·1000 / q      [mm]
 *      util  = q·s / (rows·F_Rd·1000)  [-]
 *
 * LIM. Skjærstrømmen fordeles over heftbredden `b` [mm] i tverrsnittsplanet:
 *
 *      τ    = q / b        [N/mm²]
 *      util = τ / τ_Rd     [-]
 *
 * SVEIS. Kapasiteten er allerede en skjærstrøm (`weldCapacity`, over), så
 * kontrollen er den enkleste av de tre — ingen senteravstand å løse for
 * (`sReq` er derfor `null`, ikke `Infinity`: det finnes ikke noe geometrisk
 * mål å kreve, i motsetning til skruens `s_req`):
 *
 *      util = q / q_Rd     [-]
 *
 * `q` skal være ABSOLUTTVERDIEN av skjærstrømmen (`shearFlow(...).qAbs`), og
 * normalt q_tot = |q_V| + |q_N|. Fortegnet har ingen betydning for kapasiteten.
 *
 * @param {{q: number, bondWidth?: number, connector: object}} arg
 * @returns {ConnectorCheck}
 */
export function connectorCheck({ q, bondWidth, connector }) {
  const qa = Math.abs(Number(q) || 0);
  const kind = connector && connector.kind === 'glue'
    ? 'glue'
    : connector && connector.kind === 'weld'
      ? 'weld'
      : 'screw';

  if (kind === 'weld') {
    const qRd = weldCapacity(connector || {});
    const valid = qRd > 0;
    const util = valid ? qa / qRd : null;
    return {
      kind,
      q: qa,
      sReq: null,
      tau: null,
      util,
      qRd: valid ? qRd : null,
      ok: util === null ? true : util <= 1,
      valid,
    };
  }

  if (kind === 'glue') {
    const b = Number(bondWidth);
    const tauRd = Number(connector && connector.tauRd);
    const valid = b > EPS;
    const tau = valid ? qa / b : null;
    const util = valid && tauRd > 0 ? tau / tauRd : null;
    return {
      kind,
      q: qa,
      sReq: null,
      tau,
      util,
      qRd: tauRd > 0 && valid ? tauRd * b : null,
      ok: util === null ? true : util <= 1,
      valid,
    };
  }

  const rows = Number(connector && connector.rows) || 1;
  const FRd_kN = Number(connector && connector.FRd);
  // ↓ Eneste kN→N-konvertering i beregningen. FRd er lagret i kN (§3).
  const FRd = FRd_kN * 1000;
  const spacing = Number(connector && connector.spacing);
  const valid = FRd > 0;

  // Er q = 0 er enhver senteravstand nok. Vi svarer Infinity i stedet for å
  // dele på null, så UI-et kan skrive «ingen krav» framfor «NaN mm».
  const sReq = valid ? (qa > EPS ? (rows * FRd) / qa : Infinity) : null;
  const util = valid && spacing > 0 ? (qa * spacing) / (rows * FRd) : null;

  return {
    kind,
    q: qa,
    sReq,
    tau: null,
    util,
    qRd: valid && spacing > 0 ? (rows * FRd) / spacing : null,
    ok: util === null ? true : util <= 1,
    valid,
  };
}

/* ================================================================== *
 * §1 — hovedakser og skjev bøyning
 *
 * Bølge B henter ALT den trenger til §1.1/§1.2 herfra. Ingen UI i denne
 * fila; bare tallene og advarselsflaggene.
 * ================================================================== */

/**
 * @typedef {Object} PrincipalEI
 * @property {number} EIx
 * @property {number} EIy
 * @property {number} EIxy
 * @property {number} EI1      Største hovedstivhet [Nmm²]
 * @property {number} EI2      Minste hovedstivhet [Nmm²]
 * @property {number} theta    Hovedaksevinkel [rad], mot klokka fra x-aksen til EI_1
 * @property {number} thetaDeg Samme i grader, i (−90°, 90°]
 * @property {number|null} tanBeta  Nøytralaksens helning for rent M_x
 * @property {number|null} betaDeg  Samme som vinkel [°]
 * @property {number} skew     |EI_xy| / √(EI_x·EI_y) ∈ [0, 1]
 * @property {boolean} coupled skew > SKEW_THRESHOLD
 * @property {number} xc
 * @property {number} yc
 * @property {boolean} valid
 */

/**
 * Hovedakser og skjevbøyningstall for et E-vektet tverrsnitt.
 *
 * ------------------------------------------------------------------
 * UTLEDNING 1 — hovedaksevinkelen θ
 * ------------------------------------------------------------------
 * Roteres aksene en vinkel θ mot klokka, transformeres stivhetene som en
 * symmetrisk 2. ordens tensor (Mohrs sirkel):
 *
 *      EI_x' = (EI_x+EI_y)/2 + (EI_x−EI_y)/2·cos2θ − EI_xy·sin2θ
 *
 * Hovedaksene er der EI_x' er stasjonær, dEI_x'/dθ = 0:
 *
 *      −(EI_x−EI_y)·sin2θ − 2·EI_xy·cos2θ = 0
 *   ⟹  tan2θ = −2·EI_xy / (EI_x − EI_y)
 *   ⟹  θ = ½·atan2(−2·EI_xy, EI_x − EI_y)
 *
 * `atan2` (og ikke `atan`) plukker den kvadranten der cos2θ har samme fortegn
 * som (EI_x−EI_y), og det er nettopp den løsningen som gir MAKSIMUM: setter
 * man den inn, blir EI_x' = snitt + ½√((EI_x−EI_y)² + 4EI_xy²) = EI_1.
 * Vinkelen normaliseres til (−90°, 90°] — samme konvensjon som `derive()` i
 * geometry.js. Bruk den samme, ellers spriker de to fanene i UI-et.
 *
 * ------------------------------------------------------------------
 * UTLEDNING 2 — nøytralaksens helning for et rent M_x (§1.2)
 * ------------------------------------------------------------------
 * Med ε = κ_x·y + κ_y·x og M_y = 0 gir den andre av de to ligningene i
 * `stiffnessMatrix`-utledningen
 *
 *      0 = κ_x·EI_xy + κ_y·EI_y     ⟹  κ_y = −κ_x·EI_xy/EI_y
 *
 * Nøytralaksen er der tøyningen er null:
 *
 *      κ_x·y + κ_y·x = 0  ⟹  y = −(κ_y/κ_x)·x = (EI_xy/EI_y)·x
 *
 *      tan β = EI_xy / EI_y                          ← helningen mot x-aksen
 *
 * Nedbøyningen står VINKELRETT på nøytralaksen. En retningsvektor langs
 * nøytralaksen er (1, tanβ); vinkelrett på den er (−tanβ, 1). Forholdet
 * mellom den sidevegse og den loddrette komponenten er altså |tan β| — det er
 * det tallet §1.2 vil ha i prosent.
 *
 * `tanBeta` er null når EI_y ≈ 0 (degenerert tverrsnitt), ikke Infinity: da
 * finnes det ingen meningsfull helning å vise.
 *
 * @param {SectionEA|Part[]} section
 * @returns {PrincipalEI}
 */
export function principalEI(section) {
  const s = asSection(section);
  const avg = (s.EIx + s.EIy) / 2;
  const dif = (s.EIx - s.EIy) / 2;
  const rad = Math.sqrt(dif * dif + s.EIxy * s.EIxy);

  let theta = Math.abs(s.EIxy) < EPS && Math.abs(dif) < EPS
    ? 0
    : 0.5 * Math.atan2(-2 * s.EIxy, s.EIx - s.EIy);
  if (theta <= -Math.PI / 2) theta += Math.PI;
  if (theta > Math.PI / 2) theta -= Math.PI;

  const scale = Math.sqrt(Math.abs(s.EIx * s.EIy));
  const skew = scale > EPS ? Math.abs(s.EIxy) / scale : 0;
  const tanBeta = Math.abs(s.EIy) > EPS ? s.EIxy / s.EIy : null;

  return {
    EIx: s.EIx,
    EIy: s.EIy,
    EIxy: s.EIxy,
    EI1: avg + rad,
    EI2: avg - rad,
    theta,
    thetaDeg: (theta * 180) / Math.PI,
    tanBeta,
    betaDeg: tanBeta === null ? null : (Math.atan(tanBeta) * 180) / Math.PI,
    skew,
    coupled: skew > SKEW_THRESHOLD,
    xc: s.xc,
    yc: s.yc,
    valid: s.valid,
  };
}

/**
 * @typedef {Object} AxesComparison
 * @property {PrincipalEI} before  Eksisterende tverrsnitt, om SIN EGEN akse
 * @property {PrincipalEI} after   Sammensatt tverrsnitt, om den nye aksen
 * @property {number} dxc          Δx_c [mm]
 * @property {number} dyc          Δy_c [mm]
 * @property {number} dTheta       Δθ [rad]
 * @property {number} dThetaDeg    Δθ [°]
 * @property {boolean} introducedSkew  Var ≈ symmetrisk før, er det ikke etter
 * @property {number|null} lateralFraction |tan β| etter forsterkning [-]
 * @property {number|null} lateralPercent  Samme i prosent av loddrett nedbøyning
 */

/**
 * §1.1 + §1.2 samlet: tverrsnittets akser før og etter forsterkning, med den
 * advarselen som er hele poenget med seksjonen.
 *
 * `introducedSkew` er sann når EI_xy var UNDER terskelen før og OVER etter —
 * altså når forsterkningen har INNFØRT skjev bøyning som ikke fantes. Var
 * tverrsnittet skjevt fra før, er `after.coupled` fortsatt sann, men det er
 * ikke forsterkningens skyld, og teksten i UI-et skal være en annen.
 *
 * @param {{existing: Part[]|SectionEA, combined: Part[]|SectionEA}} arg
 * @returns {AxesComparison}
 */
export function axesComparison({ existing, combined }) {
  const before = principalEI(existing);
  const after = principalEI(combined);
  let dTheta = after.theta - before.theta;
  // θ lever i (−90°, 90°]; en «rotasjon» på +170° er egentlig −10°.
  while (dTheta > Math.PI / 2) dTheta -= Math.PI;
  while (dTheta <= -Math.PI / 2) dTheta += Math.PI;

  const lateralFraction = after.tanBeta === null ? null : Math.abs(after.tanBeta);
  return {
    before,
    after,
    dxc: after.xc - before.xc,
    dyc: after.yc - before.yc,
    dTheta,
    dThetaDeg: (dTheta * 180) / Math.PI,
    introducedSkew: !before.coupled && after.coupled,
    lateralFraction,
    lateralPercent: lateralFraction === null ? null : lateralFraction * 100,
  };
}

/* ================================================================== *
 * §4 — samvirkegrad, γ-metoden (EC5 tillegg B)
 * ================================================================== */

/**
 * Effektiv lengde for γ-metoden. Metoden er utledet for SINUSFORMET LAST på
 * en fritt opplagt bjelke; for andre systemer brukes en effektiv lengde som
 * gjør det virkelige momentforløpet omtrent like «langt» som en halv
 * sinusbølge.
 */
export const SYSTEM_FACTORS = Object.freeze({
  simple: Object.freeze({
    factor: 1.0,
    label: 'Fritt opplagt',
    note: 'L_ef = L. Dette er tilfellet γ-metoden faktisk er utledet for — en halv sinusbølge mellom to momentnullpunkt.',
  }),
  continuous: Object.freeze({
    factor: 0.8,
    label: 'Kontinuerlig felt',
    note: 'L_ef = 0,8·L. Avstanden mellom momentnullpunktene i et innerfelt er kortere enn spennvidden, og glidningen rekker ikke å bygge seg like mye opp.',
  }),
  cantilever: Object.freeze({
    factor: 2.0,
    label: 'Utkraget',
    note: 'L_ef = 2·L. En utkrager er en halv fritt opplagt bjelke speilet om innspenningen, altså en kvart sinusbølge — det tilsvarer dobbel spennvidde.',
  }),
});

/**
 * @param {number} span L [mm]
 * @param {'simple'|'continuous'|'cantilever'} [system]
 * @returns {{Lef: number, factor: number, system: string, label: string, note: string, valid: boolean}}
 */
export function effectiveLength(span, system = 'simple') {
  const key = SYSTEM_FACTORS[system] ? system : 'simple';
  const s = SYSTEM_FACTORS[key];
  const L = Number(span);
  const valid = Number.isFinite(L) && L > EPS;
  return {
    Lef: valid ? L * s.factor : 0,
    factor: s.factor,
    system: key,
    label: s.label,
    note: s.note,
    valid,
  };
}

/**
 * @typedef {Object} GammaPart
 * @property {string|number} id
 * @property {number} EA      E_i·A_i [N]
 * @property {number} EI_own  E_i·I_i om DELENS EGEN akse [Nmm²]
 * @property {number} y       Delens E-tyngdepunkt langs den aktuelle aksen [mm]
 * @property {number} gamma   Samvirkefaktoren for delen [-]
 * @property {number} a       a_i = y_i − y_ef [mm], SIGNERT
 * @property {number} ESgamma γ_i·E_iA_i·a_i [Nmm] — γ-metodens motstykke til ES*
 * @property {boolean} reference  true for delen som har γ = 1
 */

/**
 * @typedef {Object} GammaResult
 * @property {boolean} applicable  false ⟹ γ-metoden er IKKE brukt (se `reason`)
 * @property {string|null} reason
 * @property {'y'|'x'} axis
 * @property {number} Lef
 * @property {number} k         Fugestivhet per lengdeenhet [N/mm²]
 * @property {number} gammaEff  Samvirkegraden — det tallet brukeren er ute etter [0..1]
 * @property {number} EAstar    Seriestivheten EA₁EA₂/(EA₁+EA₂) [N]
 * @property {number} a         Avstand mellom de to delenes tyngdepunkt [mm]
 * @property {number} EI_none   Ingen samvirkning, Σ E_iI_i [Nmm²]
 * @property {number} EI_full   Full samvirkning (Steiner) [Nmm²]
 * @property {number} EI_ef     γ-metodens effektive stivhet [Nmm²]
 * @property {number} EI_ef_series Samme tall via den lukkede topartsformelen — egenkontroll
 * @property {number} efficiency (EI_ef − EI_none)/(EI_full − EI_none) — analytisk lik gammaEff
 * @property {number} y_ef      Effektiv nøytralakse [mm]
 * @property {number} y_full    Nøytralaksen ved full samvirkning [mm]
 * @property {GammaPart[]} parts
 * @property {number} q         Skjærstrøm i fugen ved DELVIS samvirkning [N/mm] (krever `V`)
 * @property {number} q_full    Samme ved FULL samvirkning [N/mm]
 * @property {boolean} valid
 * @property {string[]} notes
 */

/**
 * γ-metoden, EC5 tillegg B — TOPARTSTILFELLET.
 *
 * ------------------------------------------------------------------
 * UTLEDNING AV a_i OG y_ef, og svaret på iterasjonsspørsmålet
 * ------------------------------------------------------------------
 * I γ-metoden har de to delene FELLES krumning κ, men hver sin aksialkraft,
 * fordi fugen glir. Ettergivenheten uttrykkes ved at delens aksialkraft er
 * REDUSERT med faktoren γ_i i forhold til full samvirkning:
 *
 *      N_i = γ_i·E_iA_i·a_i·κ
 *
 * Uten ytre aksialkraft må disse være i likevekt, ΣN_i = 0:
 *
 *      Σ γ_i E_iA_i (y_i − y_ef) κ = 0
 *   ⟹  y_ef = Σ (γ_i E_iA_i y_i) / Σ (γ_i E_iA_i)          ← §4
 *      a_i  = y_i − y_ef                                    ← SIGNERT
 *
 * Momentlikevekten gir så
 *
 *      M = κ·Σ (E_iI_i + γ_i E_iA_i a_i²)
 *   ⟹  (EI)_ef = Σ (E_iI_i + γ_i E_iA_i a_i²)
 *
 * TRENGS ITERASJON? NEI. `y_ef` avhenger av γ, men γ avhenger BARE av E_iA_i,
 * s, K og L_ef — ikke av y_ef, ikke av a_i og ikke av (EI)_ef:
 *
 *      γ_i = 1 / (1 + π²·E_iA_i·s/(K·L_ef²)) = 1 / (1 + π²·E_iA_i/(k·L_ef²))
 *
 * Løsningen er derfor EKSPLISITT i tre steg: γ først, så y_ef, så (EI)_ef.
 * (Det ville vært en fikspunktligning hvis γ hadde inneholdt (EI)_ef — men det
 * gjør den ikke, og det er nettopp derfor γ-metoden er en håndregnemetode.)
 *
 * ------------------------------------------------------------------
 * HVILKEN DEL FÅR γ = 1 — og hvorfor det MÅ være én
 * ------------------------------------------------------------------
 * §4 i planen skriver `γ_i` generisk for alle deler. Det er en FORENKLING av
 * EC5 tillegg B, som setter γ = 1 for referansedelen (B.5: γ₂ = 1 for steget i
 * treparts-tverrsnittet). Brukes γ < 1 på BEGGE deler av en topartsskjøt,
 * telles ettergivenheten to ganger og (EI)_ef blir for lav. Vi følger EC5.
 *
 * Kontrollen på at valget er riktig: den eksakte Newmark-løsningen for to
 * deler koblet med et kontinuerlig skjærlag `k`, med sinusformet last, er
 *
 *      (EI)_ef = ΣE_iI_i + γ_eff·EA*·a² ,  EA* = EA₁EA₂/(EA₁+EA₂),
 *      γ_eff   = 1/(1 + π²·EA* / (k·L_ef²)) ,  a = y₂ − y₁
 *
 * Setter man EC5-formen inn med γ_ref = 1, får man (med ψ = π²/(k·L_ef²))
 *
 *      Σ γ_i EA_i a_i² = γ_2·EA₁EA₂·a²/(γ_2·EA₂ + EA₁)
 *                      = EA₁EA₂·a²/(EA₁ + EA₂ + ψ·EA₁EA₂)
 *                      = γ_eff·EA*·a²
 *
 * — NØYAKTIG det samme uttrykket, og symmetrisk i 1↔2. (EI)_ef er altså
 * uavhengig av hvilken del som velges som referanse, mens `y_ef` og de
 * enkelte `γ_i`/`a_i` IKKE er det. Derfor rapporteres `gammaEff` (symmetrisk,
 * uavhengig av valget) som SAMVIRKEGRADEN, og `parts[i].gamma` som
 * EC5-dekomposisjonen.
 *
 * `y_ef` er for øvrig ingen felles nøytralakse: i delvis samvirkning har hver
 * del sitt eget nullpunkt for tøyningen. `y_ef` sammenfaller med
 * REFERANSEDELENS nullpunkt (den med γ = 1). Det står i `notes`.
 *
 * ------------------------------------------------------------------
 * `K` KONTRA `k` — planen bruker samme bokstav om to ting
 * ------------------------------------------------------------------
 * §3.3 kaller stivheten PER LENGDEENHET for `K`, mens §4 bruker `K` om
 * per-festemiddel-verdien og skriver `s` eksplisitt. Det er samme størrelse:
 * s/K_festemiddel = 1/k. Her heter per-lengde-stivheten alltid `k`, og du kan
 * gi enten `k` direkte eller `{K, rows, spacing, shearPlanes}` — se
 * `connection-stiffness.js` (`jointStiffness`), som regner den samme brøken.
 *
 * `k = Infinity` (sveis) gir γ = 1 eksakt, altså full samvirkning.
 *
 * @param {{groups: Array<Part[]|SectionEA>, ids?: Array<string|number>,
 *          k?: number, K?: number, spacing?: number, rows?: number, shearPlanes?: number,
 *          span?: number, Lef?: number, system?: string,
 *          axis?: 'y'|'x', referenceIndex?: number, V?: number}} arg
 *   `groups` er nøyaktig TO grupper: [eksisterende, ny]. `V` [N] er valgfri —
 *   er den gitt, fylles `q`/`q_full` ut.
 * @returns {GammaResult}
 */
export function gammaMethod({
  groups,
  ids,
  k,
  K,
  spacing,
  rows = 1,
  shearPlanes = 1,
  span,
  Lef,
  system = 'simple',
  axis = 'y',
  referenceIndex = 0,
  V = 0,
}) {
  const useY = axis !== 'x';
  const notes = [];
  const fail = (reason) => ({
    applicable: false,
    reason,
    axis: useY ? 'y' : 'x',
    Lef: 0, system, k: 0, gammaEff: 0, EAstar: 0, a: 0,
    EI_none: 0, EI_full: 0, EI_ef: 0, EI_ef_series: 0, efficiency: 0,
    y_ef: 0, y_full: 0, parts: [], q: 0, q_full: 0, valid: false, notes,
  });

  const list = Array.isArray(groups) ? groups : [];
  if (list.length !== 2) {
    return fail(
      'γ-metoden er implementert bare for topartstilfellet (eksisterende + ny). ' +
      `Her er det ${list.length} grupper — full samvirkning vises alene, og samvirkegraden er ikke beregnet.`
    );
  }

  const secs = list.map((g) => asSection(g));
  const EA = secs.map((s) => s.EA);
  const EIown = secs.map((s) => (useY ? s.EIx : s.EIy));
  const y = secs.map((s) => (useY ? s.yc : s.xc));
  if (!(EA[0] > EPS) || !(EA[1] > EPS)) {
    return fail('En av gruppene har ingen aksialstivhet (EA ≈ 0) — γ-metoden er ikke anvendelig.');
  }

  // --- effektiv lengde
  const el = Number.isFinite(Lef) && Lef > EPS
    ? {
        Lef,
        factor: 1,
        system,
        label: SYSTEM_FACTORS[system] ? SYSTEM_FACTORS[system].label : 'oppgitt L_ef',
        note: 'L_ef er lagt inn direkte.',
        valid: true,
      }
    : effectiveLength(span, system);
  if (!el.valid) return fail('Spennvidde/effektiv lengde mangler — γ-metoden krever L_ef.');
  notes.push(el.note);

  // --- fugestivhet per lengdeenhet. Samme brøk som `jointStiffness` i
  //     connection-stiffness.js; gjentatt her fordi denne fila med vilje ikke
  //     importerer noe (se filhodet der).
  let kk = Number(k);
  if (!Number.isFinite(kk) || kk < 0) {
    const Kf = Number(K);
    const s = Number(spacing);
    const r = Number(rows) > 0 ? Number(rows) : 1;
    const p = Number(shearPlanes) > 0 ? Number(shearPlanes) : 1;
    kk = Kf > 0 && s > 0 ? (p * r * Kf) / s : NaN;
  }
  if (k === Infinity) kk = Infinity;
  if (!(kk >= 0)) return fail('Fugestivheten k mangler — oppgi k [N/mm²] eller K, s og antall rader.');

  // --- γ. ψ = π²/(k·L_ef²) [1/N]; k = ∞ ⟹ ψ = 0 ⟹ γ = 1, k = 0 ⟹ ψ = ∞ ⟹ γ = 0.
  const psi = kk === Infinity ? 0 : (Math.PI * Math.PI) / (kk * el.Lef * el.Lef);
  const gammaOf = (ea) => (psi === 0 ? 1 : 1 / (1 + psi * ea));

  const refIdx = referenceIndex === 1 ? 1 : 0;
  const gamma = [0, 1].map((i) => (i === refIdx ? 1 : gammaOf(EA[i])));

  // --- y_ef, a_i, (EI)_ef
  const wSum = gamma[0] * EA[0] + gamma[1] * EA[1];
  const y_ef = (gamma[0] * EA[0] * y[0] + gamma[1] * EA[1] * y[1]) / wSum;
  const a_i = [y[0] - y_ef, y[1] - y_ef];

  const EI_none = EIown[0] + EIown[1];
  const EI_ef = EI_none + gamma[0] * EA[0] * a_i[0] * a_i[0] + gamma[1] * EA[1] * a_i[1] * a_i[1];

  // --- den lukkede topartsformen: symmetrisk γ_eff og egenkontroll av EI_ef
  const EAstar = (EA[0] * EA[1]) / (EA[0] + EA[1]);
  const a = y[1] - y[0];
  const y_full = (EA[0] * y[0] + EA[1] * y[1]) / (EA[0] + EA[1]);
  const gammaEff = psi === 0 ? 1 : 1 / (1 + psi * EAstar);
  const EI_full = EI_none + EAstar * a * a;
  const EI_ef_series = EI_none + gammaEff * EAstar * a * a;

  // ES*-analogen: γ_i·EA_i·a_i. De to har lik tallverdi og motsatt fortegn —
  // det er nettopp den likevekten y_ef ble bestemt av, akkurat som ES* har
  // det på hver side av et snitt ved full samvirkning.
  const ESgamma = [gamma[0] * EA[0] * a_i[0], gamma[1] * EA[1] * a_i[1]];

  const q = EI_ef > EPS ? (Math.abs(ESgamma[1]) * V) / EI_ef : 0;
  const q_full = EI_full > EPS ? (EAstar * Math.abs(a) * V) / EI_full : 0;

  notes.push(
    'y_ef er ingen felles nøytralakse: i delvis samvirkning har hver del sitt eget nullpunkt for tøyningen. ' +
    'y_ef sammenfaller med referansedelens (den med γ = 1).'
  );
  notes.push(
    'Full samvirkning er fortsatt standard — γ-resultatet er et tillegg som vises ved siden av, ikke en erstatning.'
  );

  return {
    applicable: true,
    reason: null,
    axis: useY ? 'y' : 'x',
    Lef: el.Lef,
    system: el.system,
    k: kk,
    gammaEff,
    EAstar,
    a,
    EI_none,
    EI_full,
    EI_ef,
    EI_ef_series,
    // (EI_ef − EI_none)/(EI_full − EI_none) er ANALYTISK lik gammaEff; regnes
    // likevel ut av tallene, slik at en fortegns- eller a_i-feil ville sprike her.
    efficiency: EI_full - EI_none > EPS ? (EI_ef - EI_none) / (EI_full - EI_none) : 0,
    y_ef,
    y_full,
    parts: [0, 1].map((i) => ({
      id: ids && ids[i] !== undefined ? ids[i] : i,
      EA: EA[i],
      EI_own: EIown[i],
      y: y[i],
      gamma: gamma[i],
      a: a_i[i],
      ESgamma: ESgamma[i],
      reference: i === refIdx,
    })),
    q,
    q_full,
    valid: true,
    notes,
  };
}

/**
 * §4.1 — kraften per festemiddel, det tallet som går videre til en
 * kapasitetskontroll.
 *
 *      F = q · s / (n_rader · n_skjærplan)          [N]
 *
 * UTLEDNING: skjærstrømmen `q` [N/mm] er kraft per lengdeenhet av skjøten.
 * Over lengden `s` mellom to festemiddelrekker skal `q·s` overføres, og den
 * kraften deles på de snittene som faktisk finnes der: `n_rader` rader på
 * tvers, hver med `n_skjærplan` skjærplan.
 *
 * `FRd` er lagret i **kN** (som `connector.FRd` ellers i modulen);
 * konverteringen skjer på én merket linje.
 *
 * @param {{q: number, spacing: number, rows?: number, shearPlanes?: number, FRd?: number}} arg
 * @returns {{F: number, F_kN: number, util: number|null, sMax: number|null,
 *            nPerMetre: number|null, ok: boolean, valid: boolean}}
 *   `sMax` er den største senteravstanden som holder utnyttelsen ≤ 1.
 *   `nPerMetre` er nødvendig antall festemidler per løpemeter skjøt.
 */
export function fastenerForce({ q, spacing, rows = 1, shearPlanes = 1, FRd }) {
  const qa = Math.abs(Number(q) || 0);
  const s = Number(spacing);
  const r = Number(rows) > 0 ? Number(rows) : 1;
  const p = Number(shearPlanes) > 0 ? Number(shearPlanes) : 1;
  const cap = Number(FRd) * 1000; // ← eneste kN→N-konvertering her. FRd er i kN.
  const valid = s > EPS;

  const F = valid ? (qa * s) / (r * p) : 0;
  const hasCap = Number.isFinite(cap) && cap > 0;
  return {
    F,
    F_kN: F / 1000,
    util: hasCap && valid ? F / cap : null,
    sMax: hasCap ? (qa > EPS ? (r * p * cap) / qa : Infinity) : null,
    nPerMetre: hasCap ? (qa * 1000) / cap : null,
    ok: hasCap && valid ? F <= cap : true,
    valid,
  };
}

/* ================================================================== *
 * §8.2 — forankringskontroll i enden
 * ================================================================== */

/**
 * Skjøtens kapasitet uttrykt som skjærstrøm `q_Rd` [N/mm] — samme størrelse
 * som `q` fra `shearFlow`, uansett forbindelsestype:
 *
 *      lim:    q_Rd = τ_Rd · b               (b = heftbredde [mm])
 *      skrue:  q_Rd = n_rader · F_Rd / s     (F_Rd i kN ⟹ ×1000)
 *      sveis:  q_Rd  direkte (`weldCapacity`)
 *
 * Regnes IKKE på nytt her — `connectorCheck` utleder allerede nøyaktig disse
 * tre, med den ene kN→N-konverteringen samlet på ett sted. Denne funksjonen
 * er bare den navngitte inngangen §8.2 trenger.
 *
 * @param {object} connector
 * @param {number} [bondWidth] [mm], bare for lim
 * @returns {number|null} q_Rd [N/mm], null hvis kapasiteten ikke er oppgitt
 */
export function jointCapacityFlow(connector, bondWidth) {
  return connectorCheck({ q: 0, bondWidth, connector }).qRd;
}

/**
 * @typedef {Object} AnchorageCheck
 * @property {number} NG      Aksialkraften som skal forankres [N]
 * @property {number} NG_kN   Samme i kN — det tallet §8.2 skal vise
 * @property {number|null} qRd  Skjøtens kapasitet per lengdeenhet [N/mm]
 * @property {number|null} Lreq Nødvendig forankringslengde [mm]
 * @property {number} L       Den lengden brukeren har lagt inn [mm]
 * @property {number|null} util L_req/L [-]
 * @property {boolean} ok     util ≤ 1
 * @property {boolean} valid
 * @property {string[]} notes
 */

/**
 * Forankringskontroll i lamellenden (§8.2).
 *
 *      L_req = N_G / q_Rd          [mm] = [N] / [N/mm]
 *
 * UTLEDNING: `q_Rd` er kraften per lengdeenhet skjøten kan overføre.
 * Integrert fra lamellenden og innover gir den N(x) = q_Rd·x. Hele kraften
 * `N_G` er innført når N(x) = N_G, altså ved x = N_G/q_Rd.
 *
 * `N_G` hentes fra BIAKSIELL bøyning (`axialInGroup`) når `Mx`/`My` og
 * geometrien er gitt, ellers brukes en `NG` som er lagt inn direkte. Den
 * gamle formen `N_G = M·ES* / EI` fra §8.2 er bare gyldig når EI_xy = 0 og bare
 * ett moment virker; den brukes ikke her.
 *
 * FORBEHOLD som SKAL vises (ligger i `notes`): kontrollen er en
 * MIDDELVERDIBETRAKTNING. Den virkelige skjærstrømmen har en topp i
 * lamellenden — `volkersen()` kvantifiserer den — og for et limt skjøteende er
 * det toppen som utløser avskalling, ikke middelverdien.
 *
 * @param {{NG?: number, Mx?: number, My?: number, groupParts?: Part[],
 *          section?: SectionEA|Part[], L: number, connector?: object,
 *          bondWidth?: number, qRd?: number}} arg
 * @returns {AnchorageCheck}
 */
export function anchorageCheck({ NG, Mx = 0, My = 0, groupParts, section, L, connector, bondWidth, qRd }) {
  const notes = [
    'Kontrollen er en middelverdibetraktning: q_Rd antas jevnt fordelt over forankringslengden.',
    'Volkersen-toppen (se «shear lag») kommer i tillegg — for et limt skjøteende er det toppen som utløser avskalling.',
  ];

  let N = Number(NG);
  if (!Number.isFinite(N)) {
    const a = groupParts && section ? axialInGroup({ Mx, My, groupParts, section }) : { NG: NaN };
    N = a.NG;
  }
  const Na = Math.abs(Number.isFinite(N) ? N : 0);

  const explicit = Number(qRd);
  const cap = Number.isFinite(explicit) && explicit > 0
    ? explicit
    : jointCapacityFlow(connector, bondWidth);

  const Ln = Number(L);
  const hasCap = Number.isFinite(cap) && cap > EPS;
  const Lreq = hasCap ? Na / cap : null;
  const util = hasCap && Ln > EPS ? Lreq / Ln : null;

  if (util !== null && util > 1) {
    notes.unshift(
      'ADVARSEL: L_req > L. Forankringen er for kort, uansett hvor liten skjærstrømmen er midt på bjelken.'
    );
  }

  return {
    NG: Number.isFinite(N) ? N : 0,
    NG_kN: (Number.isFinite(N) ? N : 0) / 1000,
    qRd: hasCap ? cap : null,
    Lreq,
    L: Number.isFinite(Ln) ? Ln : 0,
    util,
    ok: util === null ? true : util <= 1,
    valid: hasCap && Number.isFinite(N),
    notes,
  };
}
