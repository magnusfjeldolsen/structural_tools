"""prestress-hand-calc.py -- uavhengig haandregning for sak #84 (forspenning og steg).

KJOERES MED REN CPython, UTEN aa importere motoren, numpy eller structuralcodes:

    python concrete_section_calculator/docs/prestress-hand-calc.py

Tallene den skriver ut er AKSEPTKRITERIENE for motoren (`csc_prestress.py`), skrevet
FOER motorkoden. Motoren skal treffe t0-tallene innen 1 %; avvik skal forklares.
`tests/python/test_prestress.py` har tallene herfra skrevet inn som konstanter.

=====================================================================================
ANTAGELSER (alle er ANTAGELSER for referansesnittet, ikke verdier fra et produktblad)
=====================================================================================
A1  Snitt: HD265-lignende, 1200 x 265 mm, 7 sirkulaere kanaler D = 140 mm, c/c 165,
    sentrert i hoeyden. Ingen fuger/kantprofil. Referansen regner EKTE SIRKLER; motoren
    faar 32-kanten fra `tests/fixtures/section-hd265-7holes.json` (innskrevet, A +0,33 %).
    Skriptet regner derfor t0 for BEGGE, slik at avviket kan forklares tall for tall.
A2  Spennarmering: 10 tau aa A_p = 93 mm2 (12,5 mm tau), senter 45 mm over underkant,
    alle i ett lag. E_p = 195 000 MPa, f_p0,1k = 1640, f_pk = 1860, eps_uk = 0,035.
A3  sigma_p0 = 1100 MPa er spenningen i tauet RETT FOER overfoering (tap i benken
    allerede trukket fra). Heft: tauet foelger betongen etter overfoering.
A4  Betong C45/55: f_ck = 45, f_cm = 53, E_cm = 22(f_cm/10)^0,3 GPa (EC2 tab. 3.1),
    f_ctm = 0,30 f_ck^(2/3). Ved overfoering: f_ck(t0) = 30 MPa (ANTAGELSE, inndata),
    f_cm(t0) = f_ck(t0) + 8, E_cm(t0) = E_cm (f_cm(t0)/f_cm)^0,3 (EC2 3.5),
    f_ctm(t0) = f_ctm (f_cm(t0)/f_cm)^1 (EC2 3.4, alpha = 1 for t < 28 d).
A5  Egenvekt 25 kN/m3, fritt opplagt spenn L = 10 m: M_g = -g L^2/8 (sagging negativ).
    M_g virker allerede ved t0 (elementet loefter seg av benken) og er det permanente
    momentet ved t_inf.
A6  Transformert tverrsnitt: A_tr = A_c + alpha A_p, alpha = E_p/E_c. Betongen regnes
    BRUTTO (hullet tauet tar er IKKE trukket fra), samme modell som motorens standard
    (`subtract_bar_area = false`). Forskjellen mot (alpha - 1) A_p er ~0,1 % i spenning.
A7  Tap (EC2 5.10.6, lign. 5.46), med EC2 5.10.6-definisjonene:
      - kryptall phi(t_inf, t0) etter tillegg B, RH = 50 %, sement R, t0 = 1 d,
        t_inf = 50 aar, h0 = 2A/u med u = ytre omkrets + 1/2 hullomkrets (modulens valg);
      - svinn eps_cs = eps_cs(t_inf) - eps_cs(t0) etter 3.1.4 / B.2, toerking fra t_s = t0;
      - relaksasjon klasse 2 (lav), rho_1000 = 2,5 %, t = 500 000 h (3.3.2(6)/(8)),
        lign. 3.29 med sigma_pi = sigma_p ved t0 under G (5.10.6(1)(b)), mu = sigma_pi/f_pk;
      - sigma_c,QP = betongspenningen i tauhoeyde ved t0 under G + P_m0.
A8  t_inf: tauspenningen etter tap sigma_p,inf = sigma_p(t0) - Delta sigma_p,c+s+r.
    Betongspenningene ved t_inf er da STATISK BESTEMT: betongen baerer N_c = -P_inf og
    M_c = M_g - P_inf z_p (om betongens tyngdepunkt). Krumningen ved t_inf er
    M_c / (E_c,eff I_c), E_c,eff = E_cm / (1 + phi) (EC2 7.20); svinnkrumning er IKKE med.
A9  Belastet (t_inf + tilleggsmoment): korttids, transformert snitt med E_cm (28 d).
    Momentet M er TOTALT (inkl. egenvekt); tillegget er M - M_g.
A10 Dekompresjon/riss: momentet (sagging) som gir sigma_c = 0 / sigma_c = f_ctm(t) i
    UNDERKANT, regnet paa det urissede transformerte snittet fra stegets tilstand.

Fortegn: strekk positiv (spenning og N), sagging negativ (M), z opp, y-aksen gjennom
betongens tyngdepunkt. Enheter: N, mm, MPa.
"""

import math

# ------------------------------------------------------------------------------- #
# Inndata (se antagelsene over)
# ------------------------------------------------------------------------------- #
B, H = 1200.0, 265.0
N_HOLES, D_HOLE, CC = 7, 140.0, 165.0
N_GON = 32
N_TENDON, A_P1 = 10, 93.0
COVER_P = 45.0
E_P, FP01K, FPK = 195000.0, 1640.0, 1860.0
SIGMA_P0 = 1100.0
FCK, FCK_T0 = 45.0, 30.0
RHO_CONC = 25e-6           # N/mm3  (25 kN/m3)
SPAN = 10000.0             # mm
RH, CEMENT, T0, T_LIFE = 50.0, 'R', 1.0, 50 * 365.0
RHO_1000, T_RELAX_H = 2.5, 500000.0
M_LOADED = [-150e6, -200e6]   # eksempelmomenter (totale) for steget «belastet»


def section(kind):
    """A, I om tyngdepunktet (z = 0 ved symmetri), omkrets av hullene."""
    r = D_HOLE / 2.0
    if kind == 'circle':
        a_h = math.pi * r * r
        i_h = math.pi * r ** 4 / 4.0
        p_h = 2 * math.pi * r
    else:
        n = N_GON
        a_h = 0.5 * n * r * r * math.sin(2 * math.pi / n)
        i_h = n * r ** 4 / 24.0 * math.sin(2 * math.pi / n) * (2 + math.cos(2 * math.pi / n))
        p_h = 2 * n * r * math.sin(math.pi / n)
    a = B * H - N_HOLES * a_h
    i = B * H ** 3 / 12.0 - N_HOLES * i_h
    return {'A': a, 'I': i, 'u_outer': 2 * (B + H), 'u_holes': N_HOLES * p_h}


def materials():
    fcm = FCK + 8.0
    ecm = 22000.0 * (fcm / 10.0) ** 0.3
    fctm = 0.30 * FCK ** (2.0 / 3.0)
    fcm_t0 = FCK_T0 + 8.0
    ecm_t0 = ecm * (fcm_t0 / fcm) ** 0.3
    fctm_t0 = fctm * (fcm_t0 / fcm)
    return {'fcm': fcm, 'Ecm': ecm, 'fctm': fctm,
            'Ecm_t0': ecm_t0, 'fctm_t0': fctm_t0}


def transformed(sec, alpha, ap, zp):
    """Transformert tverrsnitt: A_tr, z_tr, I_tr (om z_tr)."""
    a_tr = sec['A'] + alpha * ap
    z_tr = alpha * ap * zp / a_tr
    i_tr = sec['I'] + sec['A'] * z_tr ** 2 + alpha * ap * (zp - z_tr) ** 2
    return a_tr, z_tr, i_tr


def elastic_state(sec, ec, ap, zp, eps_p0, n_ext, m_ext):
    """Initialtoeyning i tauet, lineaer-elastisk, urisset. Gir eps(z) = e0 + chi (z - z_tr)."""
    alpha = E_P / ec
    a_tr, z_tr, i_tr = transformed(sec, alpha, ap, zp)
    p0 = ap * E_P * eps_p0            # tauets kraft om tverrsnittet ikke toeyde seg
    e0 = (n_ext - p0) / (ec * a_tr)
    chi = (m_ext - n_ext * z_tr - p0 * (zp - z_tr)) / (ec * i_tr)

    def sig_c(z):
        return ec * (e0 + chi * (z - z_tr))
    sigma_p = E_P * (e0 + chi * (zp - z_tr) + eps_p0)
    return {'sig_top': sig_c(H / 2), 'sig_bot': sig_c(-H / 2), 'sig_cp': sig_c(zp),
            'sigma_p': sigma_p, 'chi': chi, 'eps_a': e0 - chi * z_tr,
            'a_tr': a_tr, 'z_tr': z_tr, 'i_tr': i_tr}


def dec_and_cr(sig_bot, m_now, z_tr, i_tr, fct):
    """Momentene (totale) som gir sigma_bot = 0 og sigma_bot = f_ct, urisset."""
    lever = (-H / 2 - z_tr) / i_tr       # d sigma_bot / d M
    m_dec = m_now + (0.0 - sig_bot) / lever
    m_cr = m_now + (fct - sig_bot) / lever
    return m_dec, m_cr


def creep_phi(fcm, h0):
    """EC2 tillegg B, B.1-B.9, skrevet ut her uavhengig av JS og structuralcodes."""
    alpha = {'S': -1, 'N': 0, 'R': 1}[CEMENT]
    t0adj = max(T0 * (9.0 / (2.0 + T0 ** 1.2) + 1.0) ** alpha, 0.5)
    a1, a2, a3 = (35 / fcm) ** 0.7, (35 / fcm) ** 0.2, (35 / fcm) ** 0.5
    rh = (1 - RH / 100) / (0.1 * h0 ** (1 / 3))
    phi_rh = 1 + rh if fcm <= 35 else (1 + rh * a1) * a2
    phi0 = phi_rh * (16.8 / math.sqrt(fcm)) * (1 / (0.1 + t0adj ** 0.2))
    bh = 1.5 * (1 + (0.012 * RH) ** 18) * h0
    beta_h = min(bh + 250, 1500) if fcm <= 35 else min(bh + 250 * a3, 1500 * a3)
    tl = T_LIFE - t0adj
    return phi0 * (tl / (beta_h + tl)) ** 0.3


def shrinkage(fcm, h0):
    """eps_cs(t_inf) - eps_cs(t0), toerking fra t_s = t0. EC2 3.1.4(6), B.2, tab. 3.3."""
    ads1, ads2 = {'S': (3, 0.13), 'N': (4, 0.12), 'R': (6, 0.11)}[CEMENT]
    beta_rh = 1.55 * (1 - (RH / 100) ** 3)
    eps_cd0 = 0.85 * ((220 + 110 * ads1) * math.exp(-ads2 * fcm / 10)) * 1e-6 * beta_rh
    # Tab. 3.3, lineaert mellom punktene; h0 < 100 gir 1,0.
    pts = [(100, 1.0), (200, 0.85), (300, 0.75), (500, 0.70)]
    if h0 <= 100:
        kh = 1.0
    elif h0 >= 500:
        kh = 0.70
    else:
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if x0 <= h0 <= x1:
                kh = y0 + (y1 - y0) * (h0 - x0) / (x1 - x0)
                break
    t_s = T0
    beta_ds = (T_LIFE - t_s) / ((T_LIFE - t_s) + 0.04 * math.sqrt(h0 ** 3))
    eps_cd = beta_ds * kh * eps_cd0
    eps_ca_inf = 2.5 * (FCK - 10) * 1e-6
    eps_ca = eps_ca_inf * ((1 - math.exp(-0.2 * T_LIFE ** 0.5)) - (1 - math.exp(-0.2 * T0 ** 0.5)))
    return {'eps_cd': eps_cd, 'eps_ca': eps_ca, 'eps_cs': eps_cd + eps_ca,
            'kh': kh, 'eps_cd0': eps_cd0}


def relaxation_class2(sigma_pi):
    """EC2 3.3.2 lign. 3.29 (klasse 2), t = 500 000 h. Gir Delta sigma_pr (positiv)."""
    mu = sigma_pi / FPK
    ratio = 0.66 * RHO_1000 * math.exp(9.1 * mu) * (T_RELAX_H / 1000) ** (0.75 * (1 - mu)) * 1e-5
    return ratio * sigma_pi, mu


def run(kind, verbose=True):
    sec = section(kind)
    mat = materials()
    ap = N_TENDON * A_P1
    zp = -H / 2 + COVER_P
    eps_p0 = SIGMA_P0 / E_P
    g = RHO_CONC * sec['A']                 # N/mm
    m_g = -g * SPAN ** 2 / 8.0

    out = {'A': sec['A'], 'I': sec['I'], 'M_g': m_g}

    # ---- t0: overfoering ------------------------------------------------------- #
    t0 = elastic_state(sec, mat['Ecm_t0'], ap, zp, eps_p0, 0.0, m_g)
    m_dec0, m_cr0 = dec_and_cr(t0['sig_bot'], m_g, t0['z_tr'], t0['i_tr'], mat['fctm_t0'])
    out['t0'] = dict(t0, M=m_g, M_dec=m_dec0, M_cr=m_cr0,
                     uncracked=max(t0['sig_top'], t0['sig_bot']) <= mat['fctm_t0'],
                     d_sigma_el=SIGMA_P0 - t0['sigma_p'])

    # ---- tap ------------------------------------------------------------------ #
    h0 = 2 * sec['A'] / (sec['u_outer'] + 0.5 * sec['u_holes'])
    phi = creep_phi(mat['fcm'], h0)
    shr = shrinkage(mat['fcm'], h0)
    sigma_pi = t0['sigma_p']
    d_pr, mu = relaxation_class2(sigma_pi)
    sig_cqp = -t0['sig_cp']                 # trykk positiv i lign. 5.46
    alpha28 = E_P / mat['Ecm']
    num_s = shr['eps_cs'] * E_P
    num_r = 0.8 * d_pr
    num_c = alpha28 * phi * sig_cqp
    den = 1 + alpha28 * ap / sec['A'] * (1 + sec['A'] / sec['I'] * zp ** 2) * (1 + 0.8 * phi)
    d_csr = (num_s + num_r + num_c) / den
    sigma_pinf = t0['sigma_p'] - d_csr
    out['losses'] = {'h0': h0, 'phi': phi, **shr, 'sigma_pi': sigma_pi, 'mu': mu,
                     'd_sigma_pr': d_pr, 'sigma_c_qp': sig_cqp, 'term_s': num_s,
                     'term_r': num_r, 'term_c': num_c, 'denominator': den,
                     'd_sigma_csr': d_csr, 'term_s_net': num_s / den,
                     'term_r_net': num_r / den, 'term_c_net': num_c / den}

    # ---- t_inf: statisk bestemt ------------------------------------------------ #
    p_inf = ap * sigma_pinf
    n_c = -p_inf
    m_c = m_g - p_inf * zp
    s_top = n_c / sec['A'] + m_c * (H / 2) / sec['I']
    s_bot = n_c / sec['A'] + m_c * (-H / 2) / sec['I']
    s_cp = n_c / sec['A'] + m_c * zp / sec['I']
    e_eff = mat['Ecm'] / (1 + phi)
    chi_inf = m_c / (e_eff * sec['I'])
    a_tr, z_tr, i_tr = transformed(sec, alpha28, ap, zp)
    # sigma_bot paa det transformerte snittet ved M_g er det samme tallet (statikk);
    # tilleggsmomentet fordeles paa det transformerte snittet.
    m_dec_inf, m_cr_inf = dec_and_cr(s_bot, m_g, z_tr, i_tr, mat['fctm'])
    out['tinf'] = {'sigma_p': sigma_pinf, 'P': p_inf, 'sig_top': s_top, 'sig_bot': s_bot,
                   'sig_cp': s_cp, 'chi': chi_inf, 'E_c_eff': e_eff, 'M': m_g,
                   'M_dec': m_dec_inf, 'M_cr': m_cr_inf,
                   'uncracked': max(s_top, s_bot) <= mat['fctm'],
                   'eps_p_star': sigma_pinf / E_P - s_cp / mat['Ecm']}

    # ---- belastet -------------------------------------------------------------- #
    out['loaded'] = []
    for m in M_LOADED:
        dm = m - m_g
        top = s_top + dm * (H / 2 - z_tr) / i_tr
        bot = s_bot + dm * (-H / 2 - z_tr) / i_tr
        sp = sigma_pinf + alpha28 * dm * (zp - z_tr) / i_tr
        chi = chi_inf + dm / (mat['Ecm'] * i_tr)
        out['loaded'].append({'M': m, 'dM': dm, 'sig_top': top, 'sig_bot': bot,
                              'sigma_p': sp, 'chi': chi,
                              'uncracked': max(top, bot) <= mat['fctm']})

    # ---- ULS, rektangulaer trykksone (EC2 3.1.7(3)), kontroll av stoerrelsesorden -- #
    fcd = 1.0 * FCK / 1.5
    fpd = FP01K / 1.15
    t_force = ap * fpd
    x = t_force / (0.8 * B * fcd)
    d = H / 2 - zp
    m_rd = -(t_force * (d - 0.4 * x))
    eps_p_plane = 0.0035 * (d - x) / x
    out['uls'] = {'x': x, 'M_Rd_block': m_rd, 'eps_p_total': out['tinf']['eps_p_star'] + eps_p_plane,
                  'eps_pd': fpd / E_P, 'flange_top': H / 2 - D_HOLE / 2}

    if verbose:
        _print(kind, out, mat)
    return out


def _print(kind, o, mat):
    f = lambda v, n=3: f'{v:,.{n}f}'.replace(',', ' ')
    print(f'\n=========== HAANDREGNING ({kind}) ===========')
    print(f'A = {f(o["A"], 1)} mm2   I = {o["I"]:.6e} mm4')
    print(f'E_cm = {f(mat["Ecm"], 1)}  E_cm(t0) = {f(mat["Ecm_t0"], 1)}  '
          f'f_ctm = {f(mat["fctm"])}  f_ctm(t0) = {f(mat["fctm_t0"])} MPa')
    print(f'M_g = {f(o["M_g"] / 1e6)} kNm')
    t0 = o['t0']
    print('--- t0 (overfoering) ---')
    print(f'  sigma_c o.k. = {f(t0["sig_top"], 4)}   u.k. = {f(t0["sig_bot"], 4)} MPa')
    print(f'  sigma_c i tauhoeyde = {f(t0["sig_cp"], 4)} MPa')
    print(f'  sigma_p = {f(t0["sigma_p"], 3)} MPa   (elastisk forkortelse {f(t0["d_sigma_el"], 3)})')
    print(f'  chi = {t0["chi"]:.6e} 1/mm   eps_a(z=0) = {t0["eps_a"]:.6e}')
    print(f'  M_dec = {f(t0["M_dec"] / 1e6)}  M_cr = {f(t0["M_cr"] / 1e6)} kNm   '
          f'urisset: {t0["uncracked"]}')
    lo = o['losses']
    print('--- tap (EC2 5.46) ---')
    print(f'  h0 = {f(lo["h0"], 2)} mm  phi = {f(lo["phi"], 4)}  eps_cs = {lo["eps_cs"]:.6e} '
          f'(cd {lo["eps_cd"]:.4e}, ca {lo["eps_ca"]:.4e}, k_h {lo["kh"]:.3f})')
    print(f'  Delta sigma_pr = {f(lo["d_sigma_pr"])} (mu = {f(lo["mu"], 4)})  '
          f'sigma_c,QP = {f(lo["sigma_c_qp"], 4)}')
    print(f'  teller: svinn {f(lo["term_s"])}  0.8 relaks {f(lo["term_r"])}  kryp {f(lo["term_c"])}; '
          f'nevner {f(lo["denominator"], 5)}')
    print(f'  Delta sigma_p,c+s+r = {f(lo["d_sigma_csr"])} MPa  '
          f'(svinn {f(lo["term_s_net"])}, relaks {f(lo["term_r_net"])}, kryp {f(lo["term_c_net"])})')
    ti = o['tinf']
    print('--- t_inf (etter tap, under M_g) ---')
    print(f'  sigma_p = {f(ti["sigma_p"])}  P = {f(ti["P"] / 1e3, 2)} kN')
    print(f'  sigma_c o.k. = {f(ti["sig_top"], 4)}   u.k. = {f(ti["sig_bot"], 4)} MPa')
    print(f'  chi = {ti["chi"]:.6e} (E_c,eff = {f(ti["E_c_eff"], 1)})  eps_p* = {ti["eps_p_star"]:.6e}')
    print(f'  M_dec = {f(ti["M_dec"] / 1e6)}  M_cr = {f(ti["M_cr"] / 1e6)} kNm   '
          f'urisset: {ti["uncracked"]}')
    print('--- belastet ---')
    for row in o['loaded']:
        print(f'  M = {f(row["M"] / 1e6, 1)} (tillegg {f(row["dM"] / 1e6)}): o.k. {f(row["sig_top"], 4)}  '
              f'u.k. {f(row["sig_bot"], 4)}  sigma_p {f(row["sigma_p"])}  chi {row["chi"]:.6e}  '
              f'urisset: {row["uncracked"]}')
    u = o['uls']
    print('--- ULS, rektangulaer trykksone (stoerrelsesorden, ikke akseptkriterium) ---')
    print(f'  x = {f(u["x"], 2)} mm (topflens {f(u["flange_top"], 1)})  '
          f'M_Rd ~ {f(u["M_Rd_block"] / 1e6, 2)} kNm  eps_p,tot = {u["eps_p_total"]:.5f} > '
          f'eps_pd = {u["eps_pd"]:.5f}')


if __name__ == '__main__':
    ref = run('circle')
    gon = run('32-gon')
    print('\n=========== 32-kant mot sirkel (forklarer avviket motor/haandregning) ===========')
    for key in ('sig_top', 'sig_bot', 'sigma_p', 'chi'):
        a, b = ref['t0'][key], gon['t0'][key]
        print(f'  t0 {key:8s}: sirkel {a:.6g}  32-kant {b:.6g}  avvik {100 * (b - a) / a:+.3f} %')
