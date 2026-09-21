# Fixturdiff, runde 12

Generert av `docs/fixture-generator.py --diff`. Hver rad er en BLADSTI i
JSON-treet; lister er indeksert, saa et avvik kan peke paa ett punkt i en
kurve og ikke bare paa «lista er ulik».

| Status | Betyr |
| --- | --- |
| `UENDRET` | Samme verdi, eller relativt avvik under 1e-12. |
| `NYTT` | Stien fantes ikke i den gamle fixturen. |
| `NORMALISERT` | `meta.wall_time_ms` / `meta.runtime` -- VALGT bort, se generatorens hodekommentar. |
| `FLYTTET` | Et tall har flyttet seg, eller et felt er borte. Ett eneste er nok til aa stoppe runden. |

**Sum `FLYTTET` over alle fixturene: 0.**

## `result-bending-beam-300x600-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 349 |
| `NYTT` | 6 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 13.8`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-bending-beam-300x600.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 102 |
| `NYTT` | 2 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 17.0`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-bending-slab-1000x200-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 353 |
| `NYTT` | 6 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 19.0`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-bending-slab-1000x200.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 102 |
| `NYTT` | 2 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 16.4`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-mc-beam-300x600-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 399 |
| `NYTT` | 6 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 262.6`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-mc-beam-300x600.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 152 |
| `NYTT` | 2 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 280.9`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-mc-slab-1000x200-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 403 |
| `NYTT` | 6 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 331.9`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-mc-slab-1000x200.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 152 |
| `NYTT` | 2 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 339.5`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-nmdomain-beam-300x600-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 560 |
| `NYTT` | 6 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 48.2`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-nmdomain-beam-300x600.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 313 |
| `NYTT` | 2 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 45.4`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-nmdomain-slab-1000x200-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 564 |
| `NYTT` | 6 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 46.9`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-nmdomain-slab-1000x200.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 313 |
| `NYTT` | 2 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 47.6`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

