(function(){"use strict";importScripts("https://cdn.jsdelivr.net/pyodide/v0.29.1/full/pyodide.js");let t=null,r=!1;async function p(){if(r){console.log("[Worker] Already initialized, skipping");return}try{console.log("[Worker] Loading Pyodide runtime..."),t=await loadPyodide(),console.log("[Worker] Installing core dependencies..."),await t.loadPackage(["numpy","micropip"]),console.log("[Worker] Installing additional dependencies via micropip..."),await t.runPythonAsync(`
            import micropip
            await micropip.install("scipy")
            await micropip.install("matplotlib")
            # prettytable not needed for core PyNite functionality
        `),console.log("[Worker] Setting up package mocking for PyNite...");const n=self.location.pathname.substring(0,self.location.pathname.lastIndexOf("/")),a=n+"/../python/setup_pynite_env.py",s=await fetch(a);if(!s.ok)throw new Error(`Failed to fetch setup_pynite_env.py: ${s.status} (path: ${a})`);const o=await s.text();await t.runPythonAsync(o),await t.runPythonAsync("setup_package_mocking()"),console.log("[Worker] Installing PyNite..."),await t.runPythonAsync(`
            import micropip
            # Install PyNite 2.0.0 - last version before numpy 2.4+ requirement (v2.0.3+)
            await micropip.install("PyniteFEA==2.0.0")
        `),console.log("[Worker] Loading PyNite analyzer module...");const e=n+"/../python/pynite_analyzer.py",i=await fetch(e);if(!i.ok)throw new Error(`Failed to fetch pynite_analyzer.py: ${i.status} (path: ${e})`);const l=await i.text();if(await t.runPythonAsync(l),console.log("[Worker] Running self-test..."),!await t.runPythonAsync(`
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
        `))throw new Error("Self-test failed - analyzer did not return success");console.log("[Worker] ✓ Initialization complete!"),r=!0}catch(n){throw console.error("[Worker] Initialization failed:",n),n}}async function y(n,a,s){if(!t||!r)throw new Error("Pyodide not initialized. Send 'init' message first.");const o=JSON.stringify(n).replace(/'/g,"\\'");let e;if(a==="loadCase")e=`analyze_frame_single_case('${o}', '${s}')`;else if(a==="combination"){const l=JSON.stringify(s).replace(/'/g,"\\'");e=`analyze_frame_combination('${o}', '${l}')`}else e=`analyze_frame_json('${o}')`;const i=await t.runPythonAsync(e);return JSON.parse(i)}self.onmessage=async n=>{const{type:a,payload:s,msgId:o}=n.data;try{switch(a){case"init":console.log("[Worker] Received init request"),await p(),self.postMessage({type:"ready",msgId:o});break;case"analyze":console.log("[Worker] Received analysis request");const{modelData:e,analysisType:i,targetName:l}=s,c=await y(e,i||"simple",l);self.postMessage({type:"results",payload:c,msgId:o});break;case"ping":self.postMessage({type:"pong",payload:{initialized:r},msgId:o});break;default:throw new Error(`Unknown message type: ${a}`)}}catch(e){console.error("[Worker] Error:",e),self.postMessage({type:"error",payload:{message:e.message,stack:e.stack,phase:r?"analysis":"initialization"},msgId:o})}},console.log("[Worker] PyNite Solver Worker loaded and ready")})();
//# sourceMappingURL=solverWorker-2qW0q_iS.js.map
