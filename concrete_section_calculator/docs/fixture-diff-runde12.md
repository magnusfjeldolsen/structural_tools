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
| `UENDRET` | 305 |
| `NYTT` | 44 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 13.8`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-bending-beam-300x600.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 102 |
| `NYTT` | 0 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 14.2`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-bending-slab-1000x200-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 309 |
| `NYTT` | 44 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 15.5`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-bending-slab-1000x200.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 102 |
| `NYTT` | 0 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 14.0`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-mc-beam-300x600-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 355 |
| `NYTT` | 44 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 253.7`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-mc-beam-300x600.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 152 |
| `NYTT` | 0 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 261.5`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-mc-slab-1000x200-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 359 |
| `NYTT` | 44 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 313.7`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-mc-slab-1000x200.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 152 |
| `NYTT` | 0 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 305.7`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-nmdomain-beam-300x600-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 516 |
| `NYTT` | 44 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 41.9`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-nmdomain-beam-300x600.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 313 |
| `NYTT` | 0 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 40.0`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-nmdomain-slab-1000x200-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 520 |
| `NYTT` | 44 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 46.6`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-nmdomain-slab-1000x200.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 313 |
| `NYTT` | 0 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 46.2`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

