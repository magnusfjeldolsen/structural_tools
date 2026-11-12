"""csc_prestress.py -- forspent armering og beregningssteg t0 / t_inf / belastet (sak #84).

HVA DENNE FILA EIER
1. Spennlagets MATERIALE (`prestress_material`): f_p0,1k, f_pk, E_p, eps_uk, gamma_s,
   areal per tau og forspenningen (sigma_p0 ELLER eps_p0), lest og kontrollert ett sted.
   Feil fortegn er en FEIL (`PrestressError`), aldri et stille absoluttbeloep.
2. Et LINEAER-ELASTISK SNITT for et vilkaarlig polygon med hull og initialtoeyning
   (`solve_plane`): urisset (transformert tverrsnitt) og risset (null strekk i betong).
3. STEGENE: `transfer` (t0), `long_term` (t_inf etter tap) og `loaded` (t_inf + moment per
   bruksgrensekombinasjon), med tapene etter EC2 5.10.6 lign. (5.46) ledd for ledd.

HVORFOR IKKE `calculate_strain_profile`
Den regner med DESIGN-lovene (parabel-rektangel med f_cd, gamma_s paa staalet). Maalt i
SLS-runden: 24 % for lav betongspenning, paa usikker side, uten varsel (ROADMAP post 4).
Spenninger i et steg er en BRUKSTILSTAND og regnes her med E_c og E_p, lineaert. Det samme
valget `csc_sls` gjorde -- men `csc_sls` integrerer `b*x` i lukket form og kjenner bare
rektangelet. Denne kjernen integrerer over polygonet (Green-formlene i `csc_polygon`), og
klipper det mot noeytralaksen naar betongen ikke skal ta strekk.

FORTEGN (pakkens, som resten av motoren): strekk positiv for spenning, toeyning og N;
sagging negativ for M; z opp; eps(z) = eps_a + chi * z i payloadens system. Momentene er om
BETONGENS TYNGDEPUNKT `z_ref`, samme punkt som `engine._build` flytter pakkas origo til.
Forspenningen er en POSITIV initialtoeyning i tauet.

MODELLEN FOR STEGENE (antagelsene er de samme som i `docs/prestress-hand-calc.py`, og den
fila er fasiten -- se `tests/python/test_prestress.py`)
- t0: E_c = E_cm(t0) etter EC2 (3.5), med f_ck(t0) som inndata; tauet har eps_p0.
- tap: lign. (5.46) per spennlag. sigma_c,QP og sigma_pi regnes i t0-tilstanden under det
  PERMANENTE momentet. Brukeren kan i stedet gi sigma_p,inf direkte (overstyring).
- t_inf: tauspenningen er KJENT (sigma_p,inf), saa betongen og slakkarmeringen baerer
  N - P_inf og M - P_inf (z_p - z_ref) -- statisk bestemt for snittet uten tau. Krumningen
  ved t_inf rapporteres med E_c,eff = E_cm / (1 + phi) (EC2 7.20); svinnkrumning er ikke med.
- belastet: korttids paa t_inf-tilstanden, E_cm, med tauets initialtoeyning
  eps_p* = sigma_p,inf/E_p - eps_c(z_p) («dekompresjonstoeyningen»). Ved det permanente
  momentet gjenskaper det t_inf-tilstanden eksakt; et annet moment gir tillegget.
  Overstiger strekket f_ctm, regnes snittet risset (null strekk i betong).
- ULS: tauet faar eps_p* som initialtoeyning i `structuralcodes` (P_m,inf, gamma_P = 1).
"""

from __future__ import annotations

import math

from shapely import Polygon, box

from csc_polygon import ring_props

# EC2 3.3.2(6): rho_1000 [%] for klasse 1 (traad/tau, ordinaer), 2 (lav relaksasjon),
# 3 (stang). Anbefalte EN-verdier, overstyrbare med `rho_1000`.
RELAXATION_RHO_1000 = {1: 8.0, 2: 2.5, 3: 4.0}
# EC2 3.3.2(8): sluttverdien av relaksasjonstapet kan anslaas for t = 500 000 timer.
RELAXATION_HOURS = 500000.0

# Standardene for spennstaal. Anbefalte EN-verdier / typiske produktverdier, alle
# overstyrbare fra payloaden. gamma_s = 1,15 og gamma_eps = 0,9 er EC2 2.4.2.4 / 3.3.6(7).
PRESTRESS_DEFAULTS = {
    'Ep': 195000.0,
    'fp01k': 1640.0,
    'fpk': 1860.0,
    'epsuk': 0.035,
    'gamma_s': 1.15,
    'gamma_eps': 0.9,
    'law': 'elasticplastic',
}


class PrestressError(ValueError):
    """Ugyldig spennlag eller stegdata. `message` er brukervendt (engelsk, som motoren)."""

    def __init__(self, message, detail=''):
        super().__init__(message)
        self.message = message
        self.detail = str(detail)


def is_prestressed(layer):
    return bool(layer.get('prestress'))


def prestress_layers(rebar):
    return [layer for layer in rebar if is_prestressed(layer)]


def _f(raw, key, default=None):
    v = raw.get(key, default)
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        raise PrestressError(f'The prestressing value "{key}" is not a number.',
                             repr(v)[:100]) from None
    if not math.isfinite(v):
        raise PrestressError(f'The prestressing value "{key}" is not finite.', repr(v))
    return v


def prestress_material(layer):
    """Leser og kontrollerer spennlagets materiale. Kaster `PrestressError`.

    sigma_p0 ELLER eps_p0 (ikke begge): spenningen i tauet rett foer overfoering, strekk
    positiv. Et negativt tall er nesten alltid en fortegnsfeil fra noen som tenker «trykk
    i betongen» -- og et tau med negativ initialtoeyning ville gitt et snitt som henger
    NED i stedet for aa krumme opp, med en M_Rd som ser rimelig ut. Derfor en feil, ikke
    en absoluttverdi.
    """
    raw = layer.get('prestress') or {}
    lid = layer.get('id', '?')
    m = {k: _f(raw, k, PRESTRESS_DEFAULTS.get(k))
         for k in ('Ep', 'fp01k', 'fpk', 'epsuk', 'gamma_s', 'gamma_eps')}
    m['law'] = str(raw.get('law') or PRESTRESS_DEFAULTS['law'])
    for k in ('Ep', 'fp01k', 'fpk', 'epsuk', 'gamma_s', 'gamma_eps'):
        if not m[k] or m[k] <= 0:
            raise PrestressError(f'Layer {lid}: the prestressing steel property "{k}" must '
                                 'be greater than 0.', f'{k}={m[k]}')
    if m['fpk'] < m['fp01k']:
        raise PrestressError(f'Layer {lid}: f_pk must not be less than f_p0,1k.',
                             f'fpk={m["fpk"]}, fp01k={m["fp01k"]}')

    area1 = _f(raw, 'area_per_tendon')
    if area1 is None or area1 <= 0:
        raise PrestressError(f'Layer {lid}: the area per tendon A_p must be given and '
                             'greater than 0 (a 12.5 mm strand is 93 mm², not the area of '
                             'a 12.5 mm circle).', f'area_per_tendon={area1}')
    m['area_per_tendon'] = area1

    sigma = _f(raw, 'sigma_p0')
    eps = _f(raw, 'eps_p0')
    if sigma is not None and eps is not None:
        raise PrestressError(f'Layer {lid}: give either σ_p0 or ε_p0, not both.',
                             f'sigma_p0={sigma}, eps_p0={eps}')
    if sigma is None and eps is None:
        raise PrestressError(f'Layer {lid}: the prestress σ_p0 (or ε_p0) is missing.')
    if sigma is None:
        sigma = eps * m['Ep']
    if not sigma > 0:
        raise PrestressError(
            f'Layer {lid}: the prestress must be a TENSILE stress in the tendon, positive '
            f'in this program (tension positive). Got σ_p0 = {sigma:.1f} MPa. A negative '
            'value would make the element sag instead of camber.',
            f'sigma_p0={sigma}', )
    if sigma >= m['fp01k']:
        raise PrestressError(
            f'Layer {lid}: σ_p0 = {sigma:.0f} MPa is not below f_p0,1k = {m["fp01k"]:.0f} '
            'MPa. The tendon would already have yielded before transfer.',
            f'sigma_p0={sigma}, fp01k={m["fp01k"]}')
    m['sigma_p0'] = sigma
    m['eps_p0'] = sigma / m['Ep']
    return m


def prestress_limit_warning(layer_id, m):
    """EC2 5.10.3(2): sigma_pm0 <= min(k7 f_pk, k8 f_p0,1k), anbefalt k7 = 0,75, k8 = 0,85.

    sigma_p0 her er spenningen RETT FOER overfoering, altsaa en ovre grense for sigma_pm0.
    Returnerer `None` eller (melding, detalj). Bare en advarsel: grensen er en anbefalt
    EN-verdi, og et nasjonalt tillegg kan si noe annet.
    """
    lim = min(0.75 * m['fpk'], 0.85 * m['fp01k'])
    if m['sigma_p0'] > lim:
        return (f'Layer {layer_id}: σ_p0 = {m["sigma_p0"]:.0f} MPa exceeds the recommended '
                f'limit min(0.75·f_pk, 0.85·f_p0,1k) = {lim:.0f} MPa of EC2 5.10.3(2).',
                f'sigma_p0={m["sigma_p0"]}, limit={lim}')
    return None


def equivalent_diameter(area):
    """`PointGeometry` tar en diameter og regner arealet som pi d^2/4. Et 12,5 mm tau er
    93 mm2, ikke 122,7 -- saa diameteren som sendes til pakka er den AREALLIKE."""
    return math.sqrt(4.0 * area / math.pi)


# ------------------------------------------------------------------------------- #
# Det lineaer-elastiske snittet
# ------------------------------------------------------------------------------- #

def _polys(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == 'Polygon':
        return [geom]
    return [g for g in getattr(geom, 'geoms', []) if g.geom_type == 'Polygon']


def region_integrals(geom):
    """(A, S_z, I_zz) om z = 0 for et shapely-polygon/-multipolygon med hull."""
    a = s = i = 0.0
    for p in _polys(geom):
        rings = [(list(p.exterior.coords)[:-1], 1.0)]
        rings += [(list(r.coords)[:-1], -1.0) for r in p.interiors]
        for pts, sign in rings:
            if len(pts) < 3:
                continue
            ra, rsz, _rsy, rizz = ring_props(pts)
            k = sign * (1.0 if ra >= 0 else -1.0)
            a += k * ra
            s += k * rsz
            i += k * rizz
    return a, s, i


def _compressed_part(poly, eps_a, chi):
    """Delen av betongen med eps <= 0 for planet eps_a + chi z."""
    minx, miny, maxx, maxy = poly.bounds
    pad = 1.0 + (maxy - miny)
    if chi == 0.0:
        return poly if eps_a <= 0 else Polygon()
    z_na = -eps_a / chi
    if chi < 0:   # eps avtar oppover: trykk over noeytralaksen
        if z_na >= maxy:
            return Polygon()
        cut = box(minx - pad, max(z_na, miny - pad), maxx + pad, maxy + pad)
    else:
        if z_na <= miny:
            return Polygon()
        cut = box(minx - pad, miny - pad, maxx + pad, min(z_na, maxy + pad))
    return poly.intersection(cut)


def _solve_linear(ec, a, s, i, steel, n, m0):
    k11 = ec * a
    k12 = ec * s
    k22 = ec * i
    r1 = n
    r2 = m0
    for st in steel:
        ea = st['E'] * st['area']
        k11 += ea
        k12 += ea * st['z']
        k22 += ea * st['z'] ** 2
        r1 -= ea * st['eps0']
        r2 -= ea * st['eps0'] * st['z']
    det = k11 * k22 - k12 * k12
    if not det or not math.isfinite(det) or abs(det) < 1e-12 * abs(k11 * k22 or 1.0):
        raise PrestressError('The elastic cross-section has no stiffness to carry the load '
                             '(no concrete in compression and too few steel levels).',
                             f'det={det}')
    eps_a = (r1 * k22 - r2 * k12) / det
    chi = (k11 * r2 - k12 * r1) / det
    return eps_a, chi


def solve_plane(poly, ec, steel, n, m, z_ref, cracked=False):
    """Lineaer-elastisk toeyningsplan for N og M (om `z_ref`).

    `steel`: liste av {z, area, E, eps0}. Staalspenningen er E (eps(z) + eps0).
    `cracked=False`: hele betongen virker (urisset, transformert tverrsnitt).
    `cracked=True`: betongen tar ikke strekk; den trykkede delen finnes ved fikspunkt-
    iterasjon paa noeytralaksen (lineaert system per iterasjon), og likevekten
    kontrolleres til slutt.
    Returnerer {eps_a, chi, cracked_region (bool), A_c_active}.
    """
    m0 = m + n * z_ref           # moment om z = 0, der integralene staar
    a, s, i = region_integrals(poly)
    eps_a, chi = _solve_linear(ec, a, s, i, steel, n, m0)
    result = {'eps_a': eps_a, 'chi': chi, 'cut': False, 'A_active': a}
    if not cracked:
        return result
    minx, miny, maxx, maxy = poly.bounds
    h = maxy - miny
    for _ in range(200):
        part = _compressed_part(poly, eps_a, chi)
        pa, ps, pi_ = region_integrals(part)
        new_a, new_chi = _solve_linear(ec, pa, ps, pi_, steel, n, m0)
        done = (abs(new_a - eps_a) <= 1e-13 + 1e-10 * abs(new_a)
                and abs(new_chi - chi) * h <= 1e-13 + 1e-10 * abs(new_chi * h))
        eps_a, chi = new_a, new_chi
        if done:
            break
    else:
        raise PrestressError('The cracked elastic analysis did not converge.',
                             f'eps_a={eps_a}, chi={chi}')
    part = _compressed_part(poly, eps_a, chi)
    pa, ps, pi_ = region_integrals(part)
    # Likevektskontroll med den ENDELIGE trykksonen.
    n_chk = ec * (pa * eps_a + ps * chi)
    m_chk = ec * (ps * eps_a + pi_ * chi)
    for st in steel:
        sig = st['E'] * (eps_a + chi * st['z'] + st['eps0'])
        n_chk += sig * st['area']
        m_chk += sig * st['area'] * st['z']
    scale = max(abs(n), abs(m0) / max(h, 1.0), 1.0)
    if abs(n_chk - n) > 1e-6 * scale or abs(m_chk - m0) > 1e-6 * scale * h:
        raise PrestressError('The cracked elastic analysis is not in equilibrium.',
                             f'N {n_chk} vs {n}, M {m_chk} vs {m0}')
    result.update({'eps_a': eps_a, 'chi': chi, 'A_active': pa,
                   'cut': abs(pa - a) > 1e-9 * a})
    return result


# ------------------------------------------------------------------------------- #
# Betongen over tid (EC2 3.1.2, 3.1.4, tillegg B) og staalets relaksasjon (3.3.2)
# ------------------------------------------------------------------------------- #

def concrete_at_transfer(fck, fck_t0):
    """E_cm, f_ctm og samme ved overfoering. EC2 (3.4) med alpha = 1 og (3.5)."""
    from structuralcodes.codes import ec2_2004
    fcm = float(ec2_2004.fcm(fck))
    ecm = float(ec2_2004.Ecm(fcm))
    fctm = float(ec2_2004.fctm(fck))
    fcm_t0 = float(ec2_2004.fcm(fck_t0))
    ecm_t0 = float(ec2_2004.Ecm_time(fcm, fcm_t0, ecm))
    fctm_t0 = float(ec2_2004.fctm_time(fctm, fcm_t0 / fcm, 1.0))
    return {'fck': fck, 'fcm': fcm, 'Ecm': ecm, 'fctm': fctm,
            'fck_t0': fck_t0, 'fcm_t0': fcm_t0, 'Ecm_t0': ecm_t0, 'fctm_t0': fctm_t0}


def shrinkage_after(fck, h0, rh, cement, t0, t_life):
    """eps_cs(t_life) - eps_cs(t0), toerking fra t_s = t0. Pakkas egne EC2-funksjoner.

    Svinnet FOER overfoering forkorter ikke tauet: det er ikke heftet ennaa. Det er derfor
    differansen som brukes i lign. (5.46), og toerkingen regnes fra t0 (elementet tas ut
    av forskalingen ved overfoering).
    """
    from structuralcodes.codes import ec2_2004
    fcm = float(ec2_2004.fcm(fck))
    cd0 = float(ec2_2004.eps_cd_0(ec2_2004.alpha_ds1(cement), ec2_2004.alpha_ds2(cement),
                                  fcm, ec2_2004.beta_RH(rh)))
    kh = float(ec2_2004.k_h(h0))
    eps_cd = float(ec2_2004.eps_cd(ec2_2004.beta_ds(t_life, t0, h0), kh, cd0))
    ca_inf = float(ec2_2004.eps_ca_inf(fck))
    eps_ca = float(ec2_2004.eps_ca(ec2_2004.beta_as(t_life), ca_inf)) - \
        float(ec2_2004.eps_ca(ec2_2004.beta_as(t0), ca_inf))
    return {'eps_cd': eps_cd, 'eps_ca': eps_ca, 'eps_cs': eps_cd + eps_ca,
            'k_h': kh, 'eps_cd_0': cd0}


def relaxation_loss(sigma_pi, fpk, cls, rho_1000=None, hours=RELAXATION_HOURS):
    """EC2 3.3.2 lign. (3.28)-(3.30). Gir (Delta sigma_pr, mu, rho_1000)."""
    cls = int(cls)
    if cls not in RELAXATION_RHO_1000:
        raise PrestressError('The relaxation class must be 1, 2 or 3 (EC2 3.3.2(4)).',
                             f'class={cls}')
    rho = RELAXATION_RHO_1000[cls] if rho_1000 is None else float(rho_1000)
    mu = sigma_pi / fpk
    tt = (hours / 1000.0) ** (0.75 * (1.0 - mu))
    if cls == 1:
        ratio = 5.39 * rho * math.exp(6.7 * mu) * tt * 1e-5
    elif cls == 2:
        ratio = 0.66 * rho * math.exp(9.1 * mu) * tt * 1e-5
    else:
        ratio = 1.98 * rho * math.exp(8.0 * mu) * tt * 1e-5
    return ratio * sigma_pi, mu, rho


# ------------------------------------------------------------------------------- #
# Stegene
# ------------------------------------------------------------------------------- #

def _num(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _cfg_float(cfg, key, default=None, positive=False):
    v = cfg.get(key, default)
    if v is None:
        return None
    try:
        v = float(v)
    except (TypeError, ValueError):
        raise PrestressError(f'The stage input "{key}" is not a number.', repr(v)[:100]) from None
    if not math.isfinite(v) or (positive and v <= 0):
        raise PrestressError(f'The stage input "{key}" must be '
                             + ('greater than 0.' if positive else 'a finite number.'),
                             f'{key}={v}')
    return v


def _steel_items(rebar, steel_es, prestrain=None, include_tendons=True):
    """Lagene som elastiske staalpunkter. `prestrain`: {layer_id: eps0} for spennlag."""
    items = []
    for layer in rebar:
        z = float(layer['bars'][0]['z']) if layer['kind'] == 'bars' else float(layer['strip']['z'])
        if is_prestressed(layer):
            if not include_tendons:
                continue
            mat = layer['_material']
            items.append({'id': layer['id'], 'z': z, 'area': float(layer['area']),
                          'E': mat['Ep'], 'eps0': (prestrain or {}).get(layer['id'], 0.0),
                          'tendon': True})
        else:
            items.append({'id': layer['id'], 'z': z, 'area': float(layer['area']),
                          'E': steel_es, 'eps0': 0.0, 'tendon': False})
    return items


class Stages:
    """Regner overfoering og langtid ved bygging, og belastet per kombinasjon etterpaa."""

    def __init__(self, poly, z_ref, rebar, steel_es, fck, cfg):
        self.poly = poly
        self.z_ref = z_ref
        self.z_top = poly.bounds[3]
        self.z_bot = poly.bounds[1]
        self.steel_es = steel_es
        cfg = cfg or {}
        self.cfg = cfg
        self.layers = []
        self.warnings = []
        for layer in rebar:
            if is_prestressed(layer):
                mat = prestress_material(layer)
                layer = dict(layer, _material=mat)
                lim = prestress_limit_warning(layer['id'], mat)
                if lim is not None:
                    self.warnings.append(('prestress_above_limit',) + lim)
            self.layers.append(layer)
        self.tendons = [l for l in self.layers if is_prestressed(l)]

        fck_t0 = _cfg_float(cfg, 'fck_t0', fck, positive=True)
        if fck_t0 > fck:
            raise PrestressError('f_ck(t0) at transfer cannot exceed f_ck.',
                                 f'fck_t0={fck_t0}, fck={fck}')
        self.mat = concrete_at_transfer(fck, fck_t0)
        self.m_transfer = _cfg_float(cfg, 'M_transfer', 0.0)
        self.m_perm = _cfg_float(cfg, 'M_permanent', self.m_transfer)
        self._transfer()
        self._losses()
        self._long_term()

    # -- hjelpere --------------------------------------------------------------- #
    def _items(self, prestrain=None, include_tendons=True):
        return _steel_items(self.layers, self.steel_es, prestrain, include_tendons)

    def _solve(self, ec, items, n, m, fct):
        """Urisset; er strekket over f_ct, risset (null strekk i betong)."""
        sol = solve_plane(self.poly, ec, items, n, m, self.z_ref)
        top = ec * (sol['eps_a'] + sol['chi'] * self.z_top)
        bot = ec * (sol['eps_a'] + sol['chi'] * self.z_bot)
        uncracked = max(top, bot) <= fct
        if not uncracked:
            sol = solve_plane(self.poly, ec, items, n, m, self.z_ref, cracked=True)
        sol['uncracked'] = uncracked
        return sol

    def _fibres(self, ec, sol):
        def sig(z):
            v = ec * (sol['eps_a'] + sol['chi'] * z)
            return v if sol['uncracked'] else min(v, 0.0)
        return sig(self.z_top), sig(self.z_bot)

    def _dec_cr(self, ec, sig_bot_unc, m_now, fct):
        """Momentene (totale, sagging) som gir sigma_c,u.k. = 0 og = f_ct, urisset."""
        unit = solve_plane(self.poly, ec, self._items(), 0.0, 1.0e6, self.z_ref)
        d_sig = ec * (unit['eps_a'] + unit['chi'] * self.z_bot) / 1.0e6
        if not d_sig:
            return None, None
        return m_now - sig_bot_unc / d_sig, m_now + (fct - sig_bot_unc) / d_sig

    def _tendon_stresses(self, sol, prestrain):
        out = []
        for l in self.tendons:
            z = float(l['bars'][0]['z']) if l['kind'] == 'bars' else float(l['strip']['z'])
            mat = l['_material']
            out.append({'id': l['id'], 'z': _num(z),
                        'sigma_p': _num(mat['Ep'] * (sol['eps_a'] + sol['chi'] * z
                                                     + prestrain[l['id']]))})
        return out

    def _stage(self, name, ec, sol, prestrain, m, n, fct, chi_report=None):
        top, bot = self._fibres(ec, sol)
        row = {
            'stage': name, 'N': _num(n), 'M': _num(m),
            'sigma_c_top': _num(top), 'sigma_c_bottom': _num(bot),
            'tendons': self._tendon_stresses(sol, prestrain),
            'chi': _num(sol['chi'] if chi_report is None else chi_report),
            'eps_a': _num(sol['eps_a']),
            'uncracked': bool(sol['uncracked']),
            'f_ct': _num(fct),
            'E_c': _num(ec),
        }
        return row

    # -- t0 --------------------------------------------------------------------- #
    def _transfer(self):
        ec = self.mat['Ecm_t0']
        fct = self.mat['fctm_t0']
        self.eps_p0 = {l['id']: l['_material']['eps_p0'] for l in self.tendons}
        items = self._items(self.eps_p0)
        sol = self._solve(ec, items, 0.0, self.m_transfer, fct)
        row = self._stage('transfer', ec, sol, self.eps_p0, self.m_transfer, 0.0, fct)
        unc = solve_plane(self.poly, ec, items, 0.0, self.m_transfer, self.z_ref)
        m_dec, m_cr = self._dec_cr(ec, ec * (unc['eps_a'] + unc['chi'] * self.z_bot),
                                   self.m_transfer, fct)
        row['M_dec'] = _num(m_dec)
        row['M_cr'] = _num(m_cr)
        for t in row['tendons']:
            mat = next(l['_material'] for l in self.tendons if l['id'] == t['id'])
            t['sigma_p0'] = _num(mat['sigma_p0'])
            t['d_sigma_el'] = _num(mat['sigma_p0'] - t['sigma_p'])
        self.transfer = row

    # -- tap -------------------------------------------------------------------- #
    def _losses(self):
        cfg = self.cfg
        override = _cfg_float(cfg, 'sigma_p_inf')
        ec0 = self.mat['Ecm_t0']
        # sigma_c,QP og sigma_pi: t0-tilstanden under det PERMANENTE momentet (5.10.6(1)).
        qp = solve_plane(self.poly, ec0, self._items(self.eps_p0), 0.0, self.m_perm, self.z_ref)
        self.losses = []
        self.sigma_p_inf = {}
        if override is not None:
            if not override > 0:
                raise PrestressError('σ_p after losses must be a tensile stress (positive).',
                                     f'sigma_p_inf={override}')
            for l in self.tendons:
                mat = l['_material']
                if override > mat['sigma_p0']:
                    raise PrestressError(
                        f'Layer {l["id"]}: σ_p after losses ({override:.0f} MPa) is greater '
                        f'than σ_p0 ({mat["sigma_p0"]:.0f} MPa).', '')
                self.sigma_p_inf[l['id']] = override
                self.losses.append({'id': l['id'], 'source': 'override',
                                    'sigma_p0': _num(mat['sigma_p0']),
                                    'sigma_p_inf': _num(override),
                                    'd_sigma_total': _num(mat['sigma_p0'] - override)})
            return

        phi = _cfg_float(cfg, 'phi', positive=False)
        if phi is None or phi < 0:
            raise PrestressError('The creep coefficient φ is needed for the losses (or give σ_p '
                                 'after losses directly).', f'phi={phi}')
        rh = _cfg_float(cfg, 'RH', 50.0, positive=True)
        cement = str(cfg.get('cement') or 'N').upper()
        t0 = _cfg_float(cfg, 't0', 28.0, positive=True)
        t_life = _cfg_float(cfg, 't_life', 50 * 365.0, positive=True)
        h0 = _cfg_float(cfg, 'h0', positive=True)
        if h0 is None:
            raise PrestressError('The notional size h0 is needed for the shrinkage loss.')
        if t_life <= t0:
            raise PrestressError('The service life must be later than the age at transfer.',
                                 f't0={t0}, t_life={t_life}')
        shr = shrinkage_after(self.mat['fck'], h0, rh, cement, t0, t_life)
        cls = int(_cfg_float(cfg, 'relaxation_class', 2.0))
        rho_1000 = _cfg_float(cfg, 'rho_1000', None)
        a_c, s_c, i_c0 = region_integrals(self.poly)
        i_c = i_c0 - a_c * self.z_ref ** 2
        ecm = self.mat['Ecm']
        for l in self.tendons:
            mat = l['_material']
            z = float(l['bars'][0]['z']) if l['kind'] == 'bars' else float(l['strip']['z'])
            eps_z = qp['eps_a'] + qp['chi'] * z
            sigma_pi = mat['Ep'] * (eps_z + self.eps_p0[l['id']])
            sigma_cqp = -ec0 * eps_z          # trykk positiv, som i (5.46)
            d_pr, mu, rho = relaxation_loss(sigma_pi, mat['fpk'], cls, rho_1000)
            alpha = mat['Ep'] / ecm
            ap = float(l['area'])
            z_cp = z - self.z_ref
            t_s = shr['eps_cs'] * mat['Ep']
            t_r = 0.8 * d_pr
            t_c = alpha * phi * sigma_cqp
            den = 1.0 + alpha * ap / a_c * (1.0 + a_c / i_c * z_cp ** 2) * (1.0 + 0.8 * phi)
            d_csr = (t_s + t_r + t_c) / den
            s_inf = sigma_pi - d_csr
            if not s_inf > 0:
                raise PrestressError(f'Layer {l["id"]}: the losses exceed the prestress.',
                                     f'sigma_pi={sigma_pi}, losses={d_csr}')
            self.sigma_p_inf[l['id']] = s_inf
            self.losses.append({
                'id': l['id'], 'source': 'ec2_5_46',
                'sigma_p0': _num(mat['sigma_p0']), 'sigma_pi': _num(sigma_pi),
                'd_sigma_el': _num(mat['sigma_p0'] - sigma_pi),
                'phi': _num(phi), 'eps_cs': _num(shr['eps_cs']), 'eps_cd': _num(shr['eps_cd']),
                'eps_ca': _num(shr['eps_ca']), 'k_h': _num(shr['k_h']),
                'relaxation_class': cls, 'rho_1000': _num(rho), 'mu': _num(mu),
                'd_sigma_pr': _num(d_pr), 'sigma_c_qp': _num(sigma_cqp),
                'term_shrinkage': _num(t_s / den), 'term_relaxation': _num(t_r / den),
                'term_creep': _num(t_c / den), 'denominator': _num(den),
                'd_sigma_csr': _num(d_csr), 'sigma_p_inf': _num(s_inf),
                'd_sigma_total': _num(mat['sigma_p0'] - s_inf),
                'inputs': {'RH': rh, 'cement': cement, 't0': t0, 't_life': t_life,
                           'h0': h0, 'hours': RELAXATION_HOURS},
            })

    # -- t_inf ------------------------------------------------------------------ #
    def _long_term(self):
        ecm = self.mat['Ecm']
        fct = self.mat['fctm']
        # Tauets kraft er KJENT: snittet uten tau baerer resten.
        n_rest = 0.0
        m_rest = self.m_perm
        for l in self.tendons:
            z = float(l['bars'][0]['z']) if l['kind'] == 'bars' else float(l['strip']['z'])
            p = float(l['area']) * self.sigma_p_inf[l['id']]
            n_rest -= p
            m_rest -= p * (z - self.z_ref)
        items = self._items(include_tendons=False)
        sol = self._solve(ecm, items, n_rest, m_rest, fct)
        self.eps_p_star = {}
        for l in self.tendons:
            z = float(l['bars'][0]['z']) if l['kind'] == 'bars' else float(l['strip']['z'])
            self.eps_p_star[l['id']] = (self.sigma_p_inf[l['id']] / l['_material']['Ep']
                                        - (sol['eps_a'] + sol['chi'] * z))
        phi = _cfg_float(self.cfg, 'phi', 0.0) or 0.0
        e_eff = ecm / (1.0 + phi)
        row = self._stage('long_term', ecm, sol, self.eps_p_star, self.m_perm, 0.0, fct,
                          chi_report=sol['chi'] * (1.0 + phi))
        row['E_c_eff'] = _num(e_eff)
        # Dekompresjon/riss fra t_inf-tilstanden, paa det transformerte snittet (E_cm).
        bot_unc = ecm * (sol['eps_a'] + sol['chi'] * self.z_bot)
        if not sol['uncracked']:
            unc = solve_plane(self.poly, ecm, items, n_rest, m_rest, self.z_ref)
            bot_unc = ecm * (unc['eps_a'] + unc['chi'] * self.z_bot)
        m_dec, m_cr = self._dec_cr(ecm, bot_unc, self.m_perm, fct)
        row['M_dec'] = _num(m_dec)
        row['M_cr'] = _num(m_cr)
        self._chi_long_short = sol['chi']
        self.long_term = row

    # -- belastet --------------------------------------------------------------- #
    def loaded(self, combo):
        ecm = self.mat['Ecm']
        fct = self.mat['fctm']
        n = float(combo.get('N_Ed', 0.0) or 0.0)
        m = float(combo['M_Ed'])
        sol = self._solve(ecm, self._items(self.eps_p_star), n, m, fct)
        chi = self.long_term['chi'] + (sol['chi'] - self._chi_long_short)
        row = self._stage('loaded', ecm, sol, self.eps_p_star, m, n, fct, chi_report=chi)
        row.update({'combo': combo['id'], 'combo_name': combo.get('name', ''),
                    'combo_type': combo.get('type'), 'dM': _num(m - self.m_perm)})
        return row

    def result(self, combos):
        loaded = [self.loaded(c) for c in combos
                  if c.get('type') in ('characteristic', 'quasi_permanent')]
        return {
            'materials': {k: _num(v) for k, v in self.mat.items()},
            'tendons': [{'id': l['id'],
                         **{k: (_num(v) if not isinstance(v, str) else v)
                            for k, v in l['_material'].items()},
                         'area': _num(l['area']),
                         'eps_p_star': _num(self.eps_p_star[l['id']])} for l in self.tendons],
            'M_transfer': _num(self.m_transfer),
            'M_permanent': _num(self.m_perm),
            'losses': self.losses,
            'stages': [self.transfer, self.long_term] + loaded,
        }
