// Materialdata for trevirke og stål.
// Kilder er oppgitt per tabell. Alle verdier i N, mm, kg/m³.
//
// [EN338]   NS-EN 338:2016 Konstruksjonstrevirke – Styrkeklasser, tabell 1.
// [EN14080] NS-EN 14080:2013 Limtre – Krav, tabell 5 (kombinert) og tabell 4 (homogent).
// [EC5]     NS-EN 1995-1-1:2004+A1:2008+NA:2010, tabell 2.3 (γM), tabell 3.1 (kmod), tabell 3.2 (kdef).
// [EC5NA]   Nasjonalt tillegg NA til NS-EN 1995-1-1 (Norge). NA.2.4.1 (γM), NA.2.3.1.2 (lastvarighet).

export const TIMBER = {
  // Konstruksjonstre [EN338 tabell 1]
  C14: { name: 'C14', type: 'solid', rho_k: 290, rho_mean: 350, f_t90k: 0.4, f_c90k: 2.0, ref: 'NS-EN 338:2016 tab. 1' },
  C16: { name: 'C16', type: 'solid', rho_k: 310, rho_mean: 370, f_t90k: 0.4, f_c90k: 2.2, ref: 'NS-EN 338:2016 tab. 1' },
  C18: { name: 'C18', type: 'solid', rho_k: 320, rho_mean: 380, f_t90k: 0.4, f_c90k: 2.2, ref: 'NS-EN 338:2016 tab. 1' },
  C24: { name: 'C24', type: 'solid', rho_k: 350, rho_mean: 420, f_t90k: 0.4, f_c90k: 2.5, ref: 'NS-EN 338:2016 tab. 1' },
  C30: { name: 'C30', type: 'solid', rho_k: 380, rho_mean: 460, f_t90k: 0.4, f_c90k: 2.7, ref: 'NS-EN 338:2016 tab. 1' },
  // Limtre [EN14080 tabell 4/5]
  GL24c: { name: 'GL24c', type: 'glulam', rho_k: 365, rho_mean: 400, f_t90k: 0.5, f_c90k: 2.5, ref: 'NS-EN 14080:2013 tab. 5' },
  GL28c: { name: 'GL28c', type: 'glulam', rho_k: 390, rho_mean: 420, f_t90k: 0.5, f_c90k: 2.5, ref: 'NS-EN 14080:2013 tab. 5' },
  GL30c: { name: 'GL30c', type: 'glulam', rho_k: 390, rho_mean: 430, f_t90k: 0.5, f_c90k: 2.5, ref: 'NS-EN 14080:2013 tab. 5' },
  GL32c: { name: 'GL32c', type: 'glulam', rho_k: 400, rho_mean: 440, f_t90k: 0.5, f_c90k: 2.5, ref: 'NS-EN 14080:2013 tab. 5' },
  GL28h: { name: 'GL28h', type: 'glulam', rho_k: 425, rho_mean: 460, f_t90k: 0.5, f_c90k: 2.5, ref: 'NS-EN 14080:2013 tab. 4' },
  GL30h: { name: 'GL30h', type: 'glulam', rho_k: 430, rho_mean: 480, f_t90k: 0.5, f_c90k: 2.5, ref: 'NS-EN 14080:2013 tab. 4' },
  GL32h: { name: 'GL32h', type: 'glulam', rho_k: 440, rho_mean: 490, f_t90k: 0.5, f_c90k: 2.5, ref: 'NS-EN 14080:2013 tab. 4' },
};

// Partialfaktorer γM – nasjonalt tillegg NA.2.4.1 (Norge) til NS-EN 1995-1-1.
// Verdiene bør verifiseres mot gjeldende utgave av NA før prosjektbruk.
export const GAMMA_M = {
  solid: { value: 1.25, ref: 'NS-EN 1995-1-1 NA.2.4.1 (konstruksjonstre)' },
  glulam: { value: 1.15, ref: 'NS-EN 1995-1-1 NA.2.4.1 (limtre)' },
  connection: { value: 1.30, ref: 'NS-EN 1995-1-1 NA.2.4.1 (forbindelser)' },
  steel_plate: { value: 1.05, ref: 'NS-EN 1993-1-1 NA.6.1 (γM0, tverrsnitt)' },
};

// kmod, tabell 3.1 [EC5] for konstruksjonstre, limtre og LVL.
// Indeks: klimaklasse (1,2,3) × lastvarighetsklasse.
export const KMOD = {
  1: { permanent: 0.6, long: 0.7, medium: 0.8, short: 0.9, instant: 1.1 },
  2: { permanent: 0.6, long: 0.7, medium: 0.8, short: 0.9, instant: 1.1 },
  3: { permanent: 0.5, long: 0.55, medium: 0.65, short: 0.7, instant: 0.9 },
};
export const KMOD_REF = 'NS-EN 1995-1-1 tabell 3.1';

export const DURATION_LABEL = {
  permanent: 'Permanent (> 10 år)',
  long: 'Langtid (6 mnd – 10 år)',
  medium: 'Mellomlang (1 uke – 6 mnd)',
  short: 'Korttid (< 1 uke)',
  instant: 'Øyeblikkslast',
};
export const DURATION_ORDER = ['permanent', 'long', 'medium', 'short', 'instant'];

// Lastkategorier med foreslått varighetsklasse og ψ-faktorer.
// ψ0/ψ1/ψ2: NS-EN 1990:2002+A1:2005+NA:2016 tabell NA.A1.1.
// Varighetsklasse: NS-EN 1995-1-1 tabell 2.2 og NA.2.3.1.2 (snø og vind i Norge).
export const LOAD_CATEGORIES = {
  G: { label: 'Egenlast (G)', permanent: true, duration: 'permanent', psi0: 1, psi1: 1, psi2: 1, ref: 'NS-EN 1995-1-1 tab. 2.2' },
  Q_A: { label: 'Nyttelast bolig (kat. A)', duration: 'medium', psi0: 0.7, psi1: 0.5, psi2: 0.3, ref: 'NS-EN 1990 NA.A1.1; NS-EN 1995-1-1 tab. 2.2' },
  Q_B: { label: 'Nyttelast kontor (kat. B)', duration: 'medium', psi0: 0.7, psi1: 0.5, psi2: 0.3, ref: 'NS-EN 1990 NA.A1.1; NS-EN 1995-1-1 tab. 2.2' },
  Q_C: { label: 'Nyttelast forsamling (kat. C)', duration: 'medium', psi0: 0.7, psi1: 0.7, psi2: 0.6, ref: 'NS-EN 1990 NA.A1.1; NS-EN 1995-1-1 tab. 2.2' },
  Q_E: { label: 'Nyttelast lager (kat. E)', duration: 'long', psi0: 1.0, psi1: 0.9, psi2: 0.8, ref: 'NS-EN 1990 NA.A1.1; NS-EN 1995-1-1 tab. 2.2' },
  S: { label: 'Snølast (S)', duration: 'short', psi0: 0.7, psi1: 0.5, psi2: 0.2, ref: 'NS-EN 1990 NA.A1.1; NS-EN 1995-1-1 NA.2.3.1.2' },
  W: { label: 'Vindlast (W)', duration: 'instant', psi0: 0.6, psi1: 0.2, psi2: 0, ref: 'NS-EN 1990 NA.A1.1; NS-EN 1995-1-1 tab. 2.2' },
};

// Stålsorter for plater [NS-EN 10025-2:2019 tabell 7], f_y for t ≤ 16 mm.
export const STEEL_PLATE = {
  S235: { f_y: 235, f_u: 360, ref: 'NS-EN 10025-2:2019 tab. 7' },
  S355: { f_y: 355, f_u: 490, ref: 'NS-EN 10025-2:2019 tab. 7' },
};

// Standard festemidler. Verdier for treskruer er typiske ETA-verdier og
// MÅ erstattes med produsentens ETA i prosjektbruk (fane «Egendefinert»).
export const FASTENER_PRESETS = {
  screw: [
    { id: 'skrue_6', label: 'Treskrue Ø6 (typisk ETA)', d: 6.0, d1: 3.9, d_head: 12, f_u: 800, f_tensk: 11000, l_options: [80, 100, 120, 140, 160] },
    { id: 'skrue_8', label: 'Treskrue Ø8 (typisk ETA)', d: 8.0, d1: 5.2, d_head: 15, f_u: 800, f_tensk: 20000, l_options: [100, 120, 140, 160, 180, 200, 240] },
    { id: 'skrue_10', label: 'Treskrue Ø10 (typisk ETA)', d: 10.0, d1: 6.4, d_head: 19, f_u: 800, f_tensk: 32000, l_options: [120, 140, 160, 180, 200, 240, 280] },
    { id: 'skrue_12', label: 'Treskrue Ø12 (typisk ETA)', d: 12.0, d1: 7.7, d_head: 22, f_u: 800, f_tensk: 45000, l_options: [160, 200, 240, 280, 320, 400] },
  ],
  nail: [
    { id: 'spiker_28', label: 'Rund spiker 2,8×75', d: 2.8, f_u: 600, l_options: [65, 75] },
    { id: 'spiker_31', label: 'Rund spiker 3,1×90', d: 3.1, f_u: 600, l_options: [80, 90] },
    { id: 'spiker_34', label: 'Rund spiker 3,4×100', d: 3.4, f_u: 600, l_options: [90, 100] },
    { id: 'spiker_40', label: 'Rund spiker 4,0×120', d: 4.0, f_u: 600, l_options: [100, 120] },
  ],
  bolt: [
    { id: 'bolt_M12', label: 'Bolt M12 kl. 4.6', d: 12, f_u: 400, washer: 36 },
    { id: 'bolt_M12_88', label: 'Bolt M12 kl. 8.8', d: 12, f_u: 800, washer: 36 },
    { id: 'bolt_M16', label: 'Bolt M16 kl. 4.6', d: 16, f_u: 400, washer: 48 },
    { id: 'bolt_M16_88', label: 'Bolt M16 kl. 8.8', d: 16, f_u: 800, washer: 48 },
    { id: 'bolt_M20', label: 'Bolt M20 kl. 8.8', d: 20, f_u: 800, washer: 60 },
  ],
  dowel: [
    { id: 'dybel_12', label: 'Stålstavdybel Ø12 S355', d: 12, f_u: 490 },
    { id: 'dybel_16', label: 'Stålstavdybel Ø16 S355', d: 16, f_u: 490 },
    { id: 'dybel_20', label: 'Stålstavdybel Ø20 S355', d: 20, f_u: 490 },
  ],
};
