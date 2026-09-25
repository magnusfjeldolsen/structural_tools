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
| `UENDRET` | 355 |
| `NYTT` | 2 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 14.7`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-bending-beam-300x600.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 104 |
| `NYTT` | 0 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 14.5`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-bending-slab-1000x200-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 359 |
| `NYTT` | 2 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 16.1`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-bending-slab-1000x200.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 104 |
| `NYTT` | 0 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 16.8`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-mc-beam-300x600-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 405 |
| `NYTT` | 2 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 258.2`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-mc-beam-300x600.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 154 |
| `NYTT` | 0 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 265.8`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-mc-slab-1000x200-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 409 |
| `NYTT` | 2 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 313.7`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-mc-slab-1000x200.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 154 |
| `NYTT` | 0 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 314.3`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-nmdomain-beam-300x600-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 566 |
| `NYTT` | 2 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 41.3`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-nmdomain-beam-300x600.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 315 |
| `NYTT` | 0 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 40.6`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-nmdomain-slab-1000x200-combos.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 570 |
| `NYTT` | 2 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 52.0`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

## `result-nmdomain-slab-1000x200.json`

| Status | Antall |
| --- | --- |
| `UENDRET` | 315 |
| `NYTT` | 0 |
| `NORMALISERT` | 2 |
| `FLYTTET` | 0 |

Maalt ved generering: `wall_time_ms = 47.9`, `runtime = 'cpython 3.11.9'`. Begge normalisert bort i fixturen.

