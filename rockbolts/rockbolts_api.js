// rockbolts_api.js — Pure calculation engine for rock bolt pull-out (SVV 220)
// No DOM dependencies. All inputs/outputs in SI-derived units:
//   Forces: kN  |  Stresses: MPa or kPa  |  Dimensions: mm  |  Lengths: m  |  Angles: degrees

window.RockboltsAPI = (() => {
  const DEG = Math.PI / 180;

  // ─── Cross-sectional area of tendon ──────────────────────────────────────
  function calcAt(phi_mm) {
    return Math.PI * phi_mm ** 2 / 4; // [mm²]
  }

  // ─── Installed tendon capacity ────────────────────────────────────────────
  // R_i.midlertidig = 0.65 · f_tk · A_t
  // R_i.permanent   = 0.50 · f_tk · A_t
  function calcRi(f_tk_MPa, At_mm2, isPermanent) {
    const factor = isPermanent ? 0.50 : 0.65;
    return factor * f_tk_MPa * At_mm2 / 1000; // [N → kN]
  }

  // ─── Required bond length: steel–grout ───────────────────────────────────
  // L = Pp / (τd · d_ekv · π)
  // [kN] / ([N/mm²] · [mm] · π) → [kN · mm / N] = [m]
  function calcLtbStaalMortel(Pp_kN, tau_d_MPa, d_ekv_mm) {
    return Pp_kN / (tau_d_MPa * d_ekv_mm * Math.PI); // [m]
  }

  // ─── Borehole geometry ────────────────────────────────────────────────────
  // d_borhull = user-supplied value (validated in UI; can be below 1.5·φ by user choice)
  function calcDborhull(phi_mm, d_valgt_mm) {
    const d_min_recommended = 1.5 * phi_mm;
    return {
      d_min_borhull: d_min_recommended,   // for display / warning only
      d_borhull: d_valgt_mm,              // use exactly what the user specified
    };
  }

  // ─── Required bond length: grout–rock ────────────────────────────────────
  function calcLtbMortelBerg(Pp_kN, tau_d_MPa, d_borhull_mm) {
    return Pp_kN / (tau_d_MPa * d_borhull_mm * Math.PI); // [m]
  }

  // ─── Rock cone: single anchor ─────────────────────────────────────────────
  // λ = √(γM · Pp / (τk · π · tan(ψ·sin(α))))
  // ψ·sin(α) is the effective cone angle in degrees (projected along anchor axis)
  // τk in kPa = kN/m², Pp in kN → result in m
  function calcLambdaEnkeltstag(gamma_M, Pp_kN, tau_k_kPa, psi_deg, alpha_deg) {
    const psi_eff_rad = psi_deg * Math.sin(alpha_deg * DEG) * DEG;
    return Math.sqrt(gamma_M * Pp_kN / (tau_k_kPa * Math.PI * Math.tan(psi_eff_rad)));
    // Verified: √(3·1632 / (50·π·tan(34.64°))) = 6.717 m ✓
  }

  // ─── Rock cone: anchor row — eq. (10-29) SVV 220 ─────────────────────────
  // λ = [-(η-1)·D + √((η-1)²·D² + π·sin(ψ_eff)·η·Pp·γM/τk)] / (π·tan(ψ_eff))
  // Note: sin(ψ_eff) in discriminant term, tan(ψ_eff) in denominator
  function calcLambdaStagrekke(gamma_M, Pp_kN, tau_k_kPa, psi_deg, alpha_avg_deg, eta, D_mm) {
    const psi_eff_rad = psi_deg * Math.sin(alpha_avg_deg * DEG) * DEG;
    const D_m = D_mm / 1000;
    const A = Math.PI * Math.tan(psi_eff_rad);
    const B = Math.PI * Math.sin(psi_eff_rad) * eta * Pp_kN * gamma_M / tau_k_kPa;
    return (-(eta - 1) * D_m + Math.sqrt((eta - 1) ** 2 * D_m ** 2 + B)) / A;
    // Verified: η=1, D=10000mm → 6.092 m ✓
  }

  // ─── Master calculation ───────────────────────────────────────────────────
  function calcAll(inputs) {
    const {
      N_Ed, f_tk, phi, isPermanent,
      tau_d_staal_mortel,
      d_borhull_valgt,
      tau_k_mortel_berg, gamma_mortel_berg,
      gamma_M, tau_k_berg, psi, alpha, eta, D,
    } = inputs;

    // 1. Load
    const Pp = N_Ed;

    // 2. Tendon cross-section and capacity
    const At = calcAt(phi);
    const Ri = calcRi(f_tk, At, isPermanent);

    // 3. Bond: steel–grout
    const d_ekv = phi;
    const Ltb_staal = calcLtbStaalMortel(Pp, tau_d_staal_mortel, d_ekv);

    // 4. Borehole
    const { d_min_borhull, d_borhull } = calcDborhull(phi, d_borhull_valgt);

    // 5. Bond: grout–rock
    const tau_d_mortel_berg = tau_k_mortel_berg / gamma_mortel_berg;
    const Ltb_mortel = calcLtbMortelBerg(Pp, tau_d_mortel_berg, d_borhull);
    const Ltb = Math.max(Ltb_staal, Ltb_mortel);

    // 6. Rock cone: single anchor
    const alpha_avg = alpha;
    const lambda_enkel = calcLambdaEnkeltstag(gamma_M, Pp, tau_k_berg, psi, alpha);

    // 7. Rock cone: anchor row
    const lambda_rekke = calcLambdaStagrekke(gamma_M, Pp, tau_k_berg, psi, alpha_avg, eta, D);

    // 8. Governing drilling depth
    const allLengths = [
      { key: 'Ltb_staal',     val: Ltb_staal,    label: 'Heft stål–mørtel' },
      { key: 'Ltb_mortel',    val: Ltb_mortel,   label: 'Heft mørtel–berg' },
      { key: 'lambda_enkel',  val: lambda_enkel, label: 'Bergkjegle, enkelt stag' },
      { key: 'lambda_rekke',  val: lambda_rekke, label: 'Bergkjegle, stagrekke' },
    ];
    const governing = allLengths.reduce((a, b) => b.val > a.val ? b : a);
    const L_innborring = governing.val;

    // 9. Utilizations
    const util_stag         = (Pp / Ri) * 100;
    const util_staal_mortel = (Ltb_staal    / L_innborring) * 100;
    const util_mortel_berg  = (Ltb_mortel   / L_innborring) * 100;
    const util_kjegle_enkel = (lambda_enkel / L_innborring) * 100;
    const util_kjegle_rekke = (lambda_rekke / L_innborring) * 100;

    return {
      inputs: { ...inputs },
      intermediate: {
        Pp,
        At, Ri, d_ekv,
        Ltb_staal,
        d_min_borhull, d_borhull,
        tau_d_mortel_berg,
        Ltb_mortel, Ltb,
        alpha_avg, lambda_enkel, lambda_rekke,
      },
      results: {
        L_innborring,
        governing_key:   governing.key,
        governing_label: governing.label,
      },
      utilizations: {
        stag:         util_stag,
        staal_mortel: util_staal_mortel,
        mortel_berg:  util_mortel_berg,
        kjegle_enkel: util_kjegle_enkel,
        kjegle_rekke: util_kjegle_rekke,
      },
      status: {
        stag_ok: util_stag <= 100,
        all_ok:  util_stag <= 100,
      },
    };
  }

  return {
    calcAll,
    calcAt,
    calcRi,
    calcLtbStaalMortel,
    calcDborhull,
    calcLtbMortelBerg,
    calcLambdaEnkeltstag,
    calcLambdaStagrekke,
  };
})();
