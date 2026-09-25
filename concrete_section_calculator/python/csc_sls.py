"""csc_sls.py -- BRUKSGRENSETILSTANDEN. EC2 7.2 (spenninger) og 7.3 (riss).

HVORFOR EN EGEN FIL. `engine.py` var 3 500 linjer, og halvparten av det var to
fag som ikke deler et eneste regnestykke: bruddgrensen spoer «baerer snittet»,
bruksgrensen spoer «hvordan oppfoerer det seg i bruk». De moetes bare i to
punkter, og de er maalt: modulen her kaller INGENTING i `engine.py` utenom de
delte hjelperne i `csc_common`, og `engine.py` kaller bare `_compute_sls` inn.
Noe smalere gjensidig grense finnes ikke i denne motoren.

DEN ENE PORTEN ER `_compute_sls`. Alt annet her er internt. Skulle en andre
funksjon herfra bli kalt utenfra, er det et varsel: da har grensen begynt aa
lekke, og de to fagene begynner aa dele tilstand de ikke skal dele.

RISSVIDDEKJEDEN BLE VAERENDE HER, og det var et valg mot mer oppdeling.
`_sls_crack*` og resten av bruksgrensen kaller hverandre BEGGE veier -- fem kall
den ene veien, tre den andre -- saa en egen `csc_crack.py` ville krevd en
importsyklus. En modulgrense som maa brytes for aa virke er ingen grense.

SKJAER BLE VAERENDE I `engine.py`, av motsatt grunn: 236 linjer i fem
funksjoner, og bruddgrensen er det eneste som bruker dem.

Delt ut i runde 12 UTEN en eneste endring i logikken. Beviset er
`tests/python/test_fixtures.py`: de committede fixturene sammenlignes tegn for
tegn med motorens svar, saa et eneste flyttet tall hadde gjort suiten roed.
"""

from __future__ import annotations

import math

from structuralcodes.codes import ec2_2004

from csc_common import (
    _depth,
    _is_hogging,
    _layer_z,
    _num,
    _tension_layers,
    _three_valued_and,
    _warning,
    _weighted_depth,
)

# ------------------------------------------------------------------ #
# SLS — EC2 7.2 (spenningsbegrensning) og 7.3.4 (rissvidde)
# global-devspecs/concrete_section_calculator-sls.md
#
# HELE KAPITTELET HVILER PAA ÉN STOeRRELSE MOTOREN IKKE HADDE: den lineaer-elastiske
# tilstanden i det (eventuelt) opprissede snittet under en bruksgrensekombinasjon.
# Modellen (spec §1.2/§1.3): betong lineaer med E_c i trykk og NULL i strekk, armering
# lineaer med E_s, transformert areal n·A_s UTEN aa punsjere betongen (samme konvensjon
# som ULS-standarden `subtract_bar_area: false`). Motoren bygger alltid et rektangel
# (`_build`), saa dette er eksakt og ikke et anslag.
#
# EN SPEILET SAGGING-RAMME GJoeR LOeSEREN GRENFRI (spec §1.2): s = +1 naar M_Ed <= 0,
# ellers -1. Etter rotsoekingen konverteres (eps_a, chi_y, z_na) tilbake til den
# ORIGINALE z-aksen (`_sls_cracked_eval` returnerer allerede originale (eps_a, chi_y);
# se funksjonens docstring for utledningen). Fra da av er ALT -- x, sigma_c, tension-
# settet, d, h_c,eff -- EN formel, delt mellom risset og urisset tilstand: eps(z) =
# eps_a + chi_y*z, akkurat som `_layer_state` allerede gjoer for ULS. Det er grunnen til
# at koden under IKKE holder to separate "byggere" for de to tilstandene.
# ------------------------------------------------------------------ #

# Rissvidde regnes bare paa tilnaermet permanent last (spec §1.5/§3.2 steg 10), som per
# definisjon ER langtidslasten. Derfor er k_t ALLTID 'long' -- ikke et brukerfelt.
_SLS_KT = 0.4

# SPEIL av `SLS_DEFAULTS` i `js/materials.js` -- IKKE en fjerde kilde.
#
# `payload.js` sender ALLTID alle fire (`enforceSlsParams` i store.js garanterer at de
# er endelige tall foer de naar hit), saa i produktet blir ingen av disse lest. De staar
# for den som kaller `engine.run()` DIREKTE -- testene her, og et framtidig skript -- slik
# at en payload uten `sls`-faktorer ikke kaster en TypeError paa `float(None)`.
#
# Endres et av tallene, er det `js/materials.js` som er kilden; dette speilet foelger
# etter. Testen `test_sls_defaults_mirror_the_js_source` leser begge filene og feiler
# hvis de gaar fra hverandre.
_SLS_FALLBACK = {
    'phi_ef': 2.0,
    'sigma_c_char_factor': 0.6,
    'sigma_c_qp_factor': 0.45,
    'sigma_s_char_factor': 0.8,
}


def _sls_theta_equiv(m_ed):
    """SLS-raden baerer ingen `theta` (kontrakten i spec §4 har ingen). Fortegnet paa
    `M_Ed` ER retningen (spec §1.2: «s = +1 naar M_Ed <= 0»), akkurat som strukturkodens
    egen konvensjon `theta = 0` for sagging. Ved aa gjenbruke `_is_hogging`/`_depth` med
    denne "som-om-theta"-verdien faar SLS gratis den SAMME definisjonen av trykkant, `d`
    og strekksett som ULS allerede har -- ingen ny regel skrevet paa nytt.
    """
    return math.pi if m_ed > 0.0 else 0.0

def _sls_uncracked_eval(b, h, Ec, Es, rebar_zs, n_ed, m_ed):
    """Spec §1.3 -- urisset elastisk tilstand, lukket form, i den ORIGINALE z-aksen.
    Ingen rotsoeking, ingen speiling: to lineaere likninger, en 2x2-determinant.

    Kalles med `Ec = E_cm` for rissbeslutningen (§1.1, ALLTID -- riss er irreversibelt og
    settes ved foerste paalastning, se hodekommentarens begrunnelse for hvorfor IKKE
    E_c,eff der) og med radens EGEN modul naar raden faktisk ER urisset (§1.4). To kall
    med to ulike `Ec` er to ULIKE stoerrelser, ikke to kilder til samme tall.

    Returnerer `(eps_a, chi_y)`, begge i den fysiske z-aksen -- `eps(z) = eps_a + chi_y*z`.
    """
    ea = Ec * b * h + sum(Es * a for a, _z in rebar_zs)
    es = sum(Es * a * z for a, z in rebar_zs)
    ei = Ec * b * h ** 3 / 12.0 + sum(Es * a * z * z for a, z in rebar_zs)
    det = ea * ei - es * es
    eps_a = (n_ed * ei - m_ed * es) / det
    chi_y = (m_ed * ea - n_ed * es) / det
    return eps_a, chi_y

def _sls_cracked_eval(b, h, Ec, Es, rebar_zs, n_ed, m_ed):
    """Spec §1.2 -- risset elastisk tilstand. Egen loeser, VERIFISERT (uavhengig, i denne
    oekten, mot en parallell UserDefined-seksjon) identisk til alle rapporterte siffer i
    spec §9, ogsaa med aksialkraft. Ingen Newton, ingen konvergens som kan feile: 120
    halveringer paa et glatt, monotont `R(z_na)` er determinat og koster mikrosekunder.

    FORTEGNSRAMMEN (spec §1.2): `s = +1` naar `M_Ed <= 0` (sagging), ellers `-1`.
    `z' = s*z`, `M' = s*M_Ed`, `N` uendret. Roten `z_na'` og krumningen `chi'` loeses i
    den speilede rammen; TILBAKE i den fysiske aksen er (algebraisk utledning, verifisert
    numerisk mot et hogging-tilfelle i denne oekten):
        eps_a  = -chi'*z_na'          (z' = 0 er samme fysiske punkt som z = 0)
        chi_y  = s*chi'                (eps(z) = eps_a + chi_y*z gjelder da UENDRET
                                         for BEGGE fortegn paa `s`, se `_sls_build_state`)
    Ingen kaller trenger aa vite at speilingen fant sted -- returverdien er allerede i
    den fysiske aksen, present for BEGGE grener sammen med den urissede loeseren.

    Returnerer `(eps_a, chi_y)`, eller `None` hvis `R` ikke skifter fortegn i
    `[-h/2, +h/2]` -- ingen likevekt med denne armeringen naar betongens strekk
    fjernes (spec §1.2: kalleren skiller da `fully_in_tension` fra
    `no_equilibrium_cracked` ved aa se paa den urissede tilstanden).
    """
    s = 1.0 if m_ed <= 0.0 else -1.0
    m_p = s * m_ed
    layers_p = [(a, s * z) for a, z in rebar_zs]

    def ab(z_na):
        x = min(max(h / 2.0 - z_na, 0.0), h)
        a_val = Ec * b * x * x / 2.0
        b_val = Ec * b * (x ** 3 / 3.0 + z_na * x * x / 2.0)
        for area, zp in layers_p:
            a_val += Es * area * (zp - z_na)
            b_val += Es * area * (zp - z_na) * zp
        return a_val, b_val

    def r_of(z_na):
        a_val, b_val = ab(z_na)
        return m_p * a_val - n_ed * b_val

    lo, hi = -h / 2.0, h / 2.0
    r_lo, r_hi = r_of(lo), r_of(hi)
    if r_lo == 0.0:
        z_na = lo
    elif r_hi == 0.0:
        z_na = hi
    elif (r_lo > 0) == (r_hi > 0):
        return None
    else:
        for _ in range(120):
            mid = (lo + hi) / 2.0
            r_mid = r_of(mid)
            if (r_mid > 0) == (r_lo > 0):
                lo, r_lo = mid, r_mid
            else:
                hi, r_hi = mid, r_mid
            if hi - lo < 1e-9:
                break
        z_na = (lo + hi) / 2.0

    a_val, b_val = ab(z_na)
    chi_p = n_ed / a_val if n_ed != 0.0 else m_p / b_val
    eps_a = -chi_p * z_na
    chi_y = s * chi_p
    return eps_a, chi_y

def _sls_tension_only_eval(Es, rebar_zs, n_ed, m_ed):
    """Toeyningsplanet naar HELE snittet er i strekk og risset.

    Da baerer betongen ingenting -- all kraft staar i jernene -- og likevekten blir to
    LINEAERE likninger i (eps_a, chi_y), uten den kubiske trykksonen `_sls_cracked_eval`
    maa lete seg fram til:

        N = E_s * [ eps_a * SUM(A_i)        + chi * SUM(A_i * z_i)   ]
        M = E_s * [ eps_a * SUM(A_i * z_i)  + chi * SUM(A_i * z_i^2) ]

    HVORFOR DEN MAA FINNES: sentrisk og eksentrisk strekk -- strekkstag, ringarmering i
    tanker, veggskiver -- er blant de VIKTIGSTE rissviddetilfellene i EC2. Standarden har
    dem eksplisitt: fig. 7.1(c) viser A_c,eff for et strekkstav, og k2 = 1,0 i
    lign. 7.13 finnes nettopp for ren strekk. Motoren svarte
    `fully_in_tension -> crack_width_ok: None` og lot dem ligge.

    Returnerer `None` naar systemet er singulaert: ETT armeringslag kan bare baere
    momentet `N * z_1`, og alt annet er en likevekt som ikke finnes. Det er en ekte
    mangel paa loesning, ikke en numerisk sviktende rot.
    """
    sa = sum(a for a, _z in rebar_zs)
    saz = sum(a * z for a, z in rebar_zs)
    sazz = sum(a * z * z for a, z in rebar_zs)
    det = sa * sazz - saz * saz
    if sa <= 0.0 or abs(det) < 1e-12 * max(1.0, sa * sazz):
        return None
    eps_a = (n_ed * sazz - m_ed * saz) / (Es * det)
    chi_y = (m_ed * sa - n_ed * saz) / (Es * det)
    return eps_a, chi_y

def _sls_build_state(b, h, Ec, Es, rebar, rebar_zs, eps_a, chi_y, m_ed, cracked,
                     tension_only=False):
    """EN formel for BEGGE tilstander (risset/urisset) og BEGGE retninger (spec §1.2's
    poeng med aa rapportere tilbake i den fysiske aksen): gitt `(eps_a, chi_y)` er
    `eps(z) = eps_a + chi_y*z` for enhver `z`, akkurat som `_layer_state` (ULS) allerede
    bruker. Trykkant/strekkant velges av `_sls_theta_equiv(m_ed)` -- samme regel som gav
    `(eps_a, chi_y)` sitt fortegn i utgangspunktet, saa de to kan ikke komme i utakt.

    `x` er avstanden fra trykkanten til nullpunktet, KLEMT til `[0, h]` (spec §1.2) --
    for en risset tilstand ligger `z_na` per konstruksjon i `[-h/2, h/2]` og klemmingen
    er ren forsikring; for en urisset tilstand (hvor `z_na` fritt kan ligge utenfor
    snittet, f.eks. ved rent aksialtrykk) er den nødvendig for at `x` skal forbli et tall
    UI-et kan tegne. `sigma_c` er STOeRRELSEN paa trykkanten, med sitt eget fortegn
    (negativ = trykk, samme konvensjon som resten av modulen).
    """
    theta_equiv = _sls_theta_equiv(m_ed)
    hogging = _is_hogging(theta_equiv)
    comp_face_z = -h / 2.0 if hogging else h / 2.0
    tens_face_z = h / 2.0 if hogging else -h / 2.0

    if tension_only:
        # ⚠ FOR ET SNITT HELT I STREKK KOMMER KRUMNINGEN FRA ARMERINGEN, IKKE FRA `M_Ed`.
        #
        # `_sls_theta_equiv(m_ed)` peker ut strekkanten av fortegnet paa momentet. Det
        # er riktig saa lenge momentet ER det som boeyer snittet. Men her staar
        # likevekten i jernene alene, og `chi_y` foelger USYMMETRIEN i armeringen: med
        # `M_Ed = 0` og ulikt jern i topp og bunn faar snittet en krumning momentet ikke
        # vet om.
        #
        # MAALT (regresjon innfoert av strekkloeseren selv, og fanget av gjennomgang):
        # 300x600, 4O25 UK + 4O20 OK, N = +900 kN, M = 0:
        #     sann   eps(topp) 1,8530e-03   eps(bunn) 1,0801e-03
        #     antatt eps_1 = 1,0801e-03 (bunn), eps_2 = 1,8530e-03 (topp)
        #     -> eps_r = 1,715, og `ec2_2004.k2()` KASTER: «must be between 0 and 1»
        #     -> hele svaret ble `{ok: False}` -- ingen ULS, ingen figur, ingen advarsel.
        # 47 av 140 proevde punkter krasjet; alle symmetriske gikk bra, saa de to
        # testene som ble skrevet for strekktilfellet kunne ikke se det.
        #
        # Samme rettelse som `sigma_c` fikk: LES AV DER DET FAKTISK ER VERST. Her er
        # «verst» den stoerste strekktoeyningen, og den kjenner bare `chi_y`.
        top = eps_a + chi_y * (h / 2.0)
        bot = eps_a + chi_y * (-h / 2.0)
        tens_face_z = h / 2.0 if top >= bot else -h / 2.0
        comp_face_z = -tens_face_z

    if chi_y == 0.0 or not math.isfinite(chi_y):
        # Rent aksialt: ingen nullpunkt i tøyningsplanet. `x` blir en degenerert
        # rapportering (hele snittet har samme fortegn), ikke en feil -- se `_num` for
        # hvorfor "uendelig langt unna" ikke skal forveksles med et tall som betyr noe
        # (samme prinsipp som `_neutral_axis` for ULS, `engine.py`-hodet §5.4).
        z_na = None
        x = h if eps_a < 0.0 else 0.0
    elif tension_only:
        # Nullpunktet ligger UTENFOR snittet (begge kanter i strekk). `z_na` staar
        # likevel som det matematiske punktet det er; `x` er null.
        z_na = -eps_a / chi_y
        x = 0.0
    else:
        z_na = -eps_a / chi_y
        x = min(max(_depth(z_na, h, theta_equiv), 0.0), h)

    # TRYKKANTEN ER IKKE ALLTID DEN `theta` PEKER PAA.
    #
    # `comp_face_z` foelger fortegnet paa `M_Ed` alene, og det er riktig for et RISSET
    # snitt: der er den ene kanten per definisjon trykksonen. For et URISSET snitt med
    # DOMINERENDE AKSIALTRYKK baerer begge kantene, og den stoerste trykkspenningen kan
    # ligge paa den kanten momentet IKKE peker paa.
    #
    # MAALT, helt ordinaer 300x600 med 3O20 i underkant og et lite stoettemoment:
    #
    #   karakteristisk, N = -3200 kN, M = +5 kNm, grense 18,0 MPa
    #       rapportert  -16,23 MPa  (util 0,901, ok = TRUE)
    #       sann maks   -18,28 MPa  (util 1,016 -> skulle vaert FALSE)
    #
    #   tilnaermet permanent, N = -2400 kN, M = +5 kNm, grense 13,5 MPa
    #       rapportert  -12,23 MPa  (util 0,906, ok = TRUE)
    #       sann maks   -13,65 MPa  (util 1,011)
    #
    # Altsaa 11-13 % for lavt, paa usikker side, og dommen snur. Uavhengig
    # haandregning av det transformerte urissede snittet reproduserer begge fibrene.
    #
    # KLEMT MOT NULL: er BEGGE kantene i strekk (rent aksialstrekk), finnes det ingen
    # trykkspenning, og `0` er det aerlige svaret. Foer dette stod det en STREKKspenning
    # paa +1,851 MPa merket «compression face» og proevd mot trykkgrensa med `abs()` --
    # altsaa et tall med feil fortegn i en kontroll det ikke hoerte hjemme i.
    if tension_only:
        # Hele snittet er i strekk og risset: det FINNES ingen trykksone, og ingen
        # trykkspenning. `x = 0` er ikke en degenerasjon her, det er svaret.
        sigma_c = 0.0
    elif cracked:
        sigma_c = Ec * (eps_a + chi_y * comp_face_z)
    else:
        sigma_c = min(Ec * (eps_a + chi_y * (h / 2.0)),
                      Ec * (eps_a + chi_y * (-h / 2.0)),
                      0.0)

    # `eps_1`/`eps_2` foelger KANTVALGET over, og bare det. For et risset snitt med
    # trykksone er `comp_face_z` fra `M_Ed` riktig, og da staar de noeyaktig som foer --
    # en omdefinering DER ville flyttet `k2` (lign. 7.13) for hver eneste rissvidde uten
    # at noen ba om det. For et snitt helt i strekk er kanten valgt av toeyningen, og
    # `eps_1` er per konstruksjon den stoerste: `eps_r` kan da ikke bli > 1.
    eps_2 = eps_a + chi_y * comp_face_z
    eps_1 = eps_a + chi_y * tens_face_z

    layers = []
    sigma_s_max = None
    for layer, (_area, z) in zip(rebar, rebar_zs):
        eps_i = eps_a + chi_y * z
        sigma_i = Es * eps_i
        layers.append({
            'id': layer['id'], 'z': _num(z), 'eps': _num(eps_i),
            'sigma': _num(sigma_i), 'tension': bool(eps_i > 0.0),
        })
        sigma_s_max = sigma_i if sigma_s_max is None else max(sigma_s_max, sigma_i)

    return {
        'x': x, 'z_na': z_na, 'eps_a': eps_a, 'chi_y': chi_y, 'sigma_c': sigma_c,
        'eps_1': eps_1, 'eps_2': eps_2, 'sigma_s_max': sigma_s_max, 'layers': layers,
        # Rissviddekjeden maa vite det: uten trykksone gjelder ikke `(h-x)/3`.
        'tension_only': bool(tension_only),
        # ÉN KILDE TIL HVILKEN KANT SOM ER STREKKANTEN. `_sls_crack` utledet den
        # tidligere paa nytt av `m_ed`, og da kunne de to bli uenige for et snitt
        # helt i strekk -- nettopp feilen over. Naa staar valget her, og kjeden
        # leser det.
        'tens_face_z': tens_face_z,
    }

def _sls_row_state(b, h, Ec, Es, rebar, rebar_zs, n_ed, m_ed, cracked, fck, fyk,
                    sig_top_u, sig_bot_u):
    """Spec §1.2 -- loeser tilstanden for ÉN evaluering (radens egen, ELLER den ekstra
    `E_cm`-evalueringen §1.4 bruker for `sigma_c_initial`) og haandhever gyldighetsvaktene.
    Returnerer `(state, None)` eller `(None, reason)`.

    `sig_top_u`/`sig_bot_u` er ALLTID den `E_cm`-baserte urissede tilstanden fra §1.1 --
    de brukes BARE til aa skille `fully_in_tension` fra `no_equilibrium_cracked` naar
    `_sls_cracked_eval` ikke finner noen rot (spec §1.2, RETTET i runde 10: den gamle
    grunnkoden `no_compression_zone` var faktuelt feil paa AC8a, som HAR en trykksone).
    """
    if not cracked:
        eps_a, chi_y = _sls_uncracked_eval(b, h, Ec, Es, rebar_zs, n_ed, m_ed)
    else:
        solved = _sls_cracked_eval(b, h, Ec, Es, rebar_zs, n_ed, m_ed)
        if solved is None:
            if sig_top_u > 0.0 and sig_bot_u > 0.0:
                # BEGGE KANTENE I STREKK. Trykksonen `_sls_cracked_eval` leter etter
                # finnes ikke, men snittet HAR en likevekt -- den staar bare helt i
                # jernene. Se `_sls_tension_only_eval`.
                pure = _sls_tension_only_eval(Es, rebar_zs, n_ed, m_ed)
                if pure is None:
                    return None, 'fully_in_tension'
                state = _sls_build_state(b, h, Ec, Es, rebar, rebar_zs, pure[0], pure[1],
                                          m_ed, cracked, tension_only=True)
                abs_sigmas_t = [abs(l['sigma']) for l in state['layers'] if l['sigma'] is not None]
                if (max(abs_sigmas_t) if abs_sigmas_t else 0.0) > fyk:
                    return None, 'stresses_outside_elastic_range'
                return state, None
            return None, 'no_equilibrium_cracked'
        eps_a, chi_y = solved

    state = _sls_build_state(b, h, Ec, Es, rebar, rebar_zs, eps_a, chi_y, m_ed, cracked)

    if cracked and (state['x'] <= 0.0 or state['x'] > h):
        # I PRAKSIS unaabart: bisection er klemt til `z_na` innenfor `[-h/2, h/2]`, som
        # per konstruksjon gir `x` innenfor `[0, h]`. Vakten staar likevel (spec §1.2,
        # §12.4) -- billig, og `ec2_2004.sr_max_far`/vaar egen `h_c,eff` kaster begge for
        # `x > h` naar rissviddekjeden senere kalles med den.
        return None, 'no_equilibrium_cracked'

    abs_sigmas = [abs(l['sigma']) for l in state['layers'] if l['sigma'] is not None]
    max_abs_sigma_s = max(abs_sigmas) if abs_sigmas else 0.0
    if max_abs_sigma_s > fyk or abs(state['sigma_c']) > fck:
        # Den lineaere modellen gjelder ikke for et snitt som har flytt (staal) eller
        # knust (betong) under bruksgrenselast. Maalt (spec §1.2, AC8b): en
        # stoettemomentrad uten toppjern gir et matematisk gyldig rotpunkt med
        # `sigma_s = 2622 MPa` og `sigma_c = -576 MPa` -- uten denne vakten et stille
        # feil tall, ikke en manglende funksjon.
        return None, 'stresses_outside_elastic_range'

    return state, None

def _sls_bar_groups(layer):
    """`(n_i, phi_i)`-par for ETT lag, til `phi_eq` (spec §3.4, lign. 7.12). For
    `kind: 'bars'` er hvert jern sin egen gruppe (`n = 1`, sin egen diameter -- tolerer
    ulike diametre i samme lag, i motsetning til resten av motoren som antar lik `z`).
    For `kind: 'strip'` er hele laget ÉN gruppe med `n = A_s/(pi*phi^2/4)`, IKKE
    nødvendigvis et helt tall -- formelen er arealvektet og tåler det (spec §3.4)."""
    if layer['kind'] == 'bars':
        return [(1.0, float(bar['dia'])) for bar in layer['bars']]
    phi = float(layer['strip']['height'])
    n = float(layer['area']) / (math.pi * phi * phi / 4.0)
    return [(n, phi)]

def _sls_layer_phi(layer):
    """Diameteren cover/terskel-formlene (lign. 7.11/7.3.4-3) skal bruke: bar-diameteren
    (ETT tall, samme antakelse om lik diameter i laget som `_layer_z` allerede gjør), eller
    stripens `height` -- som ER stripens EKVIVALENTE diameter (`equivalentStrip`,
    `rebar.js:198`, spec §3.4)."""
    if layer['kind'] == 'bars':
        return float(layer['bars'][0]['dia'])
    return float(layer['strip']['height'])

def _sls_layer_spacing(layer):
    """`s` for ETT lag, eller `None` naar laget ikke har noen senteravstand aa gi
    (spec §3.4): ett jern har ingen nabo (`barPositions` gir `[{y: 0, ...}]` for
    `n = 1`), og en stripe har alltid en avstand.

    STRIPA BRUKER 1000, IKKE `b` -- RETTET I RUNDE 10 (spec §3.4/§12.11, AC11). Et
    `spacing`-lag er ALLTID regnet per meter i `layerArea` (`rebar.js:87`, hardkodet
    1000), uansett tverrsnittstype -- inversjonen her MAA bruke den samme konstanten,
    ellers beskriver `s` og `A_s` to ulike armeringsbilder. Maalt (AC11): «Ø12 c/c 200»
    paa en 300 mm bred bjelke gir riktig `s = 200,0`; med `b` i formelen ville det blitt
    `60,0` -- og det tallet bytter GREN i `s_r,max` (§3.4).
    """
    if layer['kind'] == 'bars':
        ys = sorted(float(bar['y']) for bar in layer['bars'])
        if len(ys) < 2:
            return None
        return max(y2 - y1 for y1, y2 in zip(ys, ys[1:]))
    phi = float(layer['strip']['height'])
    area = float(layer['area'])
    return 1000.0 * math.pi * phi * phi / (4.0 * area)

def _sls_edge_face_z(z, h, tie_face_z):
    """Hvilken KANT et armeringslag hoerer til: den det er NAERMEST.

    Regelen er geometrisk og har ingen fortegn aa komme i utakt med. Paa eksakt halv
    hoeyde er avstanden lik til begge, og da faller laget til den kanten toeyningen
    allerede har pekt ut som strekkanten (`state['tens_face_z']`) -- ett deterministisk
    valg, ikke et tilfeldig.
    """
    d_bot = z + h / 2.0
    d_top = h / 2.0 - z
    if d_bot < d_top:
        return -h / 2.0
    if d_top < d_bot:
        return h / 2.0
    return tie_face_z

def _sls_crack_edge(rebar, state, b, h, x, face_z, own_tension, tension_ids,
                    alpha_e_val, f_ct_eff, Es):
    """EN kant sin egen effektive strekksone og sin egen rissvidde (EC2 7.3.4).

    `own_tension` er strekklagene som hoerer til DENNE kanten (naermest den). Alt
    kjeden trenger -- `d_kant`, `h_c,ef`, `A_s,eff`, `sigma_s`, `c`, `phi_eq`, `s` --
    leses av denne kantens EGEN sone. `eps_1`/`eps_2` (og dermed `k2`) er derimot
    snittstoerrelser: de er ytterfibertoeyningene i ETT toeyningsplan, ikke noe en
    enkelt kant eier, og de staar derfor uendret i begge kantene.

    Returnerer `(edge_dict, None)` eller `(None, reason)`.
    """
    if not own_tension:
        # En strekkANT uten et eneste jern naermest seg. Overflaten risser, men
        # 7.3.4 har ingen heftlengde aa regne med -- samme aerlige grunnkode som naar
        # jernene finnes, men ligger utenfor sonen.
        return None, 'no_bonded_bars_in_effective_area'

    # `d_kant` REGNES IKKE MED EN NY FORMEL. `_weighted_depth` er modulens ene
    # definisjon av «arealvektet tyngdepunktsdybde», og den maaler fra trykkanten --
    # altsaa fra den MOTSATTE overflaten av den vi staar paa. `theta` velges deretter:
    # staar vi paa underkanten (`face_z < 0`), er overkanten den motsatte, og det er
    # akkurat `theta = 0`. `d_kant = h - d` gjoer da `2,5*d_kant` til bit for bit det
    # SAMME uttrykket `2,5(h-d)` alltid har vaert. MAALT hvorfor det er verdt en linje:
    # med en egen sum her ble `d` paa en 250x400 349,99999999999994 mot dagens 350,0 --
    # ett ULP, paa et snitt endringen per definisjon ikke skal roere.
    theta_edge = 0.0 if face_z < 0.0 else math.pi
    d_opposite, _total = _weighted_depth(own_tension, h, theta_edge)
    if d_opposite is None:
        # Bare naabart med null samlet areal, som `_tension_layers` ikke slipper
        # gjennom -- men da finnes det ingen heftende armering ved kanten, og det er
        # den grunnkoden som sier det.
        return None, 'no_bonded_bars_in_effective_area'
    d_edge = h - d_opposite

    # EC2 7.3.2(3) med fig. 7.1. `(h-d)` i lign.-teksten er avstanden fra DEN
    # OVERFLATEN sonen ligger mot til tyngdepunktet av armeringen som hoerer til DEN
    # sonen -- her `d_kant`. `h/2` er ANTI-OVERLAPPSTAKET for det tosidige tilfellet i
    # fig. 7.1(c): to soner à `h/2` moetes eksakt paa halv hoeyde, og ingen betong kan
    # telles to ganger. Taket er altsaa ikke en paastand om at en strekkstavs sone ER
    # halve snittet.
    candidates = {
        '2.5(h-d)': 2.5 * d_edge,
        'h/2': h / 2.0,
    }
    if not state.get('tension_only'):
        # `(h-x)/3` forutsetter en trykksone og er utledet for boeyning. Uten trykksone
        # er `(h-0)/3` bare det formelen tilfeldigvis gir, ikke en begrunnet hoeyde.
        candidates['(h-x)/3'] = (h - x) / 3.0
    governing = min(candidates, key=candidates.get)
    h_c_eff = candidates[governing]

    # `h/2` staar ALLTID i kandidatlista, saa dette er en identitet, ikke en sjekk paa
    # inndata. Den staar fordi den er selve grunnen til at to soner kan eksistere side
    # om side uten aa overlappe -- brytes den, er A_c,eff talt to ganger.
    assert h_c_eff <= h / 2.0 + 1e-9, (
        f'h_c,ef {h_c_eff} over anti-overlappstaket h/2 = {h / 2.0}'
    )

    a_c_eff = b * h_c_eff

    # SONEMEDLEMSKAP ER GEOMETRISK, over ALLE lag -- ikke bare de allerede filtrert til
    # strekk. Grunnen: `no_tensile_stress_in_effective_area` (spec §3.5) skal kunne
    # svare paa et lag som geometrisk ligger i sonen men numerisk IKKE er i strekk (en
    # defensiv vakt -- vanskelig aa naa i praksis, billig aa ha). Filteret til
    # `A_s,eff` selv er likevel STREKKLAG, slik spec §3.2 steg 4 sier ordrett.
    #
    # Sonen kan ikke naa forbi halv hoeyde (taket over), saa et lag i DENNE sonen er
    # per konstruksjon naermest DENNE kanten: medlemskapet og kanttilordningen kan
    # ikke bli uenige, og et jern telles aldri i to A_s,eff -- unntatt et lag som
    # ligger EKSAKT paa halv hoeyde, som da er like langt fra begge overflatene og
    # ligger paa randen av begge sonene. Det er riktig, og det er kontinuerlig.
    zone_layers = [layer for layer in rebar
                   if abs(_layer_z(layer) - face_z) <= h_c_eff + 1e-9]
    zone_tension_layers = [layer for layer in zone_layers if layer['id'] in tension_ids]
    if not zone_tension_layers:
        return None, 'no_bonded_bars_in_effective_area'

    sigma_by_id = {l['id']: l['sigma'] for l in state['layers']}
    sigma_s = max(sigma_by_id[layer['id']] for layer in zone_tension_layers)
    if sigma_s is None or sigma_s <= 0.0:
        # Defensivt (se kommentaren over `zone_layers`): `zone_tension_layers` er per
        # konstruksjon alt filtrert til `eps > 0`, saa `sigma_s = Es*eps > 0` foelger --
        # denne grenen boer ALDRI naas, men staar for at et fremtidig avvik blir en
        # navngitt grunnkode og ikke et stille `None`/`nan`.
        return None, 'no_tensile_stress_in_effective_area'

    a_s_eff = sum(float(layer['area']) for layer in zone_tension_layers)
    rho_p_eff = float(ec2_2004.rho_p_eff(a_s_eff, 0.0, 0.0, a_c_eff))

    # eps_sm - eps_cm (lign. 7.9) -- VAAR EGEN formel (spec §3.1), IDENTISK matematikk
    # til `ec2_2004.eps_sm_eps_cm` (verifisert bit for bit i en egen orakel-test), men
    # skrevet her fordi vi trenger begge leddene og grenvalget hver for seg (§3.3/§4).
    tension_stiffening = _SLS_KT * f_ct_eff / rho_p_eff * (1.0 + alpha_e_val * rho_p_eff)
    eps_equation = (sigma_s - tension_stiffening) / Es
    eps_floor = 0.6 * sigma_s / Es
    eps_sm_eps_cm = max(eps_equation, eps_floor)
    eps_governing = 'equation' if eps_equation >= eps_floor else 'floor'

    # `c` og det ytterste laget maales fra DENNE kantens overflate. For et snitt med
    # armering bare ved én kant er `|z - face_z|` det samme tallet som `h/2 - |z|`
    # var foer -- laget ligger jo paa den siden -- saa boeyning er uroert.
    outer = min(zone_tension_layers, key=lambda l: abs(_layer_z(l) - face_z))
    phi_outer = _sls_layer_phi(outer)
    c = abs(_layer_z(outer) - face_z) - phi_outer / 2.0

    groups = [g for layer in zone_tension_layers for g in _sls_bar_groups(layer)]
    phi_eq = (sum(n * p * p for n, p in groups) / sum(n * p for n, p in groups))

    spacings = [v for v in (_sls_layer_spacing(l) for l in zone_tension_layers)
                if v is not None]
    if not spacings:
        return None, 'no_bar_spacing'
    s = max(spacings)

    # `eps_1`/`eps_2` er snittets ytterfibertoeyninger, ikke kantens -- se docstringen.
    eps_1 = state['eps_1']
    eps_2 = state['eps_2']
    eps_r = max(0.0, eps_2) / eps_1
    k1 = float(ec2_2004.k1('bond'))
    k2 = float(ec2_2004.k2(eps_r))
    k3 = float(ec2_2004.k3())
    k4 = float(ec2_2004.k4())

    threshold = float(ec2_2004.w_spacing(c, phi_eq))
    branch = 'close' if s <= threshold else 'far'
    sr_max_close = float(ec2_2004.sr_max_close(c, phi_eq, rho_p_eff, k1, k2, k3, k4))
    sr_max_far = float(ec2_2004.sr_max_far(h, x))
    sr_max = sr_max_close if branch == 'close' else sr_max_far
    w_k = float(ec2_2004.wk(sr_max, eps_sm_eps_cm))

    edge = {
        'face': 'top' if face_z > 0.0 else 'bottom',
        'face_z': _num(face_z),
        'd_edge': _num(d_edge),
        # `d` staar fortsatt MAALT FRA DEN MOTSATTE KANTEN, slik resten av modulen og
        # EC2s egen skrivemaate `2,5(h-d)` gjoer det. Da er orakelet
        # `ec2_2004.hc_eff(h, d, x)` fortsatt en gyldig uavhengig kontroll av kantens
        # `h_c,ef`, og boeyningsraden rapporterer det samme tallet som foer.
        'd': _num(d_opposite),
        'x': _num(x),
        'h_c_eff': _num(h_c_eff),
        'h_c_eff_candidates': {k: _num(v) for k, v in candidates.items()},
        'h_c_eff_governing': governing,
        'A_c_eff': _num(a_c_eff), 'A_s_eff': _num(a_s_eff),
        'layers_in_zone': [layer['id'] for layer in zone_tension_layers],
        'layers_at_face': [layer['id'] for layer in own_tension],
        'rho_p_eff': _num(rho_p_eff), 'alpha_e': _num(alpha_e_val),
        'k_t': _num(_SLS_KT), 'f_ct_eff': _num(f_ct_eff),
        'sigma_s': _num(sigma_s), 'sigma_s_layer': outer['id'],
        'eps_sm_eps_cm': _num(eps_sm_eps_cm), 'eps_equation': _num(eps_equation),
        'eps_floor': _num(eps_floor), 'eps_governing': eps_governing,
        'eps_1': _num(eps_1), 'eps_2': _num(eps_2), 'eps_r': _num(eps_r),
        'k1': _num(k1), 'k2': _num(k2), 'k3': _num(k3), 'k4': _num(k4),
        'c': _num(c), 'phi_eq': _num(phi_eq),
        'bar_spacing': _num(s), 'spacing_threshold': _num(threshold),
        'sr_max_close': _num(sr_max_close), 'sr_max_far': _num(sr_max_far),
        'sr_max': _num(sr_max), 'sr_max_branch': branch,
        'w_k': _num(w_k),
    }
    return edge, None

def _sls_crack(rebar, state, b, h, m_ed, alpha_e_val, f_ct_eff, Es):
    """Spec §3.2 -- rissviddekjeden (EC2 7.3.4), i rekkefoelgen kapittelet gir. Kalles
    BARE naar raden er `quasi_permanent` OG risset (§1.5) -- kalleren har allerede
    filtrert det. Returnerer `(crack_dict, None)` eller `(None, reason)`.

    `h_c,eff` og `eps_sm - eps_cm` er VAAR EGEN kode (spec §3.1, RETTET i runde 10):
    pakkens `ec2_2004.hc_eff`/`ec2_2004.eps_sm_eps_cm` gir bare det ENDELIGE tallet, ikke
    kandidatene/leddene §4 krever aa rapportere, og aa regne begge veier ville gitt to
    produsenter for samme stoerrelse uten kryssjekk. Pakken er i stedet et TEST-ORAKEL
    (`test_engine.py`), aldri en andre produsent naar motoren kjoerer.

    DEN EFFEKTIVE STREKKSONEN REGNES PER KANT, IKKE ÉN FOR HELE SNITTET.
    ==================================================================
    Foer dette regnet kjeden `d` som det snittvektede tyngdepunktet over ALLE
    strekklag og bygde ÉN sone fra den kanten toeyningen pekte paa. For et snitt med
    strekkarmering ved BEGGE kanter -- strekkstag, ringarmering i tanker, veggskiver --
    ble da bare den ene overflaten maalt, og den andre aldri sett paa.

    MAALT I DENNE OEKTEN (sveip over 3 888 strekkstag/veggskiver: b 300/600/1000,
    h 200-600, overdekning 35/50/70, armeringsforhold 1,0/1,6/2,5 %, usymmetri
    A_UK/A_OK 1/2/4, sigma_s 180/260/340 MPa, moment 0 til 0,09*N*h -- 1 536 av dem
    gav en rissvidde baade foer og etter; resten falt ut som urisset eller over
    flytegrensa, likt i begge motorer). Hvert tall er kjoert, ikke resonnert fram:

      * 1 476 av de 1 536 har strekkarmering ved BEGGE kanter. Foer fikk bare ÉN av
        de to overflatene et svar -- den kanten toeyningen var stoerst ved. Den andre
        ble aldri regnet, og i 1 440 av tilfellene gir de to kantene ULIK rissvidde.
      * i 32,2 % av de 1 536 var det gamle svaret FOR LAVT, altsaa paa usikker side.
        Verste maalte tilfelle: 0,3448x riktig verdi. Medianen blant de lave: 0,9000x.
        Med vanlig overdekning (35/50 mm) alene: 37,4 % for lave.
      * verstetilfellet i klartekst -- b 600, h 200, overdekning 70, rho 1,0 %,
        Ø20 i UK mot Ø16 i OK, sigma_s 340 MPa:
            foer     w_k 0,2823   (bare UK maalt, far-gren, s_r,max 260,0)
            etter    UK 0,2823    OK 0,8186   (close-gren, s_r,max 754,4)  -> 0,8186
        De 0,8186 mm er en overflate verktoeyet ikke saa paa i det hele tatt.
      * de 60 tilfellene med armering ved BARE ÉN kant gav forholdet 1,0000 eksakt.

    HVOR DET ER VERST, OG HVORFOR: i `far`-grenen (`s_r,max = 1,3(h-x)`, uavhengig av
    `rho_p,eff`) var 79,2 % av svarene for lave, mot 14,2 % i `close`-grenen. Grunnen
    er at de to leddene trekker hver sin vei: en for stor `A_c,eff` fortynner
    `rho_p,eff`, og lav `rho` gir BAADE lengre `s_r,max` (som hever w_k) og stoerre
    strekkstivningsledd (som senker den). I `close`-grenen dominerer `s_r,max`-leddet
    og feilen blir stort sett konservativ; i `far`-grenen finnes `s_r,max`-leddet
    ikke, og da staar bare den senkende virkningen igjen. Det er derfor det ikke er
    nok aa kalle den gamle regelen «konservativ».

    OGSAA DISKONTINUERLIG. Den gamle sonen var ETT intervall fra én overflate, og et
    lag som krysset halv hoeyde falt inn i eller ut av den. MAALT paa b 400, h 400,
    Ø25 ved begge kanter og et Ø20-lag flyttet i 2 mm-steg gjennom halv hoeyde,
    N = 1 400 kN:
        foer   w_k 0,8555 -> 0,6042 over 2 mm = faktor 1,4158
               (`A_s,eff` hoppet 1 472,6 -> 2 415,1 mm2 paa samme snitt)
        etter  0,6533 -> 0,6527 -> 0,6533; stoerste nabosprang over hele +/-10 mm
               var 1,0011
    Samme maaling paa b 300, h 300, Ø20, N = 900 kN: foer faktor 1,4595, etter 1,0028.

    Mekanikken bak: `A_c,eff` er betongen heften rekker ut i fra stengene NAER den
    overflaten risset maales paa. Et jern 300 mm inne i snittet kan ikke holde igjen
    et overflateriss. EC2 7.3.2(3) med fig. 7.1 sier det samme: deltegning (c) viser
    strekkstaven med TO effektive soner, én mot hver overflate, og `(h-d)` er
    avstanden fra DEN overflaten sonen ligger mot til tyngdepunktet av armeringen som
    hoerer til DEN sonen.

    REGELEN, per kant som er i STREKK:
      `d_kant`  = arealvektet avstand fra kanten til tyngdepunktet av strekklagene
                  som hoerer til den (et lag hoerer til den kanten det er naermest)
      `h_c,ef`  = min(2,5*d_kant, (h-x)/3 naar det finnes en trykksone, h/2)
      alt annet -- `A_s,eff`, `sigma_s`, `c`, `phi_eq`, `s` -- fra kantens EGEN sone
      `w_k`     = MAKS over kantene, og BEGGE kantene rapporteres i `edges`.

    REN BOEYNING ER UROERT, og det er ikke et haap, det er en identitet: med
    strekkarmering bare ved én kant er kantens lagsett HELE strekksettet, `d_kant` er
    det samme tallet `h - d` var, og sonen er den samme sonen. VERIFISERT ved aa
    kjoere 41 boeyningssnitt (bjelker 250-450 mm brede, h 300-800, Ø12-Ø32, plater med
    stripelag Ø10-Ø20 c/c 125-200, trykkarmering i OK, stoettemoment, og aksialkraft
    -500 til +200 kN) gjennom BEGGE motorene og sammenligne 32 stoerrelser i `crack`
    -- `h_c_eff`, kandidatene, `A_c_eff`, `A_s_eff`, `rho_p_eff`, `sigma_s`, begge
    leddene i lign. 7.9, k1-k4, `c`, `phi_eq`, `s`, terskelen, begge `s_r,max`-grenene
    og `w_k`: 0 avvik, stoerste relative avvik 0,0. De 32 tilfellene i det sveipet
    som IKKE gav rissvidde gav samme grunnkode i begge motorene.

    De 27 snittene `test_pure_bending_gets_exactly_the_same_zone_as_before` laaser er
    kjoert paa samme maate, felt for felt: 27 x 31 sammenligninger med `!=`, 0 avvik.
    Referansebjelken staar paa `h_c,eff = 125,00 [2.5(h-d)]`, `d = 550,0` og
    `w_k = 0,2114290340096794` -- de samme sifrene som foer endringen.

    Ett ULP av det maatte kjoepes med vilje: se kommentaren over `_weighted_depth`-
    kallet i `_sls_crack_edge`.

    EN STREKKANT SOM IKKE KAN REGNES GJOER HELE RISSVIDDEN UBESVART. Gir én av de to
    overflatene en grunnkode (`no_bar_spacing`, `no_bonded_bars_in_effective_area`),
    kan vi ikke svare «stoerste rissvidde» -- vi kjenner bare den ene. Da er `crack`
    `null` med DEN grunnen, i stedet for at den andre kanten stille blir «svaret».
    Med armering ved bare én kant er dette ordrett dagens oppfoersel.
    """
    x = state['x']

    tension = _tension_layers(rebar, state['layers'])
    if not tension:
        return None, 'no_tension_reinforcement'
    tension_ids = {layer['id'] for layer in tension}

    # STREKKANTEN LESES AV TOEYNINGSPLANET, ikke utledet paa nytt av `m_ed`. En
    # overflate risser naar betongen DER er i strekk -- det er den ene definisjonen,
    # og den gjelder like godt for én som for to kanter. For et risset boeyd snitt har
    # trykkanten `eps <= 0` og faller ut av seg selv, saa lista blir da ett element.
    eps_a = state['eps_a']
    chi_y = state['chi_y']

    # Kanten tilstanden selv pekte ut. Brukes til to ting, og ingen av dem er en ny
    # regel: aa bryte likheten naar et lag ligger EKSAKT paa halv hoeyde, og som
    # reserve hvis ingen av overflatene kommer ut som strekk.
    tie_face_z = state.get('tens_face_z')
    if tie_face_z is None:
        tie_face_z = h / 2.0 if _is_hogging(_sls_theta_equiv(m_ed)) else -h / 2.0

    faces = [face_z for face_z in (-h / 2.0, h / 2.0)
             if eps_a + chi_y * face_z > 0.0]
    if not faces:
        # Uannaabar i praksis (et risset snitt HAR en strekkant; `x` er klemt til
        # `(0, h]` av vakten i `_sls_row_state`), men `x = h` eksakt gir `eps = 0` paa
        # strekkanten. Da staar `tie_face_z` igjen -- samme kilde som foer endringen.
        faces = [tie_face_z]

    edges = []
    for face_z in faces:
        own = [layer for layer in tension
               if _sls_edge_face_z(_layer_z(layer), h, tie_face_z) == face_z]
        edge, reason = _sls_crack_edge(rebar, state, b, h, x, face_z, own,
                                       tension_ids, alpha_e_val, f_ct_eff, Es)
        if edge is None:
            # Se docstringen: en ubesvart overflate gjoer hele rissvidden ubesvart.
            return None, reason
        edges.append(edge)

    edges.sort(key=lambda e: e['face_z'])
    lead = max(edges, key=lambda e: e['w_k'])

    crack = dict(lead)
    crack.pop('face', None)
    crack.pop('face_z', None)
    crack['governing_edge'] = lead['face']
    crack['governing_edge_face_z'] = lead['face_z']
    crack['edges'] = edges
    # `w_max`/`utilisation`/`ok`/`ok_reason` fylles av kalleren (§1.5, §3.5): de
    # avhenger av `sls['w_max']`, en stoerrelse paa TVERRS av rader, ikke av
    # rissviddekjeden alene.
    crack['w_max'] = None
    crack['utilisation'] = None
    crack['ok'] = None
    crack['ok_reason'] = None
    return crack, None

def _sls_row(combo, rebar, b, h, Ecm, Ec_eff, Es, fck, fyk, alpha_e_val, f_ct_eff,
             w_max, w_max_source, w_max_reason,
             sigma_c_char_factor, sigma_c_qp_factor, sigma_s_char_factor,
             sigma_c_char_required, section_cracked):
    """Bygger ÉN `SlsRow` (spec §4). `rebar` er payloadens egen liste, i egen rekkefoelge
    -- state['layers'] faar SAMME rekkefoelge (bygd i `_sls_build_state` med `zip`), slik
    at `_tension_layers(rebar, state['layers'])` er lovlig lenger nede (§3.2)."""
    n_ed = combo['N_Ed']
    m_ed = combo['M_Ed']
    combo_type = combo['type']
    rebar_zs = [(float(l['area']), _layer_z(l)) for l in rebar]

    # §1.1 -- radens EGEN urissede strekkspenning, ALLTID med E_cm. Den staar i svaret
    # fordi den er et faktum om raden og viser HVILKEN rad som sprengte rissgrensa.
    eps_a_u, chi_u = _sls_uncracked_eval(b, h, Ecm, Es, rebar_zs, n_ed, m_ed)
    sig_top_u = Ecm * (eps_a_u + chi_u * (h / 2.0))
    sig_bot_u = Ecm * (eps_a_u + chi_u * (-h / 2.0))
    sigma_ct_uncracked = max(sig_top_u, sig_bot_u)

    # MEN TILSTANDEN FOELGER KONVOLUTTEN, IKKE RADEN.
    #
    # Hodekommentaren sier allerede «riss er irreversibelt» -- som begrunnelse for at
    # E_cm brukes i rissBESLUTNINGEN. Den ble ikke brukt paa TILSTANDEN, og da kunne en
    # rad som ikke selv sprenger rissgrensa bli regnet som urisset, enda snittet hadde
    # sprukket av en annen rad. Riss forsvinner ikke naar lasten gaar ned.
    #
    # MAALT, 300x1000 med 3O16 i underkant, XC4, w_max = 0,30:
    #   karakteristisk M = -200 kNm  ->  sigma_ct = 3,843 > f_ctm = 2,896  -> RISSER
    #   tilnaermet perm M = -144 kNm  ->  sigma_ct = 2,767 < f_ctm        -> «urisset»
    # Motoren svarte «no quasi-permanent load combination cracks the section» og
    # `sls.all_ok = True`. Regnet som risset -- slik snittet FAKTISK er:
    #   x = 230,0, sigma_s = 273,4, s_r,max = 311,9, w_k = 0,3030 mm mot 0,30
    #   -> utilisation 1,010 -> crack_width_ok = FALSE.
    # Samme feil traff `sigma_c_qp_ok`: 2,142 urisset mot 2,754 risset, 29 % lavt.
    cracked = section_cracked

    Ec_used = Ecm if combo_type == 'characteristic' else Ec_eff
    n_sec = Es / Ec_used

    state, state_reason = _sls_row_state(
        b, h, Ec_used, Es, rebar, rebar_zs, n_ed, m_ed, cracked, fck, fyk,
        sig_top_u, sig_bot_u,
    )

    # §1.4 -- betongtrykkspenningen VED PAAFOERING, kun for quasi_permanent-rader. For
    # `phi_ef = 0` er evalueringen IDENTISK med `state` (samme `Ec`), men skal likevel
    # staa med sin egen etikett (spec §1.4, AC1: "identisk, fordi phi_ef = 0 -- men den
    # SKAL staa"). For en characteristic-rad finnes ingen slik dobbelthet: `Ec ER Ecm`.
    sigma_c_initial = None
    sigma_c_initial_reason = None
    if combo_type == 'quasi_permanent':
        if Ec_used == Ecm:
            sigma_c_initial = None if state is None else state['sigma_c']
            sigma_c_initial_reason = state_reason
        else:
            state_i, reason_i = _sls_row_state(
                b, h, Ecm, Es, rebar, rebar_zs, n_ed, m_ed, cracked, fck, fyk,
                sig_top_u, sig_bot_u,
            )
            sigma_c_initial = None if state_i is None else state_i['sigma_c']
            sigma_c_initial_reason = reason_i

    crack = None
    crack_reason = None
    if state is None:
        # Grunnen ARVES fra tilstanden (spec §3.5): "de tre kodene ... er samtidig
        # state_reason-koder ... naar tilstanden mangler, arver crack_reason grunnen fra
        # den, slik at det ikke finnes to maater aa si det samme paa".
        crack_reason = state_reason
    elif combo_type != 'quasi_permanent':
        crack_reason = 'not_quasi_permanent'
    elif not cracked:
        crack_reason = 'uncracked'
    else:
        crack, crack_reason = _sls_crack(rebar, state, b, h, m_ed, alpha_e_val, f_ct_eff, Es)
        if crack is not None:
            if w_max is None:
                crack['ok_reason'] = w_max_reason
            else:
                crack['w_max'] = _num(w_max)
                crack['utilisation'] = _num(crack['w_k'] / w_max)
                crack['ok'] = bool(crack['w_k'] <= w_max)

    stress = None
    if state is not None:
        if combo_type == 'characteristic':
            sigma_c_checked = 'state'
            sigma_c_val = state['sigma_c']
            sigma_c_limit = sigma_c_char_factor * fck
            sigma_s_val = state['sigma_s_max']
            sigma_s_limit = sigma_s_char_factor * fyk
            sigma_s_ok = bool(abs(sigma_s_val) <= sigma_s_limit)
            sigma_s_util = abs(sigma_s_val) / sigma_s_limit if sigma_s_limit else None
            sigma_s_ok_reason = None
        else:
            sigma_c_checked = 'initial'
            sigma_c_val = sigma_c_initial
            sigma_c_limit = sigma_c_qp_factor * fck
            # STAALSPENNINGEN STAAR OGSAA FOR EN QUASI-PERMANENT RAD. Den hadde
            # ingen GRENSE foer -- EC2 7.2(5) gjelder karakteristisk last -- og ble
            # derfor ikke rapportert i det hele tatt. Men den er selve inngangen til
            # rissvidden (lign. 7.9), og en rad som viser w_k uten spenningen bak den
            # er et resultat man ikke kan etterproeve.
            #
            # SAMME DEFINISJON som for en karakteristisk rad: `state['sigma_s_max']`,
            # stoerste strekkspenning over ALLE lag. Ikke `crack['sigma_s']` -- den er
            # spenningen i det STYRENDE laget inne i A_c,eff, en annen stoerrelse med
            # sitt eget navn og sin egen rad i utledningen. To tall under samme
            # merkelapp er nettopp den feilformen modulen har blitt bitt av hver runde.
            sigma_s_val = state['sigma_s_max']
            sigma_s_limit = None
            sigma_s_ok = None
            sigma_s_util = None
            sigma_s_ok_reason = 'sigma_s_limit_characteristic_only'

        # RETTET i runde 10 (K5). `sigma_c_ok` ble tidligere regnet for ENHVER
        # karakteristisk rad, ogsaa naar `_sls_checks` samtidig la `sigma_c_char_ok`
        # i `not_applicable`. Utledningen i UI-et skrev da «OK» for en kontroll linja
        # rett over sa ikke gjaldt -- to steder som svarte hver sitt paa samme
        # spoersmaal, fordi svaret ble utledet to steder. Naa spoer raden OM
        # kontrollen gjelder foer den feller en dom.
        #
        # EC2 7.2(2) (karakteristisk last) gjelder BARE XD/XF/XS; 7.2(3) (tilnaermet
        # permanent) er ikke klasseavhengig og gjelder alltid.
        sigma_c_applies = sigma_c_char_required if combo_type == 'characteristic' else True
        sigma_c_ok_reason = None
        if sigma_c_val is None:
            sigma_c_ok = None
            sigma_c_util = None
            sigma_c_ok_reason = (state_reason if combo_type == 'characteristic'
                                 else sigma_c_initial_reason)
        else:
            # Utnyttelsen regnes UANSETT: `sigma_c/limit` er et faktum om raden, og
            # skal staa i utledningen ogsaa naar den ikke skal felle en dom.
            sigma_c_util = abs(sigma_c_val) / sigma_c_limit if sigma_c_limit else None
            if sigma_c_applies is True:
                sigma_c_ok = bool(abs(sigma_c_val) <= sigma_c_limit)
            elif sigma_c_applies is False:
                sigma_c_ok = None
                sigma_c_ok_reason = 'sigma_c_char_not_required'
            else:
                sigma_c_ok = None
                sigma_c_ok_reason = 'no_exposure_class'

        stress = {
            'sigma_c': _num(sigma_c_val), 'sigma_c_limit': _num(sigma_c_limit),
            'sigma_c_util': _num(sigma_c_util), 'sigma_c_ok': sigma_c_ok,
            'sigma_c_ok_reason': sigma_c_ok_reason,
            'sigma_c_checked': sigma_c_checked,
            'sigma_s': _num(sigma_s_val), 'sigma_s_limit': _num(sigma_s_limit),
            'sigma_s_util': _num(sigma_s_util), 'sigma_s_ok': sigma_s_ok,
            'sigma_s_ok_reason': sigma_s_ok_reason,
        }

    return {
        'id': combo['id'], 'name': combo['name'], 'type': combo_type,
        'N_Ed': _num(n_ed), 'M_Ed': _num(m_ed),
        'sigma_ct_uncracked': _num(sigma_ct_uncracked),
        'cracked': bool(cracked),
        'Ec_used': _num(Ec_used), 'n_sec': _num(n_sec),
        'state': None if state is None else {
            'x': _num(state['x']), 'z_na': _num(state['z_na']),
            'eps_a': _num(state['eps_a']), 'chi_y': _num(state['chi_y']),
            'sigma_c': _num(state['sigma_c']),
            'eps_1': _num(state['eps_1']), 'eps_2': _num(state['eps_2']),
            'sigma_s_max': _num(state['sigma_s_max']),
            # Hele snittet i strekk: ingen trykksone, `x = 0` og `sigma_c = 0` er
            # SVARET og ikke en degenerasjon. Feltet staar i svaret slik at rapporten
            # og skjermen kan si hvorfor, i stedet for aa la leseren lure paa det.
            'tension_only': bool(state.get('tension_only')),
            'layers': state['layers'],
        },
        'state_reason': state_reason,
        'sigma_c_initial': _num(sigma_c_initial),
        'sigma_c_initial_reason': sigma_c_initial_reason,
        'stress': stress,
        'crack': crack,
        'crack_reason': crack_reason,
    }

def _uncracked_reason(sigma_ct_max, f_ct_eff):
    """«Risser ikke» sagt med tallene som avgjorde det.

    Uten dem er setningen en paastand leseren maa tro paa. Med dem kan hen selv
    se om konklusjonen er komfortabel eller henger paa andre desimal -- og det
    er nettopp den vurderingen som avgjoer om man vil hake av for stadium II.
    """
    if sigma_ct_max is None or f_ct_eff in (None, 0):
        return 'no quasi-permanent load combination cracks the section'
    andel = sigma_ct_max / f_ct_eff
    return (
        'the section does not crack: the largest tensile stress in the uncracked '
        f'section is {sigma_ct_max:.2f} MPa against f_ct,eff = {f_ct_eff:.2f} MPa '
        f'({andel * 100:.0f} % of the cracking limit). Tick "assume cracked '
        '(state II)" to see the crack width the section would have if it cracked '
        'anyway - from shrinkage or restraint, which M_Ed does not carry.'
    )

def _sls_checks(rows, sigma_c_char_required, sigma_ct_max=None, f_ct_eff=None):
    """Spec §4 -- hvilke `sls.checks`-noekler som GJELDER, resten i `not_applicable`.
    Bruker `_three_valued_and` per noekkel over radene den gjelder for -- en rad uten
    `stress`/`crack` (tilstanden mangler) telles som `None` og ikke som utelatt: en
    rad motoren ikke kunne regne skal aldri kunne gjemme seg bak et tomt utvalg.
    """
    checks = {}
    not_applicable = {}
    char_rows = [r for r in rows if r['type'] == 'characteristic']
    qp_rows = [r for r in rows if r['type'] == 'quasi_permanent']

    if not char_rows:
        not_applicable['sigma_c_char_ok'] = 'no characteristic load combination is present'
        not_applicable['sigma_s_char_ok'] = 'no characteristic load combination is present'
    else:
        required = sigma_c_char_required
        if required is False:
            not_applicable['sigma_c_char_ok'] = (
                'the selected exposure class is not one EC2 7.2(2) requires this stress '
                'limit for (only XD, XF and XS are)'
            )
        elif required is None:
            checks['sigma_c_char_ok'] = None
        else:
            vals = [(r['stress']['sigma_c_ok'] if r['stress'] else None) for r in char_rows]
            checks['sigma_c_char_ok'] = _three_valued_and(dict(enumerate(vals)))

        vals_s = [(r['stress']['sigma_s_ok'] if r['stress'] else None) for r in char_rows]
        checks['sigma_s_char_ok'] = _three_valued_and(dict(enumerate(vals_s)))

    if not qp_rows:
        not_applicable['sigma_c_qp_ok'] = 'no quasi-permanent load combination is present'
        not_applicable['crack_width_ok'] = 'no quasi-permanent load combination is present'
    else:
        vals_qp = [(r['stress']['sigma_c_ok'] if r['stress'] else None) for r in qp_rows]
        checks['sigma_c_qp_ok'] = _three_valued_and(dict(enumerate(vals_qp)))

        cracked_qp = [r for r in qp_rows if r['cracked']]
        if not cracked_qp:
            # MED TALLET. «Risser ikke» er riktig, men det er ikke et svar paa
            # spoersmaalet brukeren sitter med -- hvor langt unna er vi? Marginen
            # avgjoer om dette er en komfortabel konklusjon eller en som henger
            # paa andre desimal.
            not_applicable['crack_width_ok'] = _uncracked_reason(sigma_ct_max, f_ct_eff)
        else:
            vals_w = [(r['crack']['ok'] if r['crack'] else None) for r in cracked_qp]
            checks['crack_width_ok'] = _three_valued_and(dict(enumerate(vals_w)))

    return checks, not_applicable

def _sls_incomplete_causes(key, rows, sigma_c_char_required):
    """Radene som GJORDE `key` ubesvart, hver med SIN EGEN grunnkode.

    HVORFOR DENNE FINNES
    Den forrige utgaven slo opp en fast engelsk setning paa NOEKKELNAVNET. Da fikk
    `sigma_c_char_ok` alltid forklaringen «ingen eksponeringsklasse er valgt», ogsaa naar
    klassen stod der og raden i stedet ikke lot seg loese -- og `sigma_s_char_ok` fikk
    ingen forklaring i det hele tatt, fordi den manglet i tabellen. En grunn valgt paa
    navnet til det som feilet er en gjetning, ikke en maaling.

    Her leses grunnen av raden som faktisk manglet svaret, med den koden motoren allerede
    satte paa den (`state_reason`, `sigma_c_initial_reason`, `crack_reason`,
    `crack['ok_reason']`). Ingen engelsk tekst bor her -- den bor i `results.js`
    (`SLS_REASON_TEXT`), og koden er noekkelen inn i den.

    Returnerer en liste av `(row_id | None, code)`. `row_id = None` naar aarsaken gjelder
    hele snittet og ikke én rad (bare eksponeringsklassen gjoer det).
    """
    char_rows = [r for r in rows if r['type'] == 'characteristic']
    qp_rows = [r for r in rows if r['type'] == 'quasi_permanent']
    out = []
    if key == 'sigma_c_char_ok':
        # Klassen gaar FOERST: er 7.2(2) ukjent, er noekkelen ubesvart uansett hva
        # radene fikk til, og `_sls_checks` naadde aldri radene.
        if sigma_c_char_required is None:
            return [(None, 'no_exposure_class')]
        for r in char_rows:
            if r['stress'] is None:
                out.append((r['id'], r['state_reason']))
            elif r['stress']['sigma_c_ok'] is None:
                out.append((r['id'], r['stress']['sigma_c_ok_reason']))
    elif key == 'sigma_s_char_ok':
        for r in char_rows:
            if r['stress'] is None or r['stress']['sigma_s_ok'] is None:
                out.append((r['id'], r['state_reason']))
    elif key == 'sigma_c_qp_ok':
        for r in qp_rows:
            if r['stress'] is None:
                out.append((r['id'], r['state_reason']))
            elif r['stress']['sigma_c_ok'] is None:
                # Her, og BARE her, er grunnen en annen enn radens egen tilstand:
                # `sigma_c` for en quasi_permanent-rad er den EKSTRA E_cm-evalueringen
                # (§1.4), som kan mangle selv om radens egen tilstand finnes.
                # `sigma_c_ok_reason` baerer allerede nettopp det skillet.
                out.append((r['id'], r['stress']['sigma_c_ok_reason']))
    elif key == 'crack_width_ok':
        for r in qp_rows:
            if not r['cracked']:
                continue
            if r['crack'] is None:
                out.append((r['id'], r['crack_reason']))
            elif r['crack'].get('ok') is None:
                out.append((r['id'], r['crack'].get('ok_reason')))
    return out

def _sls_warnings(checks, rows, sigma_c_char_required):
    """De tre nye advarselskodene (spec §4), severity `warning` alltid -- SLS er
    bruksgrense, ikke brudd. Ingen av dem siterer et tall som ikke ble regnet, og ingen
    av dem gjetter en grunn: `sls_incomplete` henter hver grunn fra raden som manglet
    svaret (`_sls_incomplete_causes`)."""
    out = []
    incomplete = [k for k, v in checks.items() if v is None]
    if incomplete:
        parts = []
        for k in incomplete:
            causes = _sls_incomplete_causes(k, rows, sigma_c_char_required)
            if not causes:
                # I praksis unaabart -- `_sls_checks` setter bare `None` naar en rad gav
                # `None`. Staar likevel: en tom forklaring skal si at den er tom, ikke
                # se ut som en forklaring.
                parts.append(f'{k}: no reason was recorded')
            else:
                parts.append(f'{k}: ' + ', '.join(
                    str(code) if rid is None else f'{rid} ({code})' for rid, code in causes))
        out.append(_warning(
            'sls_incomplete',
            f'The serviceability assessment is incomplete: {len(incomplete)} '
            + ('check' if len(incomplete) == 1 else 'checks')
            + ' could not be evaluated (' + ', '.join(incomplete) + ').',
            '; '.join(parts),
        ))

    exceeded = {k for k, v in checks.items() if v is False}
    if 'crack_width_ok' in exceeded:
        failing = [r for r in rows if r.get('crack') and r['crack']['ok'] is False]
        worst = max(failing, key=lambda r: r['crack']['utilisation'] or 0.0, default=None)
        if worst is not None:
            out.append(_warning(
                'sls_crack_width_exceeded',
                f'The crack width w_k = {worst["crack"]["w_k"]:.3f} mm exceeds w_max = '
                f'{worst["crack"]["w_max"]:.3f} mm for load combination "{worst["id"]}" '
                '(EC2 7.3.4).',
                f'row={worst["id"]}, w_k={worst["crack"]["w_k"]}, '
                f'w_max={worst["crack"]["w_max"]}',
            ))
    stress_keys = sorted({'sigma_c_char_ok', 'sigma_s_char_ok', 'sigma_c_qp_ok'} & exceeded)
    if stress_keys:
        out.append(_warning(
            'sls_stress_limit_exceeded',
            'A stress limit under EC2 7.2 is exceeded for at least one serviceability '
            'load combination: ' + ', '.join(stress_keys) + '.',
            ', '.join(stress_keys),
        ))
    return out

def _compute_sls(payload, sls_cfg, combos, bundle, warnings_out):
    """Spec §4 -- bygger `result.sls`. Kalles bare naar payloaden har et `sls`-objekt OG
    minst én kombinasjon er `characteristic`/`quasi_permanent` (haandheves av kalleren,
    `_run_inner`) -- ellers skal `result` vaere BIT FOR BIT som uten dette kapittelet
    (spec §4/AC9).

    Motoren SLAAR ALDRI OPP en eksponeringsklasse -- `payload['sls']` baerer tallene
    (`w_max`, de tre faktorene, `sigma_c_char_required`) allerede utledet av JS
    (spec §4, "payload.js gjoer ALT, engine.py gjoer INGENTING" -- samme arbeidsdeling
    som geometrien).
    """
    conc = bundle['conc']
    steel = bundle['steel']
    b = bundle['b']
    h = bundle['h']
    rebar = payload['section']['rebar']

    ecm = float(conc.Ecm)
    es = float(steel.Es)
    fck = float(conc.fck)
    fyk = float(steel.fyk)
    f_ct_eff = float(conc.fctm)

    phi_ef_raw = sls_cfg.get('phi_ef')
    phi_ef = float(phi_ef_raw) if phi_ef_raw is not None else _SLS_FALLBACK['phi_ef']
    ec_eff = ecm / (1.0 + phi_ef)
    # lign. 7.9 -- ALLTID E_cm, ALDRI E_c,eff (spec §1.4). Feller man dette, blir `w_k`
    # LAVERE enn uten kryp i det hele tatt (de to feilene opphever hverandre), og feilen
    # er usynlig med mindre `alpha_e` har sitt eget navn -- se AC2.
    alpha_e_val = es / ecm

    exposure_class = sls_cfg.get('exposure_class')
    w_max = sls_cfg.get('w_max')
    w_max = float(w_max) if w_max is not None else None
    w_max_source = sls_cfg.get('w_max_source')
    w_max_reason = sls_cfg.get('w_max_reason')
    sigma_c_char_factor = float(
        sls_cfg.get('sigma_c_char_factor', _SLS_FALLBACK['sigma_c_char_factor']))
    sigma_c_qp_factor = float(
        sls_cfg.get('sigma_c_qp_factor', _SLS_FALLBACK['sigma_c_qp_factor']))
    sigma_s_char_factor = float(
        sls_cfg.get('sigma_s_char_factor', _SLS_FALLBACK['sigma_s_char_factor']))
    sigma_c_char_required = sls_cfg.get('sigma_c_char_required')

    sls_combos = [c for c in combos
                  if c['type'] in ('characteristic', 'quasi_permanent')]

    # KONVOLUTTEN FOERST. Snittet er risset dersom NOEN bruksgrenserad sprenger
    # f_ct,eff -- og da er det risset for alle radene, fordi riss ikke gaar tilbake naar
    # lasten gaar ned. Se `_sls_row` for maalingen som gjorde dette noedvendig.
    #
    # E_cm i hele beslutningen: den urissede tilstanden er kortidsstivheten uansett
    # hvilken kombinasjon raden er, og en kryprelatert forskjell her ville gjort
    # rissgrensa avhengig av lastvarigheten.
    # MARGINEN TAS VARE PAA, ikke bare beslutningen. Loekka regnet allerede
    # `sigma_ct` for hver rad og kastet tallet; igjen sto en paastand uten noe
    # bak seg. MAALT paa en plate 1000x200, XC3, M_qp = -20 kNm/m: motoren visste
    # `sigma_ct = 0,325 MPa` mot `f_ct,eff = 2,90`, men skjermen sa bare «no
    # quasi-permanent load combination cracks the section». Spoersmaalet
    # brukeren sitter med -- «er vi like under rissmomentet?» -- kunne besvares
    # av et tall motoren allerede hadde.
    #
    # Ingen `break`: vi vil ha den STOERSTE strekkspenningen over alle radene,
    # ikke bare den foerste som eventuelt sprenger grensa.
    sigma_ct_max = None
    for combo in sls_combos:
        rebar_zs_env = [(float(l['area']), _layer_z(l)) for l in rebar]
        eps_a_e, chi_e = _sls_uncracked_eval(
            b, h, ecm, es, rebar_zs_env, combo['N_Ed'], combo['M_Ed'])
        sig_top_e = ecm * (eps_a_e + chi_e * (h / 2.0))
        sig_bot_e = ecm * (eps_a_e + chi_e * (-h / 2.0))
        worst_e = max(sig_top_e, sig_bot_e)
        if sigma_ct_max is None or worst_e > sigma_ct_max:
            sigma_ct_max = worst_e
    section_cracked = sigma_ct_max is not None and sigma_ct_max > f_ct_eff

    # STADIUM II PAA FORESPOERSEL. Et snitt som ikke risser av lasten alene kan
    # likevel risse: svinn, fastholding, temperatur og lasthistorikk ligger ikke i
    # `M_Ed`. EC2 7.3.2(2) krever dessuten minimumsarmering nettopp for det
    # tilfellet. Brukeren skal derfor kunne spoerre «hvilken rissvidde ville jeg
    # faatt om det risset likevel» uten aa maatte oppdikte et stoerre moment.
    #
    # ANTAKELSEN ER KONSERVATIV -- den paastaar riss der beregningen ikke finner
    # det -- men den er fortsatt en ANTAKELSE, og skal aldri kunne forveksles med
    # et regnet resultat. Derfor `cracked_assumed` i svaret og en egen advarsel:
    # den som leser rapporten skal se at tilstanden ble valgt, ikke funnet.
    assume_cracked = bool(sls_cfg.get('assume_cracked'))
    cracked_assumed = bool(assume_cracked and not section_cracked)
    if assume_cracked:
        section_cracked = True

    rows = []
    for combo in sls_combos:
        row = _sls_row(
            combo, rebar, b, h, ecm, ec_eff, es, fck, fyk, alpha_e_val, f_ct_eff,
            w_max, w_max_source, w_max_reason,
            sigma_c_char_factor, sigma_c_qp_factor, sigma_s_char_factor,
            sigma_c_char_required, section_cracked,
        )
        rows.append(row)

    # `sigma_c_char_required` gaar som PARAMETER, ikke som et felt paa hver rad: den
    # gjelder hele snittet (én eksponeringsklasse), og staar allerede ett sted i
    # svaret -- `sls['limits']['sigma_c_char_required']`. Et felt per rad hadde vaert
    # den samme opplysningen skrevet N + 1 ganger, og dermed N + 1 steder aa endre.
    checks, not_applicable = _sls_checks(rows, sigma_c_char_required,
                                        sigma_ct_max, f_ct_eff)
    sls_all_ok = _three_valued_and(checks)
    warnings_out.extend(_sls_warnings(checks, rows, sigma_c_char_required))

    # ANTAKELSEN SKAL VAERE SYNLIG. En rissvidde regnet for en tilstand brukeren
    # VALGTE ser ut nøyaktig som en regnet for en tilstand motoren FANT -- samme
    # tall, samme enhet, samme grense. Forskjellen finnes bare i forutsetningen,
    # og den maa derfor staa i lista som foelger tallet inn i rapporten.
    #
    # `info` og ikke `warning`: brukeren har gjort noe fornuftig og bevisst, og
    # et gult merke for et valg man nettopp tok er stoy.
    if cracked_assumed:
        warnings_out.append(_warning(
            'crack_state_assumed',
            'The crack width is computed for an assumed cracked section (state II). '
            'Under the quasi-permanent load the section does not reach its cracking '
            f'moment: the largest tensile stress is {sigma_ct_max:.2f} MPa against '
            f'f_ct,eff = {f_ct_eff:.2f} MPa. The result answers what the crack width '
            'would be if the section cracked anyway.',
            f'sigma_ct_max={sigma_ct_max}, f_ct_eff={f_ct_eff}',
            severity='info',
        ))

    return {
        'phi_ef': _num(phi_ef), 'Ecm': _num(ecm), 'Ec_eff': _num(ec_eff),
        'alpha_e': _num(alpha_e_val), 'f_ct_eff': _num(f_ct_eff),
        'exposure_class': exposure_class,
        # Konvoluttbeslutningen, paa toppnivaa: den gjelder snittet og ikke raden, og
        # da skal den staa der de andre snittstoerrelsene staar.
        'cracked': bool(section_cracked),
        # Den STOERSTE strekkspenningen i det urissede snittet over alle
        # bruksgrenseradene, ved siden av grensa den maales mot. Sammen er de to
        # hele begrunnelsen for `cracked`, og de gjoer «risser ikke» til et svar
        # med et tall i stedet for en paastand.
        'sigma_ct_max': _num(sigma_ct_max),
        # Ble tilstanden VALGT av brukeren i stedet for regnet? Bare `True` naar
        # antakelsen faktisk endret noe -- risser snittet av seg selv, er det
        # ingen antakelse aa opplyse om.
        'cracked_assumed': cracked_assumed,
        'w_max': _num(w_max), 'w_max_source': w_max_source, 'w_max_reason': w_max_reason,
        'limits': {
            'sigma_c_char_factor': _num(sigma_c_char_factor),
            'sigma_c_char': _num(sigma_c_char_factor * fck) if sigma_c_char_required is True else None,
            'sigma_c_qp_factor': _num(sigma_c_qp_factor),
            'sigma_c_qp': _num(sigma_c_qp_factor * fck),
            'sigma_s_char_factor': _num(sigma_s_char_factor),
            'sigma_s_char': _num(sigma_s_char_factor * fyk),
            'sigma_c_char_required': sigma_c_char_required,
        },
        'rows': rows,
        'checks': checks,
        'not_applicable': not_applicable,
        'all_ok': sls_all_ok,
    }
