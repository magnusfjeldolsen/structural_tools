/**
 * Concrete Minimum Reinforcement Calculator - Main Script
 * Based on Eurocode 2 (EC2) standards
 */

// Utility functions
function toFixedIfNeeded(num, digits = 2) {
    return parseFloat(num.toFixed(digits));
}

// Tab switching functionality
function switchTab(tabName) {
    // Remove active class from all tabs
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
        button.classList.add('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
        button.classList.remove('border-blue-500', 'text-blue-600');
    });

    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });

    // Show selected tab content
    const selectedTab = document.getElementById(`tab-${tabName}`);
    const selectedContent = document.getElementById(`content-${tabName}`);

    if (selectedTab && selectedContent) {
        selectedTab.classList.add('active');
        selectedTab.classList.remove('border-transparent', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300');
        selectedTab.classList.add('border-blue-500', 'text-blue-600');
        selectedContent.style.display = 'block';
    }
}

// Initialize page on load
document.addEventListener('DOMContentLoaded', function() {
    // Set default tab
    switchTab('plates');

    // Update concrete properties on load
    updateConcreteProperties();

    // Update layer spacing based on default bar diameter
    updateLayerSpacing();
});

// Update concrete properties based on grade selection
function updateConcreteProperties() {
    const gradeSelect = document.getElementById('concrete_grade');
    const fctmInput = document.getElementById('fctm');
    const warningSpan = document.getElementById('fctm-override-warning');

    if (gradeSelect.value === 'custom') {
        fctmInput.disabled = false;
        fctmInput.style.backgroundColor = '#4b5563';
        warningSpan.style.display = 'inline';
    } else {
        const fck = parseInt(gradeSelect.value);

        // Use EC2ConcreteUtils if available, otherwise use simplified calculation
        let fctm;
        if (typeof EC2ConcreteUtils !== 'undefined') {
            try {
                const params = EC2ConcreteUtils.getConcreteParameters(fck);
                fctm = params.fctm;
            } catch (error) {
                console.warn('EC2ConcreteUtils error:', error);
                fctm = calculateFctmSimplified(fck);
            }
        } else {
            fctm = calculateFctmSimplified(fck);
        }

        fctmInput.value = toFixedIfNeeded(fctm, 2);
        fctmInput.disabled = true;
        fctmInput.style.backgroundColor = '#374151';
        warningSpan.style.display = 'none';
    }
}

// Simplified fctm calculation for fallback
function calculateFctmSimplified(fck) {
    if (fck <= 50) {
        return 0.30 * Math.pow(fck, 2/3);
    } else {
        return 2.12 * Math.log(1 + (fck + 8) / 10);
    }
}

// Update layer spacing when bar diameter changes or number of layers changes
function updateLayerSpacing() {
    const nLayers = parseInt(document.getElementById('n_layers').value);
    const layerSpacingInput = document.getElementById('layer_spacing');

    if (nLayers === 1) {
        layerSpacingInput.disabled = true;
        layerSpacingInput.value = 0;
        layerSpacingInput.style.backgroundColor = '#374151';
    } else {
        layerSpacingInput.disabled = false;
        layerSpacingInput.style.backgroundColor = '#4b5563';

        // Get the first selected bar diameter for auto calculation
        const selectedDiameters = getSelectedBarDiameters();
        if (selectedDiameters.length > 0) {
            const minDia = Math.min(...selectedDiameters);
            layerSpacingInput.value = 3 * minDia;
        }
    }
}

// Update layer spacing when bar selection changes and trigger recalculation
function updateBarSelection() {
    updateLayerSpacing();

    // Hot reload: automatically recalculate if results are currently displayed
    const resultsSection = document.getElementById('plate-results');
    if (resultsSection && resultsSection.style.display !== 'none') {
        calculatePlateReinforcement(false); // false = don't scroll on hot reload
    }
}

// Handle scenario selection changes with hot reload
function updateScenarioSelection() {
    // Hot reload: automatically recalculate if results are currently displayed
    const resultsSection = document.getElementById('plate-results');
    if (resultsSection && resultsSection.style.display !== 'none') {
        calculatePlateReinforcement(false); // false = don't scroll on hot reload
    }
}

// Get selected bar diameters
function getSelectedBarDiameters() {
    const diameters = [];
    const checkboxes = document.querySelectorAll('input[type="checkbox"][id^="dia-"]');

    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            diameters.push(parseInt(checkbox.value));
        }
    });

    return diameters.sort((a, b) => a - b);
}

// Get selected scenarios
function getSelectedScenarios() {
    const scenarios = [];
    const scenarioCheckboxes = document.querySelectorAll('input[type="checkbox"][id$="-main"], input[type="checkbox"][id$="-crack"]');

    scenarioCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
            scenarios.push({
                id: checkbox.id,
                value: checkbox.value,
                loadArea: checkbox.id.includes('general') ? 'normal' : 'concentrated',
                rebarType: checkbox.id.includes('main') ? 'main' : 'crack_control'
            });
        }
    });

    return scenarios;
}

// Calculate Norwegian spacing limits
function calculateNorwegianSpacingLimits(h, loadArea, rebarType) {
    let sMax;

    if (loadArea === 'normal') {
        // Normal areas (field/support)
        if (rebarType === 'main') {
            sMax = Math.min(3 * h, 400);
        } else { // crack_control
            sMax = Math.min(3.5 * h, 450);
        }
    } else { // concentrated loads
        // Areas with concentrated loads and largest moments
        if (rebarType === 'main') {
            sMax = Math.min(2 * h, 250);
        } else { // crack_control
            sMax = Math.min(3 * h, 400);
        }
    }

    return sMax;
}

// Main calculation function for plate reinforcement
function calculatePlateReinforcement(shouldScroll = true) {
    try {
        // Get input values
        const h = parseFloat(document.getElementById('h').value);
        const c = parseFloat(document.getElementById('c').value);
        const b = parseFloat(document.getElementById('b').value);
        const nLayers = parseInt(document.getElementById('n_layers').value);
        const layerSpacing = parseFloat(document.getElementById('layer_spacing').value);
        const fctm = parseFloat(document.getElementById('fctm').value);
        const fyk = parseFloat(document.getElementById('fyk').value);

        const selectedDiameters = getSelectedBarDiameters();
        const selectedScenarios = getSelectedScenarios();

        if (selectedDiameters.length === 0) {
            alert('Please select at least one bar diameter.');
            return;
        }

        // Allow calculation without scenarios (pure As_min calculation)
        const hasScenarios = selectedScenarios.length > 0;

        // Validate inputs
        if (h <= 0 || c <= 0 || b <= 0 || fctm <= 0 || fyk <= 0) {
            alert('Please enter valid positive values for all parameters.');
            return;
        }

        // Perform calculations for each diameter and scenario combination
        const results = [];

        selectedDiameters.forEach(dia => {
            // Calculate effective depth d
            const d = h - c - (dia / 2) - (nLayers - 1) * layerSpacing;

            if (d <= 0) {
                return; // Skip if effective depth is invalid
            }

            // Calculate basic values
            const AsMin1 = 0.26 * b * d * fctm / fyk;
            const AsMin2 = 0.0013 * b * d;
            const AsMin = Math.max(AsMin1, AsMin2);
            const barArea = Math.PI * Math.pow(dia / 2, 2);

            // Calculate basic spacing from As_min
            const calculatedSpacing = barArea * b / AsMin;

            // Create result object for this diameter
            const result = {
                diameter: dia,
                d: toFixedIfNeeded(d, 1),
                AsMin: toFixedIfNeeded(AsMin, 1),
                barArea: toFixedIfNeeded(barArea, 1),
                calculatedSpacing: toFixedIfNeeded(calculatedSpacing, 0),
                scenarios: {}
            };

            if (hasScenarios) {
                // Calculate for each selected scenario
                selectedScenarios.forEach(scenario => {
                    const norwegianLimit = calculateNorwegianSpacingLimits(h, scenario.loadArea, scenario.rebarType);

                    // The actual allowable spacing is the MINIMUM of calculated spacing and Norwegian limit
                    const allowableSpacing = Math.min(calculatedSpacing, norwegianLimit);
                    const isLimitedByNorwegian = norwegianLimit < calculatedSpacing;

                    result.scenarios[scenario.value] = {
                        calculatedSpacing: toFixedIfNeeded(calculatedSpacing, 0),
                        norwegianLimit: norwegianLimit,
                        allowableSpacing: toFixedIfNeeded(allowableSpacing, 0),
                        isLimitedByNorwegian: isLimitedByNorwegian,
                        limitingFactor: isLimitedByNorwegian ? 'Norwegian rules' : 'As,min requirement'
                    };
                });
            }

            results.push(result);
        });

        if (results.length === 0) {
            alert('No valid results calculated. Please check your input parameters.');
            return;
        }

        // Display results
        displayPlateResults(results, { h, c, b, nLayers, layerSpacing, fctm, fyk, selectedScenarios, hasScenarios }, shouldScroll);

    } catch (error) {
        console.error('Calculation error:', error);
        alert('An error occurred during calculation. Please check your inputs.');
    }
}

// Display results
function displayPlateResults(results, inputs, shouldScroll = true) {
    // Show results section
    const resultsSection = document.getElementById('plate-results');
    resultsSection.style.display = 'block';

    // Display results table first
    const tableContainer = document.getElementById('plate-results-table');
    tableContainer.innerHTML = generateResultsTable(results, inputs.selectedScenarios, inputs);

    // Display calculation steps after table
    const stepsContainer = document.getElementById('plate-calc-steps');
    stepsContainer.innerHTML = generateCalculationSteps(inputs);

    // Only scroll to results if requested (not for hot reloads)
    if (shouldScroll) {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Generate calculation steps HTML
function generateCalculationSteps(inputs) {
    const { h, c, b, nLayers, layerSpacing, fctm, fyk, selectedScenarios, hasScenarios } = inputs;

    let scenarioDescriptions = '';
    if (hasScenarios && selectedScenarios.length > 0) {
        scenarioDescriptions = selectedScenarios.map(scenario => {
            const loadAreaText = scenario.loadArea === 'normal' ? 'General' : 'Concentrated loads';
            const rebarTypeText = scenario.rebarType === 'main' ? 'Main' : 'Crack control';
            return `${loadAreaText} - ${rebarTypeText}`;
        }).join(', ');
    } else {
        scenarioDescriptions = 'Pure As,min calculation (no scenario analysis)';
    }

    return `
        <div class="bg-gray-600 rounded-lg p-4 mb-4">
            <h4 class="text-lg font-semibold text-blue-400 mb-3">Input Parameters</h4>
            <div class="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                    <p><strong>h:</strong> ${h} mm (plate thickness)</p>
                    <p><strong>c:</strong> ${c} mm (concrete cover)</p>
                    <p><strong>b:</strong> ${b} mm (plate width)</p>
                    <p><strong>Number of layers:</strong> ${nLayers}</p>
                    ${nLayers > 1 ? `<p><strong>Layer spacing:</strong> ${layerSpacing} mm</p>` : ''}
                </div>
                <div>
                    <p><strong>f<sub>ctm</sub>:</strong> ${fctm} MPa</p>
                    <p><strong>f<sub>yk</sub>:</strong> ${fyk} MPa</p>
                    <p><strong>Analysis scenarios:</strong> ${scenarioDescriptions}</p>
                </div>
            </div>
        </div>

        <div class="bg-gray-600 rounded-lg p-4 mb-4">
            <h4 class="text-lg font-semibold text-yellow-400 mb-3">Calculation Formulas</h4>
            <div class="text-sm space-y-2">
                <p><strong>Effective depth:</strong> d = h - c - φ/2 - (n<sub>layers</sub>-1) × layer_spacing</p>
                <p><strong>Minimum reinforcement (EC2-1-1 9.2.1.1):</strong> A<sub>s,min</sub> = max(0.26 × b × d × f<sub>ctm</sub> / f<sub>yk</sub>, 0.0013 × b × d)</p>
                <p><strong>Bar area:</strong> A<sub>bar</sub> = π × (φ/2)²</p>
                <p><strong>Maximum spacing:</strong> c<sub>c,max</sub> = A<sub>bar</sub> × b / A<sub>s,min</sub></p>
            </div>
        </div>

        ${hasScenarios ? `
        <div class="bg-gray-600 rounded-lg p-4">
            <h4 class="text-lg font-semibold text-orange-400 mb-3">Maximum Spacing Requirements (EC2 9.3.1.1(3))</h4>
            <div class="text-sm space-y-2">
                <p class="text-blue-300"><strong>International Guideline (Eurocode 2):</strong></p>
                <div class="mt-2 text-xs text-gray-300 space-y-1">
                    <p><strong>Rules:</strong></p>
                    <p>• General areas: Main = min(3h, 400mm), Crack control = min(3.5h, 450mm)</p>
                    <p>• Concentrated loads: Main = min(2h, 250mm), Crack control = min(3h, 400mm)</p>
                </div>
            </div>
        </div>
        ` : ''}
    `;
}

// Generate results table HTML
function generateResultsTable(results, selectedScenarios, inputs) {
    const hasScenarios = inputs.hasScenarios;

    // If no scenarios, show simple As_min table
    if (!hasScenarios) {
        return generateSimpleAsMinTable(results, inputs);
    }

    // Group scenarios by type
    const generalScenarios = selectedScenarios.filter(s => s.loadArea === 'normal');
    const concentratedScenarios = selectedScenarios.filter(s => s.loadArea === 'concentrated');

    // Generate grouped headers
    let groupedHeaders = '';
    let scenarioHeaders = '';

    // General reinforcement group
    if (generalScenarios.length > 0) {
        const generalColspan = generalScenarios.length * 4;
        groupedHeaders += `
            <th class="px-2 py-2 text-center text-xs font-bold text-blue-300 bg-blue-900 border-b border-blue-600" colspan="${generalColspan}">
                GENERAL PLATE REINFORCEMENT
            </th>
        `;

        generalScenarios.forEach(scenario => {
            const rebarTypeLabel = scenario.rebarType === 'main' ? 'Main' : 'Crack Control';
            scenarioHeaders += `
                <th class="px-2 py-3 text-center text-xs font-medium text-blue-200 bg-blue-800"><strong>Allowable<br>(mm)</strong></th>
                <th class="px-2 py-3 text-center text-xs font-medium text-blue-200 bg-blue-800">From As,min<br>(mm)</th>
                <th class="px-2 py-3 text-center text-xs font-medium text-blue-200 bg-blue-800">EC2 Limit<br>(mm)</th>
                <th class="px-2 py-3 text-center text-xs font-medium text-blue-200 bg-blue-800">${rebarTypeLabel}<br>Governs</th>
            `;
        });
    }

    // Concentrated loads group
    if (concentratedScenarios.length > 0) {
        const concentratedColspan = concentratedScenarios.length * 4;
        groupedHeaders += `
            <th class="px-2 py-2 text-center text-xs font-bold text-orange-300 bg-orange-900 border-b border-orange-600" colspan="${concentratedColspan}">
                MAX MOMENTS & CONCENTRATED LOADS
            </th>
        `;

        concentratedScenarios.forEach(scenario => {
            const rebarTypeLabel = scenario.rebarType === 'main' ? 'Main' : 'Crack Control';
            scenarioHeaders += `
                <th class="px-2 py-3 text-center text-xs font-medium text-orange-200 bg-orange-800"><strong>Allowable<br>(mm)</strong></th>
                <th class="px-2 py-3 text-center text-xs font-medium text-orange-200 bg-orange-800">From As,min<br>(mm)</th>
                <th class="px-2 py-3 text-center text-xs font-medium text-orange-200 bg-orange-800">EC2 Limit<br>(mm)</th>
                <th class="px-2 py-3 text-center text-xs font-medium text-orange-200 bg-orange-800">${rebarTypeLabel}<br>Governs</th>
            `;
        });
    }

    // Generate table rows
    let tableRows = '';
    results.forEach(result => {
        // The governing spacing is the minimum allowable spacing across all scenarios
        const governingSpacing = Math.min(...Object.values(result.scenarios).map(s => s.allowableSpacing));
        const overallOK = true; // Always OK since we take the minimum

        // Generate scenario columns for this row - grouped by type
        let scenarioCells = '';

        // General scenarios first
        generalScenarios.forEach(scenario => {
            const scenarioData = result.scenarios[scenario.value];
            const statusClass = scenarioData.isLimitedByNorwegian ? 'text-yellow-400' : 'text-green-400';
            const statusText = scenarioData.isLimitedByNorwegian ? 'EC2' : 'As,min';

            scenarioCells += `
                <td class="px-2 py-3 text-center text-sm bg-blue-950 font-semibold">${scenarioData.allowableSpacing}</td>
                <td class="px-2 py-3 text-center text-sm bg-blue-950">${scenarioData.calculatedSpacing}</td>
                <td class="px-2 py-3 text-center text-sm bg-blue-950">${scenarioData.norwegianLimit}</td>
                <td class="px-2 py-3 text-center text-sm bg-blue-950"><span class="${statusClass}">${statusText}</span></td>
            `;
        });

        // Concentrated scenarios second
        concentratedScenarios.forEach(scenario => {
            const scenarioData = result.scenarios[scenario.value];
            const statusClass = scenarioData.isLimitedByNorwegian ? 'text-yellow-400' : 'text-green-400';
            const statusText = scenarioData.isLimitedByNorwegian ? 'EC2' : 'As,min';

            scenarioCells += `
                <td class="px-2 py-3 text-center text-sm bg-orange-950 font-semibold">${scenarioData.allowableSpacing}</td>
                <td class="px-2 py-3 text-center text-sm bg-orange-950">${scenarioData.calculatedSpacing}</td>
                <td class="px-2 py-3 text-center text-sm bg-orange-950">${scenarioData.norwegianLimit}</td>
                <td class="px-2 py-3 text-center text-sm bg-orange-950"><span class="${statusClass}">${statusText}</span></td>
            `;
        });

        tableRows += `
            <tr class="border-b border-gray-600">
                <td class="px-4 py-3 text-center font-medium">ø${result.diameter}</td>
                <td class="px-4 py-3 text-center">${result.d}</td>
                <td class="px-4 py-3 text-center">${result.AsMin}</td>
                <td class="px-4 py-3 text-center">${result.barArea}</td>
                <td class="px-4 py-3 text-center font-bold ${overallOK ? 'text-green-400' : 'text-red-400'}">${governingSpacing}</td>
                ${scenarioCells}
            </tr>
        `;
    });

    return `
        <div class="overflow-x-auto">
            <table class="w-full bg-gray-600 rounded-lg text-sm">
                <thead>
                    <!-- Group headers row -->
                    <tr>
                        <th class="px-4 py-2 bg-gray-500" rowspan="2">Bar Ø</th>
                        <th class="px-4 py-2 bg-gray-500" rowspan="2">d<br>(mm)</th>
                        <th class="px-4 py-2 bg-gray-500" rowspan="2">A<sub>s,min</sub><br>(mm²/m)</th>
                        <th class="px-4 py-2 bg-gray-500" rowspan="2">A<sub>bar</sub><br>(mm²)</th>
                        <th class="px-4 py-2 bg-green-700" rowspan="2"><strong>Governing<br>Spacing<br>(mm)</strong></th>
                        ${groupedHeaders}
                    </tr>
                    <!-- Sub-headers row -->
                    <tr class="bg-gray-500">
                        ${scenarioHeaders}
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-700">
                    ${tableRows}
                </tbody>
            </table>
        </div>

        <div class="mt-4 text-sm text-gray-300 space-y-2">
            <p><strong>Governing Spacing Column:</strong> Shows the maximum allowable spacing across all selected scenarios - <span class="text-green-400 font-semibold">this is your controlling requirement</span></p>
            <p><strong>Allowable Spacing:</strong> min(From As,min, EC2 limit) - the actual maximum spacing you can use</p>
            <p><strong>Governs Column:</strong> <span class="text-yellow-400">EC2</span> = EC2 9.3.1.1(3) controls, <span class="text-green-400">As,min</span> = reinforcement requirement controls</p>
            <div class="grid md:grid-cols-2 gap-4 text-xs">
                <div class="bg-blue-900 rounded p-2">
                    <p class="text-blue-300 font-semibold">General Plate Reinforcement</p>
                    <p>• Main: min(3h, 400mm) = min(3×${Math.round(inputs.h/3)}, 400) = ${Math.min(3*inputs.h, 400)}mm</p>
                    <p>• Crack control: min(3.5h, 450mm) = min(3.5×${Math.round(inputs.h/3.5)}, 450) = ${Math.min(3.5*inputs.h, 450)}mm</p>
                </div>
                <div class="bg-orange-900 rounded p-2">
                    <p class="text-orange-300 font-semibold">Max Moments & Concentrated Loads</p>
                    <p>• Main: min(2h, 250mm) = min(2×${Math.round(inputs.h/2)}, 250) = ${Math.min(2*inputs.h, 250)}mm</p>
                    <p>• Crack control: min(3h, 400mm) = min(3×${Math.round(inputs.h/3)}, 400) = ${Math.min(3*inputs.h, 400)}mm</p>
                </div>
            </div>
        </div>
    `;
}

// Generate simple As_min table (no scenarios)
function generateSimpleAsMinTable(results, inputs) {
    let tableRows = '';

    results.forEach(result => {
        tableRows += `
            <tr class="border-b border-gray-600">
                <td class="px-4 py-3 text-center font-medium">ø${result.diameter}</td>
                <td class="px-4 py-3 text-center">${result.d}</td>
                <td class="px-4 py-3 text-center">${result.AsMin}</td>
                <td class="px-4 py-3 text-center">${result.barArea}</td>
                <td class="px-4 py-3 text-center font-bold text-green-400">${result.calculatedSpacing}</td>
            </tr>
        `;
    });

    return `
        <div class="overflow-x-auto">
            <table class="w-full bg-gray-600 rounded-lg text-sm">
                <thead>
                    <tr class="bg-gray-500">
                        <th class="px-4 py-3 text-center text-xs font-medium text-gray-200 uppercase tracking-wider">
                            Bar Diameter
                        </th>
                        <th class="px-4 py-3 text-center text-xs font-medium text-gray-200 uppercase tracking-wider">
                            d (mm)
                        </th>
                        <th class="px-4 py-3 text-center text-xs font-medium text-gray-200 uppercase tracking-wider">
                            A<sub>s,min</sub><br>(mm²/m)
                        </th>
                        <th class="px-4 py-3 text-center text-xs font-medium text-gray-200 uppercase tracking-wider">
                            A<sub>bar</sub><br>(mm²)
                        </th>
                        <th class="px-4 py-3 text-center text-xs font-medium text-gray-200 uppercase tracking-wider bg-green-700">
                            <strong>Max Spacing<br>from A<sub>s,min</sub> (mm)</strong>
                        </th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-700">
                    ${tableRows}
                </tbody>
            </table>
        </div>

        <div class="mt-4 text-sm text-gray-300 space-y-2">
            <p><strong>Pure A<sub>s,min</sub> Calculation:</strong> Maximum spacing based only on minimum reinforcement requirements</p>
            <p><strong>Formula:</strong> A<sub>s,min</sub> = max(0.26 × b × d × f<sub>ctm</sub> / f<sub>yk</sub>, 0.0013 × b × d)</p>
            <p><strong>Max Spacing:</strong> A<sub>bar</sub> × b / A<sub>s,min</sub></p>
            <p class="text-yellow-400"><strong>Note:</strong> This calculation does not consider EC2 9.3.1.1(3) spacing limitations. Select scenarios above for code compliance checking.</p>
        </div>
    `;
}

// Helper function to get scenario label
function getScenarioLabel(scenario) {
    const loadArea = scenario.loadArea === 'normal' ? 'Gen' : 'Conc';
    const rebarType = scenario.rebarType === 'main' ? 'Main' : 'Crack';
    return `${loadArea}-${rebarType}`;
}