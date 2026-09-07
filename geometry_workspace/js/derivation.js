/**
 * derivation.js — utledningen som DATA, ikke som HTML.
 *
 * `derivationModel(res)` tar resultatobjektet fra `computeReinforcement()` og
 * gir tilbake utregningen som en ren datastruktur:
 *
 *     Array<{ key, title, steps: Array<{sym, formula, subst, result, note}> }>
 *
 * -----------------------------------------------------------------------
 * HVORFOR DENNE FILA FINNES
 * -----------------------------------------------------------------------
 * Formlene sto tidligere som HTML-strenger inne i `_derivationBody()` i
 * `reinforcement-ui.js`. Da rapportmodulen skulle skrive de samme formlene på
 * papir, fantes det bare to veier: enten skrive dem én gang til i
 * `report.js` — og dermed ha to sannheter som kan gli fra hverandre uten at
 * noe varsler — eller trekke dem ut hit. Panelet og rapporten rendrer nå over
 * SAMME modell. Endrer man en formel, endres begge, og det er ikke mulig å
 * glemme den ene.
 *
 * `reinforcement-ui.js` sin `_derivationBody()` er etter dette en ren
 * rendrer: den legger HTML rundt `sym`/`formula`/`subst`/`result`/`note` og
 * regner ikke, formulerer ikke og formaterer ikke noe selv.
 *
 * -----------------------------------------------------------------------
 * INGEN IMPORTER — MED VILJE
 * -----------------------------------------------------------------------
 * Som `reinforcement.js` og `connection-stiffness.js` importerer denne fila
 * ingenting. Testriggen (`tests/*.test.mjs`) laster moduler ved å lese fila og
 * importere den som en `data:`-URL; en relativ `import` ville ikke kunne
 * løses derfra. Prisen er at tallformatererne (`n`, `q`, `sci`) bor her og
 * eksporteres videre av `reinforcement-ui.js` i stedet for motsatt vei — en
 * billig pris for at utledningen kan enhetstestes uten DOM og uten oppsett.
 *
 * -----------------------------------------------------------------------
 * FERDIGE STRENGER SKAL PLUKKES OPP, IKKE SKRIVES OM
 * -----------------------------------------------------------------------
 * `connection-stiffness.js` gir allerede utskriftsklare `formula` og
 * `substituted` fra `ec5Kser()`, `etaKser()`, `slipModulus()` og
 * `interfaceStiffness()`, og `gammaMethod()`/`anchorageCheck()` gir ferdige
 * norske `notes`/`reason`. Skal en av DE størrelsene inn i utledningen, skal
 * strengen hentes derfra — aldri formuleres på nytt her, for da har vi flyttet
 * duplikatet i stedet for å fjerne det.
 *
 * MERK om `k`-steget under Volkersen: det viser `jt.kConn`
 * (`connectorStiffness`), som er en ANNEN størrelse enn `jt.ifStiff.k`
 * (`interfaceStiffness`) — den siste teller også med antall skjærplan. Å bytte
 * inn `ifStiff.formula`/`substituted` der ville altså ikke vært å fjerne et
 * duplikat, men å endre hvilket tall som vises. Det er en faglig avgjørelse,
 * ikke en opprydding, og hører ikke hjemme i en ren utflytting.
 *
 * -----------------------------------------------------------------------
 * §5.3 — MOMENTET GIR IKKE ET EGET LEDD I SKJÆRSTRØMMEN
 * -----------------------------------------------------------------------
 * Kraftdelen i hver skjøtegruppe har NØYAKTIG fem poster:
 * `q_før`, `q_etter`, `q_V,tot`, `q_N`, `q_tot` (bare `q_før` når alt er
 * eksisterende, og uten `q_før` når skjøten ligger mot en ny del). Det finnes
 * INGEN sjette post «fra M» eller «q_M», og den skal aldri legges til:
 * momentet er allerede med, fordi `q = dN/dz = V · ES* / EI` ER momentets
 * virkning sett fra skjærkraftsiden. `N_G = M · ES* / EI` er den samme kraften
 * sett fra den andre siden, og en egen momentpost ville telt den to ganger.
 * `N_G` står derfor i FORANKRINGSdelen, som et uavhengig krav til hva som må
 * innføres over `L` — aldri som et ledd i `q_tot`.
 * `tests/derivation.test.mjs` feiler hvis noen legger til en sjette post.
 */

/* ================================================================== *
 * Tallformatering — kanonisk hjem
 * ------------------------------------------------------------------ *
 * Disse lå i `reinforcement-ui.js`. De bor her fordi utledningen ikke kan
 * importere derfra (se toppen), og `reinforcement-ui.js` eksporterer dem
 * videre slik at panelets øvrige kode er uendret.
 * ================================================================== */

const nf = (dec) =>
  new Intl.NumberFormat('nb-NO', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format;

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

function sup(v) {
  return String(v).split('').map((c) => SUP[c] || c).join('');
}

/** Tierpotens med mantisse, som resten av repoet skriver store tall. */
export function sci(v, digits = 4) {
  if (!Number.isFinite(v)) return '–';
  if (v === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(v)));
  const mant = v / 10 ** exp;
  return `${nf(digits - 1)(mant)}·10${sup(exp)}`;
}

/** Tall uten enhet. Går over til tierpotens der desimalform blir uleselig. */
export function n(v, dec = 2) {
  if (v === Infinity) return '∞';
  if (!Number.isFinite(v)) return '–';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return sci(v, 4);
  return nf(dec)(v);
}

/** Tall MED enhet. Ingen størrelse i denne fanen skal vises uten. */
export function q(v, unit, dec = 2) {
  if (v === Infinity) return `∞ ${unit}`;
  if (!Number.isFinite(v)) return `– ${unit}`;
  return `${n(v, dec)} ${unit}`;
}

/** Prosent. Egen funksjon fordi utnyttelser aldri skal vises uten «%». */
export function pct(v, dec = 1) {
  if (!Number.isFinite(v)) return '–';
  return `${nf(dec)(v)} %`;
}

/**
 * N → kN. Samme omregning som `NtokN()` i `reinforcement.js`; gjentatt her
 * fordi denne fila ikke kan importere (se toppen). Endres den ene, må den
 * andre endres — men det er en deling på tusen, ikke en formel som kan gli.
 */
const NtokN = (v) => v / 1000;

/* ================================================================== *
 * Stegbygger
 * ================================================================== */

/**
 * Ett steg i utledningen.
 *
 * `part` er en maskinlesbar merkelapp på hvilken DEL av utregningen steget
 * hører til. Den rendres ikke og påvirker ikke noe brukeren ser — den finnes
 * fordi §5.3-regresjonstesten må kunne peke på «kraftdelen» uten å telle
 * posisjoner i en liste som med tiden kommer til å vokse.
 *
 *   'section'  tverrsnittsstørrelser (EA, y_c, EI_x, ΔN, q_N)
 *   'es'       arealmoment om nøytralaksen for halvplanet (ES*)
 *   'force'    skjærstrømskjeden — og BARE den, se §5.3 øverst
 *   'axial'    aksialkraften som rutes gjennom skjøten (ΔN_i)
 *   'check'    kapasitetskontrollen for forbindelsestypen
 *   'volkersen' shear lag
 *   'anchor'   forankring i enden
 *
 * @typedef {{sym: string, formula: string, subst: string, result: string,
 *            note: string, part: string}} Step
 */
function step(part, { sym, formula, subst, result, note = '' }) {
  return { sym, formula, subst, result, note, part };
}

/* ================================================================== *
 * Tverrsnittet og aksialkraften
 * ================================================================== */

function sectionSteps(res) {
  const s = res.section;
  const es = res.existingSection;
  const l = res.loads;
  const eaSubst = res.parts.length ? res.parts.map((p) => `${n(p.E, 0)}·${n(p.props.A, 0)}`).join(' + ') : '0';

  if (res.allExisting) {
    return [
      step('section', {
        sym: 'EA',
        formula: 'EA = Σ Eᵢ·Aᵢ',
        subst: eaSubst,
        result: q(es.EA, 'N', 0),
        note: 'Aksialstivheten til det eksisterende tverrsnittet (= hele tverrsnittet her, siden alt er eksisterende).',
      }),
      step('section', {
        sym: 'y_c',
        formula: 'y_c = ESx / EA',
        subst: `${n(es.ESx, 0)} Nmm / ${n(es.EA, 0)} N`,
        result: q(es.yc, 'mm'),
      }),
      step('section', {
        sym: 'EI_x',
        formula: 'EI_x = Σ Eᵢ·Ix0ᵢ − EA·y_c²  (Steiners sats, om nøytralaksen)',
        subst: `${n(es.EIx0, 0)} − ${n(es.EA, 0)}·${n(es.yc)}²`,
        result: q(es.EIx, 'Nmm²', 0),
      }),
    ];
  }

  return [
    step('section', {
      sym: 'EA',
      formula: 'EA = Σ Eᵢ·Aᵢ',
      subst: eaSubst,
      result: q(s.EA, 'N', 0),
      note: 'Aksialstivheten til hele det sammensatte tverrsnittet. E i N/mm², A i mm².',
    }),
    step('section', {
      sym: 'y_c',
      formula: 'y_c = ESx / EA = Σ Eᵢ·Sxᵢ / Σ Eᵢ·Aᵢ',
      subst: `${n(s.ESx, 0)} Nmm / ${n(s.EA, 0)} N`,
      result: q(s.yc, 'mm'),
      note: 'Den E-vektede nøytralaksen — identisk med tyngdepunktet i det transformerte tverrsnittet.',
    }),
    step('section', {
      sym: 'EI_x',
      formula: 'EI_x = Σ Eᵢ·Ix0ᵢ − EA·y_c²  (Steiners sats, om nøytralaksen)',
      subst: `${n(s.EIx0, 0)} − ${n(s.EA, 0)}·${n(s.yc)}²`,
      result: q(s.EIx, 'Nmm²', 0),
    }),
    step('section', {
      sym: 'ΔN',
      formula: 'ΔN = N_etter · Σ_ny(Eᵢ·Aᵢ) / Σ(Eⱼ·Aⱼ)',
      subst: `${n(l.after.N, 0)} N · ${n(res.transferNew.EA_group, 0)} / ${n(s.EA, 0)}`,
      result: q(NtokN(res.transferNew.dN), 'kN'),
      note: 'Aksialkraften fordeles etter aksialstivhet, fordi tøyningen er felles over tverrsnittet.',
    }),
    step('section', {
      sym: 'q_N',
      formula: 'q_N = ΔN / L',
      subst: `${n(res.transferNew.dN, 0)} N / ${n(l.L, 0)} mm`,
      result: q(res.anchorNew.valid ? res.anchorNew.q : NaN, 'N/mm'),
      note: 'Middelverdi over forankringslengden, for HELE den nye delen samlet. Per-skjøt ΔN kan avvike — se under.',
    }),
  ];
}

/* ================================================================== *
 * Skjærstrømmen per skjøt — §5.3-delen
 * ================================================================== */

function flowSteps(jt, res) {
  const s = res.section;
  const es = res.existingSection;
  const l = res.loads;
  const out = [];

  if (res.allExisting) {
    out.push(
      step('es', {
        sym: 'ES*_x, ES*_y',
        formula:
          'ES*_x = Σ_side Eᵢ·Aᵢ·(yᵢ − y_c), ES*_y = Σ_side Eᵢ·Aᵢ·(xᵢ − x_c)  — halvplanet snittlinja definerer (§8), IKKE grafen',
        subst: jt.flowBefore ? `klippet mot (x_c,y_c) = (${n(es.xc)}, ${n(es.yc)}) mm` : '–',
        result: jt.flowBefore ? `${q(jt.flowBefore.ESx, 'Nmm', 0)}, ${q(jt.flowBefore.ESy, 'Nmm', 0)}` : '–',
        note:
          'Halvplanet virker uendret på en udelt, importert profil — du trenger ikke splitte ' +
          'geometrien for å snitte i den.',
      }),
      step('force', {
        sym: 'q_før = q_y + q_x',
        formula: 'Biaksiell skjærstrøm (reinforcement.js): q = q_y + q_x, koblet via EI_xy når tverrsnittet er skjevt',
        subst: jt.flowBefore ? `${n(jt.flowBefore.qy)} + ${n(jt.flowBefore.qx)} N/mm` : '–',
        result: q(jt.qBefore, 'N/mm'),
        note: jt.flowBefore && jt.flowBefore.coupled ? 'Koblet: EI_xy ≠ 0, bidragene kan ikke regnes hver for seg.' : '',
      })
    );
    return out;
  }

  if (jt.flowBefore) {
    out.push(
      step('es', {
        sym: 'ES*_før',
        formula:
          'ES*_x = Σ_side Eᵢ·Aᵢ·(yᵢ − y_c,eks), ES*_y = Σ_side Eᵢ·Aᵢ·(xᵢ − x_c,eks)  — halvplanet mot KUN eksisterende geometri',
        subst: `klippet mot (x_c,eks, y_c,eks) = (${n(es.xc)}, ${n(es.yc)}) mm`,
        result: `${q(jt.flowBefore.ESx, 'Nmm', 0)}, ${q(jt.flowBefore.ESy, 'Nmm', 0)}`,
      }),
      step('force', {
        sym: 'q_før = q_y + q_x',
        formula: 'Biaksiell skjærstrøm om det EKSISTERENDE tverrsnittet',
        subst: `${n(jt.flowBefore.qy)} + ${n(jt.flowBefore.qx)} N/mm`,
        result: q(jt.qBefore, 'N/mm'),
      })
    );
  }

  out.push(
    step('es', {
      sym: 'ES*_etter',
      formula:
        'ES*_x = Σ_side Eᵢ·Aᵢ·(yᵢ − y_c), ES*_y = Σ_side Eᵢ·Aᵢ·(xᵢ − x_c)  — halvplanet mot HELE det sammensatte tverrsnittet',
      subst: `klippet mot (x_c, y_c) = (${n(s.xc)}, ${n(s.yc)}) mm`,
      result: `${q(jt.flowAfter.ESx, 'Nmm', 0)}, ${q(jt.flowAfter.ESy, 'Nmm', 0)}`,
    }),
    step('force', {
      sym: 'q_etter = q_y + q_x',
      formula: 'Biaksiell skjærstrøm (reinforcement.js): q = q_y + q_x, koblet via EI_xy når tverrsnittet er skjevt',
      subst: `${n(jt.flowAfter.qy)} + ${n(jt.flowAfter.qx)} N/mm`,
      result: q(jt.qAfter, 'N/mm'),
      note: jt.flowAfter.coupled
        ? 'Koblet: EI_xy ≠ 0, bidragene kan ikke regnes hver for seg — se «Effekt av forsterkningen».'
        : '',
    }),
    step('force', {
      sym: 'q_V,tot',
      formula: 'q_V,tot = |q_før| + |q_etter|',
      subst: `${n(jt.qBefore)} + ${n(jt.qAfter)}`,
      result: q(jt.qVtot, 'N/mm'),
      note: 'Superposisjon (§3): de to lasttilstandene virker på ulike tverrsnitt, og legges sammen i tallverdi.',
    }),
    step('axial', {
      sym: 'ΔN_i',
      formula: 'ΔN_i = N_etter · Σ_gruppe(Eᵢ·Aᵢ) / Σ(Eⱼ·Aⱼ)   (gruppa fra GRAFEN, §8.3 — ikke halvplanet)',
      subst: `${n(l.after.N, 0)} N · ${n(jt.EA_group, 0)} / ${n(s.EA, 0)}${
        jt.shareApplied != null ? ` · andel ${n(jt.shareApplied, 3)}` : ''
      }`,
      result: q(NtokN(jt.dN), 'kN'),
      note: 'Aksialkraften som må gjennom nettopp denne skjøten — ikke nødvendigvis alt som er «ny».',
    }),
    step('force', {
      sym: 'q_N',
      formula: 'q_N = ΔN_i / L',
      subst: `${n(jt.dN, 0)} N / ${n(l.L, 0)} mm`,
      result: q(jt.qN, 'N/mm'),
    }),
    // §5.3: q_tot er summen av NØYAKTIG to ledd. Ikke legg til et «+ q_M».
    step('force', {
      sym: 'q_tot',
      formula: 'q_tot = q_V,tot + q_N',
      subst: `${n(jt.qVtot)} + ${n(jt.qN)}`,
      result: q(jt.qTot, 'N/mm'),
    })
  );
  return out;
}

/* ================================================================== *
 * Kapasitetskontroll per forbindelsestype
 * ================================================================== */

function checkSteps(jt) {
  const c = jt.connector;

  if (c.kind === 'weld') {
    const explicitQrd = Number(c.qRd) > 0;
    return [
      step('check', {
        sym: 'q_Rd',
        formula: 'q_Rd = n_sveiser · a · f_vw,d     (f_vw,d hentes fra modulen weld_capacity/, regnes ikke ut her)',
        subst: explicitQrd ? `satt direkte = ${n(c.qRd)} N/mm` : `${n(c.nWelds, 0)} · ${n(c.a_weld)} · ${n(c.fvwd)}`,
        result: jt.check.qRd == null ? '–' : q(jt.check.qRd, 'N/mm'),
      }),
      step('check', {
        sym: 'utnyttelse',
        formula: 'util = q_tot / q_Rd',
        subst: `${n(jt.qTot)} / ${jt.check.qRd == null ? '–' : n(jt.check.qRd)}`,
        result: jt.check.util == null ? '–' : pct(jt.check.util * 100),
      }),
    ];
  }

  if (c.kind === 'glue') {
    return [
      step('check', {
        sym: 'τ',
        formula: 'τ = q_tot / b',
        subst: `${n(jt.qTot)} N/mm / ${n(jt.b, 1)} mm`,
        result: jt.tau == null ? '–' : q(jt.tau, 'N/mm²'),
      }),
      step('check', {
        sym: 'utnyttelse',
        formula: 'util = τ / τ_Rd',
        subst: `${n(jt.tau)} / ${n(c.tauRd)}`,
        result: jt.check.util == null ? '–' : pct(jt.check.util * 100),
      }),
    ];
  }

  return [
    step('check', {
      sym: 's_req',
      formula: 's_req = rader · F_Rd · 1000 / q_tot     (F_Rd i kN, q i N/mm)',
      subst: `${n(c.rows, 0)} · ${n(c.FRd)} · 1000 / ${n(jt.qTot)}`,
      result:
        jt.check.sReq === Infinity ? 'ingen krav (q_tot = 0)' : jt.check.sReq == null ? '–' : q(jt.check.sReq, 'mm', 1),
    }),
    step('check', {
      sym: 'utnyttelse',
      formula: 'util = q_tot · s / (rader · F_Rd · 1000)',
      subst: `${n(jt.qTot)} · ${n(c.spacing, 0)} / (${n(c.rows, 0)} · ${n(c.FRd)} · 1000)`,
      result: jt.check.util == null ? '–' : pct(jt.check.util * 100),
    }),
  ];
}

/* ================================================================== *
 * Shear lag (Volkersen) og forankring i enden
 * ================================================================== */

function volkersenSteps(jt, res) {
  if (!jt.volkersen || !jt.volkersen.valid) return [];
  const c = jt.connector;
  const v = jt.volkersen;
  const l = res.loads;
  return [
    step('volkersen', {
      sym: 'k',
      formula:
        c.kind === 'glue'
          ? 'k = G_a · b / t_a     [(N/mm²)·mm/mm = N/mm²]'
          : 'k = K_ser · rader / s     [(N/mm)·(1/mm) = N/mm²]',
      subst:
        c.kind === 'glue'
          ? `${n(c.Ga, 0)} · ${n(jt.b, 1)} / ${n(c.ta)}`
          : `${n(jt.slip && jt.slip.valid ? jt.slip.K : c.Kser, 0)} · ${n(c.rows, 0)} / ${n(c.spacing, 0)}`,
      result: q(jt.kConn, 'N/mm²'),
      note:
        c.kind !== 'glue' && jt.slip
          ? `K_ser fra ${jt.slip.source === 'ec5' ? 'EC5 tabell 7.1' : 'fritt innlagt (ETA)'} — samme stivhet som γ-metoden bruker.`
          : '',
    }),
    step('volkersen', {
      sym: 'λ',
      formula: 'λ = √( k · (1/α + 1/β) ),  α = (EA)_øvrig, β = (EA)_gruppe',
      subst: `√(${n(jt.kConn)} · (1/${n(jt.EA_other, 0)} + 1/${n(jt.EA_group, 0)}))`,
      result: q(v.lambda, '1/mm', 6),
    }),
    step('volkersen', {
      sym: 'q_max',
      formula: 'q(x) = (P·λ/2)·[cosh(λx′)/sinh(λL/2) + ((α−β)/(α+β))·sinh(λx′)/cosh(λL/2)],  x′ = x − L/2',
      subst: `maks |q| over x ∈ [0, ${n(l.L, 0)} mm], med P = ${n(Math.abs(jt.dN), 0)} N`,
      result: q(v.qMax, 'N/mm'),
      note: `Toppfaktor q_max/q_avg = ${n(v.peakFactor, 3)}. Integralet av q over skjøten er per konstruksjon lik P.`,
    }),
  ];
}

function anchorSteps(jt) {
  const a = jt.anchorReq;
  if (!a) return [];
  const out = [
    // §5.3: N_G står her, i FORANKRINGSdelen, og ikke i kraftdelen over.
    // Den er det samme momentet sett fra den andre siden av q = dN/dz, og
    // ville blitt telt to ganger som et eget ledd i q_tot.
    step('anchor', {
      sym: 'N_G',
      formula: 'N_G = κ_x·ES*_x + κ_y·ES*_y   (biaksiell bøyning, §1 — κ fra M_x/M_y og hovedstivhetene)',
      subst: 'for gruppa denne skjøten fører kraft til',
      result: q(a.NG_kN, 'kN'),
      note: 'Momentet gir INGEN egen skjærstrøm i q_tot — dette er et separat krav til hva som må være innført over L.',
    }),
    step('anchor', {
      sym: 'q_req',
      formula: 'q_req = N_G / L',
      subst: `${n(a.NG, 0)} N / ${n(a.L, 0)} mm`,
      result: a.qReq == null ? '–' : q(a.qReq, 'N/mm'),
      note: 'Middelverdi over hele forankringssonen — et ALTERNATIVT kriterium til q_tot, aldri en sum.',
    }),
    step('anchor', {
      sym: 'q_gov',
      formula: 'q_gov = max(q_tot, q_req)',
      subst: `max(${n(a.qTot)}, ${a.qReq == null ? '0' : n(a.qReq)})`,
      result: q(a.qGoverning, 'N/mm'),
    }),
  ];
  if (a.n != null) {
    out.push(
      step('anchor', {
        sym: 'F_Ed',
        formula: 'F_Ed = q_gov · L / n',
        subst: `${n(a.qGoverning)} N/mm · ${n(a.L, 0)} mm / ${n(a.n, 0)}`,
        result: q(a.FEd, 'kN'),
        note:
          a.FRdCap != null
            ? `Utnyttelse mot F_Rd = ${n(a.FRdCap)} kN: ${a.util == null ? '–' : pct(a.util * 100)}.`
            : 'Nødvendig kapasitet — ingen F_Rd oppgitt.',
      })
    );
  }
  return out;
}

/* ================================================================== *
 * Forutsetninger
 * ================================================================== */

/**
 * Forbeholdene som står under utledningen. De er HTML-fragmenter (ett per
 * punkt i lista) og ikke formler, men de hører til utledningen på nøyaktig
 * samme måte: de skal stå både i panelet og i rapporten, og de skal ikke
 * kunne gli fra hverandre.
 * @type {ReadonlyArray<string>}
 */
export const DERIVATION_ASSUMPTIONS = Object.freeze([
  '<strong>Full samvirkning</strong> mellom delene: tverrsnittet forblir plant, og det er ' +
    'ingen glidning i skjøten. Skjærstrømmen er nettopp den kraften forbindelsen må ta for at ' +
    'dette skal holde.',
  '<strong>Lineær elastisitet</strong>: σ = E·ε i alle deler, med E fra materialvalget. ' +
    'Ingen riss, ingen flyt, ingen kryp — skal du regne langtid, sett inn en redusert E selv.',
  '«Før»-kreftene gjelder det <strong>eksisterende</strong> tverrsnittet alene, «etter»- ' +
    'kreftene det <strong>sammensatte</strong>. Er alt merket eksisterende, finnes bare «før».',
  'Naboskap uten en skjøt regnes som stivt forbundet: former som berører eller overlapper ' +
    'hverandre og ikke har en skjøt mellom seg, oppfører seg som støpt sammen.',
  'Vektfaktoren <code>factor</code> påvirker bare tyngdepunktsfanen. Her brukes bare ' +
    '<code>material.E</code>.',
  'Beregningen er <strong>iterativ i praksis</strong>: ny geometri gir ny stivhet, som gir ' +
    'nye krefter. Tallene her gjelder de kreftene som er tastet inn.',
]);

/* ================================================================== *
 * Modellen
 * ================================================================== */

/**
 * Hele utledningen som data.
 *
 * REKKEFØLGEN ER FAST og en del av kontrakten: først tverrsnittsgruppa
 * (`key: 'section'`), så én gruppe per skjøt i modellens egen rekkefølge, med
 * skjøtens id som `key`. Rapporten og panelet skal vise det samme i samme
 * rekkefølge, og en test kan da si noe presist om hva som skal stå hvor.
 *
 * `title` er RÅ tekst, ikke HTML. Skjøtenavn er brukerdata og skal escapes av
 * den som rendrer — modellen skal kunne brukes av en rendrer som ikke lager
 * HTML i det hele tatt.
 *
 * @param {Object} res Resultatet fra `computeReinforcement()`
 * @returns {Array<{key: string, title: string, steps: Step[]}>}
 */
export function derivationModel(res) {
  if (!res) return [];
  const groups = [
    {
      key: 'section',
      title: res.allExisting ? 'Tverrsnittet (eksisterende)' : 'Tverrsnittet og aksialkraften',
      steps: sectionSteps(res),
    },
  ];
  for (const jt of res.joints || []) {
    groups.push({
      key: jt.id,
      title: jt.name,
      steps: [...flowSteps(jt, res), ...checkSteps(jt), ...volkersenSteps(jt, res), ...anchorSteps(jt)],
    });
  }
  return groups;
}
