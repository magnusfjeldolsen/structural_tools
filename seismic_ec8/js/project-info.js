/**
 * project-info.js — prosjektinformasjon til rapportens topptekst.
 *
 * Lagres i nettleseren under en nøkkel som ikke er knyttet til denne modulen,
 * slik at andre moduler kan lese de samme feltene senere.
 */

export const PROJECT_FIELDS = [
  { key: 'project',   label: 'Prosjekt', wide: true },
  { key: 'object',    label: 'Bygg / del', wide: true },
  { key: 'projectNo', label: 'Prosjektnr.' },
  { key: 'client',    label: 'Oppdragsgiver' },
  { key: 'author',    label: 'Utført av' },
  { key: 'checker',   label: 'Kontrollert av' },
  { key: 'date',      label: 'Dato' },
  { key: 'revision',  label: 'Revisjon' }
];

const STORAGE_KEY = 'structural_tools.projectInfo';

export function loadProjectInfo() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveProjectInfo(info) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
  } catch {
    // Privat modus eller blokkert lagring: feltene virker fortsatt for denne økta.
  }
}
