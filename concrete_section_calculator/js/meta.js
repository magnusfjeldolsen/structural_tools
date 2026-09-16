/**
 * meta.js — modulens identitet, ett sted.
 *
 * HVORFOR EGEN FIL
 * Rapporten (`report.js`, agent A4b) skal trykke modulnavn og versjon i
 * topplinja, men A4b kan ikke lese `MODULE_CONFIG` i `index.html` — den ligger
 * i et skript-tagg-scope rapporten ikke importerer fra (plan §8 punkt 1).
 * Uten en importerbar kilde ville versjonen blitt skrevet av for hånd to
 * steder, og den ene ville sakket etter uten at noe feilet.
 *
 * INVARIANT: `MODULE_VERSION` bumpes her, og BARE her. `index.html` sin
 * `MODULE_CONFIG` skal lese herfra, ikke duplisere strengen.
 *
 * DOM-fri og ren (plan §2.3 punkt 2).
 */

/** Mappenavn = registrerings-id. Må stemme med kopi-løkka i deploy-workflowen. */
export const MODULE_ID = 'concrete_section_calculator';

/** Vises i rapportens topptekst og i modulkortet. Norsk. */
export const MODULE_NAME = 'Betongtverrsnitt — ULS';

/** Semver for selve modulen, ikke for `structuralcodes`. */
export const MODULE_VERSION = '1.0.0';

/**
 * Versjonen av JSON-kontrakten mellom JS og Python (plan §5).
 * Både payload og resultat bærer den som `schema`. Endres den, må
 * `engine.py` og `payload.js` endres i samme commit.
 */
export const SCHEMA_VERSION = 1;

/** Hjulet i `vendor/`. Bare til visning i rapportens forutsetningskapittel. */
export const STRUCTURALCODES_VERSION = '0.7.2';
