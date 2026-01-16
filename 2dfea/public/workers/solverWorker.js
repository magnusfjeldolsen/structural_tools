/**
 * PyNite Analysis Worker
 * Lightweight JavaScript worker that loads Pyodide and Python modules
 *
 * Architecture:
 * 1. Load Pyodide runtime
 * 2. Install dependencies (numpy, scipy, etc.)
 * 3. Setup package mocking (for PyNite compatibility)
 * 4. Install PyNite
 * 5. Load Python analysis modules from /python/ directory
 * 6. Handle analysis requests via message passing
 */

// Load Pyodide from CDN
importScripts("https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js");

let pyodide = null;
let isInitialized = false;

/**
 * Initialize Pyodide environment
 * This runs once when worker receives 'init' message
 */
async function initializePyodide() {
    if (isInitialized) {
        console.log("[Worker] Already initialized, skipping");
        return;
    }

    try {
        console.log("[Worker] Loading Pyodide runtime...");
        pyodide = await loadPyodide();

        console.log("[Worker] Installing core dependencies...");
        await pyodide.loadPackage(["numpy", "micropip"]);

        console.log("[Worker] Installing additional dependencies via micropip...");
        await pyodide.runPythonAsync(`
            import micropip
            await micropip.install("prettytable")
            await micropip.install("scipy")
            await micropip.install("matplotlib")
        `);

        console.log("[Worker] Setting up package mocking for PyNite...");
        // Fetch and run the package mocking setup
        // Use self.location to construct path (classic workers don't support import.meta)
        const workerDir = self.location.pathname.substring(0, self.location.pathname.lastIndexOf('/'));
        const setupPath = workerDir + '/../python/setup_pynite_env.py';
        const setupResponse = await fetch(setupPath);
        if (!setupResponse.ok) {
            throw new Error(`Failed to fetch setup_pynite_env.py: ${setupResponse.status} (path: ${setupPath})`);
        }
        const setupCode = await setupResponse.text();
        await pyodide.runPythonAsync(setupCode);
        await pyodide.runPythonAsync('setup_package_mocking()');

        console.log("[Worker] Installing PyNite...");
        await pyodide.runPythonAsync(`
            import micropip
            # Install PyNiteFEA v2.0.2 which is compatible with numpy 2.2.5
            # Pyodide supports numpy up to 2.2.5, and v2.0.2 is the last version compatible
            await micropip.install("PyniteFEA==2.0.2")
        `);

        console.log("[Worker] Loading PyNite analyzer module...");
        // Fetch and load the main analysis module
        const analyzerPath = workerDir + '/../python/pynite_analyzer.py';
        const analyzerResponse = await fetch(analyzerPath);
        if (!analyzerResponse.ok) {
            throw new Error(`Failed to fetch pynite_analyzer.py: ${analyzerResponse.status} (path: ${analyzerPath})`);
        }
        const analyzerCode = await analyzerResponse.text();
        await pyodide.runPythonAsync(analyzerCode);

        console.log("[Worker] Running self-test...");
        // Test that the analyzer works
        const testResult = await pyodide.runPythonAsync(`
            import json
            test_data = {
                'nodes': [
                    {'name': 'N1', 'x': 0, 'y': 0, 'support': 'fixed'},
                    {'name': 'N2', 'x': 4, 'y': 0, 'support': 'free'}
                ],
                'elements': [
                    {'name': 'E1', 'nodeI': 'N1', 'nodeJ': 'N2', 'E': 210, 'I': 1e-4, 'A': 1e-3}
                ],
                'loads': {
                    'nodal': [{'node': 'N2', 'fx': 0, 'fy': -10, 'mz': 0}],
                    'distributed': [],
                    'elementPoint': []
                }
            }
            result = analyze_frame_json(json.dumps(test_data))
            json.loads(result).get('success', False)
        `);

        if (!testResult) {
            throw new Error("Self-test failed - analyzer did not return success");
        }

        console.log("[Worker] ✓ Initialization complete!");
        isInitialized = true;

    } catch (error) {
        console.error("[Worker] Initialization failed:", error);
        throw error;
    }
}

/**
 * Run analysis using loaded Python functions
 *
 * @param {Object} modelData - Frame model data
 * @param {string} analysisType - 'simple' | 'loadCase' | 'combination'
 * @param {string|Object} targetName - Load case name or combination object
 * @returns {Object} Analysis results
 */
async function runAnalysis(modelData, analysisType, targetName) {
    if (!pyodide || !isInitialized) {
        throw new Error("Pyodide not initialized. Send 'init' message first.");
    }

    const modelJson = JSON.stringify(modelData).replace(/'/g, "\\'");

    let pythonCode;
    if (analysisType === 'loadCase') {
        pythonCode = `analyze_frame_single_case('${modelJson}', '${targetName}')`;
    } else if (analysisType === 'combination') {
        const comboJson = JSON.stringify(targetName).replace(/'/g, "\\'");
        pythonCode = `analyze_frame_combination('${modelJson}', '${comboJson}')`;
    } else {
        // Simple analysis (all loads combined)
        pythonCode = `analyze_frame_json('${modelJson}')`;
    }

    const resultJson = await pyodide.runPythonAsync(pythonCode);
    return JSON.parse(resultJson);
}

/**
 * Message handler - listens for commands from main thread
 *
 * Message format:
 * {
 *   type: 'init' | 'analyze',
 *   payload: { modelData, analysisType, targetName },
 *   msgId: 'unique-id'
 * }
 */
self.onmessage = async (e) => {
    const { type, payload, msgId } = e.data;

    try {
        switch(type) {
            case 'init':
                console.log("[Worker] Received init request");
                await initializePyodide();
                self.postMessage({ type: 'ready', msgId });
                break;

            case 'analyze':
                console.log("[Worker] Received analysis request");
                const { modelData, analysisType, targetName } = payload;
                const result = await runAnalysis(modelData, analysisType || 'simple', targetName);
                self.postMessage({ type: 'results', payload: result, msgId });
                break;

            case 'ping':
                // Health check
                self.postMessage({
                    type: 'pong',
                    payload: { initialized: isInitialized },
                    msgId
                });
                break;

            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    } catch (error) {
        console.error("[Worker] Error:", error);
        self.postMessage({
            type: 'error',
            payload: {
                message: error.message,
                stack: error.stack,
                phase: isInitialized ? 'analysis' : 'initialization'
            },
            msgId
        });
    }
};

// Log when worker starts
console.log("[Worker] PyNite Solver Worker loaded and ready");
