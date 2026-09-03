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
 * B2.4 — skjærstrøm i ett grensesnitt
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} ShearFlowResult
 * @property {'y'|'x'} axis   Hvilken tverrkraftretning som er brukt
 * @property {number} V       Tverrkraften som ble brukt [N]
 * @property {number} EStar   ES* for gruppa, om nøytralaksen [Nmm]
 * @property {number} EI      Sammensatt bøyestivhet om samme akse [Nmm²]
 * @property {number} q       Signert skjærstrøm [N/mm]
 * @property {number} qAbs    |q| — det tallet forbinderkontrollen skal bruke
 * @property {number} EA_group EA for gruppa [N]
 * @property {number} arm     Avstand fra nøytralaksen til gruppas E-tyngdepunkt [mm]
 * @property {boolean} valid  false hvis EI ≈ 0 eller gruppa er tom
 */

/**
 * Skjærstrøm gjennom ett grensesnitt.
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
  const sec = asSection(section);
  const grp = sectionEA(groupParts || []);

  const useY = axis !== 'x';
  const c = useY ? sec.yc : sec.xc;
  const ES = useY ? grp.ESx : grp.ESy;
  const EI = useY ? sec.EIx : sec.EIy;

  // ES* = Σ Eᵢ Aᵢ (yᵢ − y_c) = Σ Eᵢ Sxᵢ − y_c · Σ Eᵢ Aᵢ.
  // Skrevet slik fordi `props` allerede er integrert om globalt origo, så
  // vi slipper å kjenne hver dels eget tyngdepunkt.
  const EStar = ES - c * grp.EA;

  const valid = Math.abs(EI) > EPS && grp.count > 0;
  const q = valid ? (V * EStar) / EI : 0;

  return {
    axis: useY ? 'y' : 'x',
    V,
    EStar,
    EI,
    q,
    qAbs: Math.abs(q),
    EA_group: grp.EA,
    arm: Math.abs(grp.EA) > EPS ? EStar / grp.EA : 0,
    valid,
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
