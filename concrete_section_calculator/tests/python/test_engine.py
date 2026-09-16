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

    # Akseptkriteriet i §12, med alpha_cc = 1.0 slik payload-fixturen har.
    assert close(result['bending']['M_Rd'], M_RD_BEAM)

    for key, value in expected['bending'].items():
        if key == 'layers':
            continue
        got = result['bending'][key]
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
    assert meta['moment_sign'] == -1          # rå fortegn fra pakka, se §5.2
    assert meta['direction'] == 'sagging'
    assert meta['scipy'] in ('real', 'stub')
    assert isinstance(meta['wall_time_ms'], float)

    checks = result['checks']
    assert set(checks) == {
        'as_min_ok', 'as_max_ok', 'ductility_ok', 'axial_ok', 'geometry_ok', 'all_ok',
    }
    assert all(isinstance(v, bool) for v in checks.values())
    assert checks['all_ok'] is True

    assert isinstance(result['warnings'], list)
    for w in result['warnings']:
        assert set(w) == {'code', 'severity', 'message', 'detail'}


def test_slab_matches_fixture():
    payload = load('payload-slab-1000x200.json')
    expected = load('result-bending-slab-1000x200.json')
    result = engine.run(payload)

    assert close(result['bending']['M_Rd'], expected['bending']['M_Rd'])
    assert close(result['section_props']['As_total'], expected['section_props']['As_total'])
    # Planens §3.6 oppgir −69,865 kNm/m for A_s = 1000 mm²/m eksakt. Fixturen bruker det
    # faktiske arealet (1000,86 mm²/m) fra Ø12 c/c 113, derav de 0,08 prosentene.
    assert close(result['bending']['M_Rd'], 69864525.0, rel=2e-3)


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
    for got, want in zip(mc['kappa'], expected['kappa']):
        assert close(got, want)
    for got, want in zip(mc['moment'], expected['moment']):
        assert close(got, want)

    # Fortegnsregelen: kurven krysser JSON-grensa som STØRRELSER.
    assert all(v is not None and v >= 0 for v in mc['kappa'])
    assert all(v is not None and v >= 0 for v in mc['moment'])
    # Siste punkt skal være bøyekapasiteten (§3.6).
    assert close(mc['moment'][-1], M_RD_BEAM, rel=1e-5)


def test_moment_curvature_single_point_follows_the_plan():
    """JS driver kurven ett punkt om gangen (§3.7) — da må planen ligge i svaret."""
    payload = load('payload-beam-300x600.json')
    payload['analysis'] = 'moment_curvature'
    full = engine.run(payload)['moment_curvature']

    plan = full['chi_plan']
    assert plan is not None and len(plan) == 20

    for index in (0, 9, 19):
        single = copy.deepcopy(payload)
        # `chi_plan` er størrelser; motorens egen krumning er negativ for feltmoment.
        single['options']['mc_chi'] = -plan[index]
        one = engine.run(single)['moment_curvature']
        assert len(one['kappa']) == 1
        assert one['yield_index'] is None
        assert close(one['kappa'][0], full['kappa'][index])
        # Punktvis kjøring mister pakkas videreføring av forrige tøyningsnivå som startgjett,
        # så momentet treffer ikke bit-identisk — men godt innenfor konvergenstoleransen.
        assert close(one['moment'][0], full['moment'][index], rel=1e-6)


def test_moment_curvature_utilisation_is_vertical():
    payload = load('payload-beam-300x600.json')
    payload['analysis'] = 'moment_curvature'
    payload['loads']['M_Ed'] = 200000000.0
    mc = engine.run(payload)['moment_curvature']
    assert close(mc['utilisation'], 200000000.0 / mc['M_Rd'])


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
    for got, want in zip(dom['m'], expected['m']):
        assert close(got, want)
    assert dom['field_num'] == expected['field_num']
    assert all(isinstance(v, int) for v in dom['field_num'])

    # BEGGE er fortegnsatte her. `m` er dreid med `meta.moment_sign`, slik at kapasiteten
    # i den analyserte retningen er positiv og motsatt gren negativ. Brettet man dem
    # sammen med abs, ville den bitte lille støttegrenen ligget nærmest origo og
    # `radialUtilisation` ville plukket den for en feltmomentlast.
    assert min(dom['n']) < 0
    assert min(dom['m']) < 0 and max(dom['m']) > 0
    assert close(min(dom['m']), -254741119.1548166)
    assert close(max(dom['m']), 364250941.1746183)
    assert close(max(dom['m']), max(abs(v) for v in dom['m']))
    assert close(dom['M_Rd_at_N'], M_RD_BEAM)
    assert close(dom['N_min'], expected['N_min'])
    assert close(dom['N_max'], expected['N_max'])


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
    assert close(result['bending']['M_Rd'], M_RD_BEAM)


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
    assert result['meta']['moment_sign'] == 1
    assert close(result['bending']['M_Rd'], M_RD_BEAM)
    assert close(result['section_props']['d_eff'], 550.0)
    # x måles fra trykkanten, som for støttemoment er UNDERKANT.
    assert close(result['bending']['x'], 86.0890119057411)
    assert close(result['bending']['x_over_d'], 0.15652547619225654)


def test_axial_pre_check_is_norwegian_and_stops_the_run():
    payload = load('payload-beam-300x600.json')
    payload['loads']['N_Ed'] = -5_000_000.0
    result = engine.run(payload)

    assert result['ok'] is False
    assert result['error']['code'] == 'axial_out_of_range'
    assert 'Aksialkraften' in result['error']['message']
    assert 'kN' in result['error']['message']
    # Rå engelsk pakketekst hører hjemme i detail, aldri i message.
    assert 'n_min' in result['error']['detail']
    json.dumps(result, allow_nan=False)


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
        # betongspenning, så momentet skal være praktisk talt uendret.
        assert close(result['bending']['M_Rd'],
                     load(f'result-bending-{name[8:-5]}.json')['bending']['M_Rd'],
                     rel=1e-6)


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


def test_engine_never_imports_js_or_pyodide():
    """§2.3 krav 1, håndhevet i stedet for bare dokumentert."""
    import re

    source = (MODULE_DIR / 'python' / 'engine.py').read_text(encoding='utf-8')
    forbidden = re.compile(r'^\s*(?:import|from)\s+(?:js|pyodide)\b', re.MULTILINE)
    assert forbidden.search(source) is None, forbidden.search(source).group(0)
    assert 'js' not in sys.modules
    assert 'pyodide' not in sys.modules
