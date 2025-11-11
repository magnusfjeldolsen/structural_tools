# 2D FEM - Interactive GUI: GitHub Pages Deployment Plan

## Overview

This document outlines the complete deployment strategy for automatically building and deploying the 2D FEM Interactive GUI to GitHub Pages whenever code is pushed to the repository.

---

## Architecture

### Current Setup
- **Repository**: `magnusfjeldolsen/structural_tools` (GitHub)
- **Build Tool**: Vite (React-based frontend)
- **Output**: Static files in `dist/` directory
- **Base URL**: `https://magnusfjeldolsen.github.io/structural_tools/2dfea/`

### Deployment Flow
```
Developer commits code
    ↓
Push to GitHub
    ↓
GitHub Actions workflow triggered
    ↓
npm install dependencies
    ↓
npm run build (TypeScript check + Vite build)
    ↓
Generated dist/ contents
    ↓
Deploy to gh-pages branch
    ↓
Updated on GitHub Pages
```

---

## Implementation Plan

### Phase 1: GitHub Actions Workflow

Create `.github/workflows/deploy-2dfea.yml`:

```yaml
name: Deploy 2D FEM to GitHub Pages

on:
  push:
    branches: [ main, master, 2dfeauserinteractivity ]
    paths:
      - '2dfea/**'
      - '.github/workflows/deploy-2dfea.yml'

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: '2dfea/package-lock.json'

      - name: Install dependencies
        working-directory: 2dfea
        run: npm ci

      - name: Type check
        working-directory: 2dfea
        run: npm run type-check

      - name: Build application
        working-directory: 2dfea
        run: npm run build
        env:
          VITE_BASE: /structural_tools/2dfea/

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./2dfea/dist
          destination_dir: 2dfea
          cname: # Leave empty for GitHub Pages subdomain
```

### Phase 2: Vite Configuration Update

Update `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/structural_tools/2dfea/',
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,  // Set to false for production
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'zustand'],
        }
      }
    }
  },
});
```

### Phase 3: Environment Setup

#### GitHub Repository Settings

1. **Enable GitHub Pages**:
   - Go to Settings → Pages
   - Select "Deploy from a branch"
   - Choose branch: `gh-pages`
   - Folder: `/ (root)`

2. **Add Secrets** (if needed for custom domains):
   - Settings → Secrets and variables → Actions
   - No custom secrets needed for standard GitHub Pages

#### Branch Protection (Optional)
- Settings → Branches → Add rule
- Branch name pattern: `main` or `master`
- Require status checks to pass before merging
- Require branches to be up to date before merging

### Phase 4: package.json Updates

Update `2dfea/package.json`:

```json
{
  "name": "2dfea",
  "version": "0.1.0",
  "type": "module",
  "homepage": "https://magnusfjeldolsen.github.io/structural_tools/2dfea/",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit",
    "deploy": "npm run build && npm run preview"
  },
  ...
}
```

---

## Workflow Steps

### 1. Initial Setup (One-time)

```bash
# Navigate to repository root
cd structural_tools

# Create GitHub Actions directory if it doesn't exist
mkdir -p .github/workflows

# Create deploy workflow file
touch .github/workflows/deploy-2dfea.yml
```

Copy the workflow YAML content into `.github/workflows/deploy-2dfea.yml`

### 2. Update Configuration Files

Update `vite.config.ts` with base path configuration.

### 3. Test Locally

```bash
cd 2dfea

# Build locally to verify
npm run build

# Preview the build output
npm run preview
```

### 4. Commit and Push

```bash
git add .github/workflows/deploy-2dfea.yml
git add 2dfea/vite.config.ts
git add 2dfea/package.json
git commit -m "Setup GitHub Pages deployment for 2D FEM"
git push origin <branch-name>
```

### 5. Monitor Deployment

1. Go to repository → Actions tab
2. Watch workflow progress in real-time
3. Check deployment status
4. View deployed app at: `https://magnusfjeldolsen.github.io/structural_tools/2dfea/`

---

## Deployment Triggers

The workflow automatically runs when:

1. **Code is pushed** to tracked branches:
   - `main`
   - `master`
   - `2dfeauserinteractivity` (development branch)

2. **Files changed** in:
   - `2dfea/**` (any file in 2dfea directory)
   - `.github/workflows/deploy-2dfea.yml` (workflow file itself)

This ensures:
- Only relevant code changes trigger deployments
- Development doesn't interfere with main branch
- Workflow updates don't cause cascading rebuilds

---

## Build & Deploy Details

### Build Process

1. **Install Dependencies** (`npm ci`)
   - Uses package-lock.json for deterministic installs
   - Faster than `npm install`
   - Recommended for CI/CD

2. **Type Check** (`npm run type-check`)
   - Runs TypeScript compiler without emitting files
   - Catches type errors before build
   - Ensures code quality

3. **Build** (`npm run build`)
   - Runs TypeScript compilation
   - Bundles with Vite
   - Outputs to `dist/` directory
   - Creates optimized production build

### Deployment

- Uses `peaceiris/actions-gh-pages@v3` action
- Publishes `dist/` directory contents
- Places files in `gh-pages` branch
- Automatically published by GitHub Pages

---

## Troubleshooting

### Deployment Fails

**Check logs**:
1. Go to Actions tab
2. Click on failed workflow run
3. Expand failed job to see error details

**Common Issues**:

| Issue | Solution |
|-------|----------|
| TypeScript errors | Fix type errors shown in logs, re-push |
| Build errors | Check npm scripts, verify dependencies installed |
| Page not updating | Clear browser cache, wait 1-2 minutes for CDN |
| 404 errors | Verify base path in vite.config.ts is correct |

### Manual Redeployment

```bash
# Clean and rebuild locally
cd 2dfea
rm -rf dist
npm install
npm run build

# Verify build was successful
npm run preview
```

---

## Monitoring & Maintenance

### Regular Checks

1. **After each merge to main/master**:
   - Check Actions tab for workflow success
   - Verify app loads at GitHub Pages URL
   - Test key functionality in deployed version

2. **Weekly**:
   - Review GitHub Actions usage (free tier: 2000 minutes/month)
   - Check for any workflow failures
   - Monitor build times

### Performance Optimization

- **Sourcemaps**: Currently enabled for debugging. Disable in production:
  ```typescript
  sourcemap: process.env.NODE_ENV === 'development'
  ```

- **Code Splitting**: Configure in vite.config.ts:
  ```typescript
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor': ['react', 'react-dom', 'zustand'],
      }
    }
  }
  ```

- **Caching**: GitHub Pages serves with appropriate cache headers

---

## Alternative: Manual Deployment Script

If GitHub Actions is not available, create a manual deployment script:

### `scripts/deploy.sh`

```bash
#!/bin/bash

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

cd 2dfea

echo "Building 2D FEM..."
npm run build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build successful${NC}"

    # Commit to gh-pages branch (assuming you have git-subtree installed)
    git subtree push --prefix 2dfea/dist origin gh-pages

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Deployment successful${NC}"
        echo -e "${GREEN}View at: https://magnusfjeldolsen.github.io/structural_tools/2dfea/${NC}"
    else
        echo -e "${RED}✗ Deployment failed${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi
```

Usage:
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

---

## Security Considerations

1. **GitHub Token**: Uses automatic `${{ secrets.GITHUB_TOKEN }}` (no manual setup needed)
2. **Branch Protection**: Only deploy after status checks pass
3. **Review**: All PRs should be reviewed before merge to main
4. **Secrets**: No sensitive data should be in `vite.config.ts` or environment

---

## Future Enhancements

1. **Preview Deployments**: Deploy pull requests to separate URL
2. **Performance Monitoring**: Track build times and bundle sizes
3. **Automated Tests**: Run tests before deployment
4. **Staging Environment**: Deploy to staging before production
5. **Release Notes**: Automatically generate from commit messages
6. **Analytics**: Track page views and user interactions

---

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [Vite Documentation](https://vitejs.dev/)
- [peaceiris/actions-gh-pages](https://github.com/peaceiris/actions-gh-pages)

---

## Quick Start Checklist

- [ ] Create `.github/workflows/deploy-2dfea.yml`
- [ ] Update `2dfea/vite.config.ts` with base path
- [ ] Update `2dfea/package.json` with homepage and scripts
- [ ] Commit and push to trigger first deployment
- [ ] Enable GitHub Pages in repository settings
- [ ] Verify deployment at GitHub Pages URL
- [ ] Test app functionality in deployed version
- [ ] Document any issues in repository wiki

---

**Last Updated**: November 5, 2024
**Status**: Ready for Implementation
