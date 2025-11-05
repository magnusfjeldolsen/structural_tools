/**
 * Auto-generate module registry by scanning all folders one level down from root
 * Extracts metadata from index.html files in each module folder
 *
 * Usage: node module-registry/generate-registry.js
 */

const fs = require('fs');
const path = require('path');

// Root directory (one level up from this script)
const ROOT_DIR = path.join(__dirname, '..');
const OUTPUT_FILE = path.join(__dirname, 'module-registry.json');

/**
 * Extract meta tag content from HTML
 */
function extractMetaTag(html, name) {
  // Try name attribute
  const nameRegex = new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']+)["']`, 'i');
  const nameMatch = html.match(nameRegex);
  if (nameMatch) return nameMatch[1];

  // Try property attribute (for og: tags)
  const propRegex = new RegExp(`<meta\\s+property=["']${name}["']\\s+content=["']([^"']+)["']`, 'i');
  const propMatch = html.match(propRegex);
  if (propMatch) return propMatch[1];

  return null;
}

/**
 * Extract title from HTML
 */
function extractTitle(html) {
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  return titleMatch ? titleMatch[1].trim() : null;
}

/**
 * Parse keywords string into array
 */
function parseKeywords(keywordsString) {
  if (!keywordsString) return [];
  return keywordsString
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(k => k.length > 0);
}

/**
 * Determine category from folder name or keywords
 */
function determineCategory(folderId, keywords) {
  const lowerFolderId = folderId.toLowerCase();

  if (lowerFolderId.includes('concrete')) return 'concrete';
  if (lowerFolderId.includes('steel')) return 'steel';
  if (lowerFolderId.includes('timber') || lowerFolderId.includes('wood')) return 'timber';
  if (lowerFolderId.includes('geotechnical') || lowerFolderId.includes('soil')) return 'geotechnical';
  if (lowerFolderId.includes('frame') || lowerFolderId.includes('2d') || lowerFolderId.includes('fem') || lowerFolderId.includes('fea')) return 'structural-analysis';

  // Check keywords
  const keywordStr = keywords.join(' ');
  if (keywordStr.includes('concrete')) return 'concrete';
  if (keywordStr.includes('steel')) return 'steel';
  if (keywordStr.includes('timber') || keywordStr.includes('wood')) return 'timber';
  if (keywordStr.includes('structural') || keywordStr.includes('analysis') || keywordStr.includes('fem') || keywordStr.includes('fea')) return 'structural-analysis';

  return 'other';
}

/**
 * Scan a single module folder
 */
function scanModule(folderName) {
  const indexPath = path.join(ROOT_DIR, folderName, 'index.html');

  // Check if index.html exists
  if (!fs.existsSync(indexPath)) {
    return null;
  }

  try {
    const html = fs.readFileSync(indexPath, 'utf-8');

    // Extract metadata
    const title = extractTitle(html) || extractMetaTag(html, 'og:title') || folderName;
    const description = extractMetaTag(html, 'description') || extractMetaTag(html, 'og:description') || '';
    const keywordsStr = extractMetaTag(html, 'keywords') || '';
    const keywords = parseKeywords(keywordsStr);

    // Determine category
    const category = determineCategory(folderName, keywords);

    return {
      id: folderName,
      title: title,
      description: description,
      keywords: keywords,
      url: `./${folderName}/index.html`,
      category: category
    };
  } catch (error) {
    console.error(`Error reading ${indexPath}:`, error.message);
    return null;
  }
}

/**
 * Validate module data and remove duplicates
 */
function validateAndDedup(modules) {
  const seen = new Map();
  const duplicates = [];
  const validated = [];

  modules.forEach(module => {
    // Validate required fields
    if (!module.id || !module.title || !module.url) {
      console.warn(`⚠ Skipping invalid module: missing required fields`, module);
      return;
    }

    // Check for duplicates by ID
    if (seen.has(module.id)) {
      console.warn(`⚠ Duplicate module ID found: "${module.id}" - keeping first occurrence`);
      duplicates.push(module.id);
      return;
    }

    // Check for duplicates by URL
    const existingByUrl = validated.find(m => m.url === module.url);
    if (existingByUrl) {
      console.warn(`⚠ Duplicate URL found: "${module.url}" - keeping first occurrence`);
      duplicates.push(module.id);
      return;
    }

    // Sanitize strings
    module.title = module.title.trim();
    module.description = (module.description || '').trim();
    module.keywords = module.keywords.filter(k => k && k.trim()).map(k => k.trim());

    seen.set(module.id, true);
    validated.push(module);
  });

  return { validated, duplicates };
}

/**
 * Main function to generate registry
 */
function generateRegistry() {
  console.log('\n' + '='.repeat(50));
  console.log('MODULE REGISTRY GENERATOR');
  console.log('='.repeat(50) + '\n');

  console.log('📁 Scanning modules...\n');

  // Read all items in root directory
  const items = fs.readdirSync(ROOT_DIR, { withFileTypes: true });

  // Filter for directories only (excluding special folders)
  const excludeFolders = ['node_modules', '.git', 'assets', 'module-registry', 'global-devspecs', '.github', '.vscode'];
  const folders = items
    .filter(item => item.isDirectory())
    .filter(item => !excludeFolders.includes(item.name))
    .filter(item => !item.name.startsWith('.'))
    .map(item => item.name)
    .sort();

  console.log(`📊 Found ${folders.length} potential module folders\n`);

  // Scan each folder
  const modules = [];
  let successCount = 0;
  let skipCount = 0;

  folders.forEach(folder => {
    const moduleData = scanModule(folder);
    if (moduleData) {
      console.log(`✓ ${folder}`);
      console.log(`  Title: ${moduleData.title}`);
      console.log(`  Category: ${moduleData.category}`);
      console.log(`  Keywords: ${moduleData.keywords.length} found`);
      console.log('');
      modules.push(moduleData);
      successCount++;
    } else {
      skipCount++;
    }
  });

  if (skipCount > 0) {
    console.log(`ℹ Skipped ${skipCount} folder(s) without valid index.html\n`);
  }

  // Validate and deduplicate
  console.log('🔍 Validating and deduplicating modules...\n');
  const { validated: uniqueModules, duplicates } = validateAndDedup(modules);

  if (duplicates.length > 0) {
    console.log(`⚠ Removed ${duplicates.length} duplicate(s): ${duplicates.join(', ')}\n`);
  }

  // Sort modules by title
  uniqueModules.sort((a, b) => a.title.localeCompare(b.title));

  // Create registry object with metadata
  const registry = {
    _meta: {
      generated: new Date().toISOString(),
      total_modules: uniqueModules.length,
      version: '1.0.0',
      duplicates_removed: duplicates.length,
      skipped_count: skipCount
    },
    modules: uniqueModules
  };

  // Write to JSON file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2), 'utf-8');

  console.log('='.repeat(50));
  console.log('✅ REGISTRY GENERATION COMPLETE');
  console.log('='.repeat(50));
  console.log(`📈 Summary:`);
  console.log(`   • Scanned folders: ${folders.length}`);
  console.log(`   • Valid modules: ${successCount}`);
  console.log(`   • Skipped: ${skipCount}`);
  console.log(`   • Duplicates removed: ${duplicates.length}`);
  console.log(`   • Final count: ${uniqueModules.length}`);
  console.log(`   • Output file: ${OUTPUT_FILE}`);
  console.log('='.repeat(50) + '\n');
}

// Run the generator
generateRegistry();
