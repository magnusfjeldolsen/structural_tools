"""csc_polygon.py -- fritt tverrsnitt: ett ytre polygon med hull (sak #83).

HVA DENNE FILA EIER
Gyldighetskontrollen og tverrsnittsstoerrelsene (A, tyngdepunkt, I_y, omkrets) for
`section.shape == 'polygon'`. Ingenting her kjenner `structuralcodes`; `engine.py` bygger
`SurfaceGeometry` av det `validated_polygon` gir tilbake.

HVORFOR GEOMETRIEN VALIDERES FOER MOTOREN KALLES
Overlappende hull gir `GEOSException` dypt inne i marin-integratoren (maalt 2026-11-12),
og et hull som stikker ut av det ytre polygonet integreres som NEGATIV betong utenfor
snittet -- ingen feil, bare et tall. Begge skal stoppes her, med en melding i klartekst,
foer noe annet skjer. `PolygonError` er derfor en egen type som `engine.py` gjoer om til
`{ok: false, error: {code: 'invalid_geometry'}}`, aldri en stacktrace.

KOORDINATSYSTEMET (kontrakten med `payload.js`)
`payload.js` NORMALISERER polygonet foer det sendes: y vannrett, z opp, og
OMSKREVET REKTANGEL SENTRERT I ORIGO. Da gjelder hele motorens `h/2`-bokfoering
(`_depth`, `_neutral_axis`, `d`, `x`) uendret: trykkanten er `z = +h/2` ved feltmoment,
og `h` er hoeyden av det omskrevne rektangelet. Et polygon som IKKE er sentrert, er en
feil i kalleren og avvises -- motoren flytter ikke paa geometrien i det stille, for da
ville jernkoordinatene og betongen ligget i hvert sitt system.

FORMLENE er de lukkede polygonformlene (Green), eksakte for et polygon. `js/polygon.js`
har de samme formlene; `tests/fixtures/section-hd265-7holes.json` holder dem i takt.
"""

from __future__ import annotations

import math

from shapely import Polygon
from shapely.geometry.polygon import orient
from shapely.validation import explain_validity


class PolygonError(ValueError):
    """Ugyldig fritt tverrsnitt. `message` er brukervendt (engelsk, som resten av motoren)."""

    def __init__(self, message, detail=''):
        super().__init__(message)
        self.message = message
        self.detail = str(detail)


def is_polygon(section):
    return str(section.get('shape') or 'rectangle') == 'polygon'


def _ring(raw, label):
    """En aapen ring `[[y, z], ...]` som liste av float-par. Siste punkt = foerste fjernes."""
    if not isinstance(raw, (list, tuple)):
        raise PolygonError(f'The {label} is not a list of [y, z] points.', repr(raw)[:200])
    pts = []
    for i, p in enumerate(raw):
        if not isinstance(p, (list, tuple)) or len(p) != 2:
            raise PolygonError(
                f'Point {i + 1} of the {label} is not a [y, z] pair.', repr(p)[:200])
        try:
            y = float(p[0])
            z = float(p[1])
        except (TypeError, ValueError):
            raise PolygonError(
                f'Point {i + 1} of the {label} is not a number pair.', repr(p)[:200]) from None
        if not (math.isfinite(y) and math.isfinite(z)):
            raise PolygonError(f'Point {i + 1} of the {label} is not finite.', repr(p)[:200])
        pts.append((y, z))
    # Formatet sier aapne ringer, men en lukket ring er ufarlig og vanlig -- godta den.
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    if len(set(pts)) < 3:
        raise PolygonError(
            f'The {label} needs at least three distinct points; it has {len(set(pts))}.')
    return pts


def ring_props(pts):
    """Signert areal, foerste og andre arealmoment om y-aksen (z = 0), for EN ring.

    Fortegnet foelger omloepsretningen (mot klokka positiv). Kalleren tar absoluttverdi.
    """
    a = 0.0
    sz = 0.0   # integral z dA
    sy = 0.0   # integral y dA
    izz0 = 0.0  # integral z^2 dA
    n = len(pts)
    for i in range(n):
        y0, z0 = pts[i]
        y1, z1 = pts[(i + 1) % n]
        c = y0 * z1 - y1 * z0
        a += c
        sz += (z0 + z1) * c
        sy += (y0 + y1) * c
        izz0 += (z0 * z0 + z0 * z1 + z1 * z1) * c
    return a / 2.0, sz / 6.0, sy / 6.0, izz0 / 12.0


def ring_perimeter(pts):
    n = len(pts)
    return sum(math.hypot(pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1])
               for i in range(n))


def polygon_props(outer, holes):
    """A, tyngdepunkt (y_c, z_c), I_y om tyngdepunktsaksen, omskrevet rektangel, omkrets."""
    def signed(pts):
        a, sz, sy, izz = ring_props(pts)
        s = 1.0 if a >= 0 else -1.0
        return s * a, s * sz, s * sy, s * izz

    a, sz, sy, izz = signed(outer)
    for hole in holes:
        ha, hsz, hsy, hizz = signed(hole)
        a -= ha
        sz -= hsz
        sy -= hsy
        izz -= hizz
    zc = sz / a
    yc = sy / a
    ys = [p[0] for p in outer]
    zs = [p[1] for p in outer]
    return {
        'area': a,
        'y_c': yc,
        'z_c': zc,
        'I_y': izz - a * zc * zc,
        'y_min': min(ys), 'y_max': max(ys),
        'z_min': min(zs), 'z_max': max(zs),
        'b': max(ys) - min(ys),
        'h': max(zs) - min(zs),
        'perimeter_outer': ring_perimeter(outer),
        'perimeter_holes': sum(ring_perimeter(h) for h in holes),
    }


def validated_polygon(section):
    """Leser `section.outer`/`section.holes`, kontrollerer alt, og gir

    `(shapely_polygon, props)`. Polygonet er orientert (ytre mot klokka, hull med klokka).
    Kaster `PolygonError` med en melding brukeren kan handle paa.
    """
    outer = _ring(section.get('outer'), 'outer boundary')
    raw_holes = section.get('holes') or []
    if not isinstance(raw_holes, (list, tuple)):
        raise PolygonError('"holes" must be a list of rings.', repr(raw_holes)[:200])
    holes = [_ring(h, f'hole {i + 1}') for i, h in enumerate(raw_holes)]

    shell = Polygon(outer)
    if not shell.is_valid or shell.area <= 0:
        raise PolygonError(
            'The outer boundary crosses itself or has no area. Draw it as one closed line '
            'that does not intersect itself.', explain_validity(shell))

    hole_polys = []
    for i, h in enumerate(holes):
        hp = Polygon(h)
        if not hp.is_valid or hp.area <= 0:
            raise PolygonError(
                f'Hole {i + 1} crosses itself or has no area.', explain_validity(hp))
        # STRENGT innenfor: et hull som rører den ytre randen er en innsparing og hører
        # hjemme i den ytre ringen. Og et hull som stikker UT, ville marin integrert som
        # negativ betong utenfor snittet -- et tall uten feilmelding.
        if not shell.contains(hp) or hp.boundary.intersects(shell.boundary):
            raise PolygonError(
                f'Hole {i + 1} is not strictly inside the outer boundary. A hole that '
                'touches or crosses the outer edge must be drawn as part of the outer '
                'boundary instead.', f'hole {i + 1} bounds {hp.bounds}, outer {shell.bounds}')
        hole_polys.append(hp)

    for i in range(len(hole_polys)):
        for j in range(i + 1, len(hole_polys)):
            if hole_polys[i].intersects(hole_polys[j]):
                raise PolygonError(
                    f'Holes {i + 1} and {j + 1} overlap or touch. Merge them into one hole '
                    'or move them apart.',
                    f'intersection area {hole_polys[i].intersection(hole_polys[j]).area}')

    poly = Polygon(outer, holes)
    if not poly.is_valid:
        # Siste sikring -- alt over skal ha fanget det, men GEOS sitt eget svar er fasiten.
        raise PolygonError('The cross-section geometry is not valid.', explain_validity(poly))

    props = polygon_props(outer, holes)
    if props['area'] <= 0:
        raise PolygonError('The holes remove all of the concrete area.', f'A={props["area"]}')

    # Kontrakten med `payload.js`: omskrevet rektangel sentrert i origo. Se filhodet.
    tol = 1e-6 * max(props['b'], props['h'])
    if abs(props['y_min'] + props['y_max']) / 2.0 > tol or \
            abs(props['z_min'] + props['z_max']) / 2.0 > tol:
        raise PolygonError(
            'The polygon is not centred on its bounding box. This is an error in the '
            'program that built the payload, not in your input.',
            f'y [{props["y_min"]}, {props["y_max"]}], z [{props["z_min"]}, {props["z_max"]}]')

    return orient(poly, sign=1.0), props
