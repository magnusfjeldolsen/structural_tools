#!/usr/bin/env python3
"""Genererer resultatfixturene i `tests/fixtures/` ved aa kjoere MODULENS EGEN motor.

HVORFOR `engine.run()` OG IKKE `structuralcodes` DIREKTE
--------------------------------------------------------
Forgjengeren (`fixture-generator.reference.py`, slettet i denne runden) bygde
`BeamSection` selv og kalte `structuralcodes` rett. Den skrev det i sin egen
hodekommentar: «Dette er IKKE modulens motor.» Da lages fasiten av et ANNET
program enn det som testes, og enhver test som sammenlikner `engine.run()` med
en fixtur maaler to implementasjoner mot hverandre uten aa si hvilken som er
fasit. Denne generatoren gjoer `import engine` og INGEN egen beregning --
`from structuralcodes import ...` finnes bevisst ikke i fila.

MAALINGEN SOM BEGRUNNER REGENERERINGEN (runde 12)
-------------------------------------------------
`engine.run()` ble kjoert mot alle seks committede resultatfixturene og diffet
felt for felt foer denne fila ble skrevet:

    18 nye felt (3 per fixtur), 0 borte, 0 FLYTTEDE tall

De tre nye per lastkombinasjon er `type`, `checked` og `capacity_opposes_load`.
Eneste verdi som ellers avvek var `meta.wall_time_ms` -- en klokkemaaling.
Regenereringen er altsaa ADDITIV; risikoen ligger i de SEKS NYE `-combos`-
fixturene, ikke i de gamle. Derfor `--diff` (A6) og derfor assert-en under.

NORMALISERINGEN AV `meta` -- ET VALG, IKKE EN FORGLEMMELSE
----------------------------------------------------------
`meta.wall_time_ms` settes til `None` og `meta.runtime` til `"cpython"`.
Uten det baerer fixturene en klokkemaaling og et Python-patchnivaa fra den
maskinen som tilfeldigvis kjoerte `--write` sist, og INGEN kan regenerere dem
andre steder uten aa faa en falsk diff. «Bit for bit» blir da en paastand ingen
kan etterproeve. De EKTE maalingene forsvinner ikke -- de havner i
diff-rapporten (`--diff`), der de hoerer hjemme som maaling og ikke som fasit.

SERIALISERINGEN
---------------
`json.dumps(..., indent=2, ensure_ascii=False, allow_nan=False)` + avsluttende
linjeskift. MAALT foer foerste `--write`: den formelen reproduserer alle seks
committede resultatfixturene TEGN FOR TEGN. Avvek `indent`, ville hele mappa
faatt en stoeydiff som skjulte de ekte endringene.

`--check` sammenlikner TEKST med universelle linjeskift, ikke raa bytes: fila i
arbeidstreet baerer CRLF (`core.autocrlf=true` paa Windows) mens git lagrer LF,
saa en bytesammenlikning ville slaatt ut paa Linux av en grunn som ikke har noe
med tallene aa gjoere.

BRUK
----
    python docs/fixture-generator.py --check   # skriver ingenting, exit 1 ved avvik
    python docs/fixture-generator.py --write   # skriver fixturene
    python docs/fixture-generator.py --diff    # skriver docs/fixture-diff-runde12.md
"""

import argparse
import json
import math
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
MODULE = HERE.parent
FIX = MODULE / "tests" / "fixtures"
DIFF_REPORT = HERE / "fixture-diff-runde12.md"

sys.path.insert(0, str(MODULE / "python"))
import engine  # noqa: E402  -- MAA komme etter sys.path-innsettingen over

# Payloadens navn -> om den er en `-combos`-payload. `-combos`-payloadene er de
# eneste som baerer `section.shear` og `sls`; de to andre er BEVISST uroert
# (de er dekningen for fravaerstilfellet, se `--check`-assert-en under).
PAYLOADS = (
    "beam-300x600",
    "slab-1000x200",
    "beam-300x600-combos",
    "slab-1000x200-combos",
)

# `analysis` i payloaden -> stammen i resultatfilnavnet. Navnene er de
# committede; `moment_curvature` heter `mc` og `nm_domain` heter `nmdomain`
# paa disk, og det skal de fortsette aa gjoere.
ANALYSES = (
    ("bending", "bending"),
    ("moment_curvature", "mc"),
    ("nm_domain", "nmdomain"),
)

# Feltene `--diff` merker `NORMALISERT` i stedet for `FLYTTET`. Staar et felt
# her, er avviket VALGT (se hodekommentaren) -- alt annet avvik er en regresjon.
NORMALISED = {
    "meta.wall_time_ms": None,
    "meta.runtime": "cpython",
}

# Relativt avvik over dette er `FLYTTET`. Under er det flyttallsstoey fra en
# annen prosessor eller en annen rekkefoelge paa de samme addisjonene.
REL_TOL = 1e-12


def serialise(obj):
    """Den ENE serialiseringen. Se hodekommentaren for maalingen som festet den."""
    return json.dumps(obj, indent=2, ensure_ascii=False, allow_nan=False) + "\n"


def load_payload(name):
    return json.loads((FIX / f"payload-{name}.json").read_text(encoding="utf-8"))


def generate():
    """Kjoerer motoren for alle payload x analyse og gir `{filnavn: (tekst, maalt)}`.

    `maalt` er `meta`-verdiene SLIK MOTOREN MAALTE DEM, tatt vare paa foer
    normaliseringen slaar til -- det er dem `--diff` rapporterer.
    """
    out = {}
    for name in PAYLOADS:
        base = load_payload(name)
        for analysis, stem in ANALYSES:
            payload = json.loads(json.dumps(base))
            payload["analysis"] = analysis
            result = engine.run(payload)
            filename = f"result-{stem}-{name}.json"

            if not result.get("ok"):
                raise SystemExit(
                    f"{filename}: motoren svarte ok=False -- {result.get('error')}"
                )

            # ASSERT-EN (A3). Uten den kan hele runden bli bortkastet uten at
            # noen merker det: gater man `sls` bort (payloaden mangler én av de
            # to SLS-typene) eller `shear` bort (payloaden mangler
            # `section.shear`), blir de nye fixturene BIT FOR BIT som de gamle
            # -- og de ~150 testene som skulle faatt et maalt grunnlag staar
            # fortsatt paa haandskrevne tall, stille.
            if name.endswith("-combos"):
                if result.get("sls") is None:
                    raise SystemExit(
                        f"{filename}: result['sls'] er None. `-combos`-payloaden maa ha "
                        "BEGGE SLS-typene (`characteristic` OG `quasi_permanent`) -- "
                        "motoren gater `sls` bort uten dem."
                    )
                combos = result[analysis]["combinations"]
                if combos[0].get("shear") is None:
                    raise SystemExit(
                        f"{filename}: combinations[0]['shear'] er None. `-combos`-"
                        "payloaden maa ha `section.shear`, og rad 0 maa vaere en "
                        "ULS-rad -- motoren setter `shear: None` paa enhver "
                        "ukontrollert rad (engine.py, kombinasjonsloekka)."
                    )

            measured = {
                "wall_time_ms": result["meta"].get("wall_time_ms"),
                "runtime": result["meta"].get("runtime"),
            }
            for path, value in NORMALISED.items():
                result["meta"][path.split(".", 1)[1]] = value
            out[filename] = (serialise(result), measured)
    return out


# ------------------------------------------------------------------ #
# --check
# ------------------------------------------------------------------ #

def cmd_check(generated):
    bad = []
    for filename, (text, _measured) in sorted(generated.items()):
        path = FIX / filename
        if not path.exists():
            bad.append(f"{filename}: finnes ikke paa disk")
            continue
        # Universelle linjeskift, ikke raa bytes -- se hodekommentaren.
        on_disk = path.read_text(encoding="utf-8")
        if on_disk != text:
            bad.append(f"{filename}: {_first_difference(on_disk, text)}")
    if bad:
        print("AVVIK:")
        for line in bad:
            print("  " + line)
        return 1
    print(f"{len(generated)} fixturer er tegn for tegn like motorens svar.")
    return 0


def _first_difference(on_disk, generated):
    a = on_disk.splitlines()
    b = generated.splitlines()
    for i, (x, y) in enumerate(zip(a, b), start=1):
        if x != y:
            return f"linje {i}: disk {x.strip()!r} != motor {y.strip()!r}"
    return f"ulik lengde ({len(a)} linjer paa disk, {len(b)} fra motoren)"


# ------------------------------------------------------------------ #
# --write
# ------------------------------------------------------------------ #

def cmd_write(generated):
    for filename, (text, _measured) in sorted(generated.items()):
        (FIX / filename).write_text(text, encoding="utf-8")
        print(f"skrev {filename}")
    return 0


# ------------------------------------------------------------------ #
# --diff
# ------------------------------------------------------------------ #

def _leaves(obj, prefix=""):
    """Alle bladstier i et JSON-tre. Lister indekseres -- en forskjell i det
    3. M-kappa-punktet skal kunne peke paa `moment_curvature.moment[3]` og
    ikke bare paa «lista er ulik»."""
    if isinstance(obj, dict):
        for key, value in obj.items():
            yield from _leaves(value, f"{prefix}.{key}" if prefix else key)
    elif isinstance(obj, list):
        for i, value in enumerate(obj):
            yield from _leaves(value, f"{prefix}[{i}]")
    else:
        yield prefix, obj


def _status(path, old, new):
    if path in NORMALISED:
        return "NORMALISERT"
    if isinstance(old, bool) or isinstance(new, bool):
        return "UENDRET" if old is new else "FLYTTET"
    if isinstance(old, (int, float)) and isinstance(new, (int, float)):
        if old == new:
            return "UENDRET"
        scale = max(abs(old), abs(new))
        rel = abs(old - new) / scale if scale else abs(old - new)
        return "UENDRET" if rel <= REL_TOL and math.isfinite(rel) else "FLYTTET"
    return "UENDRET" if old == new else "FLYTTET"


def cmd_diff(generated):
    rows = []
    flyttet_total = 0
    for filename, (text, measured) in sorted(generated.items()):
        new = json.loads(text)
        path = FIX / filename
        # En fixtur som ikke fantes fra foer er NYTT i sin helhet -- det er
        # tilfellet for de seks `-combos`-fixturene i denne runden.
        old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

        counts = {"UENDRET": 0, "NYTT": 0, "NORMALISERT": 0, "FLYTTET": 0}
        moved = []
        new_leaves = dict(_leaves(new))
        if old is None:
            counts["NYTT"] = len(new_leaves)
        else:
            old_leaves = dict(_leaves(old))
            for leaf, value in new_leaves.items():
                if leaf not in old_leaves:
                    counts["NYTT"] += 1
                    continue
                status = _status(leaf, old_leaves[leaf], value)
                counts[status] += 1
                if status == "FLYTTET":
                    moved.append((leaf, old_leaves[leaf], value))
            # Et felt som er BORTE er ogsaa et flyttet tall: det gamle svaret
            # finnes ikke lenger, og runden skal stoppe paa det.
            for leaf, value in old_leaves.items():
                if leaf not in new_leaves:
                    counts["FLYTTET"] += 1
                    moved.append((leaf, value, "(borte)"))
        flyttet_total += counts["FLYTTET"]
        rows.append((filename, old is None, counts, moved, measured))

    DIFF_REPORT.write_text(_report(rows, flyttet_total), encoding="utf-8")
    print(f"skrev {DIFF_REPORT.relative_to(MODULE)}")
    total = {"UENDRET": 0, "NYTT": 0, "NORMALISERT": 0, "FLYTTET": 0}
    for _f, _n, counts, _m, _meas in rows:
        for key in total:
            total[key] += counts[key]
    print("  ".join(f"{k}={v}" for k, v in total.items()))
    return 1 if flyttet_total else 0


def _report(rows, flyttet_total):
    out = [
        "# Fixturdiff, runde 12",
        "",
        "Generert av `docs/fixture-generator.py --diff`. Hver rad er en BLADSTI i",
        "JSON-treet; lister er indeksert, saa et avvik kan peke paa ett punkt i en",
        "kurve og ikke bare paa «lista er ulik».",
        "",
        "| Status | Betyr |",
        "| --- | --- |",
        "| `UENDRET` | Samme verdi, eller relativt avvik under 1e-12. |",
        "| `NYTT` | Stien fantes ikke i den gamle fixturen. |",
        "| `NORMALISERT` | `meta.wall_time_ms` / `meta.runtime` -- VALGT bort, se generatorens hodekommentar. |",
        "| `FLYTTET` | Et tall har flyttet seg, eller et felt er borte. Ett eneste er nok til aa stoppe runden. |",
        "",
        f"**Sum `FLYTTET` over alle fixturene: {flyttet_total}.**",
        "",
    ]
    for filename, is_new, counts, moved, measured in rows:
        out.append(f"## `{filename}`")
        out.append("")
        if is_new:
            out.append("NY FIXTUR -- fantes ikke paa disk foer denne runden.")
            out.append("")
        out.append("| Status | Antall |")
        out.append("| --- | --- |")
        for key in ("UENDRET", "NYTT", "NORMALISERT", "FLYTTET"):
            out.append(f"| `{key}` | {counts[key]} |")
        out.append("")
        out.append(
            f"Maalt ved generering: `wall_time_ms = {measured['wall_time_ms']}`, "
            f"`runtime = {measured['runtime']!r}`. Begge normalisert bort i fixturen."
        )
        out.append("")
        if moved:
            out.append("| Sti | Gammel | Ny |")
            out.append("| --- | --- | --- |")
            for leaf, old_value, new_value in moved:
                out.append(f"| `{leaf}` | `{old_value!r}` | `{new_value!r}` |")
            out.append("")
    return "\n".join(out) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--write", action="store_true", help="skriv fixturene")
    group.add_argument("--check", action="store_true",
                       help="skriv ingenting, exit 1 ved ett eneste avvik")
    group.add_argument("--diff", action="store_true",
                       help=f"skriv {DIFF_REPORT.name}")
    args = parser.parse_args(argv)

    generated = generate()
    if args.check:
        return cmd_check(generated)
    if args.write:
        return cmd_write(generated)
    return cmd_diff(generated)


if __name__ == "__main__":
    raise SystemExit(main())
