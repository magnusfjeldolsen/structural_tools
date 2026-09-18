/**
 * hints.js — spørsmålstegnet som bærer kapitlenes forklaringstekst (runde 8 §4).
 *
 * HVORFOR EN SØSTERFIL OG IKKE EN UTVIDELSE AV `chart-tips.js`
 * `chart-tips.js` har det samme delegeringsmønsteret og den samme klemmingen
 * mot vindusranden, men den er noe ANNET: den følger pekeren over 69
 * datapunkter, bygger innholdet sitt selv fra tre hardkodede `data-hit`-typer,
 * og har ingen låsing fordi et punkt ikke er noe man leser i ro. Generaliserte
 * vi den til å gjøre begge deler, ville den blitt to ting i én fil — og den
 * neste som rettet en feil i plasseringen måtte lest to atferder for å vite om
 * rettelsen var trygg. Mønsteret er kopiert med vilje; koden er ikke.
 *
 * HVA DENNE FILA IKKE VET
 * Den kjenner ingen tekst. Innholdet kommer inn som `texts` — registeret i
 * `ui.js` — og merkene i markupen peker på det med `data-hint="nøkkel"`. Det er
 * hele grunnen til at teksten kan flyttes hit uten å bli KOPIERT hit: den står
 * ett sted, og både merket og boblen leser det samme stedet.
 *
 * HVORFOR HOVER ÅPNER OG KLIKK LÅSER
 * Brukerens egen bestilling, og de to gjør hver sin jobb. Hover koster ingen
 * handling og er derfor riktig for «hva står det her?». Men en boble som
 * forsvinner når musa glir, kan man verken lese i ro eller MERKE teksten i —
 * og disse tekstene er ofte den eneste forklaringen av hvorfor et tall er som
 * det er. Klikket låser, og da tar boblen imot musa (`pointer-events: auto`).
 * Escape og et klikk utenfor slipper låsen igjen.
 *
 * HVORFOR ÉN LYTTER PÅ VERTEN, IKKE ÉN PER MERKE
 * `render()` bygger radlistene på nytt med `innerHTML` ved hvert tastetrykk.
 * En lytter hengt på et merke ville dødd ved neste omtegning, stille. Lytteren
 * her sitter på `document.body` og overlever alt som skjer under den — og den
 * gjør dermed at et merke kan settes inn i en RAD senere uten at noe her må
 * endres.
 */

/** Luft mot vindusranden, og mellom merket og boblen. */
const EDGE = 8;
const GAP = 6;

/**
 * Hvor boblen skal stå, i klientkoordinater. REN funksjon — den er skilt ut
 * nettopp fordi den er den eneste delen av fila som kan gå galt uten at det
 * synes: en boble som havner utenfor vinduet er ikke en feilmelding, den er
 * bare borte. Her kan den regnes og påstås uten en nettleser.
 *
 * UNDER MERKET ER FØRSTEVALGET: der dekker boblen ikke overskriften eller
 * feltet man nettopp så på. Over er reserven, og bare når det faktisk er plass
 * der — ellers ville en boble nær toppen av skjermen blitt dyttet opp i
 * ingenting.
 *
 * @param {{top:number,bottom:number,left:number}} anchor merkets klientrektangel
 * @param {{width:number,height:number}} size boblas målte størrelse
 * @param {{width:number,height:number}} view vindusflata
 */
export function hintPosition(anchor, size, view) {
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - size.height;
  const fitsBelow = below + size.height + EDGE <= view.height;
  const fitsAbove = above >= EDGE;
  const placement = fitsBelow || !fitsAbove ? 'below' : 'above';
  const top = Math.max(EDGE, placement === 'below' ? below : above);
  // Venstrekanten følger merket, men skyves inn når boblen ellers ville stukket
  // ut til høyre. `Math.max` sist, slik at en boble som er bredere enn vinduet
  // begynner ved venstre rand i stedet for på et negativt tall.
  const left = Math.max(EDGE, Math.min(anchor.left, view.width - size.width - EDGE));
  return { left, top, placement };
}

/**
 * Kobler hintene til `host`. Kalles ÉN gang, med `document.body`.
 *
 * Dokumentet og vinduet hentes fra verten selv (`ownerDocument` /
 * `defaultView`) i stedet for fra globalene. Det er ikke seremoni: det er det
 * som gjør at atferden — hover åpner, klikk låser, klikk utenfor lukker — kan
 * KJØRES i en test uten nettleser, i stedet for å bli påstått med et
 * tekstsøk i kilden.
 *
 * @returns {{isOpen: () => boolean, close: () => void}} håndtaket `topOverlay`
 *   i `ui.js` bruker for at Escape skal lukke hintet FØR hjelpelista.
 */
export function attachHints(host, texts) {
  const doc = host && host.ownerDocument;
  const win = doc && doc.defaultView;
  const dead = { isOpen: () => false, close: () => {} };
  if (!doc || !win || host.dataset.hintsBound === '1') return dead;
  host.dataset.hintsBound = '1';

  let bubble = null;
  /** Merket boblen hører til akkurat nå, eller `null` når den er lukket. */
  let mark = null;
  /** Låst av et klikk? Da rører hverken hover eller pekerens avreise den. */
  let locked = false;

  const ensure = () => {
    if (bubble) return bubble;
    bubble = doc.createElement('div');
    bubble.setAttribute('role', 'tooltip');
    bubble.id = 'hint-bubble';
    // Samme dempede uttrykk som pekerboblene i figurene, med ÉN forskjell:
    // her brytes teksten (`white-space: normal`, `max-width`). Innholdet er
    // hele setninger, ikke tallrader, og en setning på én linje ville vært
    // bredere enn skjermen.
    bubble.style.cssText = [
      'position:fixed', 'z-index:70', 'display:none',
      'max-width:30rem', 'background:rgba(15,23,42,.98)', 'color:#cbd5e1',
      'border:1px solid #475569', 'border-radius:6px',
      'padding:8px 10px', 'font-size:12px', 'line-height:1.5',
      'white-space:normal', 'box-shadow:0 4px 14px rgba(0,0,0,.5)',
    ].join(';');
    doc.body.appendChild(bubble);
    return bubble;
  };

  function place() {
    if (!mark || !bubble) return;
    const anchor = mark.getBoundingClientRect();
    const view = { width: win.innerWidth, height: win.innerHeight };
    // Merket er rullet ut av syne. Uten dette ble boblen stående klemt mot
    // randen og pekte på ingenting — den samme feilen `chart-tips.js` løser
    // ved å skjule seg helt ved rulling.
    if (anchor.bottom < 0 || anchor.top > view.height) { close(); return; }
    const box = bubble.getBoundingClientRect();
    const p = hintPosition(anchor, { width: box.width, height: box.height }, view);
    bubble.style.left = `${p.left}px`;
    bubble.style.top = `${p.top}px`;
  }

  function open(next, lock) {
    const html = texts[next.dataset.hint];
    // En ukjent nøkkel gir INGEN boble. En tom boks under merket ville sett ut
    // som om forklaringen fantes og var blank; nå merkes savnet av testen som
    // krever at hvert `data-hint` finnes i registeret.
    if (!html) return;
    const b = ensure();
    if (next !== mark) {
      b.innerHTML = html;
      if (mark) mark.setAttribute('aria-expanded', 'false');
    }
    mark = next;
    locked = Boolean(lock);
    mark.setAttribute('aria-expanded', 'true');
    b.style.display = 'block';
    // LÅST BOBLE TAR IMOT MUSA. Hele poenget med låsingen er at man skal kunne
    // merke teksten, og en markering kan ikke dras gjennom noe som ikke tar
    // imot pekeren. Ulåst er det motsatt: da må boblen slippe hover videre til
    // det som ligger under, ellers lukker den seg selv i det den dukker opp.
    b.style.pointerEvents = locked ? 'auto' : 'none';
    b.style.userSelect = locked ? 'text' : 'none';
    place();
  }

  function close() {
    if (mark) mark.setAttribute('aria-expanded', 'false');
    mark = null;
    locked = false;
    if (bubble) bubble.style.display = 'none';
  }

  const hitMark = (ev) => {
    const t = ev.target;
    return t && typeof t.closest === 'function' ? t.closest('[data-hint]') : null;
  };

  host.addEventListener('pointerover', (ev) => {
    // Et låst hint eier skjermen til brukeren selv slipper det. Uten denne
    // linja ville et streif over et annet merke revet bort teksten man holdt
    // på å merke.
    if (locked) return;
    const el = hitMark(ev);
    if (el) open(el, false);
    else if (mark) close();
  });

  host.addEventListener('click', (ev) => {
    const el = hitMark(ev);
    if (el) {
      // Merkene ligger inne i en `<summary>` og i en `<label>`. Uten dette
      // ville ETT trykk gitt to virkninger: hintet åpnet seg, og boksen foldet
      // seg ut / fokus hoppet til feltet ved siden av.
      ev.preventDefault();
      ev.stopPropagation();
      if (el === mark && locked) close();
      else open(el, true);
      return;
    }
    // Et klikk INNE i boblen er en markering som begynner, ikke et ønske om å
    // lukke. Alt annet lukker.
    if (bubble && bubble.contains(ev.target)) return;
    if (mark) close();
  });

  win.addEventListener('scroll', place, { passive: true });
  win.addEventListener('resize', place);

  return { isOpen: () => Boolean(mark), close };
}
