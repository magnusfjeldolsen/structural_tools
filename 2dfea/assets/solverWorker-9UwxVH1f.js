(function(){"use strict";importScripts("https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js");let t=null,s=!1;async function c(){if(s){console.log("[Worker] Already initialized, skipping");return}try{console.log("[Worker] Loading Pyodide runtime..."),t=await loadPyodide(),console.log("[Worker] Installing core dependencies..."),await t.loadPackage(["numpy","micropip"]),console.log("[Worker] Installing additional dependencies via micropip..."),await t.runPythonAsync(`
            import micropip
            await micropip.install("prettytable")
            await micropip.install("scipy")
            await micropip.install("matplotlib")
        `),console.log("[Worker] Setting up package mocking for PyNite...");const o=await fetch("/public/python/setup_pynite_env.py");if(!o.ok)throw new Error(`Failed to fetch setup_pynite_env.py: ${o.status}`);const i=await o.text();await t.runPythonAsync(i),await t.runPythonAsync("setup_package_mocking()"),console.log("[Worker] Installing PyNite..."),await t.runPythonAsync(`
            import micropip
            await micropip.install("PyniteFEA")
        `),console.log("[Worker] Loading PyNite analyzer module...");const n=await fetch("/public/python/pynite_analyzer.py");if(!n.ok)throw new Error(`Failed to fetch pynite_analyzer.py: ${n.status}`);const a=await n.text();if(await t.runPythonAsync(a),console.log("[Worker] Running self-test..."),!await t.runPythonAsync(`
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
        `))throw new Error("Self-test failed - analyzer did not return success");console.log("[Worker] ✓ Initialization complete!"),s=!0}catch(o){throw console.error("[Worker] Initialization failed:",o),o}}async function p(o,i,n){if(!t||!s)throw new Error("Pyodide not initialized. Send 'init' message first.");const a=JSON.stringify(o).replace(/'/g,"\\'");let e;if(i==="loadCase")e=`analyze_frame_single_case('${a}', '${n}')`;else if(i==="combination"){const l=JSON.stringify(n).replace(/'/g,"\\'");e=`analyze_frame_combination('${a}', '${l}')`}else e=`analyze_frame_json('${a}')`;const r=await t.runPythonAsync(e);return JSON.parse(r)}self.onmessage=async o=>{const{type:i,payload:n,msgId:a}=o.data;try{switch(i){case"init":console.log("[Worker] Received init request"),await c(),self.postMessage({type:"ready",msgId:a});break;case"analyze":console.log("[Worker] Received analysis request");const{modelData:e,analysisType:r,targetName:l}=n,y=await p(e,r||"simple",l);self.postMessage({type:"results",payload:y,msgId:a});break;case"ping":self.postMessage({type:"pong",payload:{initialized:s},msgId:a});break;default:throw new Error(`Unknown message type: ${i}`)}}catch(e){console.error("[Worker] Error:",e),self.postMessage({type:"error",payload:{message:e.message,stack:e.stack,phase:s?"analysis":"initialization"},msgId:a})}},console.log("[Worker] PyNite Solver Worker loaded and ready")})();
//# sourceMappingURL=solverWorker-9UwxVH1f.js.map
