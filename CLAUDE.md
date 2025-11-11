# Claude Instructions for structural_tools

## Module Development

When prompted to create or modify a module, look inside global-devspecs. Consider both:
- plan_IO-structure_for_modules.md
- detailed-report-implementation-plan.md
- README.md
- Other relevant documents according to the prompt

Always propose a plan on what you will do. If in auto-accept, present the plan and start coding.

### Google Analytics Tag

When creating HTML files, ensure that every page has the Google Analytics tag directly after the `<head>` element. Copy and paste this tag exactly (only once per page):

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-BFVZQQ2LYN"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-BFVZQQ2LYN');
</script>
```

Test at: https://magnusfjeldolsen.github.io/structural_tools/

---

## Deployment Workflow

**READ DEPLOYMENT.md FOR FULL DETAILS.** This is a quick reference for common deployment tasks.

### Architecture Overview

The project uses a **hybrid deployment model**:
- **Master branch**: Clean source code for all modules
- **gh-pages branch**: Production deployment (auto-generated)
  - Built 2dfea React app in `2dfea/` directory
  - All plain HTML modules (20+ modules)
  - `.nojekyll` file (prevents Jekyll MIME type errors)

### Deployment Process

**Automatic deployment** is triggered by:
1. Push to `master` or `main` branch
2. Changes in `2dfea/` directory OR `.github/workflows/deploy-2dfea.yml` file
3. GitHub Actions workflow automatically:
   - Installs dependencies
   - Type-checks the code
   - Builds 2dfea
   - Regenerates module registry
   - Deploys to gh-pages
   - Publishes to GitHub Pages within 1-2 minutes

### Workflow: Make Changes → Test → Deploy

#### 1. Make Changes to 2dfea
```bash
# Edit files in 2dfea/src/
# Example: Add new feature or fix a bug
```

#### 2. Test Locally
```bash
cd 2dfea
npm run dev      # Starts dev server at localhost:5173
npm run type-check  # Check for TypeScript errors
```

#### 3. Commit and Push
```bash
git add 2dfea/
git commit -m "Add new feature to 2dfea"
git push origin master
```

#### 4. Monitor Deployment
- Check GitHub Actions: https://github.com/magnusfjeldolsen/structural_tools/actions
- Deployment should complete in 2-3 minutes
- Live at: https://magnusfjeldolsen.github.io/structural_tools/2dfea/

### Workflow: Update Plain HTML Module

```bash
# 1. Edit the module directly
# Example: concrete_beam_design/index.html

# 2. Ensure Google Analytics tag is in <head> (if new file)

# 3. Test in browser or local HTTP server

# 4. Commit and push
git add concrete_beam_design/
git commit -m "Update concrete beam design module"
git push origin master

# Note: Plain HTML modules are auto-deployed with no build step
```

### Important: 2dfea Specifics

#### Worker Path Resolution
The Web Worker (`solverWorker.js`) loads Python files using relative URL resolution:

```javascript
// This works on localhost AND GitHub Pages
const setupResponse = await fetch(new URL('../python/setup_pynite_env.py', import.meta.url).href);
```

**Do NOT use hardcoded paths** like `/public/python/file.py` — they break on GitHub Pages.

#### Vite Base Path
Production builds use: `base: '/structural_tools/2dfea/'`
This is automatically handled in vite.config.ts when NODE_ENV=production.

#### TypeScript and Zustand
- All Zustand store setters must have type annotations: `set((state: StateType) => {...})`
- Run `npm run type-check` before pushing to catch errors early

### Troubleshooting

**2dfea shows 404 on GitHub Pages?**
- Wait 1-2 minutes for cache refresh
- Verify workflow ran: https://github.com/magnusfjeldolsen/structural_tools/actions
- Check built files exist: `git ls-tree origin/gh-pages 2dfea/`

**Local dev works but GitHub Pages shows source code?**
- Built dist/ wasn't deployed. Push to master again.
- Or manually check workflow status and re-run if needed.

**Python files 404 in 2dfea?**
- Use relative URL resolution in Worker (see Worker Path Resolution above)
- Rebuild: `npm run build`
- Redeploy: `git push origin master`

**Plain HTML module shows blank?**
- Verify `index.html` exists in module directory
- Check relative paths in HTML (should work at any depth)
- Ensure Google Analytics tag is present

### Key Files

- **Deployment Guide**: `DEPLOYMENT.md` (comprehensive reference)
- **Workflow**: `.github/workflows/deploy-2dfea.yml`
- **2dfea Config**: `2dfea/vite.config.ts`
- **2dfea Package**: `2dfea/package.json`
- **Worker**: `2dfea/public/workers/solverWorker.js`
- **GitHub Pages Settings**: https://github.com/magnusfjeldolsen/structural_tools/settings/pages

### Available URLs

- **Root**: https://magnusfjeldolsen.github.io/structural_tools/
- **2dfea**: https://magnusfjeldolsen.github.io/structural_tools/2dfea/
- **Plain Modules**: https://magnusfjeldolsen.github.io/structural_tools/{module_name}/