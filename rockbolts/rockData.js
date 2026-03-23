// rockData.js — Lookup tables for rock bolt pull-out calculator (SVV 220)
// Source: SVV Håndbok V220, Kim & Lee method

// Rock types with unit weight, compressive strength, and grout–rock bond strength
// tau_k: characteristic grout–rock bond strength [MPa] — mørtel min. B30 (NS-EN 1992)
window.ROCK_TYPES = [
  { name: 'Granitt',   gamma_min: 25, gamma_max: 28, fc_min: 90,  fc_max: 170, tau_k: 2.0 },
  { name: 'Gabbro',    gamma_min: 27, gamma_max: 31, fc_min: 18,  fc_max: 250, tau_k: 2.5 },
  { name: 'Gneis',     gamma_min: 25, gamma_max: 28, fc_min: 90,  fc_max: 130, tau_k: 1.5 },
  { name: 'Kvartsitt', gamma_min: 21, gamma_max: 25, fc_min: 150, fc_max: 170, tau_k: 2.5 },
  { name: 'Sandstein', gamma_min: 20, gamma_max: 26, fc_min: 100, fc_max: 140, tau_k: 1.2 },
  { name: 'Kalkstein', gamma_min: 25, gamma_max: 28, fc_min: 70,  fc_max: 100, tau_k: 2.0 },
  { name: 'Leiskifer', gamma_min: 20, gamma_max: 27, fc_min: 25,  fc_max: 60,  tau_k: 0.5 },
];

// Rock mass quality classes — determines shear strength τk and max failure angle ψ
// tau_k_default: representative τk [kPa] used as default when class is selected
// psi_max: maximum failure half-angle ψ [degrees]
window.ROCK_QUALITY = [
  {
    label: 'Meget godt berg — τk = 100–200 kPa, ψ ≤ 45°',
    description: 'Meget godt berg, ett sprekkesett med sporadiske sprekker. Bergmassens trykkstyrke > 50 MPa.',
    tau_k_default: 150,
    psi_max: 45,
  },
  {
    label: 'Godt berg — τk = 50–100 kPa, ψ ≤ 40°',
    description: 'Bergmasser med to sprekkesett og sporadiske sprekker. Bergmassens trykkstyrke 15–50 MPa.',
    tau_k_default: 75,
    psi_max: 40,
  },
  {
    label: 'Dårlig berg — τk = 50 kPa, ψ ≤ 30°',
    description: 'Tre sprekkesett med sporadiske sprekker, < 20 sprekker/m². Bergmassens trykkstyrke < 15 MPa.',
    tau_k_default: 50,
    psi_max: 30,
  },
];

// Mortar classes and design bond strength steel–grout [MPa]
window.MORTAR_CLASSES = [
  { name: 'B30', tau_d: 1.9 },
  { name: 'B25', tau_d: 1.5 },
];
