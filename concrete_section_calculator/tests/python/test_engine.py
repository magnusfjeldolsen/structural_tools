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
    assert set(checks) == {
        'as_min_ok', 'as_max_ok', 'ductility_ok', 'axial_ok', 'geometry_ok',
        'shear_ok', 'asw_min_ok', 'stirrup_spacing_ok', 'all_ok',
    }
    assert all(isinstance(v, bool) for v in checks.values())
    assert checks['all_ok'] is True
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
