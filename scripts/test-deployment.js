#!/usr/bin/env node
/**
 * Test deployment staging locally
 *
 * This script mimics the GitHub Actions deployment process locally,
 * allowing you to verify the deployment will work before pushing.
 *
 * Usage: npm run test:deploy
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const STAGING_DIR = path.join(__dirname, '..', 'deploy-staging');

console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   Testing Deployment Staging (Local)                       ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

// Clean staging directory
console.log('🧹 Cleaning staging directory...');
if (fs.existsSync(STAGING_DIR)) {
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
}
fs.mkdirSync(STAGING_DIR, { recursive: true });

// Build 2dfea
console.log('');
console.log('🔨 Building 2dfea...');
try {
  execSync('cd 2dfea && npm run build', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Build failed!');
  process.exit(1);
}

// Copy 2dfea built files
console.log('');
console.log('📦 Copying 2dfea built files...');
const dfea2Staging = path.join(STAGING_DIR, '2dfea');
fs.mkdirSync(dfea2Staging, { recursive: true });
copyDir(path.join(__dirname, '..', '2dfea', 'dist'), dfea2Staging);

// Copy plain HTML modules
console.log('');
console.log('📦 Copying plain HTML modules...');
const modules = [
  'pryout',
  'concrete_plate_CFRP',
  'concrete_beam_design',
  'concrete_anchorage_length',
  'concrete_base_plate_compressive_design',
  'concrete_dowels',
  'concrete_minimum_reinforcement',
  'concrete_slab_design',
  'steel_beam_relative_deisgn',
  'steel_cross_section_database',
  'steel_fire_temperature',
  'weld_capacity',
  'THP',
  'clustering',
  'deliveryhub',
  'DIN_rod_torque',
  'ec2concrete',
  'seismic_ec8',
  'transversal_forces_stiffened_web',
  'transversal_forces_unstiffened_web',
  '2dframeanalysis'
];

modules.forEach(module => {
  const modulePath = path.join(__dirname, '..', module);
  if (fs.existsSync(modulePath) && fs.statSync(modulePath).isDirectory()) {
    console.log(`  ✓ ${module}`);
    copyDir(modulePath, path.join(STAGING_DIR, module));
  }
});

// Copy root files
console.log('');
console.log('📦 Copying root files...');
const rootFiles = ['index.html', 'robots.txt', 'sitemap.xml'];
rootFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✓ ${file}`);
    fs.copyFileSync(filePath, path.join(STAGING_DIR, file));
  }
});

// Copy directories
const rootDirs = ['module-registry', 'assets'];
rootDirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (fs.existsSync(dirPath)) {
    console.log(`  ✓ ${dir}/`);
    copyDir(dirPath, path.join(STAGING_DIR, dir));
  }
});

// Create .nojekyll
fs.writeFileSync(path.join(STAGING_DIR, '.nojekyll'), '');

console.log('');
console.log('✅ Staging complete!');
console.log('');
console.log('📂 Staging directory structure:');
execSync(`ls -lah "${STAGING_DIR}"`, { stdio: 'inherit' });

console.log('');
console.log('💡 Next steps:');
console.log('   1. Review staging directory: deploy-staging/');
console.log('   2. Test locally: npm run dev:serve');
console.log('   3. If all looks good: git push origin master');
console.log('');

// Helper function to copy directories recursively
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
