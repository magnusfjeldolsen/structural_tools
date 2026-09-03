/**
 * numeric-input.js — CAD-aktig tallinntasting rett i lerretet (§2 i
 * interaksjonsplanen).
 *
 * Modulen er en liten tilstandsmaskin som er HELT uavhengig av hvilket verktøy
 * som er aktivt. `main.js` sender tastetrykk hit FØR hurtigtastene; tar den
 * tasten, åpnes et lite felt ved markøren, og verktøyet får punktet, vinkelen
 * eller lengden ferdig tolket gjennom `onCommit`. Det er dette som gjør at
 * «bare begynn å skrive» virker uten at hvert verktøy må implementere det.
 *
 * Ingen kunnskap om store eller viewport — bare DOM og tolkning av tekst.
 */

/** Tastene som starter en inntasting. `d`/`D` og `@` er relativ-prefiksene. */
const START_KEY = /^[0-9.,\-dD@]$/;

/**
 * Tolker en inntastet streng.
 *
 * Skilletegn mellom x og y er **mellomrom eller tab**, aldri komma: komma er
 * desimaltegn på norsk, og både `.` og `,` godtas som det. Prefikset `D`
 * (eller `@`, AutoCAD-vanen) betyr relativt til forrige punkt, og mellomrommet
 * etter prefikset er valgfritt (`d300 200` = `D 300 200`).
 *
 * @param {string} text
 * @returns {{relative: boolean, nums: number[]}|null} null ved uleselig tekst
 */
export function parseNumericEntry(text) {
  let rest = String(text == null ? '' : text).trim();
  if (!rest) return null;

  let relative = false;
  const prefix = /^([dD]|@)\s*/.exec(rest);
  if (prefix) {
    relative = true;
    rest = rest.slice(prefix[0].length);
  }
  rest = rest.trim();
  if (!rest) return null;

  const parts = rest.split(/[\s\t]+/).filter(Boolean);
  const nums = [];
  for (const part of parts) {
    // Komma er desimaltegn, ikke skilletegn — derfor byttes det ut her, ikke
    // brukt til å splitte over.
    const n = Number(part.replace(',', '.'));
    if (!Number.isFinite(n)) return null;
    nums.push(n);
  }
  return nums.length ? { relative, nums } : null;
}

export class NumericInput {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.host        elementet feltet legges i (må være posisjonert)
   * @param {(v: object) => (object|void)} opts.onCommit  får `{kind:'point'|'delta'|'length'|'angle', x, y, value}`
   * @param {() => void} [opts.onCancel]   kalt når feltet lukkes med Esc
   * @param {() => string} [opts.getUnit]  arbeidsenheten, bare til ledeteksten
   * @param {() => ('point'|'angle'|'length'|null)} [opts.getExpect] hva verktøyet venter på
   * @param {() => ([number, number]|null)} [opts.getAnchor] markørens plassering i host-koordinater
   * @param {(e: KeyboardEvent) => boolean} [opts.onSnapShortcut] Alt+siffer, som har forrang
   * @param {(msg: string) => void} [opts.onStatus]
   */
  constructor(opts = {}) {
    this.host = opts.host || document.body;
    this.onCommit = opts.onCommit || (() => {});
    this.onCancel = opts.onCancel || (() => {});
    this.getUnit = opts.getUnit || (() => '');
    this.getExpect = opts.getExpect || (() => 'point');
    this.getAnchor = opts.getAnchor || (() => null);
    this.onSnapShortcut = opts.onSnapShortcut || (() => false);
    this.onStatus = opts.onStatus || (() => {});

    this.active = false;
    /** Hva inntastingen skal tolkes som når den bekreftes. */
    this.expected = 'point';

    this._build();
  }

  _build() {
    const box = document.createElement('div');
    box.id = 'numeric-input';
    box.className =
      'hidden absolute z-40 flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-sky-500 ' +
      'bg-slate-900/95 backdrop-blur shadow-lg shadow-black/50';
    box.style.pointerEvents = 'auto';

    const label = document.createElement('span');
    label.className = 'text-[10px] uppercase tracking-wide text-sky-400 whitespace-nowrap';

    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Tallinntasting');
    input.style.width = '11rem';
    input.className = 'num';

    const hint = document.createElement('span');
    hint.className = 'text-[10px] text-slate-500 whitespace-nowrap';

    box.appendChild(label);
    box.appendChild(input);
    box.appendChild(hint);
    this.host.appendChild(box);

    this.el = box;
    this.label = label;
    this.input = input;
    this.hint = hint;

    input.addEventListener('keydown', (e) => this._onKeyDown(e));
    // Klikker man i lerretet mens feltet står åpent, vil man peke ut punktet i
    // stedet — feltet lukkes, men kommandoen står.
    input.addEventListener('blur', () => {
      if (this.active) this.close();
    });
  }

  /* ---------------- tilstand ---------------- */

  /** Sier hva neste bekreftelse skal tolkes som. */
  expect(kind) {
    this.expected = kind === 'angle' || kind === 'length' || kind === 'delta' ? kind : 'point';
    this._syncLabels();
    return this;
  }

  /**
   * Tar imot et tastetrykk fra `main.js`. Returnerer `true` hvis tasten startet
   * en inntasting — da skal den IKKE gå videre til hurtigtastene.
   *
   * @param {KeyboardEvent} e
   * @returns {boolean}
   */
  beginIfTypingKey(e) {
    if (this.active) return false;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (!e.key || e.key.length !== 1 || !START_KEY.test(e.key)) return false;
    const expect = this.getExpect();
    if (!expect) return false; // verktøyet venter ikke på noe tall
    this.open(e.key, expect);
    return true;
  }

  open(seed = '', expect = null) {
    this.active = true;
    this.expect(expect || this.getExpect() || 'point');
    this.input.value = seed;
    this.el.classList.remove('hidden');
    this._place();
    this.input.focus();
    // Markøren skal stå etter det som allerede er skrevet
    const n = this.input.value.length;
    try {
      this.input.setSelectionRange(n, n);
    } catch (err) {
      /* noen nettlesere nekter på ferske felt — uvesentlig */
    }
  }

  /** Lukker feltet. Kommandoen som er i gang står — det er Esc-kaskadens jobb. */
  close(cancelled = false) {
    if (!this.active) return false;
    this.active = false;
    this.el.classList.add('hidden');
    this.input.value = '';
    if (this.input === document.activeElement) this.input.blur();
    if (cancelled) this.onCancel();
    return true;
  }

  /* ---------------- plassering ---------------- */

  _place() {
    const rect = this.host.getBoundingClientRect();
    const w = 260;
    const h = 34;
    const anchor = this.getAnchor();
    let left = null;
    let top = null;
    if (anchor && Number.isFinite(anchor[0]) && Number.isFinite(anchor[1])) {
      left = anchor[0] + 14;
      top = anchor[1] + 14;
      // Ikke plass ved markøren? Da nederst i lerretet, som planen sier.
      if (left + w > rect.width - 8 || top + h > rect.height - 40) {
        left = null;
        top = null;
      }
    }
    if (left === null) {
      left = Math.max(8, (rect.width - w) / 2);
      top = Math.max(8, rect.height - h - 48);
    }
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(top)}px`;
  }

  _syncLabels() {
    const unit = this.getUnit ? this.getUnit() : '';
    if (this.expected === 'angle') {
      this.label.textContent = 'vinkel';
      this.input.placeholder = '45';
      this.hint.textContent = 'grader · Enter';
    } else if (this.expected === 'length') {
      this.label.textContent = 'lengde';
      this.input.placeholder = '200';
      this.hint.textContent = `${unit} · Enter`;
    } else {
      this.label.textContent = 'x  y';
      this.input.placeholder = '300 200  ·  D 300 200';
      this.hint.textContent = `${unit} · D = relativt · Enter`;
    }
  }

  /* ---------------- tastatur ---------------- */

  _onKeyDown(e) {
    // Alt+siffer (snap/orto) har forrang, også midt i en inntasting.
    if (this.onSnapShortcut(e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (e.key === 'Escape') {
      // Første Esc lukker BARE feltet — kommandoen står. Neste Esc går til
      // kaskaden i main.js og avbryter kommandoen, som ellers.
      e.preventDefault();
      e.stopPropagation();
      this.close(true);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      this._commit();
      return;
    }

    if (e.key === 'Tab') {
      // Feltet er én streng, så Tab er ganske enkelt et skilletegn.
      e.preventDefault();
      e.stopPropagation();
      if (!/\s$/.test(this.input.value)) this.input.value += ' ';
      return;
    }

    // Alt annet skrives i feltet, og skal ikke utløse hurtigtaster.
    e.stopPropagation();
  }

  _commit() {
    const parsed = parseNumericEntry(this.input.value);
    if (!parsed) {
      this.onStatus('Klarte ikke å lese tallet. Skriv «300 200», «D 300 200» eller «10,5 0».');
      return;
    }

    const { relative, nums } = parsed;
    let value = null;

    if (nums.length >= 2) {
      // To tall er alltid et punkt — også der verktøyet i utgangspunktet ba om
      // en vinkel eller en radius, siden et punkt da er et gyldig svar.
      value = { kind: relative ? 'delta' : 'point', x: nums[0], y: nums[1] };
    } else if (this.expected === 'angle') {
      value = { kind: 'angle', value: nums[0] };
    } else if (this.expected === 'length') {
      value = { kind: 'length', value: nums[0] };
    } else {
      this.onStatus('Skriv x og y, skilt med mellomrom eller tab. Komma er desimaltegn.');
      return;
    }

    const res = this.onCommit(value) || {};
    if (res.ok === false) {
      if (res.msg) this.onStatus(res.msg);
      return; // la feltet stå, så tallet kan rettes
    }
    this.close();
  }
}
