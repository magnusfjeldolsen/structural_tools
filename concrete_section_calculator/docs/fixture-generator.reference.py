"""Prototyp av engine.py - genererer resultatfixturene fra payload-fixturene.

Dette er IKKE modulens motor. Den validerer §5-kontrakten og produserer de frosne
tallene A3/A4b/UX jobber mot, ved aa faktisk kjoere structuralcodes 0.7.2 lokalt.
"""
import json
import math
import pathlib
import time

import numpy as np
from shapely import Polygon
from structuralcodes.codes import ec2_2004
from structuralcodes.geometry import CompoundGeometry, PointGeometry, SurfaceGeometry
from structuralcodes.materials.concrete import ConcreteEC2_2004
from structuralcodes.materials.reinforcement import ReinforcementEC2_2004
from structuralcodes.sections import BeamSection

FIX = pathlib.Path(
    r"C:\Python\structural_tools-csc\concrete_section_calculator\tests\fixtures"
)


def _num(v):
    if v is None:
        return None
    v = float(v)
    return v if math.isfinite(v) else None


def _arr(a):
    return [_num(x) for x in np.asarray(a).tolist()]


def _layer_z(layer):
    return layer["bars"][0]["z"] if layer["kind"] == "bars" else layer["strip"]["z"]


def build(p):
    sec = p["section"]
    c = sec["concrete"]
    s = sec["steel"]
    conc = ConcreteEC2_2004(fck=c["fck"], gamma_c=c["gamma_c"], alpha_cc=c["alpha_cc"],
                            constitutive_law=c["law"])
    steel = ReinforcementEC2_2004(
        fyk=s["fyk"], Es=s["Es"], ftk=s["ftk"], epsuk=s["epsuk"],
        gamma_s=s["gamma_s"], gamma_eps=s["gamma_eps"],
        constitutive_law=s["law"],
    )
    b, h = sec["b"], sec["h"]
    poly = Polygon([(-b / 2, -h / 2), (b / 2, -h / 2), (b / 2, h / 2), (-b / 2, h / 2)])
    parts = [SurfaceGeometry(poly, conc)]
    for layer in sec["rebar"]:
        if layer["kind"] == "bars":
            for bar in layer["bars"]:
                parts.append(
                    PointGeometry((bar["y"], bar["z"]), bar["dia"], steel,
                                  group_label=layer["id"])
                )
        else:
            st = layer["strip"]
            w, hh, z = st["width"], st["height"], st["z"]
            sp = Polygon([(-w / 2, z - hh / 2), (w / 2, z - hh / 2),
                          (w / 2, z + hh / 2), (-w / 2, z + hh / 2)])
            parts.append(SurfaceGeometry(sp, steel, group_label=layer["id"]))
    return BeamSection(CompoundGeometry(parts), integrator="marin"), conc, steel


def layer_strains(p, eps_a, chi_y, steel):
    out = []
    for layer in p["section"]["rebar"]:
        z = _layer_z(layer)
        eps = eps_a + chi_y * z
        sig = float(steel.constitutive_law.get_stress(np.array([eps]))[0])
        out.append({"id": layer["id"], "z": _num(z), "eps": _num(eps),
                    "sigma": _num(sig), "compression": bool(eps < 0)})
    return out


def run(name):
    p = json.loads((FIX / f"payload-{name}.json").read_text())
    sec, conc, steel = build(p)
    sc = sec.section_calculator
    theta = p["options"]["theta"]
    b, h = p["section"]["b"], p["section"]["h"]
    As = sum(l["area"] for l in p["section"]["rebar"])
    d = h / 2 - min(_layer_z(l) for l in p["section"]["rebar"])
    fctm = ec2_2004.fctm(p["section"]["concrete"]["fck"])
    as_min = max(0.26 * fctm / p["section"]["steel"]["fyk"] * b * d, 0.0013 * b * d)
    as_max = 0.04 * b * h

    t0 = time.perf_counter()
    bend = sc.calculate_bending_strength(theta=theta, n=p["loads"]["N_Ed"])
    dt = (time.perf_counter() - t0) * 1000
    sign = -1 if bend.m_y < 0 else 1
    z_na = (-bend.eps_a / bend.chi_y) if bend.chi_y else None
    x = (h / 2 - z_na) if z_na is not None else None
    ls = layer_strains(p, bend.eps_a, bend.chi_y, steel)

    checks = {
        "as_min_ok": bool(As >= as_min), "as_max_ok": bool(As <= as_max),
        "ductility_ok": True, "axial_ok": True, "geometry_ok": True, "all_ok": True,
    }
    common = {
        "ok": True, "schema": 1,
        "meta": {
            "structuralcodes_version": "0.7.2", "engine_version": "0.0.0-fixture",
            "runtime": "cpython (fixturegenerator)", "integrator": "marin",
            "scipy": "real", "moment_sign": sign, "theta": theta,
            "direction": "sagging" if theta == 0 else "hogging",
            "subtract_bar_area": False, "wall_time_ms": round(dt, 1),
        },
        "materials": {
            "fck": _num(conc.fck), "fcd": _num(conc.fcd()), "fctm": _num(fctm),
            "alpha_cc": p["section"]["concrete"]["alpha_cc"],
            "gamma_c": p["section"]["concrete"]["gamma_c"], "Ecm": _num(conc.Ecm),
            "law_concrete": p["section"]["concrete"]["law"],
            "eps_c": _num(conc.eps_c2), "eps_cu": _num(conc.eps_cu2),
            "eps_c_name": "eps_c2", "eps_cu_name": "eps_cu2",
            "fyk": _num(steel.fyk), "ftk": _num(steel.ftk), "Es": _num(steel.Es),
            "k": p["section"]["steel"]["k"],
            "gamma_s": p["section"]["steel"]["gamma_s"],
            "gamma_eps": p["section"]["steel"]["gamma_eps"],
            "law_steel": p["section"]["steel"]["law"],
            "fyd": _num(steel.fyd()), "ftd": _num(steel.ftd()),
            "eps_yd": _num(steel.epsyd), "eps_uk": _num(steel.epsuk),
            "eps_ud": _num(steel.epsud()),
        },
        "section_props": {
            "Ag": _num(b * h), "As_total": _num(As), "rho": _num(As / (b * d)),
            "b_t": _num(b), "d_eff": _num(d),
            "As_min": _num(as_min), "As_max": _num(as_max),
            "n_min": _num(sc.n_min), "n_max": _num(sc.n_max),
        },
        "checks": checks,
        "warnings": [],
    }

    eps_s_max = max(l["eps"] for l in ls)
    eps_c_top = bend.eps_a + bend.chi_y * (h / 2)
    eps_yd, eps_ud, eps_cu = steel.epsyd, steel.epsud(), conc.eps_cu2
    if eps_s_max < eps_yd and all(l["compression"] for l in ls):
        mode = "compression_no_tension"
    elif eps_s_max >= eps_ud * (1 - 1e-3):
        mode = "steel_rupture"
    elif eps_c_top <= -eps_cu * (1 - 1e-3) and eps_s_max >= eps_yd:
        mode = "concrete_crushing"
    else:
        mode = "over_reinforced"
    common["checks"]["ductility_ok"] = bool(eps_s_max >= eps_yd)

    res = dict(common, analysis="bending")
    res["bending"] = {
        "N_Ed": _num(p["loads"]["N_Ed"]), "M_Rd": _num(abs(bend.m_y)),
        "eps_a": _num(bend.eps_a), "chi_y": _num(bend.chi_y),
        "x": _num(x), "x_over_d": _num(x / d) if x is not None else None,
        "eps_c_top": _num(bend.eps_a + bend.chi_y * (h / 2)),
        "eps_s_max": _num(eps_s_max), "failure_mode": mode,
        "layers": ls, "M_Ed": _num(p["loads"]["M_Ed"]), "utilisation": 0.0,
    }
    (FIX / f"result-bending-{name}.json").write_text(json.dumps(res, indent=2) + "\n")

    mc = sc.calculate_moment_curvature(
        theta=theta, n=p["loads"]["N_Ed"],
        num_pre_yield=p["options"]["mc_pre_yield"],
        num_post_yield=p["options"]["mc_post_yield"],
    )
    npts = p["options"]["mc_pre_yield"] + p["options"]["mc_post_yield"]
    r2 = dict(common, analysis="moment_curvature")
    r2["moment_curvature"] = {
        "N_Ed": _num(p["loads"]["N_Ed"]),
        "kappa": [abs(v) for v in _arr(mc.chi_y)],
        "moment": [abs(v) for v in _arr(mc.m_y)],
        "yield_index": p["options"]["mc_pre_yield"] - 1,
        "M_Rd": _num(abs(bend.m_y)), "M_Ed": _num(p["loads"]["M_Ed"]),
        "utilisation": 0.0, "truncated": bool(len(mc.chi_y) < npts),
    }
    (FIX / f"result-mc-{name}.json").write_text(json.dumps(r2, indent=2) + "\n")

    dom = sc.calculate_nm_interaction_domain(theta=theta, complete_domain=True)
    r3 = dict(common, analysis="nm_domain")
    r3["nm_domain"] = {
        "n": _arr(dom.n), "m": [_num(v * sign) for v in _arr(dom.m_y)],
        "field_num": [int(v) for v in np.asarray(dom.field_num).tolist()],
        "N_Ed": _num(p["loads"]["N_Ed"]), "M_Ed": _num(p["loads"]["M_Ed"]),
        "M_Rd_at_N": _num(abs(bend.m_y)), "utilisation": 0.0,
        "N_min": _num(sc.n_min), "N_max": _num(sc.n_max),
    }
    (FIX / f"result-nmdomain-{name}.json").write_text(json.dumps(r3, indent=2) + "\n")

    xs = f"{x:.2f}" if x is not None else "-"
    print(f"{name}: M_Rd={abs(bend.m_y):.2f} Nmm  x={xs}  mc={len(mc.chi_y)} pkt  "
          f"dom={len(dom.n)} pkt  As_min={as_min:.1f}  ({dt:.0f} ms)")


for nm in ("beam-300x600", "slab-1000x200"):
    run(nm)
