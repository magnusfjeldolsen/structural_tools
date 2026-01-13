# Deployment Guide: Option C Hybrid Architecture

This document describes the deployment architecture and workflow for the structural_tools project on GitHub Pages.

## Architecture Overview

The project uses a **hybrid deployment model** that combines:

- **Master branch**: Clean source code for all modules (both built and plain HTML)
- **gh-pages branch**: Production-ready deployment with:
  - Built 2D FEM React app (compiled JavaScript)
  - All plain HTML modules (concrete plate, steel beam, etc.)
  - Shared assets and resources

## Module Structure

### Built Module (Requires Build)
- **2dfea**: React + TypeScript application
  - Source: `2dfea/src/`
  - Config: `2dfea/vite.config.ts`
  - Build output: `2dfea/dist/`
  - Dependencies: npm packages

### Plain HTML Modules (No Build Required)
- `concrete_plate_CFRP/`
- `concrete_beam_design/`
- `concrete_anchorage_length/`
- `concrete_base_plate_compressive_design/`
- `concrete_dowels/`
- `concrete_minimum_reinforcement/`
- `concrete_slab_design/`
- `clustering/`
- `DIN_rod_torque/`
- `deliveryhub/`
- `ec2concrete/`
- `seismic_ec8/`
- `steel_beam_relative_design/`
- `steel_cross_section_database/`
- `steel_fire_temperature/`
- `THP/`
- `transversal_forces_stiffened_web/`
- `transversal_forces_unstiffened_web/`
- `weld_capacity/`
- `2dframeanalysis/`

## Deployment Workflow

### Quick Start: Local Development

```bash
# 1. Clone the repository
git clone https://github.com/magnusfjeldolsen/structural_tools.git
cd structural_tools

# 2. For 2dfea development, install dependencies
cd 2dfea
npm install

# 3. Start dev server on localhost:5173
npm run dev

# 4. For other modules, just open the HTML files in a browser
```

### Making Changes

#### Option A: Change 2dfea (React App)

```bash
# 1. Make changes in 2dfea/src/
# 2. Test locally with: npm run dev

# 3. Commit changes
git add 2dfea/src/
git commit -m "Add new feature to 2dfea"

# 4. Push to master
git push origin master
```

#### Option B: Change Plain HTML Modules

```bash
# 1. Edit the module directly (e.g., concrete_beam_design/index.html)
# 2. Test by opening in browser or local HTTP server

# 3. Commit changes
git add concrete_beam_design/
git commit -m "Update concrete beam design module"

# 4. Push to master
git push origin master
```

### Automated Deployment (GitHub Actions)

**Trigger**: Any push to master that includes changes in ANY module directory

**Workflow Steps**:
1. Checkout code from master
2. Install Node.js dependencies (for built modules)
3. Run TypeScript type checking (for 2dfea)
4. Build 2dfea (`npm run build`)
   - Compiles TypeScript to JavaScript
   - Bundles with Vite
   - Outputs to `2dfea/dist/`
5. Prepare staging directory:
   - Copy 2dfea built files to `staging/2dfea/`
   - Copy ALL plain HTML modules to staging
   - Copy root files (index.html, module-registry, etc.)
6. Deploy entire staging directory to gh-pages branch
7. GitHub Pages automatically publishes within 1-2 minutes

**Workflow File**: `.github/workflows/deploy-all-modules.yml`

**Key Feature**: All modules are deployed together atomically. This ensures:
- No module deployment can break another module
- gh-pages always has consistent state
- Single source of truth (master branch)

## GitHub Pages Configuration

### Current Setup
- **Source Branch**: `gh-pages`
- **Source Folder**: `/ (root)`
- **URL**: https://magnusfjeldolsen.github.io/structural_tools/

### How to Verify/Update Configuration

1. Go to: https://github.com/magnusfjeldolsen/structural_tools/settings/pages
2. Under **"Build and deployment"**:
   - **Source**: Should be `Deploy from a branch`
   - **Branch**: Should be `gh-pages`
   - **Folder**: Should be `/ (root)`

## Manual Deployment (If Needed)

If you need to manually deploy without pushing to master:

```bash
# 1. Make sure 2dfea is built
cd 2dfea
npm install
npm run build
cd ..

# 2. Check out gh-pages branch
git checkout gh-pages

# 3. Update 2dfea with built files
cp -r 2dfea/dist/* 2dfea/

# 4. Stage and commit
git add 2dfea/
git commit -m "Manual deployment: update 2dfea built files"

# 5. Push to origin
git push origin gh-pages

# 6. Go back to master
git checkout master
```

## Available URLs

### Root
- https://magnusfjeldolsen.github.io/structural_tools/

### 2D FEM (Built React App)
- https://magnusfjeldolsen.github.io/structural_tools/2dfea/

### Plain HTML Modules
- https://magnusfjeldolsen.github.io/structural_tools/concrete_plate_CFRP/
- https://magnusfjeldolsen.github.io/structural_tools/concrete_beam_design/
- https://magnusfjeldolsen.github.io/structural_tools/2dframeanalysis/
- ... and 17+ more modules

## Common Tasks

### Build 2dfea Locally

```bash
cd 2dfea
npm install
npm run build
npm run type-check  # Check types without building
```

### Test Before Deployment

```bash
# 1. Build locally
cd 2dfea && npm run build && cd ..

# 2. Serve locally to test GitHub Pages structure
python -m http.server 8000

# 3. Open http://localhost:8000/structural_tools/2dfea/
```

### Update Dependencies

```bash
cd 2dfea
npm update
npm audit fix  # Fix security vulnerabilities
npm install    # Update package-lock.json
git add package*.json
git commit -m "Update npm dependencies"
git push origin master
```

## Troubleshooting

### 2dfea Shows 404 on GitHub Pages

**Solution**: Wait 1-2 minutes for GitHub Pages cache to refresh, or:
1. Check that gh-pages branch has the built files: `git ls-tree origin/gh-pages 2dfea/`
2. Verify the files were deployed in the most recent commit

### Local Dev Works but GitHub Pages Shows Source Code

**Solution**: The built `dist/` wasn't deployed. Trigger a new build:
```bash
git push origin master
```
Or manually run the deployment steps above.

### Python Files Not Loading in 2dfea (404)

**Solution**: This happens when worker tries to load Python files from wrong path. Fixed in solverWorker.js to use relative paths. If issue persists:
1. Rebuild: `npm run build`
2. Redeploy: `git push origin master`

### Module Pages Show Blank Page

**Plain HTML Module Issue**:
1. Verify `index.html` exists in module directory
2. Check relative paths in HTML (should work at any depth)
3. Test locally before committing

## Important Notes

### .gitignore Configuration

The following are properly ignored and NOT committed to git:
- `node_modules/` - npm dependencies
- `2dfea/dist/` - build output
- `2dfea/tsconfig.json`, `2dfea/vite.config.ts` - build config (on gh-pages only)
- `2dfea/src/` - TypeScript source (on gh-pages only)

### .nojekyll File

A `.nojekyll` file exists at the gh-pages root to prevent Jekyll processing, which would cause MIME type errors for compiled JavaScript files.

### Worker Path Resolution

The solverWorker.js uses relative path resolution for Python files:
```javascript
// This works on both localhost and GitHub Pages
const setupResponse = await fetch(new URL('../python/setup_pynite_env.py', import.meta.url).href);
```

## Development Best Practices

1. **Always test locally first**
   ```bash
   npm run dev  # for 2dfea
   ```

2. **Run type checking before committing**
   ```bash
   npm run type-check
   ```

3. **Keep commits atomic** - one feature per commit

4. **Write descriptive commit messages**
   ```bash
   git commit -m "Add load case management to 2dfea"
   ```

5. **Use branches for larger features**
   ```bash
   git checkout -b feature/new-module
   # Make changes...
   git push origin feature/new-module
   # Create PR on GitHub
   ```

## Unified Deployment Architecture (Updated 2026)

### How It Works
- **Single workflow** deploys ALL modules to gh-pages
- **Trigger**: Any change to ANY module on master
- **Process**:
  1. Build 2dfea (TypeScript → JavaScript)
  2. Stage all modules in temporary directory
  3. Deploy entire staging directory to gh-pages
  4. GitHub Pages serves from gh-pages branch

### Module Types
1. **Built Modules** (2dfea): Requires npm build, outputs to dist/
2. **Plain HTML Modules** (pryout, concrete_*, steel_*, etc.): Copied as-is

### Making Changes to Any Module
1. Edit module on master branch (either built or plain HTML)
2. Commit and push to master
3. GitHub Actions automatically deploys EVERYTHING
4. All modules stay in sync on gh-pages

### Why This Approach?
- ✅ Prevents partial deployments breaking other modules
- ✅ Single source of truth (master)
- ✅ Atomic updates - all modules deploy together
- ✅ Simple mental model - push to master = full deploy
- ✅ No risk of pryout deployment breaking 2dfea or vice versa

## Key Files

- **Deployment Workflow**: `.github/workflows/deploy-all-modules.yml`
- **2dfea Config**: `2dfea/vite.config.ts`
- **2dfea Package**: `2dfea/package.json`
- **2dfea Worker**: `2dfea/public/workers/solverWorker.js`
- **2dfea Python Setup**: `2dfea/public/python/setup_pynite_env.py`
- **GitHub Pages Settings**: https://github.com/magnusfjeldolsen/structural_tools/settings/pages

## Support

For issues or questions:
1. Check this deployment guide first
2. Review recent commits: `git log --oneline -20`
3. Check GitHub Actions runs: https://github.com/magnusfjeldolsen/structural_tools/actions
4. See git history for file changes: `git log -- filename`
