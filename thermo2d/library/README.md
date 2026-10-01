# Firmabibliotek for thermo2d

Materialer og kurver som hele firmaet skal dele. Hver fil her leses av både
web-appen (bundles inn ved bygging) og MCP-serveren (`--workspace`-mappen kan
peke hit). Innebygde elementer kan ikke endres; legg heller inn et nytt element
med egen id.

## Format

Én fil per element eller per kategori, JSON eller CSV:

- `*.json`: ett `LibraryItem` eller en liste. Minste materiale:

```json
{
  "id": "firma-mineralull-035",
  "category": "material",
  "name": "Mineralull λD 0,035",
  "nameNb": "Mineralull λD 0,035",
  "tags": ["isolasjon", "insulation"],
  "quality": "manufacturer",
  "source": { "text": "Produsent, datablad 'Produktnavn', dato", "url": "https://..." },
  "material": {
    "name": "Mineralull λD 0,035",
    "category": "insulation",
    "model": { "kind": "constant", "lambda": 0.035, "cp": 1030, "rho": 30 },
    "emissivity": 0.9,
    "validRange": [-30, 250],
    "source": { "text": "Produsent, datablad 'Produktnavn', dato" },
    "quality": "manufacturer",
    "tags": ["isolasjon"]
  }
}
```

- `*.csv` (konstante materialer): `name;category;lambda;cp;rho;emissivity;source`

Temperaturavhengige materialer bruker `"model": { "kind": "table", "rows": [{ "theta": 20, "lambda": ..., "cp": ..., "rho": ... }, ...] }`.

## Regel

Alle verdier skal ha en sitering (standard med punkt/tabell, eller datablad med
dokumentnavn og dato). En kollega kontrollerer tallene mot kilden i PR-en før
filen flettes inn. Verdier uten datablad merkes `"quality": "typical"`.

Fra appen: «Eksporter til firmabibliotek» på et egendefinert materiale laster
ned en ferdig JSON-fil som legges her.
