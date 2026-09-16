/**
 * chart-tips.js — pekerboble for datapunktene i M–κ- og M–N-figurene.
 *
 * HVORFOR EN EGEN FIL OG IKKE I `charts.js`
 * `charts.js` er DOM-fri og returnerer strenger (plan §2.3 punkt 2), nettopp
 * fordi den samme funksjonen tegner både skjermfiguren og papirfiguren. Den kan
 * derfor emittere `data-*` på usynlige treffflater, men ikke lytte på noe.
 * Koblingen hører hjemme her, på skjermsiden alene.
 *
 * HVORFOR HENDELSESDELEGERING OG IKKE LYTTERE PER PUNKT
 * Figuren tegnes på nytt ved hver eneste beregning, og et M–N-diagram har 69
 * punkter pluss én per lastkombinasjon. Å henge lyttere på hvert punkt ville
 * betydd å rydde opp etter dem ved hver omtegning, og en glemt opprydding
 * lekker stille. Én lytter på seksjonen overlever alle omtegninger.
 *
 * HVORFOR `clientX/clientY` OG IKKE ELEMENTETS EGEN POSISJON
 * `.svg-fit` skalerer SVG-en med CSS, så SVG-koordinatene stemmer ikke med
 * skjermen. Pekerens egne klientkoordinater er immune mot det.
 */

import { fmtNumber, DASH } from './results.js';

/** Bygger boblas innhold. Returnerer null for et treff vi ikke kjenner. */
function tipHtml(d) {
  const num = (v, dec) => (v === undefined || v === '' ? DASH : fmtNumber(Number(v), dec));
  // Én rad = dempet etikett til venstre, tallet høyrestilt. To kolonner gjør at
  // tallene står under hverandre i stedet for å flyte etter ulikt lange navn.
  const row = (k, v) =>
    `<div style="display:flex;gap:10px;justify-content:space-between">`
    + `<span style="color:#94a3b8">${k}</span><span>${v}</span></div>`;
  const esc = (t) => String(t).replace(/[&<>"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  if (d.hit === 'mc') {
    return row('Point', num(Number(d.i) + 1, 0))
         + row('κ', `${num(d.kappa, 3)} · 10⁻⁶/mm`)
         + row('M', `${num(d.moment, 1)} kNm`);
  }
  if (d.hit === 'env') {
    // Feltnummeret er EC2 sine bruddfelt 1–6. Det er den ene opplysningen som
    // forklarer hvorfor omhyllingen skifter form akkurat der, så den tas med
    // når motoren har den.
    return row('Envelope', `#${num(Number(d.i) + 1, 0)}`)
         + row('N', `${num(d.n, 1)} kN`)
         + row('M', `${num(d.m, 1)} kNm`)
         + (d.field === undefined ? '' : row('EC2 field', num(d.field, 0)));
  }
  if (d.hit === 'load') {
    const head = esc(d.combo || 'Load combination')
      + (d.governing === '1'
        ? ' <span style="color:#fbbf24;font-size:10px">governing</span>' : '');
    return `<div style="margin-bottom:2px">${head}</div>`
         + row('N<sub>Ed</sub>', `${num(d.n, 1)} kN`)
         + row('M<sub>Ed</sub>', `${num(d.m, 1)} kNm`);
  }
  return null;
}

/**
 * Kobler boblen til `host`. Kalles ÉN gang; tåler at figurene byttes ut under
 * den så mange ganger man vil.
 */
export function attachChartTips(host) {
  if (!host || host.dataset.tipsBound === '1') return;
  host.dataset.tipsBound = '1';

  let tip = null;
  const ensure = () => {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.setAttribute('role', 'tooltip');
    // Bevisst nedtonet: boblen skal kunne stå over en tett kurve uten å ta
    // oppmerksomhet fra den. Liten skrift, tynn kant, ingen tung skygge — og
    // `tabular-nums` slik at tallene ikke hopper sidelengs når man beveger seg
    // langs kurven.
    tip.style.cssText = [
      'position:fixed', 'z-index:70', 'pointer-events:none', 'display:none',
      'background:rgba(15,23,42,.96)', 'color:#e2e8f0',
      'border:1px solid #475569', 'border-radius:4px',
      'padding:4px 7px', 'font-size:11px', 'line-height:1.45',
      'white-space:nowrap', 'box-shadow:0 2px 8px rgba(0,0,0,.4)',
      'font-variant-numeric:tabular-nums',
    ].join(';');
    document.body.appendChild(tip);
    return tip;
  };

  const hide = () => { if (tip) tip.style.display = 'none'; };

  host.addEventListener('pointermove', (ev) => {
    const el = ev.target instanceof Element ? ev.target.closest('[data-hit]') : null;
    if (!el) { hide(); return; }
    const html = tipHtml(el.dataset);
    if (!html) { hide(); return; }

    const t = ensure();
    t.innerHTML = html;
    t.style.display = 'block';
    // Plasseres ved pekeren, men klemmes innenfor vinduet slik at et punkt helt
    // til høyre ikke skyver boblen ut av syne.
    const box = t.getBoundingClientRect();
    const x = Math.min(ev.clientX + 14, window.innerWidth - box.width - 8);
    const y = Math.max(8, ev.clientY - box.height - 12);
    t.style.left = `${Math.max(8, x)}px`;
    t.style.top = `${y}px`;
  });

  host.addEventListener('pointerleave', hide);
  // Rulling flytter figuren under en boble som ellers blir stående igjen og
  // peker på feil punkt.
  window.addEventListener('scroll', hide, { passive: true });
}
