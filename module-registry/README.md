# Module Registry System

This folder contains the auto-discovery and search system for all structural engineering calculators.

## Files

- **`generate-registry.js`** - Node.js script that scans all module folders and extracts metadata
- **`module-registry.json`** - Auto-generated registry file (do not edit manually)
- **`search-config.js`** - Search logic using Fuse.js for fuzzy search with live autocomplete

## How It Works

### 1. Auto-Discovery
The `generate-registry.js` script:
- Scans all folders one level down from the root directory
- Looks for `index.html` files in each folder
- Extracts metadata from HTML meta tags:
  - `<title>` - Module title
  - `<meta name="description">` - Module description
  - `<meta name="keywords">` - Searchable keywords
  - `<meta property="og:title">` - Alternative title
  - `<meta property="og:description">` - Alternative description
- Automatically categorizes modules (concrete, steel, structural-analysis, etc.)
- Generates `module-registry.json` with all metadata

### 2. Search System
The `search-config.js` implements:
- **Fuzzy Search** - Tolerates typos and approximate matches using Fuse.js
- **Weighted Search** - Prioritizes title matches (50%), then description (30%), then keywords (20%)
- **Live Autocomplete** - Updates results as user types (200ms debounce)
- **Keyboard Navigation** - Arrow keys, Enter to select, Escape to close
- **Visual Results** - Category icons, color coding, and match highlighting

### 3. Integration
The main `index.html` includes:
- Search bar component in the header
- Fuse.js library from CDN
- `search-config.js` script
- Custom styling for search dropdown

## Usage

### Regenerate Registry
When you add or modify modules, regenerate the registry:

```bash
npm run update-registry
```

Or run directly:

```bash
node module-registry/generate-registry.js
```

### Adding a New Module
1. Create a new folder with an `index.html` file
2. Add proper meta tags:
   ```html
   <title>Module Name - Description</title>
   <meta name="description" content="Detailed module description">
   <meta name="keywords" content="keyword1, keyword2, keyword3">
   ```
3. Run `npm run update-registry`
4. The module will automatically appear in search results

### Module Categories
The system automatically categorizes modules based on folder names and keywords:
- **concrete** - Concrete design tools
- **steel** - Steel design tools
- **structural-analysis** - FEA and frame analysis
- **timber** - Timber/wood structures
- **geotechnical** - Soil and foundation
- **other** - Miscellaneous tools

## Search Features

### Fuzzy Matching
Users can make typos and still find modules:
- "conrete beam" → finds "Concrete Beam Design"
- "weld capasity" → finds "Weld Capacity Calculator"
- "fire steel" → finds "Steel Fire Temperature Calculator"

### Multi-field Search
Search looks in:
1. Module titles (highest priority)
2. Descriptions
3. Keywords

### Real-time Results
- Minimum 2 characters to trigger search
- Debounced 200ms for performance
- Shows top 8 matching results
- Dropdown closes on click outside

### Keyboard Controls
- **↓ / ↑** - Navigate results
- **Enter** - Open selected module
- **Escape** - Close dropdown
- **Clear button** - Visible when text entered

## Technical Details

### Fuse.js Configuration
```javascript
{
  threshold: 0.4,        // 0 = exact, 1 = match anything
  distance: 100,         // Max character distance for fuzzy match
  minMatchCharLength: 2, // Minimum characters to match
  includeMatches: true,  // For highlighting
  includeScore: true     // For result ranking
}
```

### Performance
- Registry loads once on page load
- Search executes client-side (no server calls)
- Typical search completes in <10ms
- Supports 50+ modules without performance impact

## Maintenance

### Excluded Folders
The generator automatically excludes:
- `node_modules`
- `.git`
- `assets`
- `module-registry`
- `global-devspecs`
- Hidden folders (starting with `.`)

### Registry Format
```json
{
  "_meta": {
    "generated": "ISO timestamp",
    "total_modules": 20,
    "version": "1.0.0"
  },
  "modules": [
    {
      "id": "folder_name",
      "title": "Display Title",
      "description": "Module description",
      "keywords": ["keyword1", "keyword2"],
      "url": "./folder_name/index.html",
      "category": "concrete"
    }
  ]
}
```

## Future Enhancements
- [ ] Add module tags/filters in UI
- [ ] Recent search history
- [ ] Analytics on popular searches
- [ ] Module ratings/favorites
- [ ] Advanced filters (by standard, category, etc.)
