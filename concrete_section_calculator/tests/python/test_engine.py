"""test_engine.py — motoren mot de frosne fixturene.

HVORFOR DENNE TESTEN LESER PAYLOAD-FIXTUREN OG IKKE BYGGER SIN EGEN
`payload.test.mjs` påstår at `payload.js` produserer nøyaktig `payload-beam-300x600.json`.
Denne fila bruker SAMME fil som inndata. Det er koblingen som gjør planens §12 —
«samme M_Rd i CPython som i nettleseren» — til noe som faktisk kan etterprøves: bygde
testene hver sin payload, ville JS og Python kunne drive fra hverandre uten at noe ble rødt.

HVORFOR TALLENE SAMMENLIGNES MOT FIXTURENE OG IKKE MOT KONSTANTER I FILA
Fixturene er kontrakten (§2.2), og de samme filene mater tegne-, rapport- og UX-arbeidet.
Bakte vi tallene inn her, ville en drift i motoren kunne rettes ved å oppdatere testen —
og alle andre ville fortsatt jobbe mot de gamle tallene.
"""

from __future__ import annotations

import copy
import json
import math
import pathlib
import sys

import pytest

MODULE_DIR = pathlib.Path(__file__).resolve().parents[2]
FIXTURES = MODULE_DIR / 'tests' / 'fixtures'
sys.path.insert(0, str(MODULE_DIR / 'python'))

import engine  # noqa: E402

# Regresjonsgrunnlaget fra planens §3.6. Står her som en EKSPLISITT konstant, ikke bare som
# en fixtursammenligning, fordi det er tallet akseptkriteriet er formulert med.
#
# Dette er en STØRRELSE (v4 endret ikke absoluttverdien, bare fortegnet, plan §1.6). Hvert
# kallsted legger på fortegnet konteksten sin gir: NEGATIVT for feltmoment (referansebjelken
# med underkantarmering, θ = 0), POSITIVT for støttemoment (θ = π).
M_RD_BEAM = 215006759.19
REL_TOL = 1e-6


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding='utf-8'))


@pytest.fixture(autouse=True)
def _fresh_section():
    """Motoren cacher den forberedte seksjonen med vilje (§3.7). Testene vil ha den fersk."""
    engine.reset_cache()
    yield
    engine.reset_cache()


def close(a, b, rel=REL_TOL):
    if a is None or b is None:
        return a is b or a == b
    return math.isclose(a, b, rel_tol=rel, abs_tol=1e-9)


# ------------------------------------------------------------------ #
# Bøyekapasitet
# ------------------------------------------------------------------ #

def test_beam_bending_matches_fixture():
    payload = load('payload-beam-300x600.json')
    expected = load('result-bending-beam-300x600.json')
    result = engine.run(payload)

    assert result['ok'] is True
    assert result['schema'] == 1
    assert result['analysis'] == 'bending'

    # Akseptkriteriet i §9 (v4): samme absoluttverdi som før, NEGATIVT fortegn for feltmoment.
    assert close(result['bending']['M_Rd'], -M_RD_BEAM)

    for key, value in expected['bending'].items():
        if key == 'layers':
            continue
        if key == 'combinations':
            # v4 la til `V_Ed`/`shear` på hver kombinasjon og snudde `M_Rd`s fortegn — se
            # `test_old_loads_shape_is_treated_as_a_single_unnamed_combination` og
            # `test_meta_and_checks_shape`/skjærtestene for de dedikerte påstandene.
            continue
        got = result['bending'][key]
        if key == 'M_Rd':
            # Fikstueren kan holde enten det gamle (positive) eller det nye (rå, negative)
            # tallet, avhengig av når den sist ble regenerert (planens §8 — koordinatoren
            # regenererer MELLOM bølgene, ikke i denne). Sammenlign derfor STØRRELSEN her;
            # selve fortegnet er alt sjekket eksakt over.
            assert close(abs(got), abs(value)), f'bending.M_Rd magnitude: {got} != {value}'
            assert got < 0, 'feltmoment (sagging) skal vaere NEGATIVT etter fortegnsregelen'
            continue
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            assert close(got, value), f'bending.{key}: {got} != {value}'
        else:
            assert got == value, f'bending.{key}: {got} != {value}'

    assert len(result['bending']['layers']) == len(expected['bending']['layers'])
    for got, want in zip(result['bending']['layers'], expected['bending']['layers']):
        for key, value in want.items():
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                assert close(got[key], value), f'layer.{key}'
            else:
                assert got[key] == value, f'layer.{key}'
        # §5.2 krever i tillegg en utnyttelse per lag; fixturen ble laget før den fantes.
        assert got['utilisation'] is not None


def test_beam_section_props_and_materials_match_fixture():
    payload = load('payload-beam-300x600.json')
    expected = load('result-bending-beam-300x600.json')
    result = engine.run(payload)

    for block in ('materials', 'section_props'):
        for key, value in expected[block].items():
            got = result[block][key]
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                assert close(got, value), f'{block}.{key}: {got} != {value}'
            else:
                assert got == value, f'{block}.{key}: {got} != {value}'

    # A_s,min regnes av motoren selv etter EC2 9.2.1.1, fordi `ec2_2004.As_min` er
    # rissviddeminimumet etter 7.3.2 og et helt annet krav (planens §3.6).
    props = result['section_props']
    fctm = result['materials']['fctm']
    manual = max(0.26 * fctm / 500.0 * 300.0 * 550.0, 0.0013 * 300.0 * 550.0)
    assert close(props['As_min'], manual)
    assert close(props['As_max'], 0.04 * 300.0 * 600.0)
    # Med ett lag i strekk faller de to definisjonene sammen.
    assert close(props['d_eff'], props['d_eff_all'])
    assert close(props['As_tension'], props['As_total'])


def _beam_with_compression_steel():
    """Referansebjelken pluss 2Ø12 i overkant — hullet fixturene ikke dekker."""
    payload = load('payload-beam-300x600.json')
    payload['section']['rebar'].append({
        'id': 'L2', 'kind': 'bars', 'area': 226.19467105846502,
        'bars': [
            {'y': -100.0, 'z': 250.0, 'dia': 12.0},
            {'y': 100.0, 'z': 250.0, 'dia': 12.0},
        ],
    })
    return payload


def test_d_eff_is_the_tension_reinforcement_only():
    """EC2 9.2.1.1 sin `d` er trykkanten til STREKKARMERINGENS tyngdepunkt.

    Tar man trykkarmeringen med i vektingen, synker `d` fra 550 til 453 mm, og
    `A_s,min = 0.26·f_ctm/f_yk·b_t·d` blir tilsvarende for lav — på usikker side, i akkurat
    de snittene noen har lagt inn trykkarmering. Fixturene har ett lag og ville aldri
    fanget det, så regresjonen må stå her.
    """
    result = engine.run(_beam_with_compression_steel())
    props = result['section_props']

    assert close(props['d_eff'], 550.0)
    assert close(props['As_tension'], 942.4777960769379)

    # Det arealvektede tallet over ALLE lag beholdes ved siden av, slik at rapporten kan
    # vise begge og valget er synlig.
    total = 942.4777960769379 + 226.19467105846502
    expected_all = (942.4777960769379 * 550.0 + 226.19467105846502 * 50.0) / total
    assert close(props['d_eff_all'], expected_all)
    assert props['d_eff'] > props['d_eff_all']

    # A_s,min og rho skal bruke den nye, riktige d.
    fctm = result['materials']['fctm']
    assert close(props['As_min'],
                 max(0.26 * fctm / 500.0 * 300.0 * 550.0, 0.0013 * 300.0 * 550.0))
    # ρ er EC2 sin ρ_l: STREKKARMERINGEN over b_t·d. Teller og nevner må gjelde den samme
    # armeringen — 1168,672/(b·550) ville vært total armering delt på strekkarmeringens
    # dybde, et tall uten mening som en leser likevel tar for ρ_l.
    assert close(props['rho'], 942.4777960769379 / (300.0 * 550.0))
    assert not close(props['rho'], props['As_total'] / (300.0 * 550.0))
    assert close(result['bending']['x_over_d'], result['bending']['x'] / 550.0)


def test_d_eff_follows_the_strain_plane_for_hogging():
    """Snur retningen, snur strekksiden — uten at geometrien endres."""
    payload = load('payload-beam-300x600.json')
    payload['section']['rebar'][0]['bars'] = [
        {'y': y, 'z': 250.0, 'dia': 20.0} for y in (-100.0, 0.0, 100.0)
    ]   # 3Ø20 i OVERKANT
    payload['section']['rebar'].append({
        'id': 'L2', 'kind': 'bars', 'area': 226.19467105846502,
        'bars': [
            {'y': -100.0, 'z': -250.0, 'dia': 12.0},
            {'y': 100.0, 'z': -250.0, 'dia': 12.0},
        ],
    })   # 2Ø12 i UNDERKANT, som blir trykkarmering ved støttemoment
    payload['options']['theta'] = math.pi
    result = engine.run(payload)

    layers = {l['id']: l for l in result['bending']['layers']}
    assert layers['L1']['compression'] is False
    assert layers['L2']['compression'] is True

    props = result['section_props']
    assert close(props['d_eff'], 550.0)
    assert close(props['As_tension'], 942.4777960769379)
    assert close(props['d_eff_all'], 453.22580645161287)
    fctm = result['materials']['fctm']
    assert close(props['As_min'],
                 max(0.26 * fctm / 500.0 * 300.0 * 550.0, 0.0013 * 300.0 * 550.0))


def test_d_eff_counts_every_layer_that_is_actually_in_tension():
    """Ligger HELE armeringen i strekk, er hele armeringen strekkarmering.

    Referansebjelken med underkantarmering, regnet som støttemoment, er nettopp det
    tilfellet: nøytralaksen havner under begge lagene (x = 43 mm fra underkant), så begge
    står i strekk og `d` er tyngdepunktet av begge. Det er derfor strekksiden avgjøres fra
    tøyningsplanet og ikke fra geometrien — en geometrisk regel ville kalt underkantjernene
    trykkarmering her, og gitt feil `d`.
    """
    payload = _beam_with_compression_steel()
    payload['options']['theta'] = math.pi
    result = engine.run(payload)

    assert all(l['compression'] is False for l in result['bending']['layers'])
    props = result['section_props']
    assert close(props['d_eff'], props['d_eff_all'])
    assert close(props['As_tension'], props['As_total'])
    assert close(props['d_eff'], 146.77419354838707)


def test_meta_and_checks_shape():
    result = engine.run(load('payload-beam-300x600.json'))
    meta = result['meta']
    assert meta['structuralcodes_version'] == '0.7.2'
    assert meta['integrator'] == 'marin'
    # `meta.moment_sign` og `meta.domain_theta` er fjernet i v4 (plan §1.5) — ingen
    # produksjonskode leste dem, og fortegnet ligger nå rått i selve resultatfeltene.
    assert 'moment_sign' not in meta
    assert 'domain_theta' not in meta
    assert meta['direction'] == 'sagging'
    assert meta['scipy'] in ('real', 'stub')
    assert isinstance(meta['wall_time_ms'], float)

    checks = result['checks']
    # `shear_ok`/`asw_min_ok`/`stirrup_spacing_ok` er nye i v4 (plan §4.3) og skal finnes
    # SELV UTEN skjærdata i payloaden — denne fixturen har ingen `section.shear`, og
    # feltene skal da bli `True` (vakuøst, ingenting å feile på).
    # `bending_ok`/`brittle_ok` er nye i runde 6 (§1.2/§1.5).
    assert set(checks) == {
        'as_min_ok', 'as_max_ok', 'ductility_ok', 'brittle_ok', 'axial_ok', 'geometry_ok',
        'bending_ok', 'shear_ok', 'asw_min_ok', 'stirrup_spacing_ok', 'all_ok',
    }
    # TREVERDIG fra runde 6 (§1.1): `None` er et gyldig kontrollsvar og betyr «motoren kan
    # ikke hevde noen av delene». Den gamle `isinstance(v, bool)`-påstanden VAR innkodingen
    # av den toverdige antakelsen som lot ubesvarte kontroller telle som bestått.
    assert all(v is True or v is False or v is None for v in checks.values())
    assert checks['all_ok'] is True
    # Fixturen har M_Ed = 0 (⇒ η = 0) og M_Rd = 215,0 kNm ≫ M_cr = 52,1 kNm, så de to nye
    # kontrollene skal begge være `True` — ingen fixturverdi endres av runde 6 (§1.8).
    assert checks['bending_ok'] is True
    assert checks['brittle_ok'] is True
    assert checks['shear_ok'] is True
    assert checks['asw_min_ok'] is True
    assert checks['stirrup_spacing_ok'] is True

    assert isinstance(result['warnings'], list)
    for w in result['warnings']:
        assert set(w) == {'code', 'severity', 'message', 'detail'}


def test_slab_matches_fixture():
    payload = load('payload-slab-1000x200.json')
    expected = load('result-bending-slab-1000x200.json')
    result = engine.run(payload)

    # Se `test_beam_bending_matches_fixture`: fikstueren kan holde det gamle (positive)
    # eller det nye (rå, negative) tallet — sammenlign STØRRELSEN, sjekk fortegnet eksakt.
    assert close(abs(result['bending']['M_Rd']), abs(expected['bending']['M_Rd']))
    assert result['bending']['M_Rd'] < 0     # plate med underkantarmering = feltmoment
    assert close(result['section_props']['As_total'], expected['section_props']['As_total'])
    # Planens §3.6 oppgir −69,865 kNm/m for A_s = 1000 mm²/m eksakt. Fixturen bruker det
    # faktiske arealet (1000,86 mm²/m) fra Ø12 c/c 113, derav de 0,08 prosentene.
    assert close(result['bending']['M_Rd'], -69864525.0, rel=2e-3)


# ------------------------------------------------------------------ #
# Moment–krumning
# ------------------------------------------------------------------ #

def test_moment_curvature_matches_fixture():
    payload = load('payload-beam-300x600.json')
    payload['analysis'] = 'moment_curvature'
    expected = load('result-mc-beam-300x600.json')['moment_curvature']
    mc = engine.run(payload)['moment_curvature']

    assert len(mc['kappa']) == len(expected['kappa']) == 20
    assert mc['yield_index'] == expected['yield_index'] == 9
    assert mc['truncated'] is False
    # v4: `moment_curvature.moment`/`.kappa` er RÅ (plan §1.4), ikke lenger størrelser —
    # fikstueren kan fortsatt holde de gamle (positive) tallene, så sammenlign størrelsen.
    for got, want in zip(mc['kappa'], expected['kappa']):
        assert close(abs(got), abs(want))
    for got, want in zip(mc['moment'], expected['moment']):
        assert close(abs(got), abs(want))

    # Feltmoment (θ = 0, standardretningen): kurven er NEGATIV i pakkens eget fortegn.
    assert all(v is not None and v <= 0 for v in mc['kappa'])
    assert all(v is not None and v <= 0 for v in mc['moment'])
    # `chi_plan` er det ENE unntaket som fortsatt er en størrelse (§1.4).
    assert all(v is not None and v >= 0 for v in mc['chi_plan'])
    # Siste punkt skal være bøyekapasiteten (§3.6), RÅTT og negativt for feltmoment.
    assert close(mc['moment'][-1], -M_RD_BEAM, rel=1e-5)


def test_moment_curvature_single_point_follows_the_plan():
    """JS driver kurven ett punkt om gangen (§3.7) — da må planen ligge i svaret."""
    payload = load('payload-beam-300x600.json')
    payload['analysis'] = 'moment_curvature'
    full = engine.run(payload)['moment_curvature']

    plan = full['chi_plan']
    assert plan is not None and len(plan) == 20

    for index in (0, 9, 19):
        single = copy.deepcopy(payload)
        # `chi_plan` mates rett inn, uten fortegnsbehandling. Se testen under.
        single['options']['mc_chi'] = plan[index]
        one = engine.run(single)['moment_curvature']
        assert len(one['kappa']) == 1
        assert one['yield_index'] is None
        assert close(one['kappa'][0], full['kappa'][index])
        # Punktvis kjøring mister pakkas videreføring av forrige tøyningsnivå som startgjett,
        # så momentet treffer ikke bit-identisk — men godt innenfor konvergenstoleransen.
        assert close(one['moment'][0], full['moment'][index], rel=1e-6)


def test_mc_chi_is_a_magnitude_not_a_signed_curvature():
    """`mc_chi` skal tolkes som STØRRELSE, som alt annet i den analyserte retningen.

    Krevde motoren fortegnsatt krumning, måtte hver konsument gange `chi_plan` med
    `meta.moment_sign` for å få riktig kurve — og glemte man det, ga punkt 5 på
    referansebjelken 0,4 kNm i stedet for 114 kNm, uten at noe feilet. Et fortegn som
    bare er dokumentert er et fortegn noen kommer til å bomme på.
    """
    payload = load('payload-beam-300x600.json')
    payload['analysis'] = 'moment_curvature'
    full = engine.run(payload)['moment_curvature']
    index = 5

    positive = copy.deepcopy(payload)
    positive['options']['mc_chi'] = full['chi_plan'][index]
    negative = copy.deepcopy(payload)
    negative['options']['mc_chi'] = -full['chi_plan'][index]

    a = engine.run(positive)['moment_curvature']
    b = engine.run(negative)['moment_curvature']

    assert a['moment'] == b['moment']
    assert a['kappa'] == b['kappa']
    assert close(a['moment'][0], full['moment'][index], rel=1e-6)
    # Det målte tallet, ikke et omtrentlig: −114,4 MNmm (RÅTT, negativt for feltmoment,
    # plan §1.4), ikke 0,4.
    assert close(a['moment'][0], -114408358.78818576)


def _mc_payload(theta=0.0, alpha_cc=1.0, law_steel=None):
    payload = load('payload-beam-300x600.json')
    payload['analysis'] = 'moment_curvature'
    payload['options']['theta'] = theta
    payload['section']['concrete']['alpha_cc'] = alpha_cc
    if law_steel:
        payload['section']['steel']['law'] = law_steel
    if theta:
        payload['section']['rebar'][0]['bars'] = [
            {'y': y, 'z': 250.0, 'dia': 20.0} for y in (-100.0, 0.0, 100.0)
        ]
    return payload


@pytest.mark.parametrize('label,theta,alpha_cc,law', [
    # α_cc = 1,0 er fixturens tilstand; α_cc = 0,85 er UI-standarden (norsk NA), og det er
    # DEN som utløser feilen. En test på fixturtilstanden alene ville vært grønn hele veien.
    ('felt, alpha_cc=1.0', 0.0, 1.0, 'elasticplastic'),
    ('felt, alpha_cc=0.85', 0.0, 0.85, 'elasticperfectlyplastic'),
    ('stotte, alpha_cc=0.85', math.pi, 0.85, 'elasticperfectlyplastic'),
])
def test_driven_curve_equals_a_batch_run_including_the_last_point(label, theta, alpha_cc, law):
    """Punkt for punkt drevet kurve mot ett samlet kall — SÆRLIG bruddpunktet.

    Målt før rettelsen, på standardtilstanden (α_cc 0,85): siste punkt ga 126,2 kNm drevet
    mot 201,0 kNm samlet — 37 % for lavt, `truncated: false`, `warnings: []`. Punkt 0–18
    var en ren monoton kurve, så feilen så ut som et resultat. Nå regnes bruddpunktet som
    bøyekapasitet i BEGGE modi, og de to må da være identiske.
    """
    payload = _mc_payload(theta, alpha_cc, law)
    full = engine.run(payload)['moment_curvature']
    plan = full['chi_plan']
    assert len(plan) == 20, label

    for index in range(len(plan)):
        single = copy.deepcopy(payload)
        single['options']['mc_chi'] = plan[index]
        one = engine.run(single)['moment_curvature']
        assert close(one['kappa'][0], full['kappa'][index]), f'{label}[{index}]'
        assert close(one['moment'][0], full['moment'][index], rel=1e-6), \
            f'{label}[{index}]: {one["moment"][0]} != {full["moment"][index]}'

    # Bruddpunktet skal være EKSAKT likt, ikke bare nær — det er kapasiteten i begge modi.
    last = copy.deepcopy(payload)
    last['options']['mc_chi'] = plan[-1]
    assert engine.run(last)['moment_curvature']['moment'][0] == full['moment'][-1], label
    assert full['moment'][-1] == full['M_Rd'], label


def test_endpoint_mismatch_is_reported_not_silently_swallowed():
    """En 37 %-feil skal aldri kunne vises uten at noe sier fra."""
    quiet = engine.run(_mc_payload(0.0, 1.0, 'elasticplastic'))
    assert not [w for w in quiet['warnings'] if w['code'] == 'mc_endpoint_mismatch']

    loud = engine.run(_mc_payload(0.0, 0.85, 'elasticperfectlyplastic'))
    hits = [w for w in loud['warnings'] if w['code'] == 'mc_endpoint_mismatch']
    assert len(hits) == 1
    assert 'kNm' in hits[0]['message']
    # `info`, ikke `warning`: α_cc 0,85 er norsk NA og UI-ets standard, så denne utløses på
    # nesten hver M–κ-kjøring — og sluttpunktet som RAPPORTERES er eksakt. En advarsel som
    # alltid står der lærer brukeren å overse dem som faktisk teller.
    assert hits[0]['severity'] == 'info'
    # Ingen spekulasjon om resten av kurven: nabopunktene er målt til å ligge der de skal.
    assert 'rest of the curve' not in hits[0]['message']
    # Begge tallene skal stå i detail, ellers kan ingen etterprøve merknaden.
    assert 'fixed-curvature m_y' in hits[0]['detail']
    assert 'M_Rd' in hits[0]['detail']
    # Kurven avsluttes i kapasiteten uansett.
    assert loud['moment_curvature']['moment'][-1] == loud['moment_curvature']['M_Rd']


def test_the_first_point_after_yield_needs_no_special_handling():
    """Pakka gjør et sprang ved flytning også — målt, og der er startgjettet uskyldig."""
    for alpha_cc, law in ((1.0, 'elasticplastic'), (0.85, 'elasticperfectlyplastic')):
        payload = _mc_payload(0.0, alpha_cc, law)
        full = engine.run(payload)['moment_curvature']
        for index in (9, 10):       # siste før flyt og første etter
            single = copy.deepcopy(payload)
            single['options']['mc_chi'] = full['chi_plan'][index]
            one = engine.run(single)['moment_curvature']
            rel = abs(one['moment'][0] - full['moment'][index]) / abs(full['moment'][index])
            assert rel < 1e-7, f'alpha_cc={alpha_cc} punkt {index}: {rel:.3e}'


@pytest.mark.parametrize('label,theta,top_steel', [
    ('sagging', 0.0, False),
    ('hogging', math.pi, True),
])
def test_chi_plan_agrees_with_a_batch_run_in_both_directions(label, theta, top_steel):
    """Planen MÅ være den samme kurven det samlede kallet ville gitt.

    `calculate_moment_curvature` roterer den cachede `integration_data` med −θ før den
    kaller `_prepare_chi_array`. Gjorde ikke `_chi_plan` det samme, leste pakka armeringen
    i feil koordinatsystem: for θ = π ble planen 10 punkter mot 20 i det samlede kallet,
    med verdier som ikke sammenfalt. For θ = 0 er rotasjonen identiteten, så feilen var
    usynlig der — derfor er begge retninger med her.
    """
    payload = load('payload-beam-300x600.json')
    payload['analysis'] = 'moment_curvature'
    payload['options']['theta'] = theta
    if top_steel:
        payload['section']['rebar'][0]['bars'] = [
            {'y': y, 'z': 250.0, 'dia': 20.0} for y in (-100.0, 0.0, 100.0)
        ]

    mc = engine.run(payload)['moment_curvature']
    plan = mc['chi_plan']

    assert plan is not None, label
    assert len(plan) == 20, f'{label}: {len(plan)}'          # = mc_pre_yield + mc_post_yield
    assert len(plan) == len(mc['kappa']), label
    # `chi_plan` er alltid en STØRRELSE (§1.4); `kappa` er RÅ i v4 og har hogging sitt eget
    # fortegn (positivt her) og sagging sitt (negativt) — se `_moment_curvature`.
    if theta == 0.0:
        assert [-v for v in plan] == mc['kappa'], label       # eksakt, ikke bare nær
        assert all(v <= 0 for v in mc['kappa']), label
    else:
        assert plan == mc['kappa'], label                     # eksakt, ikke bare nær
        assert all(v >= 0 for v in mc['kappa']), label
    assert all(v >= 0 for v in plan), label

    # Og punktvis drift på planen gir den samme kurven.
    for index in (0, 9, 19):
        single = copy.deepcopy(payload)
        single['options']['mc_chi'] = plan[index]
        one = engine.run(single)['moment_curvature']
        assert close(one['kappa'][0], mc['kappa'][index]), f'{label}[{index}]'
        assert close(one['moment'][0], mc['moment'][index], rel=1e-5), f'{label}[{index}]'


def test_chi_plan_leaves_the_cached_integration_data_unrotated():
    """Den forberedte seksjonen er delt mellom kall (§3.7) og må komme uendret tilbake."""
    payload = load('payload-beam-300x600.json')
    payload['options']['theta'] = math.pi

    before = engine.run(payload)['bending']['M_Rd']
    mc = copy.deepcopy(payload)
    mc['analysis'] = 'moment_curvature'
    engine.run(mc)
    after = engine.run(payload)['bending']['M_Rd']

    assert close(after, before)


def test_moment_curvature_utilisation_is_vertical():
    payload = load('payload-beam-300x600.json')
    payload['analysis'] = 'moment_curvature'
    payload['loads']['M_Ed'] = 200000000.0
    mc = engine.run(payload)['moment_curvature']
    # `utilisation` er ALLTID en størrelse (§1.4) — `M_Rd` er RÅTT (negativt for feltmoment).
    assert close(mc['utilisation'], 200000000.0 / abs(mc['M_Rd']))


# ------------------------------------------------------------------ #
# M–N-diagram
# ------------------------------------------------------------------ #

def test_nm_domain_matches_fixture():
    payload = load('payload-beam-300x600.json')
    payload['analysis'] = 'nm_domain'
    expected = load('result-nmdomain-beam-300x600.json')['nm_domain']
    dom = engine.run(payload)['nm_domain']

    assert len(dom['n']) == len(expected['n']) == 69
    for got, want in zip(dom['n'], expected['n']):
        assert close(got, want)
    # v4 (plan §1.5): `m` er RÅ, ikke lenger dreid med et eget fortegn. Fikstueren er nå
    # regenerert i den nye konvensjonen (koordinatoren har verifisert: kun fortegnet på
    # `M_Rd`/`kappa`/`moment`/`m` snudde, absoluttverdiene er uendret) — sammenlign derfor
    # direkte.
    for got, want in zip(dom['m'], expected['m']):
        assert close(got, want)
    assert dom['field_num'] == expected['field_num']
    assert all(isinstance(v, int) for v in dom['field_num'])

    # To grener, hver i sitt halvplan: feltgrenen (stor, NEGATIV i pakkens eget fortegn for
    # dette snittet) og støttegrenen (liten, positiv) — se planens §1.6 for tallene.
    assert min(dom['n']) < 0
    assert min(dom['m']) < 0 and max(dom['m']) > 0
    assert close(min(dom['m']), -364250941.1746183)
    assert close(max(dom['m']), 254741119.1548166)
    # Feltgrenen dominerer i størrelse — dens |m| er hele omhyllingens største.
    assert close(abs(min(dom['m'])), max(abs(v) for v in dom['m']))
    assert close(dom['M_Rd_at_N'], -M_RD_BEAM)
    assert close(dom['N_min'], expected['N_min'])
    assert close(dom['N_max'], expected['N_max'])

    # §10 B2 punkt 6: `M_Rd` er NY, og skal ha nøyaktig samme verdi som `M_Rd_at_N`.
    assert dom['M_Rd'] == dom['M_Rd_at_N']
    assert dom['governing'] == 'C1'
    assert len(dom['combinations']) == 1
    assert dom['combinations'][0]['id'] == 'C1'


def test_nm_domain_point_set_is_the_same_for_sagging_and_hogging_theta():
    """Koordinatorrettelse: den forrige versjonen av denne testen påsto at omhyllingen ble
    DREID til å ligge stille når governing byttet retning — et begrep som ikke finnes
    lenger. Med RÅ `m` (plan §1.5) trengs ingen dreining i det hele tatt: punktMENGDEN i
    omhyllingen er identisk for θ = 0 og θ = π, bare traverseringsrekkefølgen snur (verifisert
    tall for tall). `options.theta` er dermed irrelevant for selve `n`/`m` — men avgjør
    fortsatt hvilken `domain_theta` som rapporteres, og det er det denne testen faktisk
    kan påstå.

    `meta.moment_sign`/`meta.domain_theta` er fjernet (ingen produksjonskode leste dem) —
    den påstanden er uendret fra før og beholdes.
    """
    payload = load('payload-beam-300x600.json')
    payload['analysis'] = 'nm_domain'
    payload['loads'] = {
        'combinations': [
            {'id': 'C1', 'name': 'sagging', 'N_Ed': 0.0, 'M_Ed': 100000000.0,
             'theta': 0.0},
            # Uten overkantarmering er hogging-kapasiteten liten (~6,4 kNm), så en
            # beskjeden M_Ed her gir likevel størst utnyttelse og vinner governing.
            {'id': 'C2', 'name': 'hogging', 'N_Ed': 0.0, 'M_Ed': 5000000.0,
             'theta': math.pi},
        ],
        'active': 'C1',
    }
    result = engine.run(payload)
    dom = result['nm_domain']

    assert dom['governing'] == 'C2'                    # hogging vant på utnyttelse
    assert 'moment_sign' not in result['meta']
    assert 'domain_theta' not in result['meta']
    assert dom['domain_theta'] == 0.0                  # omhyllingen fulgte options.theta

    # Regn omhyllingen på nytt med `options.theta = π` (uavhengig kjøring) og sammenlign
    # PUNKTMENGDEN, ikke rekkefølgen — se hodekommentaren.
    payload_pi = copy.deepcopy(payload)
    payload_pi['options']['theta'] = math.pi
    dom_pi = engine.run(payload_pi)['nm_domain']

    assert dom_pi['domain_theta'] == math.pi
    assert len(dom['n']) == len(dom_pi['n'])
    for (n1, m1), (n2, m2) in zip(sorted(zip(dom['n'], dom['m'])),
                                   sorted(zip(dom_pi['n'], dom_pi['m']))):
        assert close(n1, n2)
        assert close(m1, m2)


# Bruddtilstanden UI og rapport leser generisk. Nøkkelnavnene må være de samme i `bending`
# og `nm_domain`, ellers trenger hver leser et særtilfelle per analyse.
ULTIMATE_STATE_KEYS = (
    'eps_a', 'chi_y', 'x', 'x_over_d', 'eps_c_top', 'eps_s_max', 'failure_mode', 'layers',
)


def test_nm_domain_carries_the_ultimate_state_at_the_load_point():
    """Uten dette sto hele inspeksjonspanelet tomt i M–N-analysen.

    Tallene er alt regnet: `M_Rd_at_N` kommer fra et eget
    `calculate_bending_strength(theta, N_Ed)`, og det kallet har tøyningsplanet. Å la det
    ligge ubrukt i akkurat den analysen der man oftest vil se nøytralaksen — søyler med
    aksialkraft — er å kaste bort et svar vi har.
    """
    payload = load('payload-beam-300x600.json')
    payload['loads']['N_Ed'] = -500000.0

    bending = engine.run(payload)['bending']
    domain_payload = copy.deepcopy(payload)
    domain_payload['analysis'] = 'nm_domain'
    dom = engine.run(domain_payload)['nm_domain']

    for key in ULTIMATE_STATE_KEYS:
        assert key in dom, key
        # Identiske nøkkelnavn OG identiske verdier: det er den samme bruddtilstanden,
        # ved N_Ed, ikke et vilkårlig punkt på omhyllingen.
        assert dom[key] == bending[key], key

    assert dom['x'] is not None and dom['failure_mode'] is not None
    assert dom['layers'] and dom['layers'][0]['eps'] is not None
    assert close(dom['M_Rd_at_N'], bending['M_Rd'])


# ------------------------------------------------------------------ #
# §5.4 — tall som ikke krysser JSON
# ------------------------------------------------------------------ #

def test_zero_curvature_gives_null_not_infinity():
    """Den eksplisitte `chi_y = 0`-regresjonen fra §12."""
    z_na, x = engine._neutral_axis(eps_a=-0.002, chi_y=0.0, h=600.0, theta=0.0)
    assert z_na is None
    assert x is None


def test_pure_compression_result_survives_strict_json():
    """Ved N = n_min er krumningen numerisk null, og x må bli null — ikke 3,5e10."""
    payload = load('payload-beam-300x600.json')
    payload['loads']['N_Ed'] = -4010438.409731036   # = n_min for referansebjelken
    result = engine.run(payload)

    assert result['ok'] is True
    bending = result['bending']
    assert abs(bending['chi_y']) < 1e-9
    assert bending['x'] is None
    assert bending['x_over_d'] is None
    assert bending['failure_mode'] == 'compression_no_tension'

    # Ingen Infinity, ingen NaN, ingen numpy-typer skal ha sluppet gjennom.
    text = json.dumps(result, allow_nan=False)
    assert 'Infinity' not in text and 'NaN' not in text


def test_run_json_round_trip():
    payload = load('payload-beam-300x600.json')
    result = json.loads(engine.run_json(json.dumps(payload)))
    assert close(result['bending']['M_Rd'], -M_RD_BEAM)


# ------------------------------------------------------------------ #
# Retning, bruddform, kontroller og advarsler
# ------------------------------------------------------------------ #

def _beam_with_top_steel():
    payload = load('payload-beam-300x600.json')
    payload['section']['rebar'] = [{
        'id': 'T1',
        'kind': 'bars',
        'area': 942.4777960769379,
        'bars': [
            {'y': -100.0, 'z': 250.0, 'dia': 20.0},
            {'y': 0.0, 'z': 250.0, 'dia': 20.0},
            {'y': 100.0, 'z': 250.0, 'dia': 20.0},
        ],
    }]
    return payload


def test_hogging_mirrors_sagging():
    """Støttemoment med overkantarmering skal gi samme kapasitet som speilbildet."""
    hogging = _beam_with_top_steel()
    hogging['options']['theta'] = math.pi
    result = engine.run(hogging)

    assert result['meta']['direction'] == 'hogging'
    assert 'moment_sign' not in result['meta']
    # Støttemoment er POSITIVT i pakkens eget fortegn (motsatt av feltmoment, §1.1).
    assert close(result['bending']['M_Rd'], M_RD_BEAM)
    assert close(result['section_props']['d_eff'], 550.0)
    # x måles fra trykkanten, som for støttemoment er UNDERKANT.
    assert close(result['bending']['x'], 86.0890119057411)
    assert close(result['bending']['x_over_d'], 0.15652547619225654)


def test_axial_pre_check_is_english_and_still_returns_the_full_envelope():
    """§4.4: aksialsjekken stopper ikke lenger hele kjøringen.

    Med bare ÉN kombinasjon (den gamle `loads`-forma) og den utenfor grensene, finnes det
    ingen kandidat til `governing` (§4.3 regel 4). Toppnivå `ok` blir da `False` med en
    `axial_out_of_range`-feil — men resten av konvolutten (checks, section_props, meta,
    combinations) er fortsatt der, slik at figurer og tabeller har noe å vise.
    """
    payload = load('payload-beam-300x600.json')
    payload['loads']['N_Ed'] = -5_000_000.0
    result = engine.run(payload)

    assert result['ok'] is False
    assert result['error']['code'] == 'axial_out_of_range'
    assert 'axial force' in result['error']['message']
    assert 'kN' in result['error']['message']
    assert 'n_min' in result['error']['detail']

    assert result['checks']['axial_ok'] is False
    assert result['bending']['governing'] is None
    combo = result['bending']['combinations'][0]
    assert combo['within_limits'] is False
    assert combo['M_Rd'] is None
    assert combo['utilisation'] is None

    per_combo = [w for w in result['warnings'] if w['code'] == 'axial_out_of_range']
    assert len(per_combo) == 1
    assert per_combo[0]['combo'] == 'C1'
    assert 'axial force' in per_combo[0]['message']

    json.dumps(result, allow_nan=False)


def test_three_combinations_one_out_of_range_does_not_upset_the_others():
    """§4.6, full presisjon. C3 ligger under n_min og skal ikke røre C1/C2."""
    payload = load('payload-beam-300x600.json')
    payload['loads'] = {
        'combinations': [
            {'id': 'C1', 'name': 'ULS 1', 'N_Ed': 0.0, 'M_Ed': 150000000.0, 'theta': 0.0},
            {'id': 'C2', 'name': 'ULS 2', 'N_Ed': -500000.0, 'M_Ed': 250000000.0,
             'theta': 0.0},
            {'id': 'C3', 'name': 'ULS 3', 'N_Ed': -5000000.0, 'M_Ed': 100000000.0,
             'theta': 0.0},
        ],
        'active': 'C1',
    }
    result = engine.run(payload)
    assert result['ok'] is True

    bending = result['bending']
    assert close(result['section_props']['n_min'], -4010438.409731036)
    combos = {c['id']: c for c in bending['combinations']}

    # θ = 0 for alle tre ⇒ feltmoment ⇒ M_Rd NEGATIV (§1).
    assert close(combos['C1']['M_Rd'], -215006759.18601915)
    assert close(combos['C1']['utilisation'], 0.6976524857538235)
    assert combos['C1']['within_limits'] is True

    assert close(combos['C2']['M_Rd'], -305396902.98483205)
    assert close(combos['C2']['utilisation'], 0.818606860634787)
    assert combos['C2']['within_limits'] is True

    assert combos['C3']['within_limits'] is False
    assert combos['C3']['M_Rd'] is None
    assert combos['C3']['utilisation'] is None

    # C2 har størst utnyttelse av kandidatene og skal derfor styre toppnivåfeltene (§4.3).
    assert bending['governing'] == 'C2'
    assert close(bending['M_Rd'], -305396902.98483205)
    assert close(bending['utilisation'], 0.818606860634787)
    assert close(bending['N_Ed'], -500000.0)

    assert result['checks']['axial_ok'] is False       # C3 alene gjør det usant
    hits = [w for w in result['warnings'] if w['code'] == 'axial_out_of_range']
    assert len(hits) == 1
    assert hits[0]['combo'] == 'C3'
    assert hits[0]['combo_name'] == 'ULS 3'


def test_governing_tie_break_picks_the_first_combination_not_null():
    """§4.3 regel 3 — også når ALLE utnyttelser er 0, som i den committede fixturen."""
    payload = load('payload-beam-300x600.json')
    payload['loads'] = {
        'combinations': [
            {'id': 'C1', 'name': 'A', 'N_Ed': 0.0, 'M_Ed': 0.0, 'theta': 0.0},
            {'id': 'C2', 'name': 'B', 'N_Ed': -100000.0, 'M_Ed': 0.0, 'theta': 0.0},
            {'id': 'C3', 'name': 'C', 'N_Ed': -200000.0, 'M_Ed': 0.0, 'theta': 0.0},
        ],
        'active': 'C1',
    }
    result = engine.run(payload)
    assert all(c['utilisation'] == 0.0 for c in result['bending']['combinations'])
    assert result['bending']['governing'] == 'C1'
    assert close(result['bending']['N_Ed'], 0.0)


def test_old_loads_shape_is_treated_as_a_single_unnamed_combination():
    """§4.2: gammel form ⇒ nøyaktig fixturtallet, som én kombinasjon `C1` uten navn."""
    payload = load('payload-beam-300x600.json')
    result = engine.run(payload)

    assert result['bending']['governing'] == 'C1'
    combo = result['bending']['combinations'][0]
    assert combo['id'] == 'C1'
    assert combo['name'] == ''
    assert close(combo['M_Rd'], -M_RD_BEAM)
    assert close(result['bending']['M_Rd'], -M_RD_BEAM)


def test_mc_active_combo_is_set_only_for_moment_curvature():
    payload = load('payload-beam-300x600.json')
    bending = engine.run(payload)
    assert 'mc_active_combo' not in bending['meta']

    payload['analysis'] = 'moment_curvature'
    mc = engine.run(payload)
    assert mc['meta']['mc_active_combo'] == 'C1'
    assert len(mc['moment_curvature']['combinations']) == 1
    assert mc['moment_curvature']['combinations'][0]['id'] == 'C1'


def test_every_analysis_block_carries_combinations_and_governing():
    """§4.3: `combinations`, `governing` OG `shear_governing` skal finnes i HVER analyseblokk.

    M–κ har bare én kombinasjon å velge governing blant, men nøkkelen skal likevel stå
    der — den committede fixturen har `M_Ed = 0` og altså `utilisation = 0.0`, nøyaktig
    regel 3 sitt uavgjort-tilfelle, så et manglende `governing` her ville vist seg som
    `None` i stedet for `'C1'`.

    `shear_governing` skal stå der på samme vilkår, og være `None` når fixturen ikke har
    noen `section.shear` i det hele tatt — nøkkelen skal finnes, ikke verdien gjettes.
    """
    payload = load('payload-beam-300x600.json')
    assert 'shear' not in payload['section']       # forutsetningen for None-påstanden under
    for analysis in ('bending', 'moment_curvature', 'nm_domain'):
        payload['analysis'] = analysis
        block = engine.run(payload)[analysis]
        assert 'combinations' in block, analysis
        assert 'governing' in block, analysis
        assert block['governing'] == 'C1', analysis
        assert 'shear_governing' in block, analysis
        assert block['shear_governing'] is None, analysis


def _shear_analysis_independence_payload():
    """To kombinasjoner der SKJÆR styres av en ANNEN rad enn bøyning og enn den aktive.

    `C1` er aktiv og styrer bøyning (stor `M_Ed`, ingen skjærlast). `C2` styrer skjær
    (liten `M_Ed`, stor `V_Ed`) og er hverken aktiv eller bøyningens governing. Det er
    nettopp den konstellasjonen som avslører at en analyse bare skjærløser den aktive
    raden: da MÅ `shear_governing` bli `C1`, som er feil.
    """
    payload = _shear_reference_payload()
    payload['loads'] = {
        'combinations': [
            {'id': 'C1', 'name': 'bending-critical', 'N_Ed': 0.0, 'M_Ed': -200000000.0,
             'theta': 0.0, 'V_Ed': 0.0},
            {'id': 'C2', 'name': 'shear-critical', 'N_Ed': 0.0, 'M_Ed': -1000000.0,
             'theta': 0.0, 'V_Ed': 300000.0},
        ],
        'active': 'C1',
    }
    return payload


def test_shear_governing_is_the_same_row_in_every_analysis():
    """§10 C2: skjærresultatet skal være det samme uansett hvilken analyse som kjøres.

    Før rettelsen løste `moment_curvature` bare den AKTIVE kombinasjonen, og
    `shear_governing` kunne per definisjon aldri peke på noen annen rad enn den aktive.
    Her er den aktive raden (`C1`) ikke skjærkritisk, så M–κ ville svart `C1` der bøying
    og M–N svarte `C2`.
    """
    seen = {}
    for analysis in ('bending', 'moment_curvature', 'nm_domain'):
        payload = _shear_analysis_independence_payload()
        payload['analysis'] = analysis
        block = engine.run(payload)[analysis]
        assert block['shear_governing'] == 'C2', analysis
        assert block['governing'] == 'C1', analysis     # bøying styres fortsatt av C1
        seen[analysis] = [c['id'] for c in block['combinations']]
    assert seen['moment_curvature'] == ['C1', 'C2']     # alle radene, i payload-rekkefølge
    assert seen['moment_curvature'] == seen['bending'] == seen['nm_domain']


def test_shear_block_and_shear_checks_are_bit_identical_across_analyses():
    """Kjernekravet i §10 C2: SAMME payload ⇒ nøyaktig samme skjærtall i alle tre analysene.

    Sammenligningen er `==` på hele skjærdikten per kombinasjon — ikke `close()` — fordi
    skjær ikke bruker tøyningsplanet i det hele tatt (`_shear_result` leser bare geometri,
    `M_Ed`-fortegnet, `N_Ed`, `V_Ed` og materialene). Da finnes det ingen numerisk drift
    som kan unnskylde et avvik: tallene skal være identiske, ikke bare like.
    """
    shear_keys = ('shear_ok', 'asw_min_ok', 'stirrup_spacing_ok')
    per_combo = {}
    checks = {}
    governing = {}
    for analysis in ('bending', 'moment_curvature', 'nm_domain'):
        payload = _shear_analysis_independence_payload()
        payload['analysis'] = analysis
        result = engine.run(payload)
        block = result[analysis]
        per_combo[analysis] = {c['id']: c['shear'] for c in block['combinations']}
        checks[analysis] = {k: result['checks'][k] for k in shear_keys}
        governing[analysis] = block['shear_governing']

    ref = per_combo['bending']
    assert set(ref) == {'C1', 'C2'}
    # Skjæret er evaluert for BEGGE radene, ellers sier likheten under ingenting.
    assert all(ref[cid]['evaluated'] is True for cid in ref)
    for analysis in ('moment_curvature', 'nm_domain'):
        assert per_combo[analysis] == ref, analysis
        assert checks[analysis] == checks['bending'], analysis
        assert governing[analysis] == governing['bending'], analysis


def test_moment_curvature_curve_still_belongs_to_the_active_combination():
    """Bare kombinasjonsløkka og skjæret ble utvidet — KURVEN er fortsatt den aktive radens.

    `C2` har både mindre `M_Ed` og en helt annen last enn den aktive `C1`. Ville kurven
    blitt regnet for governing eller for første rad, ville `M_Ed`/`mc_active_combo` her
    pekt et annet sted.
    """
    payload = _shear_analysis_independence_payload()
    payload['analysis'] = 'moment_curvature'
    payload['loads']['active'] = 'C2'
    result = engine.run(payload)
    mc = result['moment_curvature']

    assert result['meta']['mc_active_combo'] == 'C2'
    assert close(mc['M_Ed'], -1000000.0)
    assert mc['governing'] == 'C2'                  # blokka handler om den aktive raden
    assert mc['shear_governing'] == 'C2'
    assert len(mc['combinations']) == 2             # men skjæret dekker begge radene
    assert len(mc['kappa']) > 0

    # Den IKKE-aktive raden er med bare for skjæret: bøyefeltene står tomme med vilje,
    # fordi en bruddtilstand her ville blitt betalt på nytt for hvert κ-punkt.
    idle = next(c for c in mc['combinations'] if c['id'] == 'C1')
    assert idle['M_Rd'] is None and idle['utilisation'] is None
    assert idle['within_limits'] is True            # aksialsjekken er likevel gjort
    assert idle['shear']['evaluated'] is True


def test_moment_curvature_falls_back_to_the_active_row_not_the_first_one():
    """Er den AKTIVE raden utenfor `[n_min, n_max]`, finnes ingen `governing` — og da må
    M–κ-blokka fortsatt speile den aktive raden, ikke bare snuble tilbake til `combinations[0]`.

    Denne raden ville ikke eksistert før rettelsen (M–κ hadde bare én rad i lista), så
    reserveregelen «første rad» er nå aktivt farlig: her er første rad en helt annen,
    gyldig kombinasjon.
    """
    payload = _shear_reference_payload()
    payload['analysis'] = 'moment_curvature'
    payload['loads'] = {
        'combinations': [
            {'id': 'C1', 'name': 'valid', 'N_Ed': 0.0, 'M_Ed': -150000000.0,
             'theta': 0.0, 'V_Ed': 10000.0},
            {'id': 'C2', 'name': 'out-of-range', 'N_Ed': -5000000.0, 'M_Ed': -1000000.0,
             'theta': 0.0, 'V_Ed': 0.0},
        ],
        'active': 'C2',
    }
    result = engine.run(payload)
    mc = result['moment_curvature']

    assert result['meta']['mc_active_combo'] == 'C2'
    assert mc['governing'] is None                  # den aktive raden er ikke en kandidat
    assert result['ok'] is False
    assert close(mc['M_Ed'], -1000000.0)            # den AKTIVE radens last, ikke C1 sin
    assert mc['kappa'] == []
    assert result['checks']['axial_ok'] is False


def test_bar_in_compression_zone_warning_is_quantitative():
    payload = load('payload-beam-300x600.json')
    payload['section']['rebar'].append({
        'id': 'L2', 'kind': 'bars', 'area': 226.1946710584651,
        'bars': [
            {'y': -100.0, 'z': 250.0, 'dia': 12.0},
            {'y': 100.0, 'z': 250.0, 'dia': 12.0},
        ],
    })
    result = engine.run(payload)
    hits = [w for w in result['warnings'] if w['code'] == 'bar_in_compression_zone']
    assert len(hits) == 1
    assert 'L2' in hits[0]['message']
    assert 'kNm' in hits[0]['message']      # kvantitativt anslag, ikke «marginalt»
    assert hits[0]['severity'] == 'warning'


def test_subtract_bar_area_punches_holes_for_bars_and_strips():
    for name in ('payload-beam-300x600.json', 'payload-slab-1000x200.json'):
        payload = load(name)
        payload['options']['subtract_bar_area'] = True
        engine.reset_cache()
        result = engine.run(payload)
        assert result['ok'] is True
        assert result['meta']['subtract_bar_area'] is True
        # Jernene ligger i strekksonen, der parabel-rektangelloven gir null
        # betongspenning, så momentet skal være praktisk talt uendret. Fikstueren kan
        # holde det gamle (positive) eller det nye (rå, negative) tallet, se
        # `test_beam_bending_matches_fixture` — sammenlign derfor størrelsen.
        fixture_m_rd = load(f'result-bending-{name[8:-5]}.json')['bending']['M_Rd']
        assert close(abs(result['bending']['M_Rd']), abs(fixture_m_rd), rel=1e-6)
        assert result['bending']['M_Rd'] < 0    # begge fixturene har underkantarmering


def test_as_min_failure_sets_check_and_warning():
    payload = load('payload-beam-300x600.json')
    payload['section']['rebar'] = [{
        'id': 'L1', 'kind': 'bars', 'area': 56.5486677646,
        'bars': [{'y': 0.0, 'z': -250.0, 'dia': 8.0}],
    }]
    result = engine.run(payload)
    assert result['checks']['as_min_ok'] is False
    assert result['checks']['all_ok'] is False
    assert any(w['code'] == 'as_min_not_met' for w in result['warnings'])


def test_bar_outside_section_is_caught():
    payload = load('payload-beam-300x600.json')
    payload['section']['rebar'][0]['bars'][0]['z'] = -400.0
    result = engine.run(payload)
    assert result['checks']['geometry_ok'] is False
    assert any(w['code'] == 'bar_outside_section' for w in result['warnings'])


def test_unknown_integrator_is_rejected_not_silently_downgraded():
    payload = load('payload-beam-300x600.json')
    payload['options']['integrator'] = 'fiber'
    result = engine.run(payload)
    assert result['ok'] is False
    assert 'triangle' in result['error']['detail']


# ------------------------------------------------------------------ #
# Skjær — EC2 6.2 (v4-planens §3–4)
# ------------------------------------------------------------------ #

# Referansesnittet planens §4.1a/§4.1b måler på: 300×600, C30/37, α_cc = 1,0 (samme
# materialer som `payload-beam-300x600.json`), men med `dc = 53` for UK-armeringen
# (`cover 35 + stirrup_dia 8 + dia/2`) i stedet for fixturens runde `dc = 50` — derfor
# bygges dette snittet direkte her og IKKE fra fixturfila. `z = -247` (UK, 3Ø20) og
# `z = +251` (OK, 2Ø12) gir nøyaktig de `A_sl`/`d`-tallene planen oppgir.
def _shear_reference_payload(stirrups=None):
    payload = load('payload-beam-300x600.json')
    payload['section']['rebar'] = [
        {
            'id': 'L1', 'kind': 'bars', 'area': 942.4777960769379,
            'bars': [{'y': y, 'z': -247.0, 'dia': 20.0} for y in (-100.0, 0.0, 100.0)],
        },
        {
            'id': 'L2', 'kind': 'bars', 'area': 226.19467105846502,
            'bars': [{'y': -100.0, 'z': 251.0, 'dia': 12.0},
                     {'y': 100.0, 'z': 251.0, 'dia': 12.0}],
        },
    ]
    if stirrups is None:
        stirrups = [{'id': 'S1', 'dia': 8.0, 'spacing': 150.0, 'legs': 2, 'fywk': 500.0,
                     'alpha': 90.0}]
    payload['section']['shear'] = {
        'strut_angle_deg': 45.0,
        'z_factor': 0.9,
        'stirrups': stirrups,
    }
    return payload


def test_ned_for_shear_flips_the_sign():
    """Én funksjon som ikke gjør noe annet (plan §4.1a) — egen test som akseptkriteriet
    krever."""
    assert engine._ned_for_shear(500000.0) == -500000.0
    assert engine._ned_for_shear(-500000.0) == 500000.0
    assert engine._ned_for_shear(0.0) == 0.0


@pytest.mark.parametrize('n_ed_tension_positive,expected_vrdc', [
    (0.0, 81615.2393),          # N_Ed = 0
    (-500000.0, 149990.24),     # 500 kN TRYKK i vår konvensjon (N_Ed < 0)
    (500000.0, 13240.24),       # 500 kN STREKK i vår konvensjon (N_Ed > 0)
])
def test_shear_ned_sign_matches_measured_vrdc(n_ed_tension_positive, expected_vrdc):
    """Planens §4.1a-tabell: snudd fortegn gir en elleve gangers overestimering på et
    strekksnitt. `A_sl = 942,4778`, `d = 547` (feltmoment, UK-armeringen alene)."""
    payload = _shear_reference_payload(stirrups=[])   # bare V_Rd,c er under test her
    payload['loads']['N_Ed'] = n_ed_tension_positive
    payload['loads']['M_Ed'] = -1.0   # < 0 ⇒ feltmoment ⇒ strekkside UK (theta = 0)
    result = engine.run(payload)

    shear = result['bending']['combinations'][0]['shear']
    assert shear['evaluated'] is True
    assert close(shear['Asl'], 942.4777960769379)
    assert close(shear['d'], 547.0)
    assert close(shear['V_Rd_c'], expected_vrdc, rel=1e-5)
    assert shear['V_Rd'] == shear['V_Rd_c']
    assert shear['governing_mode'] == 'no_stirrups'


def test_shear_asl_and_d_are_geometric_from_the_moment_sign():
    """Planens §4.1b: samme snitt, felt gir UK-armeringen, støtte gir OK-armeringen —
    rent geometrisk, ikke fra tøyningsplanet."""
    sagging = _shear_reference_payload(stirrups=[])
    sagging['loads']['N_Ed'] = 0.0
    sagging['loads']['M_Ed'] = -1.0     # feltmoment
    sag_shear = engine.run(sagging)['bending']['combinations'][0]['shear']
    assert close(sag_shear['Asl'], 942.4777960769379)
    assert close(sag_shear['d'], 547.0)
    assert close(sag_shear['V_Rd_c'], 81615.2393, rel=1e-5)

    hogging = _shear_reference_payload(stirrups=[])
    hogging['loads']['N_Ed'] = 0.0
    hogging['loads']['M_Ed'] = 1.0      # støttemoment
    # `theta` kommer fra `options.theta` (gammel `loads`-form) — engine.py utleder den
    # ALDRI fra fortegnet til M_Ed selv; det er payload.js sin jobb (plan §1.3).
    hogging['options']['theta'] = math.pi
    hog_shear = engine.run(hogging)['bending']['combinations'][0]['shear']
    assert close(hog_shear['Asl'], 226.19467105846502)
    assert close(hog_shear['d'], 551.0)
    assert close(hog_shear['V_Rd_c'], 64281.8718, rel=1e-5)

    # Feil side på et støttemoment ville gitt +27 % på usikker side (planens tall).
    assert hog_shear['V_Rd_c'] < sag_shear['V_Rd_c']


def test_shear_zero_moment_picks_the_least_asl_and_flags_ambiguous():
    """§4.1b: `M_Ed = 0` har ingen strekkside fra momentet — den MINSTE (strengeste)
    `A_sl` av de to brukes, med en `shear_asl_ambiguous`-advarsel som gjør valget synlig."""
    payload = _shear_reference_payload(stirrups=[])
    payload['loads']['N_Ed'] = 0.0
    payload['loads']['M_Ed'] = 0.0
    result = engine.run(payload)

    shear = result['bending']['combinations'][0]['shear']
    # OK-laget (226,19) er mindre enn UK-laget (942,48) — den strengeste av de to.
    assert close(shear['Asl'], 226.19467105846502)
    assert close(shear['d'], 551.0)

    hits = [w for w in result['warnings'] if w['code'] == 'shear_asl_ambiguous']
    assert len(hits) == 1
    assert hits[0]['severity'] == 'info'
    assert hits[0]['combo'] == 'C1'


def test_shear_full_result_matches_measured_numbers():
    """Planens §4.2-eksempel, tall for tall: `V_Ed = 120 000 N` på feltmoment-siden."""
    payload = _shear_reference_payload()
    payload['loads']['N_Ed'] = 0.0
    payload['loads']['M_Ed'] = -1.0
    payload['loads']['V_Ed'] = 120000.0
    result = engine.run(payload)

    shear = result['bending']['combinations'][0]['shear']
    assert shear['evaluated'] is True
    assert close(shear['V_Ed'], 120000.0)
    assert close(shear['V_Rd_c'], 81615.2393, rel=1e-5)
    assert close(shear['V_Rd_s'], 143453.3, rel=1e-5)
    assert close(shear['V_Rd_max'], 779803.2, rel=1e-5)
    assert close(shear['V_Rd'], shear['V_Rd_s'])                  # min(V_Rd_s, V_Rd_max)
    assert shear['governing_mode'] == 'stirrups'
    assert close(shear['utilisation'], 0.83651, rel=1e-4)
    assert close(shear['z'], 492.3, rel=1e-5)
    assert close(shear['asw_s'], 0.670206, rel=1e-5)
    assert close(shear['asw_s_min'], 0.262907, rel=1e-5)
    assert close(shear['asw_s_required'], 0.560634, rel=1e-5)
    assert close(shear['sl_max'], 410.25)
    assert close(shear['st_max'], 410.25)

    # EC2 6.2.3(2): V_Rd,c legges ALDRI til V_Rd,s.
    assert shear['V_Rd'] != shear['V_Rd_c'] + shear['V_Rd_s']


def test_shear_without_stirrups_falls_back_to_vrdc_and_stays_exempt():
    """§9-akseptet: tom bøyleliste ⇒ `V_Rd = V_Rd,c`, mode `no_stirrups`, INGEN
    `asw_below_minimum` (den koden hører uansett hjemme i `section.js`/D2, men motorens
    `checks.asw_min_ok` skal følge samme unntak, EC2 6.2.1(4)/9.3.2, plan §4.4)."""
    payload = _shear_reference_payload(stirrups=[])
    payload['loads']['N_Ed'] = 0.0
    payload['loads']['M_Ed'] = -1.0
    result = engine.run(payload)

    shear = result['bending']['combinations'][0]['shear']
    assert shear['governing_mode'] == 'no_stirrups'
    assert shear['V_Rd'] == shear['V_Rd_c']
    assert shear['V_Rd_s'] is None
    assert shear['V_Rd_max'] is None

    assert result['checks']['asw_min_ok'] is True
    assert result['checks']['stirrup_spacing_ok'] is True
    assert not [w for w in result['warnings'] if w['code'] == 'asw_below_minimum']


def test_shear_absent_from_payload_leaves_old_fixtures_untouched():
    """Ingen `section.shear` (alle fixturer før v4) ⇒ `shear: None` og de tre nye
    kontrollene vakuøst sanne — ikke en feil, bare fravær av skjærdata."""
    result = engine.run(load('payload-beam-300x600.json'))
    combo = result['bending']['combinations'][0]
    assert combo['shear'] is None
    assert combo['V_Ed'] == 0.0
    assert result['checks']['shear_ok'] is True
    assert result['checks']['asw_min_ok'] is True
    assert result['checks']['stirrup_spacing_ok'] is True


def test_slab_runs_with_shear_config_without_error():
    """Standardplata: `bw = sectionWidth = 1000` (per meter), ingen bøyler i v1-standarden
    for plate ⇒ `no_stirrups`-veien, og INGEN feil."""
    payload = load('payload-slab-1000x200.json')
    payload['section']['shear'] = {
        'strut_angle_deg': 45.0, 'z_factor': 0.9, 'stirrups': [],
    }
    result = engine.run(payload)

    assert result['ok'] is True
    shear = result['bending']['combinations'][0]['shear']
    assert shear['evaluated'] is True
    assert close(shear['bw'], 1000.0)
    assert shear['governing_mode'] == 'no_stirrups'
    assert result['checks']['asw_min_ok'] is True


def test_shear_governing_can_differ_from_bendings_governing():
    """§4.3: en rad med stor `V_Ed` og lite `M_Ed` skal kunne styre skjær uten å være i
    nærheten av å styre bøying — et eget merke, ikke slått sammen med η_M (§4.3)."""
    payload = _shear_reference_payload()
    payload['loads'] = {
        'combinations': [
            # Styrer BØYNING: stor M_Ed, ingen skjærlast.
            {'id': 'C1', 'name': 'bending-critical', 'N_Ed': 0.0, 'M_Ed': -200000000.0,
             'theta': 0.0, 'V_Ed': 0.0},
            # Styrer SKJÆR: liten M_Ed (lav bøyeutnyttelse), stor V_Ed.
            {'id': 'C2', 'name': 'shear-critical', 'N_Ed': 0.0, 'M_Ed': -1000000.0,
             'theta': 0.0, 'V_Ed': 300000.0},
        ],
        'active': 'C1',
    }
    result = engine.run(payload)

    assert result['bending']['governing'] == 'C1'
    assert result['bending']['shear_governing'] == 'C2'
    assert result['bending']['governing'] != result['bending']['shear_governing']


# ------------------------------------------------------------------ #
# STEG 2 — lastkombinasjonstype (uls / characteristic / quasi_permanent)
# ------------------------------------------------------------------ #

def test_r8_a_characteristic_row_never_changes_a_single_number_the_uls_row_alone_would_give():
    """R8 — DEN STERKESTE ENKELTPÅSTANDEN i STEG 2. En SLS-rad ved siden av en
    uls-rad skal aldri endre et eneste tall `checks` viser: `checks` er
    BIT-IDENTISK med en kjøring UTEN SLS-raden i det hele tatt.
    """
    payload = load('payload-beam-300x600.json')
    payload['loads'] = {
        'combinations': [
            {'id': 'C1', 'name': 'ULS 1', 'type': 'uls', 'N_Ed': 0.0, 'M_Ed': 150000000.0,
             'theta': 0.0},
        ],
        'active': 'C1',
    }
    uls_only = engine.run(copy.deepcopy(payload))

    payload['loads']['combinations'].append({
        'id': 'C2', 'name': 'SLS 1', 'type': 'characteristic', 'N_Ed': -100000.0,
        'M_Ed': 80000000.0, 'theta': 0.0,
    })
    with_sls = engine.run(payload)

    assert with_sls['ok'] is True
    assert with_sls['bending']['governing'] == 'C1'
    assert with_sls['checks'] == uls_only['checks']
    assert close(with_sls['bending']['M_Rd'], uls_only['bending']['M_Rd'])

    sls_row = next(c for c in with_sls['bending']['combinations'] if c['id'] == 'C2')
    assert sls_row['type'] == 'characteristic'
    assert sls_row['checked'] is False
    assert sls_row['within_limits'] is None      # ALDRI False — aksialsjekken ble aldri kjørt
    assert sls_row['M_Rd'] is None
    assert sls_row['flexure_solved'] is False
    assert sls_row['shear'] is None


def test_r9_a_characteristic_row_with_a_huge_v_ed_never_governs_shear():
    """R9 — en `characteristic`-rad med `V_Ed` stor nok til å briste skal likevel
    ALDRI kunne bli `shear_governing`, og skjærkontrollen (`shear_ok`) forblir sann:
    raden har `shear: None`, den er aldri en kandidat i utgangspunktet.
    """
    payload = _shear_reference_payload()
    payload['loads'] = {
        'combinations': [
            {'id': 'C1', 'name': 'ULS 1', 'type': 'uls', 'N_Ed': 0.0, 'M_Ed': -1.0,
             'theta': 0.0, 'V_Ed': 10000.0},
            {'id': 'C2', 'name': 'SLS 1', 'type': 'characteristic', 'N_Ed': 0.0,
             'M_Ed': -1.0, 'theta': 0.0, 'V_Ed': 5000000.0},
        ],
        'active': 'C1',
    }
    result = engine.run(payload)

    assert result['ok'] is True
    assert result['checks']['shear_ok'] is True
    assert result['bending']['shear_governing'] != 'C2'
    row = next(c for c in result['bending']['combinations'] if c['id'] == 'C2')
    assert row['shear'] is None
    assert row['checked'] is False


def test_r10_a_leading_sls_row_does_not_break_the_reference_used_for_section_props():
    """R10 — rad 0 er `characteristic`, rad 1 er den ENESTE `uls`-raden.
    `_select_governing` filtrerer på `checked` (§E5), så `section_props`/`checks`
    regnes mot rad 1 — `as_min_ok` skal IKKE bli `None` bare fordi den FØRSTE
    raden i lista tilfeldigvis er en SLS-rad.
    """
    payload = load('payload-beam-300x600.json')
    payload['loads'] = {
        'combinations': [
            {'id': 'C1', 'name': 'SLS 1', 'type': 'characteristic', 'N_Ed': 0.0,
             'M_Ed': 0.0, 'theta': 0.0},
            {'id': 'C2', 'name': 'ULS 1', 'type': 'uls', 'N_Ed': 0.0, 'M_Ed': 150000000.0,
             'theta': 0.0},
        ],
        'active': 'C2',
    }
    result = engine.run(payload)

    assert result['ok'] is True
    assert result['bending']['governing'] == 'C2'
    assert result['section_props']['d_eff'] is not None
    assert result['checks']['as_min_ok'] is not None


def test_r11_axial_ok_is_not_upset_by_an_sls_row_with_within_limits_none():
    """R11 — `axial_ok = all(... if c['checked'])` (§E5): en SLS-rad med
    `within_limits: None` skal ALDRI kunne velte `axial_ok`. Uten filteret ville
    `all([True, None])` gitt `False` — Python regner `None` som usant i `all()`.
    """
    payload = load('payload-beam-300x600.json')
    payload['loads'] = {
        'combinations': [
            {'id': 'C1', 'name': 'ULS 1', 'type': 'uls', 'N_Ed': 0.0, 'M_Ed': 0.0,
             'theta': 0.0},
            {'id': 'C2', 'name': 'SLS 1', 'type': 'characteristic', 'N_Ed': 0.0,
             'M_Ed': 0.0, 'theta': 0.0},
        ],
        'active': 'C1',
    }
    result = engine.run(payload)

    row = next(c for c in result['bending']['combinations'] if c['id'] == 'C2')
    assert row['within_limits'] is None
    assert result['checks']['axial_ok'] is True


def test_r12_no_uls_row_at_all_gives_a_different_error_than_axial_out_of_range():
    """R12 — TO ULIKE SITUASJONER, TO ULIKE MELDINGER (§E6). Ingen `uls`-rad i det
    hele tatt: `ok is False`, koden er `no_uls_combination` — IKKE
    `axial_out_of_range` — meldingen nevner ikke aksialkraftområdet, `checks`
    FINNES fortsatt, og `checks['all_ok'] is None` (§F i v5-avviket).
    """
    payload = load('payload-beam-300x600.json')
    payload['loads'] = {
        'combinations': [
            {'id': 'C1', 'name': 'SLS 1', 'type': 'characteristic', 'N_Ed': 0.0,
             'M_Ed': 0.0, 'theta': 0.0},
            {'id': 'C2', 'name': 'SLS 2', 'type': 'quasi_permanent', 'N_Ed': 0.0,
             'M_Ed': 0.0, 'theta': 0.0},
        ],
        'active': 'C1',
    }
    result = engine.run(payload)

    assert result['ok'] is False
    assert result['error']['code'] == 'no_uls_combination'
    assert 'axial force' not in result['error']['message']
    assert 'kN' not in result['error']['message']
    assert 'checks' in result
    assert result['checks']['all_ok'] is None
    assert all(c['checked'] is False for c in result['bending']['combinations'])
    json.dumps(result, allow_nan=False)


@pytest.mark.parametrize('payload_name,result_name', [
    ('payload-beam-300x600.json', 'result-bending-beam-300x600.json'),
    ('payload-slab-1000x200.json', 'result-bending-slab-1000x200.json'),
    ('payload-beam-300x600-combos.json', 'result-bending-beam-300x600.json'),
    ('payload-slab-1000x200-combos.json', 'result-bending-slab-1000x200.json'),
])
def test_r13_a_payload_with_no_type_field_at_all_gives_unchanged_numbers(payload_name, result_name):
    """R13 — RENT ADDITIVITETSKRAV. De FIRE committede payload-fixturene har
    ALDRI hatt et `type`-felt (de er fra før STEG 2). `checks`, `M_Rd` og HELE
    skjærdikten på hver rad skal fortsatt matche `result-*.json` EKSAKT — bare
    med `type: 'uls'`/`checked: True` lagt til additivt.
    """
    payload = load(payload_name)
    expected = load(result_name)
    result = engine.run(payload)

    assert result['ok'] is True
    assert result['checks'] == expected['checks']
    assert close(result['bending']['M_Rd'], expected['bending']['M_Rd'])

    got_rows = {c['id']: c for c in result['bending']['combinations']}
    want_rows = {c['id']: c for c in expected['bending']['combinations']}
    assert got_rows.keys() == want_rows.keys()
    for cid, want in want_rows.items():
        got = got_rows[cid]
        # NYE felt, lagt til additivt — sjekkes for seg, ikke i sammenlikningen under.
        assert got['type'] == 'uls'
        assert got['checked'] is True
        for key, value in want.items():
            if key == 'layers':
                continue
            if key == 'name':
                # `name` er IKKE en del av additivitetskravet: den gamle `loads`-
                # forma gir alltid `''` (§4.2), mens `-combos`-fixturen navngir
                # raden «ULS 1» — en forskjell mellom de to PAYLOAD-formene selv,
                # ikke noe STEG 2 rørte.
                continue
            got_val = got[key]
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                assert close(got_val, value), f'{cid}.{key}: {got_val} != {value}'
            else:
                assert got_val == value, f'{cid}.{key}: {got_val} != {value}'


def test_r14_the_old_loads_shape_gives_type_uls_and_checked_true():
    """R14 — den GAMLE `loads`-formen (`{N_Ed, M_Ed}`, uten `combinations`) skal
    ALLTID gi `type: 'uls'`, `checked: True` — den formen har ingen egen måte å
    uttrykke en type på, og skal alltid bli kontrollert, som den alltid har.
    """
    payload = load('payload-beam-300x600.json')
    assert 'combinations' not in payload['loads']
    result = engine.run(payload)
    combo = result['bending']['combinations'][0]
    assert combo['type'] == 'uls'
    assert combo['checked'] is True


def _shear_all_ok_payload(v_ed=10000.0, stirrups=None, extra_out_of_range_combo=False):
    """Én gyldig kombinasjon (`C1`) som alene skal gi `all_ok: True`, med valgfri
    ekstra kombinasjon utenfor `[n_min, n_max]` for å isolere `axial_ok`."""
    payload = _shear_reference_payload(stirrups=stirrups)
    combos = [
        {'id': 'C1', 'name': 'valid', 'N_Ed': 0.0, 'M_Ed': -150000000.0, 'theta': 0.0,
         'V_Ed': v_ed},
    ]
    if extra_out_of_range_combo:
        combos.append({
            'id': 'C2', 'name': 'out-of-range', 'N_Ed': -5000000.0, 'M_Ed': -1000000.0,
            'theta': 0.0, 'V_Ed': 0.0,
        })
    payload['loads'] = {'combinations': combos, 'active': 'C1'}
    return payload


def test_all_ok_folds_in_axial_and_shear_checks():
    """Koordinatorrettelse: `all_ok` er raden rapporten viser som «Overall assessment»
    og skal derfor IKKE kunne bli `True` med en aksialkraft utenfor `[n_min, n_max]`
    eller en strøket skjærkontroll — bøyningens fire kontroller er ikke nok alene.

    Hver av de fire NYE kontrollene (`axial_ok`, `shear_ok`, `asw_min_ok`,
    `stirrup_spacing_ok`) skal, HVER FOR SEG, kunne velte `all_ok` uten å røre de andre
    — det er nettopp den isolasjonen som ville fanget at én kontroll ble glemt i
    formelen.
    """
    baseline = engine.run(_shear_all_ok_payload())
    checks = baseline['checks']
    assert all(checks[k] is True for k in (
        'as_min_ok', 'as_max_ok', 'ductility_ok', 'axial_ok', 'geometry_ok',
        'shear_ok', 'asw_min_ok', 'stirrup_spacing_ok',
    )), checks
    assert checks['all_ok'] is True

    # axial_ok alene: C2 ligger utenfor [n_min, n_max], C1 (gyldig) forblir governing.
    axial_bad = engine.run(_shear_all_ok_payload(extra_out_of_range_combo=True))
    assert axial_bad['checks']['axial_ok'] is False
    assert axial_bad['checks']['shear_ok'] is True
    assert axial_bad['checks']['asw_min_ok'] is True
    assert axial_bad['checks']['stirrup_spacing_ok'] is True
    assert axial_bad['checks']['all_ok'] is False

    # shear_ok alene: V_Ed over V_Rd, resten av snittet uendret.
    shear_bad = engine.run(_shear_all_ok_payload(v_ed=200000.0))
    assert shear_bad['checks']['shear_ok'] is False
    assert shear_bad['checks']['axial_ok'] is True
    assert shear_bad['checks']['asw_min_ok'] is True
    assert shear_bad['checks']['stirrup_spacing_ok'] is True
    assert shear_bad['checks']['all_ok'] is False

    # asw_min_ok alene: tynne bøyler, avstand fortsatt innenfor s_l,max (410,25).
    thin_stirrups = [{'id': 'S1', 'dia': 6.0, 'spacing': 400.0, 'legs': 2, 'fywk': 500.0,
                       'alpha': 90.0}]
    asw_bad = engine.run(_shear_all_ok_payload(stirrups=thin_stirrups))
    assert asw_bad['checks']['asw_min_ok'] is False
    assert asw_bad['checks']['stirrup_spacing_ok'] is True
    assert asw_bad['checks']['axial_ok'] is True
    assert asw_bad['checks']['shear_ok'] is True
    assert asw_bad['checks']['all_ok'] is False

    # stirrup_spacing_ok alene: grovere bøyler holder Asw/s over minimum ved 450 mm c/c,
    # som likevel er over s_l,max (410,25).
    wide_stirrups = [{'id': 'S1', 'dia': 12.0, 'spacing': 450.0, 'legs': 2, 'fywk': 500.0,
                       'alpha': 90.0}]
    spacing_bad = engine.run(_shear_all_ok_payload(stirrups=wide_stirrups))
    assert spacing_bad['checks']['stirrup_spacing_ok'] is False
    assert spacing_bad['checks']['asw_min_ok'] is True
    assert spacing_bad['checks']['axial_ok'] is True
    assert spacing_bad['checks']['shear_ok'] is True
    assert spacing_bad['checks']['all_ok'] is False


def test_progress_is_a_plain_callable():
    events = []
    payload = load('payload-beam-300x600.json')
    payload['analysis'] = 'moment_curvature'
    engine.run(payload, lambda phase, done, total: events.append((phase, done, total)))

    assert events, 'motoren skal rapportere framdrift'
    assert {e[0] for e in events} <= {'section', 'solve'}
    for _phase, done, total in events:
        assert done is None or isinstance(done, int)
        assert total is None or isinstance(total, int)


class _NotCallable:
    """Stand-in for JS sin `null`, som kommer inn i Python som et `JsNull`-objekt."""


def test_a_non_callable_progress_is_ignored_not_fatal():
    """Målt under ekte Pyodide: `run_json(payload, null)` krasjet på «JsNull not callable».

    `null` er den naturlige måten en JS-konsument skriver «ingen framdrift» på, og et
    argument som bare er til pynt skal aldri kunne velte en beregning.
    """
    payload = load('payload-beam-300x600.json')
    for stand_in in (None, _NotCallable(), object(), 0, ''):
        result = engine.run(payload, stand_in)
        assert result['ok'] is True, stand_in
        assert close(result['bending']['M_Rd'], -M_RD_BEAM)


def test_engine_never_imports_js_or_pyodide():
    """§2.3 krav 1, håndhevet i stedet for bare dokumentert."""
    import re

    source = (MODULE_DIR / 'python' / 'engine.py').read_text(encoding='utf-8')
    forbidden = re.compile(r'^\s*(?:import|from)\s+(?:js|pyodide)\b', re.MULTILINE)
    assert forbidden.search(source) is None, forbidden.search(source).group(0)
    assert 'js' not in sys.modules
    assert 'pyodide' not in sys.modules


# ------------------------------------------------------------------ #
# Runde 6 §1 — treverdige kontroller, bøyekontroll og sprøbrudd
#
# Alle tallene under er MÅLT på referansebjelken (300×600, 3Ø20 UK, C30/37, B500NC) med
# motoren, ikke regnet for hånd i en plan. De står som eksplisitte konstanter fordi det er
# nettopp disse tallene akseptkriteriet er formulert med — se fila sitt hode for hvorfor
# resten sammenliknes mot fixturene i stedet.
# ------------------------------------------------------------------ #

M_CR_BEAM = 52136426.768704005          # W·f_ctm, N_Ed = 0
M_CR_BEAM_N500 = 102136426.76870401     # W·(f_ctm − N_Ed/A_c), N_Ed = −500 kN
M_RD_BEAM_HOGGING = 6387625.18409428    # underkantarmering regnet som støttemoment
M_RD_BEAM_HOGGING_N500 = 132184632.98769428


def _beam(theta=0.0, m_ed=0.0, n_ed=0.0):
    """Referansebjelken med én kombinasjon, retning og last satt direkte."""
    payload = load('payload-beam-300x600.json')
    payload['options']['theta'] = theta
    payload['loads'] = {'N_Ed': n_ed, 'M_Ed': m_ed}
    return payload


def test_bending_check_catches_a_beam_loaded_past_its_capacity():
    """Rundens hovedfeil: η = 2,33 ga «Overall assessment: OK» uten en eneste advarsel.

    `_utilisation` regnet tallet, og INGEN kontroll leste det. Denne testen ville ikke bare
    feilet før — den ville kastet `KeyError: 'bending_ok'`, for kontrollen fantes ikke.
    """
    result = engine.run(_beam(m_ed=-500000000.0))

    assert close(result['bending']['M_Rd'], -M_RD_BEAM)
    assert close(result['bending']['utilisation'], 2.3255082858460785)

    assert result['checks']['bending_ok'] is False
    assert result['checks']['all_ok'] is False
    # De øvrige kontrollene er uberørte — feilen er bøyekapasiteten alene, og en kontroll
    # som farger av på naboene ville vært like ubrukelig som ingen kontroll.
    for key in ('as_min_ok', 'as_max_ok', 'ductility_ok', 'brittle_ok', 'axial_ok',
                'geometry_ok'):
        assert result['checks'][key] is True, key

    hits = [w for w in result['warnings'] if w['code'] == 'bending_capacity_exceeded']
    assert len(hits) == 1
    assert hits[0]['severity'] == 'error'
    assert '2.325' in hits[0]['message'] or '2.3255' in hits[0]['detail']


def test_bending_threshold_is_exactly_one_without_slack():
    """η ≤ 1,0 EKSAKT. En toleranse her ville motsagt UI-et, ikke myknet det.

    `results.js` har `UTILISATION_THRESHOLDS.over = 1.0` og bruker strengt `x > 1.0` til den
    røde «Capacity exceeded»-pilla. Med en slakk på 1e-6 ville η = 1,0000005 gitt rød pille
    ved siden av en grønn kontrollrad — to svar på samme spørsmål i samme skjermbilde.

    `M_Ed` settes til nøyaktig `M_Rd`, og deretter til det NÆRMESTE flyttallet lenger unna
    null. Målt: η = 1,0 og η = 1,0000000000000002 — altså det minste avviket som overhodet
    kan uttrykkes i flyttall. Finnes det en slakk, fanges den her.

    `M_Rd` HENTES fra en kjøring og bakes ikke inn som konstant: modulens `M_RD_BEAM` er
    avrundet til to desimaler, og med den blir η = 1,000000000019 — da ville testen målt
    avrundingen i stedet for terskelen.
    """
    m_rd = engine.run(load('payload-beam-300x600.json'))['bending']['M_Rd']
    assert close(m_rd, -M_RD_BEAM)

    exactly = engine.run(_beam(m_ed=m_rd))
    assert exactly['bending']['utilisation'] == 1.0
    assert exactly['checks']['bending_ok'] is True

    one_ulp_over = engine.run(_beam(m_ed=math.nextafter(m_rd, -math.inf)))
    assert one_ulp_over['bending']['utilisation'] > 1.0
    assert one_ulp_over['checks']['bending_ok'] is False


def test_bending_check_ignores_combinations_that_were_never_solved():
    """Definisjonsmengden er `within_limits` OG `flexure_solved` (§1.2).

    I M–κ løses bøyningen bare for den aktive raden. De uløste radene har `M_Rd: None` og
    `utilisation: None`, og må falle UT av mengden i stedet for å telles som bestått — en
    rad uten bruddtilstand er ingen bestått bøyekontroll. Er den aktive raden i tillegg
    utenfor `[n_min, n_max]`, er mengden tom og kontrollen UBESVART, ikke `True`.
    """
    payload = load('payload-beam-300x600.json')
    payload['analysis'] = 'moment_curvature'
    payload['loads'] = {
        'combinations': [
            {'id': 'C1', 'name': 'valid', 'N_Ed': 0.0, 'M_Ed': -150000000.0,
             'theta': 0.0, 'V_Ed': 0.0},
            {'id': 'C2', 'name': 'out-of-range', 'N_Ed': -5000000.0, 'M_Ed': -1000000.0,
             'theta': 0.0, 'V_Ed': 0.0},
        ],
        'active': 'C2',
    }
    result = engine.run(payload)
    rows = result['moment_curvature']['combinations']

    # C1 er innenfor, men BLE IKKE LØST; C2 er løst-forsøkt, men utenfor.
    by_id = {c['id']: c for c in rows}
    assert by_id['C1']['within_limits'] is True and by_id['C1']['flexure_solved'] is False
    assert by_id['C2']['within_limits'] is False

    assert result['checks']['bending_ok'] is None
    assert result['checks']['axial_ok'] is False
    # `False` slår `None`: aksialkraften utenfor området er en ekte feil og skal vises som
    # feil, ikke som «kan ikke vurderes».
    assert result['checks']['all_ok'] is False


def test_null_never_counts_as_a_pass():
    """Støttemoment med bare underkantarmering og N = −500 kN: INGEN lag i strekk.

    Før runde 6 svarte motoren på alle spørsmålene likevel. `_effective_depth` falt tilbake
    på den geometriske strekksiden og deretter på alle lag, og fikk `d = 50 mm` og
    ρ = 6,28 % for et snitt uten armering på strekksiden. `as_min is None ⇒ True` gjorde
    A_s,min-kontrollen bestått, og `eps_s_max is not None and …` gjorde duktiliteten til et
    påstått brudd — to motsatte konvensjoner for det samme ukjente, side om side.

    Nå er begge UBESVART, og `all_ok` blir `None`, ikke `True` og ikke `False`.
    """
    result = engine.run(_beam(theta=math.pi, m_ed=5000000.0, n_ed=-500000.0))

    assert close(result['bending']['M_Rd'], M_RD_BEAM_HOGGING_N500)
    assert result['bending']['eps_s_max'] < 0        # ingenting står i strekk
    assert result['bending']['failure_mode'] == 'compression_no_tension'

    props = result['section_props']
    assert props['d_eff'] is None
    assert props['As_min'] is None
    assert props['rho'] is None
    assert result['bending']['x_over_d'] is None
    assert props['As_tension'] == 0.0
    assert close(props['As_total'], 942.4777960769379)   # armeringen er der, bare i trykk

    checks = result['checks']
    assert checks['ductility_ok'] is None
    assert checks['as_min_ok'] is None
    assert checks['all_ok'] is None
    # Det som FAKTISK kunne avgjøres, ble avgjort.
    assert checks['axial_ok'] is True
    assert checks['bending_ok'] is True
    assert checks['brittle_ok'] is True


def test_a_false_check_beats_a_null_check():
    """N = −20000 kN: ingen bruddtilstand i det hele tatt, men aksialkraften ER for stor.

    Alle fire bøyekontrollene blir `None` — det finnes ikke noe å hevde noe om — mens
    `axial_ok` er et ekte `False`. `all_ok` skal da være `False`, ikke `None`: et brudd får
    ikke gjemme seg bak en ubesvart kontroll.
    """
    result = engine.run(_beam(theta=math.pi, m_ed=5000000.0, n_ed=-20000000.0))

    assert result['ok'] is False
    assert result['bending']['combinations'][0]['within_limits'] is False
    assert result['bending']['M_Rd'] is None

    checks = result['checks']
    for key in ('bending_ok', 'brittle_ok', 'ductility_ok', 'as_min_ok'):
        assert checks[key] is None, key
    assert checks['axial_ok'] is False
    assert checks['all_ok'] is False


def test_assessment_incomplete_names_the_checks_that_are_null():
    """En «–» i «Overall assessment» skal aldri stå uforklart (§1.1).

    Grunnen til `null` ligger i `warnings`, aldri i kontrollverdien — så advarselen må
    navngi NØYAKTIG de kontrollene som ble ubesvart, og ingen andre.
    """
    result = engine.run(_beam(theta=math.pi, m_ed=5000000.0, n_ed=-500000.0))
    hits = [w for w in result['warnings'] if w['code'] == 'assessment_incomplete']
    assert len(hits) == 1

    null_keys = {k for k, v in result['checks'].items() if v is None} - {'all_ok'}
    assert null_keys == {'ductility_ok', 'as_min_ok'}
    # GRUNNENE MAA LIGGE I `detail`, ikke i `message`: `describeWarning` i
    # `js/results.js` kaster motorens `message` for enhver kode den kjenner og viser
    # bare `detail`. Laa de i `message`, fikk brukeren aldri vite hvorfor «–» sto der.
    for key in null_keys:
        assert key in hits[0]['detail'], key
        assert null_keys != set(), key
    # Og hver noekkel skal ha en FORKLARING etter kolon, ikke bare staa oppramset.
    for key in null_keys:
        i = hits[0]['detail'].index(key + ':')
        assert len(hits[0]['detail'][i + len(key) + 1:].strip()) > 20, key
    assert str(len(null_keys)) in hits[0]['message']

    # Og motsatt: er ingenting ubesvart, skal advarselen ikke finnes.
    clean = engine.run(load('payload-beam-300x600.json'))
    assert not [w for w in clean['warnings'] if w['code'] == 'assessment_incomplete']


def test_brittle_check_catches_the_unreinforced_tension_zone():
    """`|M_Rd| ≥ M_cr` — den fysiske kontrollen A_s,min bare er et surrogat for.

    Referansebjelken regnet som STØTTEmoment har all armeringen i trykksonen. A_s,min blir
    22,6 mm² (fordi `d` degenererer til 50 mm) mot 942 mm² armering og består med 42×
    margin, mens kapasiteten på 6,4 kNm ligger langt under riss-momentet på 52,1 kNm.
    Snittet går i stykker i det øyeblikket det risser. EC2 9.2.1.1(1) sier selv at et slikt
    snitt «should be considered as unreinforced».
    """
    result = engine.run(_beam(theta=math.pi, m_ed=5000000.0))

    assert close(result['bending']['M_Rd'], M_RD_BEAM_HOGGING)
    assert close(result['section_props']['M_cr'], M_CR_BEAM)

    assert result['checks']['brittle_ok'] is False
    assert result['checks']['all_ok'] is False
    # A_s,min består fortsatt — og det er hele poenget med at kontrollen måtte legges til.
    assert result['checks']['as_min_ok'] is True

    hits = [w for w in result['warnings'] if w['code'] == 'brittle_failure_risk']
    assert len(hits) == 1
    assert hits[0]['severity'] == 'error'


def test_unreinforced_tension_zone_is_the_failure_mode_reported():
    """Bruddformen skal si det handlingsbare, ikke det formelt forsvarlige.

    `over_reinforced` var ikke galt som tøyningstilstand — betongen knuses før jernet
    flyter — men det sier «du har for mye armering» til en som har for lite på den siden
    det gjelder. Den nye verdien står FORAN `steel_rupture` i `_classify`.
    """
    result = engine.run(_beam(theta=math.pi, m_ed=5000000.0))
    assert result['bending']['failure_mode'] == 'unreinforced_tension_zone'

    # Men bare når kapasiteten faktisk ligger under riss-momentet: den samme bjelken som
    # FELTmoment har M_Rd = 215,0 kNm ≫ M_cr og skal beholde sin egen bruddform.
    sagging = engine.run(load('payload-beam-300x600.json'))
    assert sagging['bending']['failure_mode'] == 'concrete_crushing'
    assert sagging['checks']['brittle_ok'] is True


def test_m_cr_uses_fctm_and_rises_with_axial_compression():
    """`M_cr = W·(f_ctm − N_Ed/A_c)` med `W = b·h²/6`, og `f_ctm` — IKKE `f_ctm,fl`.

    Valget er besluttet, ikke tilfeldig: samme `f_ct,eff` som EC2 9.2.1.1 selv bruker, og
    kalibreringsargumentet hviler på den. For 300×600 er de to identiske uansett (EC2 3.1.8
    gir faktor 1,0 ved h = 600), så testen forankrer valget der det ER synlig: `M_cr` ved
    N = 0 skal være nøyaktig `W·f_ctm`.
    """
    zero = engine.run(load('payload-beam-300x600.json'))
    fctm = zero['materials']['fctm']
    w_section = 300.0 * 600.0 ** 2 / 6.0
    assert close(zero['section_props']['M_cr'], w_section * fctm)
    assert close(zero['section_props']['M_cr'], M_CR_BEAM)

    # Aksialtrykk (negativt N_Ed) LØFTER riss-momentet — fortegnet i `− N_Ed/A_c`.
    pressed = engine.run(_beam(theta=math.pi, m_ed=5000000.0, n_ed=-500000.0))
    assert close(pressed['section_props']['M_cr'], M_CR_BEAM_N500)
    assert pressed['section_props']['M_cr'] > zero['section_props']['M_cr']

    # Plata: samme formel per meter bredde. W = 1000·200²/6.
    slab = engine.run(load('payload-slab-1000x200.json'))
    assert close(slab['section_props']['M_cr'], 19309787.692112595)
    assert slab['checks']['brittle_ok'] is True      # 69,9 kNm/m mot 19,3 kNm/m


def test_as_min_is_checked_against_the_tension_reinforcement():
    """A_s,min skal måles mot `As_tension`, ikke mot `As_total` (§1.4).

    `rho` har brukt `As_tension` i flere runder allerede, med begrunnelsen at teller og
    nevner må gjelde den samme armeringen. Nøyaktig samme argument gjelder kontrollen; den
    ble bare ikke med. Tilfellet her er konstruert slik at de to svarer ULIKT: 1Ø8 i
    underkant og 4Ø25 i overkant, med N = −500 kN som skyver nøytralaksen ned så
    overkanten står i trykk. Målt: `As_tension` = 50,3 mm² mot `A_s,min` = 248,5 mm²,
    mens `As_total` = 2013,8 mm² ville bestått med 8× margin.
    """
    payload = _beam(n_ed=-500000.0)
    payload['section']['rebar'] = [
        {'id': 'L1', 'kind': 'bars', 'area': 50.26548245743669,
         'bars': [{'y': 0.0, 'z': -250.0, 'dia': 8.0}]},
        {'id': 'L2', 'kind': 'bars', 'area': 1963.4954084936207,
         'bars': [{'y': -80.0, 'z': 250.0, 'dia': 25.0},
                  {'y': -27.0, 'z': 250.0, 'dia': 25.0},
                  {'y': 27.0, 'z': 250.0, 'dia': 25.0},
                  {'y': 80.0, 'z': 250.0, 'dia': 25.0}]},
    ]
    result = engine.run(payload)
    props = result['section_props']

    assert close(props['d_eff'], 550.0)
    assert close(props['As_tension'], 50.26548245743669)
    assert close(props['As_min'], 248.51696759748907)
    # Den gamle regelen hadde bestått her — og det er nettopp derfor testen finnes.
    assert props['As_total'] > props['As_min']

    assert result['checks']['as_min_ok'] is False
    assert result['checks']['all_ok'] is False
    hits = [w for w in result['warnings'] if w['code'] == 'as_min_not_met']
    assert len(hits) == 1
    assert 'As_tension' in hits[0]['detail']


def test_a_layer_exactly_on_the_neutral_axis_is_not_in_tension():
    """Strekksettet er ETT begrep med ÉN definisjon: ε > 0 (§1.3).

    Regelen sto tidligere to steder i to representasjoner, og de var allerede uenige ved
    ε nøyaktig 0: `all(l['compression'])` var USANT (ε er ikke < 0), så `_classify` kalte
    snittet `over_reinforced`, mens `_effective_depth` fant en tom strekkside og falt
    tilbake på reservegrenene sine. Samme snitt, to motsatte svar på «står noe i strekk?».
    """
    rebar = [{'id': 'L1', 'kind': 'bars', 'area': 100.0,
              'bars': [{'y': 0.0, 'z': 0.0, 'dia': 10.0}]}]
    layers = [{'id': 'L1', 'z': 0.0, 'eps': 0.0, 'sigma': 0.0,
               'utilisation': 0.0, 'compression': False}]

    assert engine._tension_layers(rebar, layers) == []
    assert engine._classify(
        [], 0.0, -0.0035, 0.00217, 0.0675, 0.0035, m_rd=-1.0e6, m_cr=5.0e7,
    ) == 'compression_no_tension'

    # Og ett jern med ε > 0 er i strekksettet, uansett hvor lite.
    layers[0]['eps'] = 1e-12
    assert engine._tension_layers(rebar, layers) == rebar


def test_no_warning_quotes_a_value_that_was_never_computed():
    """§1.7, som en testbar påstand: `'None'` skal ikke forekomme i noen advarsel.

    Motoren trykte til nå ordrett «eps_s_max=None < eps_yd=0.00217» ut i rapporten —
    `describeWarning` tar alltid med `detail`. Det er en påstand om et bruddplan som aldri
    ble regnet, i det ene dokumentet en prosjekterende signerer på. Regelen bak er at en
    advarsel legges BARE når den tilhørende kontrollen er `False`, aldri på `None`.

    Scenariene under er nettopp de som PRODUSERER nullverdier og feil samtidig — kjørte vi
    bare de grønne tilfellene, ville påstanden vært tom.
    """
    paired = {
        'ductility_limit': 'ductility_ok',
        'as_min_not_met': 'as_min_ok',
        'as_max_exceeded': 'as_max_ok',
        'bending_capacity_exceeded': 'bending_ok',
        'brittle_failure_risk': 'brittle_ok',
    }
    scenarios = {
        'reference': load('payload-beam-300x600.json'),
        'slab': load('payload-slab-1000x200.json'),
        'over-utilised': _beam(m_ed=-500000000.0),
        'hogging, no tension side': _beam(theta=math.pi, m_ed=5000000.0),
        'hogging, all in compression': _beam(theta=math.pi, m_ed=5000000.0,
                                             n_ed=-500000.0),
        'axial far out of range': _beam(theta=math.pi, m_ed=5000000.0,
                                        n_ed=-20000000.0),
        'no flexural solution at all': _beam(n_ed=-4010438.409731036),
    }
    seen = set()
    for name, payload in scenarios.items():
        engine.reset_cache()
        result = engine.run(payload)
        for w in result['warnings']:
            seen.add(w['code'])
            assert 'None' not in w['message'], f'{name}: {w["code"]} message'
            assert 'None' not in w['detail'], f'{name}: {w["code"]} detail'
            # Og ingen advarsel uten en kontroll som faktisk er `False` bak seg.
            key = paired.get(w['code'])
            if key is not None:
                assert result['checks'][key] is False, f'{name}: {w["code"]}'

    # Påstanden er bare verdt noe hvis scenariene faktisk utløste advarslene som pleide å
    # sitere ikke-regnede tall. `ductility_limit` er den som trykte «eps_s_max=None».
    assert 'ductility_limit' in seen
    assert 'axial_out_of_range' in seen
    assert 'assessment_incomplete' in seen


def test_bending_warning_names_the_worst_combination():
    """Kontrollen skanner ALLE radene, og advarselen peker på den verste av dem.

    Uten `combo`/`combo_name` kaster `results.js` sin kodetabell motorens egen `message`
    (`describeWarning`), og hvilken rad det gjelder forsvinner — nøyaktig grunnen til at
    `axial_out_of_range` ble merket slik i endringsrunde 2. Én advarsel, ikke én per rad:
    grunnen er den samme for alle, og ti like meldinger ville skjult de andre advarslene.
    """
    payload = load('payload-beam-300x600.json')
    payload['loads'] = {
        'combinations': [
            {'id': 'C1', 'name': 'ULS 1', 'N_Ed': 0.0, 'M_Ed': -100000000.0,
             'theta': 0.0, 'V_Ed': 0.0},
            {'id': 'C2', 'name': 'ULS 2', 'N_Ed': 0.0, 'M_Ed': -300000000.0,
             'theta': 0.0, 'V_Ed': 0.0},
            {'id': 'C3', 'name': 'ULS 3', 'N_Ed': 0.0, 'M_Ed': -500000000.0,
             'theta': 0.0, 'V_Ed': 0.0},
        ],
        'active': 'C1',
    }
    result = engine.run(payload)

    rows = {c['id']: c for c in result['bending']['combinations']}
    assert rows['C1']['utilisation'] < 1.0        # C1 alene ville bestått
    assert rows['C2']['utilisation'] > 1.0
    assert rows['C3']['utilisation'] > 1.0

    assert result['checks']['bending_ok'] is False
    hits = [w for w in result['warnings'] if w['code'] == 'bending_capacity_exceeded']
    assert len(hits) == 1                          # ÉN, ikke to
    assert hits[0]['combo'] == 'C3'                # den verste, ikke den første
    assert hits[0]['combo_name'] == 'ULS 3'
    assert '2 of 3 combinations' in hits[0]['detail']


def test_brittle_check_does_not_undercut_as_min_where_d_is_real():
    """Kalibreringen, som er grunnen til at `brittle_ok` ikke blir en ny falsk alarm.

    A_s,min etter EC2 9.2.1.1 ER kalibrert mot nettopp `|M_Rd| ≥ M_cr`. Er `d` ekte, skal
    derfor et snitt armert nøyaktig til A_s,min ligge OVER riss-momentet — ellers ville den
    nye kontrollen feilet på snitt som er riktig dimensjonert etter standarden, og den ville
    vært ubrukelig. Måler forholdstallet direkte: 63,09 kNm mot 52,14 kNm = 1,21.

    Planen anslo 56,5 kNm og 1,08 for hånd. Tallet under er kjørt gjennom motoren, og
    konklusjonen blir sterkere, ikke svakere: marginen er større enn anslått.
    """
    payload = load('payload-beam-300x600.json')
    payload['section']['rebar'] = [{
        'id': 'L1', 'kind': 'bars', 'area': 248.51696759748907,
        'bars': [{'y': 0.0, 'z': -250.0, 'dia': 17.8}],
    }]
    result = engine.run(payload)
    props = result['section_props']

    # Armert NØYAKTIG til minimum, i full effektiv dybde.
    assert close(props['d_eff'], 550.0)
    assert close(props['As_tension'], props['As_min'])
    assert result['checks']['as_min_ok'] is True

    assert close(abs(result['bending']['M_Rd']), 63088877.50995147)
    assert close(props['M_cr'], M_CR_BEAM)
    assert abs(result['bending']['M_Rd']) / props['M_cr'] > 1.2
    # Og dermed: sprøbruddkontrollen er IKKE den bindende der `d` er ekte.
    assert result['checks']['brittle_ok'] is True


def test_brittle_check_does_not_reject_a_slab_armed_exactly_to_as_min():
    """REGRESJON: `brittle_ok` underkjente plater som oppfyller EC2 9.2.1.1 eksakt.

    A_s,min utledes med KARAKTERISTISK flytespenning (`0.26·f_ctm/f_yk·b_t·d`), mens
    `M_Rd` er en dimensjonerende kapasitet og bærer `gamma_s = 1,15`. Sammenliknes de to
    rått, blir kontrollen systematisk 1,15 ganger strengere enn kalibreringen den skal
    speile.

    Forholdet `M_Rd/M_cr` skalerer som `(d/h)²`, fordi `M_Rd ~ A_s,min·f_yd·z ~ d²` og
    `M_cr ~ h²`. Bjelker ligger på d/h ≈ 0,87–0,92 og gikk klar; plater ligger på
    0,73–0,80 og gjorde det ikke. Målt uten gamma_s: h = 200 ga 0,903 — altså en
    `error`-advarsel og `all_ok = false` på et snitt som tilfredsstiller EC2.
    """
    import math as _math
    for h, dia in ((200, 12), (250, 12), (300, 12), (600, 20)):
        payload = load('payload-slab-1000x200.json')
        payload['section']['h'] = float(h)
        payload['section']['concrete']['alpha_cc'] = 0.85
        payload['analysis'] = 'bending'
        d = h - (35 + dia / 2)
        fctm = 2.8965
        as_min = max(0.26 * fctm / 500.0 * 1000.0 * d, 0.0013 * 1000.0 * d)
        payload['section']['rebar'] = [{
            'id': 'L1', 'kind': 'strip', 'area': as_min,
            'strip': {'width': as_min / dia, 'height': float(dia), 'z': -h / 2 + 35 + dia / 2},
        }]
        payload['loads'] = {'N_Ed': 0.0, 'M_Ed': -1000.0}
        result = engine.run(payload)
        assert result['ok'] is True, (h, result.get('error'))
        checks = result['checks']
        assert checks['as_min_ok'] is True, h
        assert checks['brittle_ok'] is True, (
            f'h={h}: et snitt armert noeyaktig til A_s,min skal ikke kalles sproett. '
            f"M_Rd={abs(result['bending']['M_Rd']) / 1e6:.2f} kNm, "
            f"M_cr={result['section_props']['M_cr'] / 1e6:.2f} kNm"
        )

    # Og kontrollen skal fortsatt slaa til der den SKAL: bare underkantarmering og et
    # stoettemoment. gamma_s redder ikke et snitt uten armering paa strekksiden.
    hogging = engine.run(_beam(theta=_math.pi, m_ed=5000000.0))
    assert hogging['checks']['brittle_ok'] is False
    assert hogging['bending']['failure_mode'] == 'unreinforced_tension_zone'

# ------------------------------------------------------------------ #
# Kapasiteten kan peke MOTSATT VEI av lasten (runde 11)
# ------------------------------------------------------------------ #

def _hogging_with_tension(n_ed, m_ed=70e6):
    """Referansebjelken med 3O20 i UNDERKANT, stoettemoment og aksialstrekk.

    Stoettemoment vil si strekk i OVERKANT -- der det ikke staar ett eneste jern. Med
    nok aksialstrekk gir `calculate_bending_strength(theta=pi, n)` da et NEGATIVT
    moment, altsaa kapasiteten den andre veien.
    """
    payload = load('payload-beam-300x600.json')
    payload['options']['theta'] = math.pi
    payload['loads'] = {
        'combinations': [{'id': 'C1', 'name': 'ULS', 'N_Ed': n_ed, 'M_Ed': m_ed,
                          'theta': math.pi}],
        'active': 'C1',
    }
    return engine.run(payload)


def test_capacity_pointing_the_other_way_is_a_failure_not_a_low_utilisation():
    """MAALT foer denne vakten:

        M_Ed = +70 kNm (stoette),  N = +300 kN strekk
        ->  M_Rd = -70,51 kNm,  eta = 0,993,  bending_ok TRUE,  all_ok TRUE,
            advarsler: INGEN

    En groenn rapport for et snitt som ikke baerer lasten i det hele tatt. `_utilisation`
    regner `abs(M_Ed)/abs(M_Rd)`, og absoluttverdiene skjulte at de to pekte hver sin vei.

    Uavhengig bevis for at kapasiteten ER null i lastens retning: M-N-omhyllingen har
    ikke ett eneste positivt moment ved N = +300 kN.
    """
    result = _hogging_with_tension(300e3)
    assert result['ok'] is True
    row = result['bending']['combinations'][0]

    assert row['M_Rd'] < 0, 'forutsetningen for testen: kapasiteten kommer ut negativ'
    assert row['capacity_opposes_load'] is True
    assert result['checks']['bending_ok'] is False, \
        'et snitt uten kapasitet i lastens retning er et BRUDD, ikke en lav utnyttelse'
    assert result['checks']['all_ok'] is False

    codes = [w['code'] for w in result['warnings']]
    assert 'capacity_opposite_direction' in codes
    warning = next(w for w in result['warnings'] if w['code'] == 'capacity_opposite_direction')
    assert warning['severity'] == 'error'
    # Advarselen skal baere BEGGE tallene, ellers kan ingen etterproeve paastanden.
    assert '70.0' in warning['message'] and '-70.5' in warning['message']


def test_capacity_direction_is_measured_against_theta_not_the_sign_of_m_ed():
    """REGRESJON paa selve rettelsen. Foerste forsoek sammenliknet fortegnet paa `M_Ed`
    med fortegnet paa `M_Rd`, og gav FALSKE POSITIVER paa den gamle payload-formen, der
    `M_Ed` er en STOERRELSE og retningen staar i `theta` -- formen fixturene og
    `test_three_combinations_one_out_of_range_does_not_upset_the_others` bruker.

    `M_Ed: +150e6` med `theta: 0.0` er FELTMOMENT, og `M_Rd = -215 kNm` er da riktig vei.
    """
    payload = load('payload-beam-300x600.json')
    payload['loads'] = {
        'combinations': [{'id': 'C1', 'name': 'ULS', 'N_Ed': 0.0, 'M_Ed': 150e6,
                          'theta': 0.0}],
        'active': 'C1',
    }
    result = engine.run(payload)
    row = result['bending']['combinations'][0]
    assert row['M_Rd'] < 0
    assert row['capacity_opposes_load'] is False, \
        'gammel payload-form: fortegnet paa M_Ed er en stoerrelse, ikke en retning'
    assert result['checks']['bending_ok'] is True


def test_capacity_direction_leaves_the_ordinary_cases_alone():
    """Vakten skal ikke kunne slaa inn paa noe som virket. Uten dette ville «sett alltid
    True» vaert en bestaatt rettelse."""
    # Stoettemoment UTEN aksialkraft: kapasiteten er liten (6,4 kNm) men RIKTIG vei.
    small = _hogging_with_tension(0.0)
    row = small['bending']['combinations'][0]
    assert row['M_Rd'] > 0
    assert row['capacity_opposes_load'] is False
    # Den er overutnyttet, og det er den advarselen som skal komme -- ikke den nye.
    codes = [w['code'] for w in small['warnings']]
    assert 'bending_capacity_exceeded' in codes
    assert 'capacity_opposite_direction' not in codes

    # Feltmoment med trykk: helt ordinaert, og uroert.
    payload = load('payload-beam-300x600.json')
    payload['loads'] = {
        'combinations': [{'id': 'C1', 'name': 'ULS', 'N_Ed': -500e3, 'M_Ed': -250e6,
                          'theta': 0.0}],
        'active': 'C1',
    }
    ordinary = engine.run(payload)
    assert ordinary['bending']['combinations'][0]['capacity_opposes_load'] is False
    assert ordinary['checks']['all_ok'] is True


def test_capacity_direction_terskelen_ligger_der_kapasiteten_skifter_fortegn():
    """Vakten skal foelge FYSIKKEN, ikke en terskel noen har skrevet inn. Maalt paa
    referansebjelken ligger fortegnsskiftet mellom N = +20 og +40 kN aksialstrekk."""
    below = _hogging_with_tension(20e3)['bending']['combinations'][0]
    above = _hogging_with_tension(40e3)['bending']['combinations'][0]
    assert below['M_Rd'] > 0 and below['capacity_opposes_load'] is False
    assert above['M_Rd'] < 0 and above['capacity_opposes_load'] is True

# ------------------------------------------------------------------ #
# Skjaerkontroller som svarte BESTAATT uten aa ha regnet noe (runde 11)
# ------------------------------------------------------------------ #

def _shear_case(v_ed, theta=0.0, stirrups=None, section_type='beam'):
    payload = load('payload-beam-300x600.json')
    payload['section']['type'] = section_type
    payload['section']['shear'] = {'strut_angle_deg': 45.0, 'z_factor': 0.9,
                                   'stirrups': stirrups or []}
    payload['options']['theta'] = theta
    m_ed = 150e6 if theta else -150e6
    payload['loads'] = {
        'combinations': [{'id': 'C1', 'name': 'ULS', 'N_Ed': 0.0, 'M_Ed': m_ed,
                          'V_Ed': v_ed, 'theta': theta}],
        'active': 'C1',
    }
    return engine.run(payload)


def test_shear_that_could_not_be_evaluated_is_unanswered_not_passed():
    """MAALT foer denne: referansebjelken med stoettemoment (ingen toppjern, altsaa ingen
    strekkside aa maale `d` fra) og `V_Ed = 900 kN` gav

        shear: evaluated=False, V_Rd=None, d=None
        checks.shear_ok = TRUE,  og ingen skjaeradvarsel i det hele tatt

    Samme feilform runde 6 lukket for `as_min_ok` og `ductility_ok`: en kontroll som
    svarer BESTAATT uten aa ha regnet noe.
    """
    result = _shear_case(900e3, theta=math.pi)
    row = result['bending']['combinations'][0]
    assert row['shear']['evaluated'] is False
    assert result['checks']['shear_ok'] is None, 'ubesvart, ikke bestaatt -- og ikke brudd'
    assert result['checks']['all_ok'] is False

    incomplete = next(w for w in result['warnings'] if w['code'] == 'assessment_incomplete')
    assert 'shear_ok' in incomplete['detail']
    assert 'effective depth' in incomplete['detail']


def test_shear_without_any_load_is_passed_not_unanswered():
    """Motstykket: ingen skjaerkraft er ingenting aa kontrollere, og da er `True`
    riktig. `None` her ville gjort hver eneste rene boeyeberegning «ubesvart»."""
    result = _shear_case(0.0)
    assert result['checks']['shear_ok'] is True
    assert result['checks']['all_ok'] is True


def test_a_beam_without_stirrups_fails_minimum_shear_reinforcement():
    """EC2 6.2.1(4) unntar deler der skjaerarmering ikke er noedvendig -- plater og deler
    av mindre betydning. Unntaket gjelder IKKE bjelker: 9.2.2(5) krever rho_w >=
    rho_w,min uansett.

    MAALT foer denne: 300x600 bjelke, tom boeyleliste, V_Ed = 60 kN gav
    `asw_min_ok = True`. `payload.section.type` ble sendt av `payload.js` og lest av
    INGEN -- null treff i hele motoren.
    """
    result = _shear_case(60e3, section_type='beam')
    assert result['checks']['asw_min_ok'] is False
    assert result['checks']['all_ok'] is False


def test_a_slab_without_stirrups_is_still_exempt():
    """Plata er nettopp tilfellet EC2 6.2.1(4) unntar, og skal ikke feile av aa mangle
    boeyler. Uten denne ville rettelsen over gjort hver eneste plate ikke-bestaatt."""
    payload = load('payload-slab-1000x200.json')
    payload['section']['type'] = 'slab'
    payload['section']['shear'] = {'strut_angle_deg': 45.0, 'z_factor': 0.9, 'stirrups': []}
    payload['loads'] = {
        'combinations': [{'id': 'C1', 'name': 'ULS', 'N_Ed': 0.0, 'M_Ed': -40e6,
                          'V_Ed': 60e3, 'theta': 0.0}],
        'active': 'C1',
    }
    result = engine.run(payload)
    assert result['checks']['asw_min_ok'] is True


def test_a_beam_without_stirrups_and_without_shear_is_not_penalised():
    """Og en bjelke uten skjaerkraft trenger ingen minimumsboeyler heller."""
    result = _shear_case(0.0, section_type='beam')
    assert result['checks']['asw_min_ok'] is True
