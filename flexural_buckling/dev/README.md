# Development Tools - Flexural Buckling Module

This folder contains development tools for the flexural buckling module.

## start_dev_server.py

Python script that manages the local development server.

**Features:**
- Automatically kills any existing server on port 8000
- Starts a new HTTP server serving the structural_tools root directory
- Opens the front page (index.html) in your default browser
- Serves on http://localhost:8000

**Usage:**

```bash
# From anywhere in the project:
python flexural_buckling/dev/start_dev_server.py

# Or from the dev folder:
cd flexural_buckling/dev
python start_dev_server.py
```

**What it does:**

1. **Kills existing server**: Finds and terminates any process using port 8000
2. **Starts new server**: Launches Python's built-in HTTP server on port 8000
3. **Opens browser**: Automatically opens http://localhost:8000/index.html
4. **Serves from root**: The server runs from the structural_tools root, so all modules are accessible

**Keyboard shortcuts:**
- `Ctrl+C` - Stop the server

**Troubleshooting:**

If port 8000 is still in use after running the script:
- Manually check for processes: `netstat -ano | findstr :8000` (Windows)
- Kill manually: `taskkill /F /PID <PID>` (Windows)

## Server Access

Once running, you can access:
- Front page: http://localhost:8000/index.html
- Flexural Buckling module: http://localhost:8000/flexural_buckling/index.html
- Any other module: http://localhost:8000/<module_name>/index.html

## Why use this?

The local HTTP server is needed because:
1. **CORS restrictions**: Browsers block `file://` protocol from fetching JSON files
2. **Testing**: Mimics the production GitHub Pages environment
3. **Development**: All modules work the same as when deployed
