/**
 * numeric-input.js — uttrykksfelt: «200+50», «20*5^2/8», «1200/6».
 *
 * HVORFOR IKKE BARE `type="number"`
 * Ingeniøren har tallet i hodet som et regnestykke, ikke som et tall. Skal
 * `dc` være «35+8+10» skriver man det, i stedet for å regne 53 i hodet og
 * miste sporet av hvor det kom fra. Mønsteret er hentet fra
 * `geometry_workspace/js/numeric-input.js` og de eldre betongmodulene.
 *
 * INVARIANTEN SOM BESKYTTES HER
 * `evaluate()` returnerer `null` ved uleselig tekst — den kaster ALDRI og gir
 * ALDRI `NaN`. Alle kallere sjekker dermed ett og samme: `=== null`. Et `NaN`
 * som slipper gjennom til `store.js` ville forplantet seg til payloaden og
 * kommet ut igjen som en uforståelig `ValueError` fra Python.
 *
 * KOMMA ER DESIMALTEGN, IKKE SKILLETEGN
 * Norsk tastatur gir «0,85». Det MÅ bety 0.85 og ikke to tall. Derfor byttes
 * komma ut før tolkning, og et uttrykk kan aldri inneholde en argumentliste.
 *
 * DOM-FRI (plan §2.3 punkt 2)
 * Fila rører verken `document` eller `window`. `bindNumericInput()` bruker bare
 * elementet den får inn som argument, og lar dermed hele modulen kjøre — og
 * testes — i `node --test`.
 */

/** Bare siffer, operatorer, parenteser, punktum, mellomrom og `^` slipper gjennom. */
const ALLOWED = /^[0-9+\-*/().\s^eE]*$/;

/**
 * Tolker et uttrykk.
 *
 * @param {string|number} expr
 * @returns {number|null} `null` ved tom, uleselig eller ikke-endelig verdi
 */
export function evaluate(expr) {
  if (typeof expr === 'number') return Number.isFinite(expr) ? expr : null;
  if (typeof expr !== 'string') return null;

  // Komma → punktum FØR alt annet, ellers ville «0,85» blitt fjernet som søppel.
  const text = expr.trim().replace(/,/g, '.');
  if (!text) return null;
  if (!ALLOWED.test(text)) return null;

  // `^` er potens for brukeren, `**` for JavaScript.
  const js = text.replace(/\^/g, '**');
  let value;
  try {
    // `Function` i stedet for `eval`: ingen tilgang til lokalt scope. Inndataen
    // er allerede silt gjennom `ALLOWED`, så ingen identifikatorer kan nå hit.
    // eslint-disable-next-line no-new-func
    value = Function(`"use strict"; return (${js});`)();
  } catch (err) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

/**
 * Tolker og begrenser til et gyldig område.
 *
 * @param {string|number} expr
 * @param {{min?:number, max?:number, integer?:boolean}} [rules]
 * @returns {number|null}
 */
export function evaluateBounded(expr, rules = {}) {
  let v = evaluate(expr);
  if (v === null) return null;
  if (rules.integer) v = Math.round(v);
  if (rules.min !== undefined && v < rules.min) return null;
  if (rules.max !== undefined && v > rules.max) return null;
  return v;
}

/**
 * Formaterer et tall for visning i et felt: engelsk desimalpunktum, ingen
 * unødvendige nuller. `null`/`NaN` blir «–», som er det rapporten og UI-en
 * skal vise for et tall som ikke krysset JSON-grensa (plan §5.4).
 *
 * @param {number|null|undefined} v
 * @param {number} [decimals=3] maks antall desimaler
 */
export function formatNumber(v, decimals = 3) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '–';
  const n = Number(v);
  // `toFixed` + strip: gir 53 for 53.0 og 0.85 for 0.8500.
  let s = n.toFixed(decimals);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s;
}

/**
 * Kobler et `<input type="text">` til uttrykkstolkningen.
 *
 * Feltet beholder brukerens TEKST mens det har fokus, og erstattes med det
 * tolkede tallet først ved `blur`/Enter. Skrev vi tilbake på hvert tastetrykk,
 * ville «200+» blitt til «200» før brukeren rakk å skrive «+50».
 *
 * Bruker BARE elementet som sendes inn — ingen `document`, ingen `window`.
 *
 * @param {{value:string, addEventListener:Function}} el
 * @param {(value:number|null, el:object) => void} onCommit
 * @param {{min?:number, max?:number, integer?:boolean}} [rules]
 * @returns {() => void} avmelding
 */
/**
 * ⚠ TEKSTEN MARKERES NÅR FELTET FÅR FOKUS.
 *
 * Feltene her er SMÅ og inneholder ETT tall man nesten alltid vil erstatte, ikke
 * redigere: «300» blir «400», «12» blir «16». Uten markering må man først
 * markere selv, eller slette tegn for tegn — og klikker man midt i «300» og
 * skriver «4», står det plutselig «3400».
 *
 * `requestAnimationFrame` fordi nettleseren selv setter markøren ETTER
 * `focus`-hendelsen: en `select()` som kjøres med én gang blir overskrevet av
 * klikket som utløste den. Etter én ramme er plasseringen ferdig, og vår
 * markering blir stående.
 *
 * Bare når feltet får fokus UTENFRA. Står markøren allerede der og brukeren
 * klikker en gang til for å plassere den, skal det valget stå — da redigerer
 * man, og da er markering i veien.
 */
function selectOnFocus(el) {
  el.addEventListener('focus', () => {
    requestAnimationFrame(() => {
      if (document.activeElement !== el) return;
      try {
        el.select();
      } catch {
        // `select()` finnes ikke på alle inndatatyper. Fokuset er satt uansett,
        // og det er hovedsaken.
      }
    });
  });
}

export function bindNumericInput(el, onCommit, rules = {}) {
  if (!el || typeof el.addEventListener !== 'function') {
    throw new Error('bindNumericInput: trenger et element med addEventListener.');
  }
  const commit = () => {
    const v = evaluateBounded(el.value, rules);
    if (v !== null) el.value = formatNumber(v);
    onCommit(v, el);
  };
  const onKey = (e) => {
    if (e && e.key === 'Enter') commit();
  };
  el.addEventListener('blur', commit);
  el.addEventListener('keydown', onKey);
  selectOnFocus(el);
  return () => {
    if (typeof el.removeEventListener === 'function') {
      el.removeEventListener('blur', commit);
      el.removeEventListener('keydown', onKey);
    }
  };
}
