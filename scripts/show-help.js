#!/usr/bin/env node
/**
 * Show available development commands
 */

console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   Structural Tools - Development Commands                  ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');
console.log('📦 DEVELOPMENT');
console.log('   npm run dev             Start 2dfea in dev mode (hot reload)');
console.log('   npm run dev:2dfea       Same as npm run dev');
console.log('   npm run dev:serve       Serve all modules (mimics GitHub Pages)');
console.log('');
console.log('🔨 BUILD');
console.log('   npm run build           Build 2dfea + update registry');
console.log('   npm run build:2dfea     Build only 2dfea module');
console.log('');
console.log('👀 PREVIEW');
console.log('   npm run preview         Build everything + serve locally');
console.log('   npm run test:deploy     Test deployment staging locally');
console.log('');
console.log('🛠️  UTILITIES');
console.log('   npm run update-registry Regenerate module registry');
console.log('   npm run help            Show this help message');
console.log('');
console.log('📖 TYPICAL WORKFLOWS');
console.log('');
console.log('   1️⃣  Develop 2dfea (React/TypeScript):');
console.log('      npm run dev          # Hot reload dev server');
console.log('      # Make changes in 2dfea/src/');
console.log('      # Changes update automatically');
console.log('');
console.log('   2️⃣  Develop plain HTML module (pryout, concrete_*, etc.):');
console.log('      npm run dev:serve    # Start local server');
console.log('      # Edit HTML/JS/CSS files');
console.log('      # Refresh browser to see changes');
console.log('');
console.log('   3️⃣  Test before pushing to GitHub:');
console.log('      npm run preview      # Full build + serve');
console.log('      # Open http://localhost:8080/structural_tools/');
console.log('      # Test all modules');
console.log('      # If all good: git push origin master');
console.log('');
console.log('   4️⃣  Test deployment staging:');
console.log('      npm run test:deploy  # Mimics GitHub Actions');
console.log('      # Check deploy-staging/ directory');
console.log('      # Verify all modules are present');
console.log('');
console.log('🌐 LOCAL URLs (when server is running):');
console.log('   http://localhost:8080/structural_tools/');
console.log('   http://localhost:8080/structural_tools/2dfea/');
console.log('   http://localhost:8080/structural_tools/pryout/');
console.log('');
console.log('📚 More info: See DEPLOYMENT.md');
console.log('');
