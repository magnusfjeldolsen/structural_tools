/**
 * Help, tour and agent strings (nb + en). Kept separate from the editor's
 * dictionary so this module can be developed independently. Plain words, no
 * FEM jargon; standards are cited where a number comes from one.
 */
export type HelpLang = 'nb' | 'en';

export interface HelpPage {
  id: string;
  title: string;
  /** Simple block markup: lines starting with '# ' are headings, '- ' bullets, '> ' notes, '| ' table rows (cells split by ' | '). Blank line separates paragraphs. */
  body: string;
}

export interface GlossaryRow {
  term: string;
  en: string;
  meaning: string;
}

const GLOSSARY_NB: GlossaryRow[] = [
  { term: 'Prosjekt', en: 'Project', meaning: 'Hele modellen i ett dokument: regioner, materialer, randbetingelser, tidsserier, målepunkter, analyser og scenarier. Én sannhet; alt annet er avledet.' },
  { term: 'Region', en: 'Region', meaning: 'Et sammenhengende område i snittet med ett materiale. Kan ha hull. Regioner kan ligge inni hverandre, men ikke delvis overlappe.' },
  { term: 'Armeringsstang', en: 'Rebar', meaning: 'En rund stang med senter, diameter og stålmateriale. Regnes termisk som stål (standard) eller leses som betongtemperatur hvis du setter betong som materiale på stangen.' },
  { term: 'Armeringssett', en: 'Rebar set', meaning: 'En regel som lager stenger fra geometrien (kantrad, hjørner, rutenett, ring) og lager dem på nytt når geometrien endres.' },
  { term: 'Overdekning', en: 'Cover', meaning: 'Avstand fra betongoverflaten til lengdearmeringens overflate (standard) eller senter. Tverrarmering (bøyler, fordelingsarmering) legges til som egen avstand «Ø tverrarmering» og regnes ikke termisk.' },
  { term: 'Bøyle', en: 'Stirrup', meaning: 'Lukket armeringsbane i overdekningsavstand fra kanten. Standard: kun posisjonsreferanse, ikke meshet.' },
  { term: 'Randbetingelse', en: 'Boundary condition', meaning: 'Hva som skjer på en kant: fast temperatur, konveksjon, konveksjon + stråling, varmefluks eller isolert. Hver kant har nøyaktig én; standard er isolert.' },
  { term: 'Eksponering', en: 'Exposure', meaning: 'Snarvei som setter randbetingelser på hele flater i klartekst: brann, ueksponert, isolert, inne, ute.' },
  { term: 'Eksponert side', en: 'Exposed face', meaning: 'Kant med brannkurve: konveksjon + stråling mot gasstemperaturen.' },
  { term: 'Ueksponert side', en: 'Unexposed face', meaning: 'Kant mot omgivelsene under brann. Ingen brannstråling treffer den; varmeovergangen er et valg: 4 W/m²K (standard, EN 1991-1-2 §3.1(5)), 9 W/m²K (§3.1(6), stråling til omgivelsene innbakt) eller egen verdi.' },
  { term: 'Tidsserie', en: 'Time series', meaning: 'Verdi mot tid (°C eller W/m²) som styrer en randbetingelse eller varmekilde. Brannkurver og klimaserier er tidsserier med sitering.' },
  { term: 'Brannkurve', en: 'Fire curve', meaning: 'Standardisert gasstemperatur mot tid (ISO 834, hydrokarbon, parametrisk …) hentet fra biblioteket.' },
  { term: 'Målepunkt', en: 'Probe', meaning: 'Et punkt der temperaturen leses ut over tid. Skrevet inn, klikket, ved en dybde fra en flate, eller automatisk i hver armeringsstang.' },
  { term: 'Linjeprofil', en: 'Line probe', meaning: 'En linje som gir temperaturprofilen langs seg ved valgt tid.' },
  { term: 'Analyse', en: 'Analysis', meaning: 'Kjøreoppsett: stasjonær, transient eller periodisk, med varighet, tidssteg og toleranser.' },
  { term: 'Scenario', en: 'Scenario', meaning: 'En variant av prosjektet uttrykt som overstyringer (materialbytte, annen kurve, annen overdekning). Kjøres og sammenlignes ved siden av basismodellen.' },
  { term: 'Metrikk', en: 'Metric', meaning: 'En avledet størrelse etter kjøring: varmestrøm, U-verdi, ψ-verdi, overflatetemperatur, f_Rsi, tid til terskel.' },
  { term: 'Bibliotek', en: 'Library', meaning: 'Materialer og kurver med sitering og kvalitetsflagg (standard, produsent, typisk, bruker). Innebygde elementer er skrivebeskyttet; prosjektet lagrer en kopi av det det bruker.' },
  { term: 'Egendefinert materiale', en: 'Custom material', meaning: 'Materiale du har laget eller endret. Lagres i prosjektet, og kan deles via firmabiblioteket.' },
  { term: 'Firmabibliotek', en: 'Company library', meaning: 'Delte materialer og kurver i en mappe i Git-repoet, lest av både appen og serveren.' },
  { term: 'Resultat', en: 'Run result', meaning: 'Mesh, temperaturfelt ved utdatatidspunkter og målepunkthistorikk for én analyse og ett scenario. Blir utdatert når modellen endres, men slettes ikke før neste kjøring.' },
  { term: 'Utdatert', en: 'Stale', meaning: 'Resultat som ikke lenger svarer til modellen.' },
];

const GLOSSARY_EN: GlossaryRow[] = [
  { term: 'Project', en: 'Prosjekt', meaning: 'The whole model in one document: regions, materials, boundary conditions, time series, probes, analyses and scenarios. One truth; everything else is derived.' },
  { term: 'Region', en: 'Region', meaning: 'A connected area of the section with one material. May have holes. Regions may nest but not partially overlap.' },
  { term: 'Rebar', en: 'Armeringsstang', meaning: 'A round bar with centre, diameter and steel material. Thermally it is steel (default) or read as concrete temperature if you assign concrete to the bar.' },
  { term: 'Rebar set', en: 'Armeringssett', meaning: 'A rule that generates bars from the geometry (edge row, corners, grid, ring) and regenerates them when the geometry changes.' },
  { term: 'Cover', en: 'Overdekning', meaning: 'Distance from the concrete surface to the surface (default) or centre of the longitudinal bar. Transverse reinforcement (stirrups, distribution bars) is added as the separate distance "Ø transverse" and is not modelled thermally.' },
  { term: 'Stirrup', en: 'Bøyle', meaning: 'Closed reinforcement path at cover distance from the edge. Default: position reference only, not meshed.' },
  { term: 'Boundary condition', en: 'Randbetingelse', meaning: 'What happens on an edge: fixed temperature, convection, convection + radiation, heat flux or insulated. Each edge has exactly one; the default is insulated.' },
  { term: 'Exposure', en: 'Eksponering', meaning: 'Shortcut that sets boundary conditions on whole faces in plain words: fire, unexposed, insulated, indoor, outdoor.' },
  { term: 'Exposed face', en: 'Eksponert side', meaning: 'Edge with a fire curve: convection + radiation to the gas temperature.' },
  { term: 'Unexposed face', en: 'Ueksponert side', meaning: 'Edge towards the surroundings during fire. No fire radiation reaches it; the film coefficient is a choice: 4 W/m²K (default, EN 1991-1-2 §3.1(5)), 9 W/m²K (§3.1(6), radiation to the surroundings included) or a custom value.' },
  { term: 'Time series', en: 'Tidsserie', meaning: 'Value against time (°C or W/m²) that drives a boundary condition or heat source. Fire curves and climate series are time series with a citation.' },
  { term: 'Fire curve', en: 'Brannkurve', meaning: 'Standardised gas temperature against time (ISO 834, hydrocarbon, parametric …) from the library.' },
  { term: 'Probe', en: 'Målepunkt', meaning: 'A point where the temperature is read over time. Typed, clicked, at a depth from a face, or automatic at every rebar.' },
  { term: 'Line probe', en: 'Linjeprofil', meaning: 'A line along which the temperature profile is read at the selected time.' },
  { term: 'Analysis', en: 'Analyse', meaning: 'Run setup: steady, transient or periodic, with duration, time step and tolerances.' },
  { term: 'Scenario', en: 'Scenario', meaning: 'A variant of the project expressed as overrides (material swap, other curve, other cover). Run and compared next to the base model.' },
  { term: 'Metric', en: 'Metrikk', meaning: 'A derived quantity after a run: heat flow, U-value, ψ-value, surface temperature, f_Rsi, time to threshold.' },
  { term: 'Library', en: 'Bibliotek', meaning: 'Materials and curves with citation and quality flag (standard, manufacturer, typical, user). Built-ins are read-only; the project stores a copy of what it uses.' },
  { term: 'Custom material', en: 'Egendefinert materiale', meaning: 'A material you made or changed. Stored in the project; can be shared through the company library.' },
  { term: 'Company library', en: 'Firmabibliotek', meaning: 'Shared materials and curves in a folder of the Git repository, read by the app and the server.' },
  { term: 'Run result', en: 'Resultat', meaning: 'Mesh, temperature fields at output times and probe histories for one analysis and one scenario. Becomes stale when the model changes but is kept until the next run.' },
  { term: 'Stale', en: 'Utdatert', meaning: 'A result that no longer matches the model.' },
];

export const AGENT_HELP_NB = `thermo2d har et lite API på siden for agenter (Claude in Chrome og andre). Det er alltid på og bruker samme kommandolag som knappene i appen.

Start med \`window.thermo2d.describe()\` i konsollen eller via et JavaScript-verktøy. Svaret er en liste over verktøy i MCP-form: navn, beskrivelse og JSON-skjema for inndata. Kall et verktøy med \`window.thermo2d.call('navn', { ...inndata })\` eller \`window.thermo2d.tools.navn({ ... })\`. Alle svar er vanlig JSON.

Typisk rekkefølge: \`list_templates\` → \`create_from_template\` → \`search_library\` + \`apply_commands\` (materialer, armering, eksponering, målepunkter) → \`validate\` → \`run_analysis\` → \`query_results\`. Feil svarer med felt, årsak og gyldige alternativer, så du kan rette uten å gjette.

Når en agent kaller API-et, vises et merke «Agent aktiv» nede til venstre i noen sekunder, slik at brukeren ser hva som skjer. Full beskrivelse med eksempel: agent.md på modulens adresse.`;

export const AGENT_HELP_EN = `thermo2d exposes a small in-page API for agents (Claude in Chrome and others). It is always on and uses the same command layer as the buttons in the app.

Start with \`window.thermo2d.describe()\` in the console or through a JavaScript tool. It returns a list of tools in MCP shape: name, description and a JSON Schema for the input. Call a tool with \`window.thermo2d.call('name', { ...input })\` or \`window.thermo2d.tools.name({ ... })\`. Every answer is plain JSON.

Typical order: \`list_templates\` → \`create_from_template\` → \`search_library\` + \`apply_commands\` (materials, reinforcement, exposure, probes) → \`validate\` → \`run_analysis\` → \`query_results\`. Errors name the field, the reason and the valid options, so you can correct without guessing.

While an agent calls the API a badge "Agent active" appears bottom-left for a few seconds so the user sees what is happening. Full description with a worked example: agent.md at the module address.`;

function pagesNb(): HelpPage[] {
  return [
    {
      id: 'start',
      title: 'Kom i gang: brann på en bjelke',
      body: `Slik får du temperaturen i armeringen etter 90 minutter brann, fra blankt lerret til tall. Omvisningen («Start omvisning» nederst) leder deg gjennom akkurat disse stegene i appen.

# 1. Velg en mal
Trykk «Ny» og velg «Rektangulær bjelke». Skriv bredde og høyde i mm. La haken «Legg til betong, ISO 834 og brann på tre sider» stå, så får du et kjørbart oppsett med én gang.

# 2. Materiale
Fanen «Materialer» viser hva prosjektet bruker. «Legg til fra bibliotek» åpner søk; hvert materiale har kilde (standard eller datablad) og et kvalitetsflagg. Verdier merket «typisk» bør byttes med datablad før en leveranse.

# 3. Eksponering
Fanen «Eksponering»: velg sider (under, venstre, høyre) og «Brann». Toppen settes til «Ueksponert». Kantene farges etter randbetingelsen de har fått.

# 4. Armering
Fanen «Armering»: «Kantrad», pek på underkanten, sett Ø, antall og overdekning. Overdekningen måles til lengdearmeringens overflate; legg bøylediameteren i feltet «Ø tverrarmering». Hver stang får automatisk et målepunkt.

# 5. Kjør
Sett varighet (90 min) og tidssteg (5 s) øverst og trykk «Kjør». En vanlig bjelke tar noen sekunder.

# 6. Les resultatet
Konturplottet viser temperaturfeltet ved tiden på glideren. Klikk hvor som helst i snittet for en midlertidig avlesning, og «Fest» den for å få kurven over tid. Fanen «Brann» gir tabellen med stangtemperaturer, k_s(θ) og redusert flytegrense, pluss 500 °C-isotermen.

> Endrer du modellen etter kjøringen, merkes resultatet «Utdatert» til du kjører på nytt. Ingenting slettes før da.`,
    },
    {
      id: 'climate',
      title: 'Klima og U-verdi',
      body: `Samme verktøy regner stasjonært for U-verdi, kuldebroer (ψ) og innvendig overflatetemperatur.

# Oppsett
Tegn snittet som regioner (betong, isolasjon, gips …) eller bruk malen «Lagdelt vegg». Sett «Inne» på innsiden og «Ute» på utsiden i fanen «Eksponering». Inne bruker overgangsmotstand R_si = 0,13 m²K/W (vannrett varmestrøm), ute R_se = 0,04 m²K/W, etter EN ISO 6946.

# Analyse
Velg «Stasjonær» i fanen «Analyse». For døgn- eller årsvariasjon velger du «Periodisk» og en sinus- eller importert klimaserie; løseren gjentar perioden til den er innsvingt.

# Avlesning
Fanen «Bygningsfysikk» gir varmestrøm, U-verdi, laveste og midlere overflatetemperatur, f_Rsi og en duggpunktsjekk for valgt innetemperatur og luftfuktighet. Metrikker du legger til i prosjektet beregnes og vises her.

> Dampdiffusjon (Glaser) er ikke en del av thermo2d; det kommer som eget verktøy som bruker samme temperaturfelt.`,
    },
    {
      id: 'bc',
      title: 'Randbetingelser',
      body: `En randbetingelse sier hva som skjer på en kant. Hver kant har nøyaktig én; kanter uten tilordning er isolerte (ingen varmestrøm).

# Typer
- Fast temperatur: kanten holder temperaturen i en tidsserie.
- Konveksjon: q = α(θ_luft − θ_overflate), med α i W/m²K eller overgangsmotstand R_s i m²K/W.
- Konveksjon + stråling (brann): EN 1991-1-2 §3.1, med α_c = 25 W/m²K, Φ = 1, ε_m fra materialet (0,7 for betong), ε_f = 1.
- Varmefluks: påtrykt W/m², for eksempel absorbert sol.
- Isolert: ingen varmestrøm, også brukt for symmetrisnitt.

# Ueksponert side under brann
Ingen brannstråling treffer den siden. Valgene er 4 W/m²K (standard; EN 1991-1-2 §3.1(5), konveksjon alene), 9 W/m²K (§3.1(6), der stråling til omgivelsene er bakt inn i tallet) eller egen verdi. Forskjellen betyr lite for stenger nær brannsiden og 10–20 K for stenger nær den ueksponerte siden.

# Tilordning
Velg en randbetingelse i listen, så er «Mal på kanter» på: hver kant du klikker i tegningen får den randbetingelsen med én gang; shift-klikk fjerner. Sideknappene (under, topp, venstre, høyre, alle ytterkanter) er hurtigvalg. Trenger du to randbetingelser på én rett side, bruk «Sett inn punkt på kant»; begge delene arver den gamle tilordningen, og du maler om den ene.`,
    },
    {
      id: 'rebar',
      title: 'Armering og overdekning',
      body: `# Overdekning
Overdekning måles fra betongoverflaten til lengdearmeringens overflate (du kan bytte til senter under prosjektinnstillinger). Bøyler og annen tverrarmering legges inn som avstand i feltet «Ø tverrarmering»; stangsenteret blir overdekning + Ø tverrarmering + Ø/2. Tverrarmeringen regnes ikke termisk.

# Sett som følger geometrien
Kantrad, hjørner, rutenett og ring lages på nytt når geometrien, overdekningen eller delingen endres. Flytter du en enkelt stang, løsnes den fra settet og blir manuell. Stengene nummereres B1, B2 … stabilt.

# Stål eller betong
Stengene meshes som stål som standard: stålet leder og lagrer varme, så hjørnestenger blir 20–40 K kaldere enn om du leser betongtemperaturen i stangsenteret. EN 1992-1-2 tillegg A og de fleste verktøy oppgir betongtemperaturen. I resultattabellen kan du trykke «Vis betongtemperatur ved stangsenter» for å få begge tall ved siden av hverandre.

# Kontroller
Appen advarer om fri avstand under 20 mm eller Ø, overdekning under Ø, stenger utenfor betongen og stenger som overlapper. Advarslene stopper ikke kjøringen.`,
    },
    {
      id: 'probes',
      title: 'Målepunkter og resultater',
      body: `# Målepunkter
- Skriv inn: fanen «Målepunkter», rad med navn, x og y i mm. Lim gjerne inn fra Excel.
- Dybde fra flate: velg en kant og en dybde, så plasseres punktet på innsiden av kanten.
- Klikk: i resultatvisningen gir ett klikk en midlertidig avlesning; «Fest» gjør den permanent.
- Automatisk: hver armeringsstang har et målepunkt i senter.

Målepunkter du legger til etter kjøringen leses fra de lagrede feltene, så du trenger ikke kjøre på nytt.

# Visning
Fargeskalaen er fast 0–1100 °C i 100 °C-bånd, slik at plott kan sammenlignes på øyemål; du kan endre min, maks og trinn. Isolinjer kan slås av og på; 500 °C-isotermen fremheves når snittet har armering. Temperaturen varierer lineært innenfor hvert element, og båndene tegnes eksakt etter det.

# Tid
Glideren og spill-knappen flytter tiden; klikk i kurvediagrammet setter den også. Tabellen viser valgte tidspunkter (30, 60, 90, 120 min som standard) og kan kopieres eller lagres som CSV med norsk eller engelsk tallformat.

# Eksport
PNG av plottet, SVG og CSV via figurkittet, og en selvstendig interaktiv HTML-fil som kan sendes på e-post og åpnes uten nett.`,
    },
    { id: 'glossary', title: 'Ordliste', body: GLOSSARY_NB.map((g) => `| ${g.term} | ${g.en} | ${g.meaning}`).join('\n') },
    { id: 'agents', title: 'For agenter', body: AGENT_HELP_NB },
  ];
}

function pagesEn(): HelpPage[] {
  return [
    {
      id: 'start',
      title: 'Getting started: fire on a beam',
      body: `How to get the rebar temperature after 90 minutes of fire, from a blank canvas to numbers. The tour ("Start tour" at the bottom) walks you through exactly these steps in the app.

# 1. Pick a template
Press "New" and choose "Rectangular beam". Type width and height in mm. Leave "Add concrete, ISO 834 and fire on three sides" ticked to get a runnable setup at once.

# 2. Material
The "Materials" tab lists what the project uses. "Add from library" opens search; every material has a source (standard or datasheet) and a quality flag. Values flagged "typical" should be replaced with datasheet values before a deliverable.

# 3. Exposure
"Exposure" tab: pick faces (bottom, left, right) and "Fire". The top becomes "Unexposed". Edges are coloured by the boundary condition they carry.

# 4. Reinforcement
"Reinforcement" tab: "Edge row", point at the bottom edge, set Ø, count and cover. Cover is measured to the surface of the longitudinal bar; put the stirrup diameter in "Ø transverse". Every bar gets a probe automatically.

# 5. Run
Set duration (90 min) and time step (5 s) at the top and press "Run". An ordinary beam takes a few seconds.

# 6. Read the result
The contour plot shows the field at the slider time. Click anywhere in the section for a temporary reading and "Pin" it to get the curve over time. The "Fire" tab gives the rebar table with temperatures, k_s(θ) and reduced yield strength, plus the 500 °C isotherm.

> If you change the model after a run, the result is marked "Stale" until you run again. Nothing is deleted before that.`,
    },
    {
      id: 'climate',
      title: 'Climate and U-value',
      body: `The same tool solves steady state for U-values, thermal bridges (ψ) and inner surface temperature.

# Setup
Draw the section as regions (concrete, insulation, gypsum …) or use the "Layered wall" template. Set "Indoor" on the inside and "Outdoor" on the outside in the "Exposure" tab. Indoor uses R_si = 0.13 m²K/W (horizontal heat flow), outdoor R_se = 0.04 m²K/W, per EN ISO 6946.

# Analysis
Choose "Steady" in the "Analysis" tab. For daily or yearly variation choose "Periodic" with a sine or imported climate series; the solver repeats the period until it settles.

# Reading
The "Building physics" tab gives heat flow, U-value, minimum and mean surface temperature, f_Rsi and a dew-point check for a chosen indoor temperature and humidity. Metrics added to the project are evaluated and shown here.

> Vapour diffusion (Glaser) is not part of thermo2d; it will come as a separate tool using the same temperature field.`,
    },
    {
      id: 'bc',
      title: 'Boundary conditions',
      body: `A boundary condition says what happens on an edge. Each edge has exactly one; unassigned edges are insulated (no heat flow).

# Types
- Fixed temperature: the edge follows a time series.
- Convection: q = α(θ_air − θ_surface), with α in W/m²K or a surface resistance R_s in m²K/W.
- Convection + radiation (fire): EN 1991-1-2 §3.1, with α_c = 25 W/m²K, Φ = 1, ε_m from the material (0.7 for concrete), ε_f = 1.
- Heat flux: imposed W/m², e.g. absorbed solar radiation.
- Insulated: no heat flow, also used for symmetry cuts.

# Unexposed face during fire
No fire radiation reaches that face. The choices are 4 W/m²K (default; EN 1991-1-2 §3.1(5), convection alone), 9 W/m²K (§3.1(6), radiation to the surroundings folded into the number) or a custom value. The difference matters little for bars near the fire and 10–20 K for bars near the unexposed face.

# Assigning
Select a boundary condition in the list and "Paint on edges" is on: every edge you click in the drawing gets it immediately; shift-click removes. The side buttons (bottom, top, left, right, all exterior) are shortcuts. For two conditions on one straight side use "Insert point on edge"; both halves inherit the old assignment and you repaint one.`,
    },
    {
      id: 'rebar',
      title: 'Reinforcement and cover',
      body: `# Cover
Cover is measured from the concrete surface to the surface of the longitudinal bar (switch to centre under project settings). Stirrups and other transverse reinforcement are entered as a distance in "Ø transverse"; the bar centre becomes cover + Ø transverse + Ø/2. Transverse reinforcement is not modelled thermally.

# Sets that follow the geometry
Edge rows, corners, grids and rings regenerate when the geometry, cover or spacing changes. Moving a single bar detaches it from its set. Bars are numbered B1, B2 … stably.

# Steel or concrete
Bars are meshed as steel by default: steel conducts and stores heat, so corner bars come out 20–40 K cooler than the concrete temperature at the bar centre. EN 1992-1-2 Annex A and most tools report the concrete temperature. In the result table, press "Show concrete temperature at bar centre" to see both side by side.

# Checks
The app warns about clear spacing below 20 mm or Ø, cover below Ø, bars outside the concrete and overlapping bars. Warnings do not stop the run.`,
    },
    {
      id: 'probes',
      title: 'Probes and results',
      body: `# Probes
- Typed: "Probes" tab, a row with name, x and y in mm. Paste from Excel if you like.
- Depth from a face: pick an edge and a depth; the point is placed inside the edge.
- Click: in the results view one click gives a temporary reading; "Pin" makes it permanent.
- Automatic: every rebar has a probe at its centre.

Probes added after the run are read from the stored fields, so no rerun is needed.

# Display
The colour scale is fixed at 0–1100 °C in 100 °C bands so plots compare at a glance; change min, max and step if you need. Isolines can be toggled; the 500 °C isotherm is highlighted when the section has rebars. Temperature varies linearly inside each element and the bands are drawn exactly from that.

# Time
The slider and play button move the time; clicking in the chart sets it too. The table shows chosen times (30, 60, 90, 120 min by default) and copies or saves as CSV in Norwegian or English number format.

# Export
PNG of the plot, SVG and CSV through the figure kit, and a self-contained interactive HTML file that can be e-mailed and opened offline.`,
    },
    { id: 'glossary', title: 'Glossary', body: GLOSSARY_EN.map((g) => `| ${g.term} | ${g.en} | ${g.meaning}`).join('\n') },
    { id: 'agents', title: 'For agents', body: AGENT_HELP_EN },
  ];
}

export function helpPages(lang: HelpLang): HelpPage[] {
  return lang === 'nb' ? pagesNb() : pagesEn();
}

export interface TourStepText {
  title: string;
  body: string;
}

const UI_NB = {
  help: 'Hjelp',
  close: 'Lukk',
  startTour: 'Start omvisning',
  tourDone: 'Omvisning fullført',
  agentsLink: 'Åpne agent.md',
  next: 'Neste',
  back: 'Tilbake',
  skip: 'Hopp over',
  finish: 'Ferdig',
  stepOf: (i: number, n: number) => `Steg ${i} av ${n}`,
  waiting: 'Gjør steget i appen, så går omvisningen videre av seg selv.',
  agentActive: 'Agent aktiv',
  glossaryHead: ['Begrep', 'Engelsk', 'Betydning'],
};
const UI_EN: typeof UI_NB = {
  help: 'Help',
  close: 'Close',
  startTour: 'Start tour',
  tourDone: 'Tour completed',
  agentsLink: 'Open agent.md',
  next: 'Next',
  back: 'Back',
  skip: 'Skip',
  finish: 'Finish',
  stepOf: (i, n) => `Step ${i} of ${n}`,
  waiting: 'Do the step in the app and the tour moves on by itself.',
  agentActive: 'Agent active',
  glossaryHead: ['Term', 'Norwegian', 'Meaning'],
};

export function helpUi(lang: HelpLang): typeof UI_NB {
  return lang === 'nb' ? UI_NB : UI_EN;
}

export function tourSteps(lang: HelpLang): TourStepText[] {
  return lang === 'nb'
    ? [
        { title: 'Velg en mal', body: 'Trykk «Ny» og velg «Rektangulær bjelke». Skriv 300 × 500 mm og trykk «Opprett».' },
        { title: 'Materiale', body: 'Regionen trenger et materiale. Med forslagshaken på har bjelken allerede fått betong; ellers: fanen «Materialer» → «Legg til fra bibliotek».' },
        { title: 'Eksponering', body: 'Fanen «Eksponering»: brann på under, venstre og høyre side, «Ueksponert» på toppen. Kantene farges rødt og blått.' },
        { title: 'Armering', body: 'Fanen «Armering» → «Kantrad»: pek på underkanten, Ø20, 4 stk, overdekning 35 mm. Legg eventuell bøylediameter i «Ø tverrarmering».' },
        { title: 'Målepunkter', body: 'Hver stang fikk et målepunkt i senter automatisk. I fanen «Målepunkter» kan du legge til flere, for eksempel 25 og 50 mm fra underkant.' },
        { title: 'Kjør', body: 'Sett varighet 90 min og tidssteg 5 s øverst, og trykk «Kjør». Fremdriften vises i knappen.' },
        { title: 'Klikk i snittet', body: 'Klikk hvor som helst i konturplottet for en avlesning, og trykk «Fest som målepunkt» for å få kurven over tid.' },
        { title: 'Stangtemperaturer', body: 'Fanen «Brann» til høyre gir tabellen med temperatur, k_s(θ) og redusert flytegrense for hver stang, og 500 °C-isotermen i plottet.' },
      ]
    : [
        { title: 'Pick a template', body: 'Press "New" and choose "Rectangular beam". Type 300 × 500 mm and press "Create".' },
        { title: 'Material', body: 'The region needs a material. With the suggestion box ticked the beam already has concrete; otherwise: "Materials" tab → "Add from library".' },
        { title: 'Exposure', body: '"Exposure" tab: fire on bottom, left and right, "Unexposed" on top. Edges turn red and blue.' },
        { title: 'Reinforcement', body: '"Reinforcement" tab → "Edge row": point at the bottom edge, Ø20, 4 bars, cover 35 mm. Put any stirrup diameter in "Ø transverse".' },
        { title: 'Probes', body: 'Every bar got a probe at its centre automatically. In the "Probes" tab you can add more, e.g. 25 and 50 mm from the bottom face.' },
        { title: 'Run', body: 'Set duration 90 min and time step 5 s at the top and press "Run". Progress shows in the button.' },
        { title: 'Click in the section', body: 'Click anywhere in the contour plot for a reading and press "Pin as probe" to get the curve over time.' },
        { title: 'Rebar temperatures', body: 'The "Fire" tab on the right gives the table with temperature, k_s(θ) and reduced yield strength per bar, and the 500 °C isotherm in the plot.' },
      ];
}
