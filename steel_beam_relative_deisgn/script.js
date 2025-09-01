// Steel Profile Calculator JavaScript

// Profile data extracted from Excel
const profileData = {
    IPE: [
        { name: 'IPE80', wy: 20.0, iy: 0.801, weight: 6.0 },
        { name: 'IPE100', wy: 34.2, iy: 1.71, weight: 8.1 },
        { name: 'IPE120', wy: 53.0, iy: 3.18, weight: 10.4 },
        { name: 'IPE140', wy: 77.3, iy: 5.41, weight: 12.9 },
        { name: 'IPE160', wy: 109, iy: 8.69, weight: 15.8 },
        { name: 'IPE180', wy: 146, iy: 13.2, weight: 18.8 },
        { name: 'IPE200', wy: 194, iy: 19.4, weight: 22.4 },
        { name: 'IPE220', wy: 252, iy: 27.7, weight: 26.2 },
        { name: 'IPE240', wy: 324, iy: 38.9, weight: 30.7 },
        { name: 'IPE270', wy: 429, iy: 57.9, weight: 36.1 },
        { name: 'IPE300', wy: 557, iy: 83.6, weight: 42.2 },
        { name: 'IPE330', wy: 713, iy: 118, weight: 49.1 },
        { name: 'IPE360', wy: 904, iy: 163, weight: 57.1 },
        { name: 'IPE400', wy: 1156, iy: 231, weight: 66.3 },
        { name: 'IPE450', wy: 1500, iy: 337, weight: 77.6 },
        { name: 'IPE500', wy: 1928, iy: 482, weight: 90.7 },
        { name: 'IPE550', wy: 2441, iy: 671, weight: 106 },
        { name: 'IPE600', wy: 3069, iy: 921, weight: 122 }
    ],
    HEA: [
        { name: 'HEA100', wy: 72.8, iy: 3.49, weight: 16.7 },
        { name: 'HEA120', wy: 106, iy: 6.06, weight: 19.9 },
        { name: 'HEA140', wy: 155, iy: 10.3, weight: 24.7 },
        { name: 'HEA160', wy: 220, iy: 16.7, weight: 30.4 },
        { name: 'HEA180', wy: 294, iy: 25.1, weight: 35.5 },
        { name: 'HEA200', wy: 389, iy: 36.9, weight: 42.3 },
        { name: 'HEA220', wy: 515, iy: 54.1, weight: 50.5 },
        { name: 'HEA240', wy: 675, iy: 77.6, weight: 60.3 },
        { name: 'HEA260', wy: 836, iy: 105, weight: 68.2 },
        { name: 'HEA280', wy: 1013, iy: 137, weight: 76.4 },
        { name: 'HEA300', wy: 1260, iy: 183, weight: 88.3 },
        { name: 'HEA320', wy: 1479, iy: 229, weight: 97.6 },
        { name: 'HEA340', wy: 1678, iy: 277, weight: 105 },
        { name: 'HEA360', wy: 1891, iy: 331, weight: 112 },
        { name: 'HEA400', wy: 2311, iy: 451, weight: 125 },
        { name: 'HEA450', wy: 2896, iy: 637, weight: 140 },
        { name: 'HEA500', wy: 3550, iy: 870, weight: 155 },
        { name: 'HEA550', wy: 4146, iy: 1119, weight: 166 },
        { name: 'HEA600', wy: 4787, iy: 1412, weight: 178 },
        { name: 'HEA650', wy: 5474, iy: 1752, weight: 190 },
        { name: 'HEA700', wy: 6241, iy: 2153, weight: 204 },
        { name: 'HEA800', wy: 7682, iy: 3034, weight: 224 },
        { name: 'HEA900', wy: 9485, iy: 4221, weight: 252 },
        { name: 'HEA1000', wy: 11190, iy: 5538, weight: 272 }
    ],
    HEB: [
        { name: 'HEB100', wy: 89.9, iy: 4.50, weight: 20.4 },
        { name: 'HEB120', wy: 144, iy: 8.64, weight: 26.7 },
        { name: 'HEB140', wy: 216, iy: 15.1, weight: 33.7 },
        { name: 'HEB160', wy: 311, iy: 24.9, weight: 42.6 },
        { name: 'HEB180', wy: 426, iy: 38.3, weight: 51.2 },
        { name: 'HEB200', wy: 570, iy: 57.0, weight: 61.3 },
        { name: 'HEB220', wy: 736, iy: 80.9, weight: 71.5 },
        { name: 'HEB240', wy: 938, iy: 113, weight: 83.2 },
        { name: 'HEB260', wy: 1148, iy: 149, weight: 93.0 },
        { name: 'HEB280', wy: 1376, iy: 193, weight: 103 },
        { name: 'HEB300', wy: 1678, iy: 252, weight: 117 },
        { name: 'HEB320', wy: 1926, iy: 308, weight: 127 },
        { name: 'HEB340', wy: 2156, iy: 367, weight: 134 },
        { name: 'HEB360', wy: 2400, iy: 432, weight: 142 },
        { name: 'HEB400', wy: 2884, iy: 577, weight: 155 },
        { name: 'HEB450', wy: 3551, iy: 799, weight: 171 },
        { name: 'HEB500', wy: 4287, iy: 1072, weight: 187 },
        { name: 'HEB550', wy: 4971, iy: 1367, weight: 199 },
        { name: 'HEB600', wy: 5701, iy: 1710, weight: 212 },
        { name: 'HEB650', wy: 6480, iy: 2106, weight: 225 },
        { name: 'HEB700', wy: 7340, iy: 2569, weight: 241 },
        { name: 'HEB800', wy: 8977, iy: 3591, weight: 262 },
        { name: 'HEB900', wy: 10980, iy: 4941, weight: 291 },
        { name: 'HEB1000', wy: 12890, iy: 6447, weight: 314 }
    ]
};

// Current calculation results
let currentResults = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Simple setup - just add event listeners and set calculation mode
    toggleCalculationMode();
    
    // Add event listeners
    document.getElementById('profileType').addEventListener('change', function() {
        populateProfileDropdown();
    });
    document.getElementById('calculationMode').addEventListener('change', function() {
        toggleCalculationMode();
    });
    document.getElementById('staticModel').addEventListener('change', function() {
        updateLoadModelOptions();
    });
    document.getElementById('selectedProfile').addEventListener('change', function() {
        // Trigger calculations when a profile is selected
        const actingMoment = validateInput('actingMoment', 0, 10000, 0);
        if (actingMoment > 0) {
            updateCalculations();
        }
    });
    
    // Add event listener for suggest sections button
    document.getElementById('suggestSectionsBtn').addEventListener('click', suggestSections);
    
    // Add real-time validation event listeners
    document.getElementById('actingMoment').addEventListener('input', function() {
        validateInputWithColor('actingMoment');
        // Auto-update calculations if we have enough info
        setTimeout(() => {
            const profileType = document.getElementById('profileType').value;
            const selectedProfile = document.getElementById('selectedProfile').value;
            if (profileType && selectedProfile && this.value.trim()) {
                updateCalculations();
            }
        }, 500);
    });
    document.getElementById('stiffnessUtilization').addEventListener('input', function() {
        validateInputWithColor('stiffnessUtilization');
    });
    document.getElementById('yieldLimit').addEventListener('input', function() {
        validateInputWithColor('yieldLimit');
    });
    document.getElementById('beamLength').addEventListener('input', function() {
        validateInputWithColor('beamLength');
    });
    document.getElementById('deflectionLimit').addEventListener('input', function() {
        validateInputWithColor('deflectionLimit');
    });
    document.getElementById('gammaM0').addEventListener('input', function() {
        validateInputWithColor('gammaM0');
    });
    document.getElementById('characteristicMoment').addEventListener('input', function() {
        validateInputWithColor('characteristicMoment');
    });
    document.getElementById('youngModulus').addEventListener('input', function() {
        validateInputWithColor('youngModulus');
    });
});


function populateProfileDropdown() {
    const profileType = document.getElementById('profileType').value;
    const selectedProfileDropdown = document.getElementById('selectedProfile');
    
    // Clear existing options
    selectedProfileDropdown.innerHTML = '<option value="">Select a profile...</option>';
    
    // Populate with profiles of the selected type
    if (profileType && profileData[profileType]) {
        profileData[profileType].forEach(profile => {
            const option = document.createElement('option');
            option.value = profile.name;
            option.textContent = profile.name;
            selectedProfileDropdown.appendChild(option);
        });
    }
}

function updateLoadModelOptions() {
    const staticModel = document.getElementById('staticModel').value;
    const loadModelSelect = document.getElementById('loadModel');
    
    // Clear existing options
    loadModelSelect.innerHTML = '<option value="">Select load model...</option>';
    
    if (staticModel === 'simply_supported') {
        loadModelSelect.innerHTML += '<option value="udl">Evenly Distributed Load</option>';
        loadModelSelect.innerHTML += '<option value="point_mid">Point Load at Mid-span</option>';
    } else if (staticModel === 'cantilever') {
        loadModelSelect.innerHTML += '<option value="udl">Evenly Distributed Load</option>';
        loadModelSelect.innerHTML += '<option value="point_tip">Point Load at Tip</option>';
    }
}

function toggleCalculationMode() {
    const calculationModeSelect = document.getElementById('calculationMode');
    const calculationMode = calculationModeSelect.value;
    const stiffnessUtilizationGroup = document.getElementById('stiffnessUtilizationGroup');
    const loadingModelGroup = document.getElementById('loadingModelGroup');
    
    if (calculationMode === 'utilization') {
        // Show stiffness utilization ratio input, hide loading model inputs
        stiffnessUtilizationGroup.style.display = 'block';
        loadingModelGroup.style.display = 'none';
        // Remove orange styling
        calculationModeSelect.classList.remove('calculation-mode-coming-soon');
    } else {
        // Show loading model inputs, hide stiffness utilization ratio input
        stiffnessUtilizationGroup.style.display = 'none';
        loadingModelGroup.style.display = 'block';
        // Remove orange styling since loading model is now functional
        calculationModeSelect.classList.remove('calculation-mode-coming-soon');
    }
}

function updateCalculations() {
    // Get input values with validation
    const profileType = document.getElementById('profileType').value;
    const selectedProfileName = document.getElementById('selectedProfile').value;
    const calculationMode = document.getElementById('calculationMode').value;
    const yieldLimit = validateInput('yieldLimit', 200, 500, 355);
    const actingMoment = validateInput('actingMoment', 0, 10000, 0);
    
    // Check for basic required inputs
    if (actingMoment <= 0) {
        showError('Please enter a valid acting moment greater than 0 kNm');
        return;
    }
    
    // Clear any existing errors
    clearErrors();

    // Steel properties
    const E = 210000; // MPa - Young's modulus for steel
    const gammaM0 = 1.0; // Partial factor for material
    const fyd = yieldLimit / gammaM0; // Design yield strength
    
    let WelRequired, IyRequired, slsUtilization, ulsUtilization;
    
    if (calculationMode === 'utilization') {
        // Utilization ratio mode - this is the main functionality requested
        const stiffnessUtilization = validateInput('stiffnessUtilization', 0.1, 1.0, 0.8);
        
        // Calculate requirements based on user inputs:
        // Wel.required = MEd / fyd 
        WelRequired = (actingMoment * 1000000) / fyd; // mm³
        
        // For the SLS utilization, we need to use the selected profile's Iy as reference
        // The approach: Iy.required = SLS_utilization_ratio * Iy_of_selected_section
        
        // If a profile is selected, use it as reference
        if (selectedProfileName) {
            const selectedProfile = profileData[profileType].find(p => p.name === selectedProfileName);
            if (selectedProfile) {
                const profileIy = selectedProfile.iy * 1000000; // Convert to mm⁴
                IyRequired = stiffnessUtilization * profileIy;
                slsUtilization = stiffnessUtilization;
                
                // Calculate ULS utilization for selected profile
                const profileWy = selectedProfile.wy * 1000; // Convert to mm³
                const profileMRd = (profileWy * yieldLimit) / (1000000 * gammaM0);
                ulsUtilization = actingMoment / profileMRd;
            } else {
                // Default calculation if no profile selected
                IyRequired = WelRequired * 10; // Rough estimation
                slsUtilization = stiffnessUtilization;
                ulsUtilization = 1.0; // Assume full utilization
            }
        } else {
            // If no profile selected, use a default approach
            // For the first calculation, assume typical ratios
            IyRequired = WelRequired * 10; // Rough estimation for Iy requirement
            slsUtilization = stiffnessUtilization;
            ulsUtilization = 1.0; // Assume full utilization
        }
        
    } else {
        // Loading model mode - deflection calculations
        const beamLength = validateInput('beamLength', 0.1, 50, 6.0);
        const deflectionLimit = validateInput('deflectionLimit', 150, 1000, 300);
        const characteristicMoment = validateInput('characteristicMoment', 0, 10000, 0);
        const youngModulus = validateInput('youngModulus', 100000, 300000, 210000);
        const staticModel = document.getElementById('staticModel').value;
        const loadModel = document.getElementById('loadModel').value;
        
        if (beamLength <= 0) {
            showError('Please enter a valid beam length greater than 0 m');
            return;
        }
        
        if (!staticModel || !loadModel) {
            showError('Please select both static model and load model');
            return;
        }
        
        if (characteristicMoment <= 0) {
            showError('Please enter a valid characteristic moment Mch greater than 0 kNm');
            return;
        }
        
        // Calculate required section modulus for ULS moment capacity
        WelRequired = (actingMoment * 1000000) / (yieldLimit / gammaM0); // mm³

        // Calculate required second moment of area for deflection based on formulas
        const L = beamLength * 1000; // Convert to mm
        const Mch = characteristicMoment * 1000000; // Convert to N⋅mm
        const E = youngModulus; // MPa = N/mm²
        const deltaMax = L / deflectionLimit; // Maximum allowed deflection in mm
        
        // Calculate Iy required using the provided formulas: u_max = coefficient * Mch * L² / (E * Iy)
        // Rearranging: Iy = coefficient * Mch * L² / (E * u_max)
        let deflectionCoefficient;
        
        if (staticModel === 'simply_supported') {
            if (loadModel === 'point_mid') {
                // Simply supported, point load: u_max = Mch*L²/(12*E*Iy)
                deflectionCoefficient = 1/12;
            } else if (loadModel === 'udl') {
                // Simply supported, UDL: u_max = 5*Mch*L²/(48*E*Iy)
                deflectionCoefficient = 5/48;
            }
        } else if (staticModel === 'cantilever') {
            if (loadModel === 'point_tip') {
                // Cantilever, point load: u_max = Mch*L²/(3*E*Iy)
                deflectionCoefficient = 1/3;
            } else if (loadModel === 'udl') {
                // Cantilever, UDL: u_max = Mch*L²/(4*E*Iy)
                deflectionCoefficient = 1/4;
            }
        }
        
        IyRequired = (deflectionCoefficient * Mch * Math.pow(L, 2)) / (E * deltaMax); // mm⁴
        
        // Calculate utilizations if profile is selected
        if (selectedProfileName) {
            const selectedProfile = profileData[profileType].find(p => p.name === selectedProfileName);
            if (selectedProfile) {
                const profileIy = selectedProfile.iy * 1000000;
                const profileWy = selectedProfile.wy * 1000;
                const profileMRd = (profileWy * yieldLimit) / (1000000 * gammaM0);
                ulsUtilization = actingMoment / profileMRd;
                slsUtilization = IyRequired / profileIy;
            }
        } else {
            ulsUtilization = 1.0;
            slsUtilization = 1.0;
        }
    }

    // Convert to standard units for display
    const WelRequired_display = WelRequired / 1000; // Convert mm³ to 10³ mm³ for display
    const IyRequired_display = IyRequired / 1000000; // Convert mm⁴ to 10⁶ mm⁴ for display

    // Update selected profile analysis display
    document.getElementById('ulsUtilization').value = ulsUtilization.toFixed(3);
    document.getElementById('slsUtilization').value = slsUtilization.toFixed(3);

    // Update requirements display
    document.getElementById('welRequired').value = WelRequired_display.toFixed(1);
    document.getElementById('iyRequired').value = IyRequired_display.toFixed(1);

    
    // Find the lightest suitable section across ALL profile types
    const allLightestSuitable = findLightestSuitableAcrossAllTypes(WelRequired, IyRequired, yieldLimit, gammaM0);
    
    // Calculate for all profile types
    currentResults = {};
    
    Object.keys(profileData).forEach(type => {
        const profiles = profileData[type];

        // Determine first adequate profile in catalog order
        const lightestSuitable = profiles.find(profile => {
            const profileWy = profile.wy * 1000; // mm³
            const profileIy = profile.iy * 1000000; // mm⁴
            return profileWy > WelRequired && profileIy > IyRequired; // strict '>' per requirement
        });

        // Build detailed list for display (keep catalog order; do not sort by weight)
        const suitableProfiles = profiles.map(profile => {
            const profileWy = profile.wy * 1000;
            const profileIy = profile.iy * 1000000;
            const MRd = (profileWy * yieldLimit) / (1000000 * gammaM0);
            const momentOK = profileWy > WelRequired;
            const stiffnessOK = profileIy > IyRequired;
            return {
                ...profile,
                MRd: MRd,
                momentOK,
                stiffnessOK,
                suitable: momentOK && stiffnessOK,
                utilizationMoment: WelRequired / profileWy,
                utilizationStiffness: IyRequired / profileIy
            };
        });
        
        currentResults[type] = {
            profiles: suitableProfiles,
            lightestSuitable: lightestSuitable
        };
    });

    // Update display
    updateResultsDisplay(profileType);
    updateComparisonDisplay(profileType);
    updateSuggestedSectionDisplay(allLightestSuitable, WelRequired, IyRequired, yieldLimit, gammaM0);
}

function updateResultsDisplay(selectedProfileType) {
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.innerHTML = '';

    Object.keys(profileData).forEach(profileType => {
        const result = currentResults[profileType];
        const isSelected = profileType === selectedProfileType;
        
        const profileCard = document.createElement('div');
        profileCard.className = `section-card ${isSelected ? 'selected-profile pulse-glow' : ''}`;
        
        let cardContent = `
            <h2 class="heading-3 mb-4 ${isSelected ? 'text-blue-400' : 'text-gray-100'}">
                ${profileType} Profiles
                ${isSelected ? '<span class="text-sm ml-2 text-blue-400">(Selected)</span>' : ''}
            </h2>
        `;

        if (result.lightestSuitable) {
            cardContent += `
                <div class="bg-green-900/30 border border-green-500/50 rounded-lg p-4 mb-4">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="status-icon status-ok"></span>
                        <span class="font-semibold text-green-300">Lightest Suitable Profile</span>
                    </div>
                    <div class="text-2xl font-bold text-green-200 mb-2">
                        ${result.lightestSuitable.name}
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div>
                            <span class="text-gray-400">Weight:</span>
                            <span class="font-semibold ml-1 text-gray-200">${result.lightestSuitable.weight} kg/m</span>
                        </div>
                        <div>
                            <span class="text-gray-400">MRd:</span>
                            <span class="font-semibold ml-1 text-gray-200">${result.lightestSuitable.MRd.toFixed(1)} kNm</span>
                        </div>
                        <div>
                            <span class="text-gray-400">Wy:</span>
                            <span class="font-semibold ml-1 text-gray-200">${result.lightestSuitable.wy} × 10³ mm³</span>
                        </div>
                        <div>
                            <span class="text-gray-400">Iy:</span>
                            <span class="font-semibold ml-1 text-gray-200">${result.lightestSuitable.iy} × 10⁶ mm⁴</span>
                        </div>
                    </div>
                    <div class="mt-3 flex gap-4">
                        <div class="flex items-center gap-1">
                            <span class="status-icon ${result.lightestSuitable.momentOK ? 'status-ok' : 'status-fail'}"></span>
                            <span class="text-xs text-gray-300">Moment OK</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <span class="status-icon ${result.lightestSuitable.stiffnessOK ? 'status-ok' : 'status-fail'}"></span>
                            <span class="text-xs text-gray-300">Stiffness OK</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            cardContent += `
                <div class="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-4">
                    <div class="flex items-center gap-2">
                        <span class="status-icon status-fail"></span>
                        <span class="font-semibold text-red-300">No suitable profile found</span>
                    </div>
                    <p class="text-sm text-red-400 mt-1">
                        Consider increasing profile size or reducing requirements
                    </p>
                </div>
            `;
        }

        // Add profile list
        cardContent += `
            <div class="space-y-2 max-h-64 overflow-y-auto">
                <h4 class="font-semibold text-gray-300 text-sm mb-2">Available Profiles:</h4>
        `;

        result.profiles.slice(0, 8).forEach(profile => {
            cardContent += `
                <div class="p-2 rounded border profile-item ${profile.suitable ? 'bg-green-900/20 border-green-500/30' : 'bg-gray-800/50 border-gray-600/50'}">
                    <div class="flex justify-between items-center">
                        <span class="font-medium ${profile.suitable ? 'text-green-300' : 'text-gray-300'}">
                            ${profile.name}
                        </span>
                        <span class="text-sm text-gray-400">${profile.weight} kg/m</span>
                    </div>
                    <div class="flex gap-2 mt-1 items-center">
                        <span class="status-icon ${profile.momentOK ? 'status-ok' : 'status-fail'}"></span>
                        <span class="status-icon ${profile.stiffnessOK ? 'status-ok' : 'status-fail'}"></span>
                        <span class="text-xs text-gray-500">
                            MRd: ${profile.MRd.toFixed(1)} kNm
                        </span>
                    </div>
                </div>
            `;
        });

        cardContent += '</div>';
        profileCard.innerHTML = cardContent;
        resultsSection.appendChild(profileCard);
    });
}

function updateComparisonDisplay(selectedProfileType) {
    const comparisonSection = document.getElementById('comparisonSection');
    const comparisonDescription = document.getElementById('comparisonDescription');
    const comparisonGrid = document.getElementById('comparisonGrid');

    const selectedResult = currentResults[selectedProfileType];
    
    if (!selectedResult || !selectedResult.lightestSuitable) {
        comparisonSection.style.display = 'none';
        return;
    }

    comparisonSection.style.display = 'block';
    const selectedProfile = selectedResult.lightestSuitable;

    // Update description
    comparisonDescription.innerHTML = `
        <p class="text-gray-300">
            Comparing <span class="font-semibold text-blue-400">${selectedProfile.name}</span> 
            (${selectedProfile.weight} kg/m) with equivalent profiles from other series:
        </p>
    `;

    // Get comparison data
    const comparisons = [];
    Object.keys(currentResults).forEach(type => {
        if (type !== selectedProfileType) {
            const lightest = currentResults[type]?.lightestSuitable;
            if (lightest) {
                const weightDiff = ((lightest.weight - selectedProfile.weight) / selectedProfile.weight * 100);
                comparisons.push({
                    type,
                    profile: lightest.name,
                    weight: lightest.weight,
                    weightDiff,
                    isLighter: lightest.weight < selectedProfile.weight
                });
            }
        }
    });

    // Sort by weight
    comparisons.sort((a, b) => a.weight - b.weight);

    // Update comparison grid
    comparisonGrid.innerHTML = '';
    comparisons.forEach(comparison => {
        const comparisonCard = document.createElement('div');
        comparisonCard.className = `p-4 rounded-lg border profile-item ${
            comparison.isLighter ? 'bg-green-900/20 border-green-500/30' : 'bg-red-900/20 border-red-500/30'
        }`;
        
        comparisonCard.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <span class="font-semibold text-lg text-gray-200">${comparison.profile}</span>
                <span class="font-bold ${comparison.isLighter ? 'text-green-400' : 'text-red-400'}">
                    ${comparison.weight} kg/m
                </span>
            </div>
            <div class="text-sm ${comparison.isLighter ? 'text-green-300' : 'text-red-300'}">
                ${comparison.isLighter ? '🟢 Lighter by' : '🔴 Heavier by'} ${Math.abs(comparison.weightDiff).toFixed(1)}%
            </div>
        `;
        
        comparisonGrid.appendChild(comparisonCard);
    });
}

// Input validation functions with color coding
function validateInputWithColor(elementId, value = null) {
    const element = document.getElementById(elementId);
    if (!element) return { value: 0, isValid: false };
    
    if (value === null) {
        value = element.value.trim();
    }
    
    // Try to evaluate mathematical expressions
    let numericValue;
    try {
        // Simple evaluation - replace common functions and operators
        let expression = value.replace(/\^/g, '**'); // Replace ^ with **
        expression = expression.replace(/\bsqrt\(/g, 'Math.sqrt('); // Add Math.sqrt support
        expression = expression.replace(/\bsin\(/g, 'Math.sin('); // Add Math.sin support
        expression = expression.replace(/\bcos\(/g, 'Math.cos('); // Add Math.cos support
        expression = expression.replace(/\btan\(/g, 'Math.tan('); // Add Math.tan support
        expression = expression.replace(/\bpi\b/g, 'Math.PI'); // Add pi support
        expression = expression.replace(/\be\b/g, 'Math.E'); // Add e support
        
        numericValue = Function('"use strict"; return (' + expression + ')')();
    } catch (e) {
        numericValue = parseFloat(value);
    }
    
    let isValid = true;
    
    // Specific validation rules per field
    if (elementId === 'actingMoment') {
        // For MEd, allow 0 and positive values, mark negative as invalid
        isValid = !isNaN(numericValue) && numericValue >= 0;
    } else if (elementId === 'stiffnessUtilization') {
        // For stiffness utilization, mark negative as invalid, but allow > 1
        isValid = !isNaN(numericValue) && numericValue >= 0;
    } else if (elementId === 'yieldLimit') {
        // Yield limit should be reasonable (200-1000 MPa)
        isValid = !isNaN(numericValue) && numericValue >= 200 && numericValue <= 1000;
    } else if (elementId === 'beamLength') {
        // Beam length should be positive
        isValid = !isNaN(numericValue) && numericValue > 0;
    } else if (elementId === 'deflectionLimit') {
        // Deflection limit should be positive
        isValid = !isNaN(numericValue) && numericValue > 0;
    } else if (elementId === 'gammaM0') {
        // Material factor should be >= 1.0 and reasonable (max 2.0)
        isValid = !isNaN(numericValue) && numericValue >= 1.0 && numericValue <= 2.0;
    } else if (elementId === 'characteristicMoment') {
        // Characteristic moment can be 0 or positive
        isValid = !isNaN(numericValue) && numericValue >= 0;
    } else if (elementId === 'youngModulus') {
        // Young's modulus should be reasonable (100000-300000 MPa)
        isValid = !isNaN(numericValue) && numericValue >= 100000 && numericValue <= 300000;
    } else {
        // Default validation - just check if it's a number
        isValid = !isNaN(numericValue);
    }
    
    // Apply color coding
    element.classList.remove('input-valid', 'input-invalid');
    if (isValid) {
        element.classList.add('input-valid');
    } else {
        element.classList.add('input-invalid');
    }
    
    return { value: isNaN(numericValue) ? 0 : numericValue, isValid };
}

// Simplified validation function for backward compatibility
function validateInput(elementId, min = null, max = null, defaultValue = 0) {
    const result = validateInputWithColor(elementId);
    return result.isValid ? result.value : defaultValue;
}

function showError(message) {
    clearMessages();
    const errorDiv = document.createElement('div');
    errorDiv.id = 'error-message';
    errorDiv.className = 'bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-4';
    errorDiv.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="status-icon status-fail"></span>
            <span class="font-semibold text-red-300">Error</span>
        </div>
        <p class="text-sm text-red-400 mt-1">${message}</p>
    `;
    
    const mainContainer = document.querySelector('.main-container');
    const firstSectionCard = document.querySelector('.section-card');
    mainContainer.insertBefore(errorDiv, firstSectionCard);
}

function showWarning(message) {
    const warningDiv = document.createElement('div');
    warningDiv.className = 'bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-2 mb-2 text-xs text-yellow-300';
    warningDiv.textContent = message;
    
    const mainContainer = document.querySelector('.main-container');
    const firstSectionCard = document.querySelector('.section-card');
    mainContainer.insertBefore(warningDiv, firstSectionCard);
    
    // Auto-remove warning after 3 seconds
    setTimeout(() => {
        if (warningDiv.parentNode) {
            warningDiv.parentNode.removeChild(warningDiv);
        }
    }, 3000);
}

function clearErrors() {
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) {
        errorMessage.parentNode.removeChild(errorMessage);
    }
}

function clearMessages() {
    // Clear both errors and warnings
    clearErrors();
    const warnings = document.querySelectorAll('.bg-yellow-900\\/30');
    warnings.forEach(warning => {
        if (warning.parentNode) {
            warning.parentNode.removeChild(warning);
        }
    });
}

// New function to find the lightest suitable section across all profile types
function findLightestSuitableAcrossAllTypes(WelRequired, IyRequired, yieldLimit, gammaM0) {
    let lightestProfile = null;
    let lightestWeight = Infinity;
    let lightestType = null;
    
    Object.keys(profileData).forEach(type => {
        const profiles = profileData[type];
        
        // Find first suitable profile in this type (profiles are sorted by ascending properties)
        const suitableProfile = profiles.find(profile => {
            const profileWy = profile.wy * 1000; // mm³
            const profileIy = profile.iy * 1000000; // mm⁴
            return profileWy > WelRequired && profileIy > IyRequired;
        });
        
        // Check if this is the lightest so far
        if (suitableProfile && suitableProfile.weight < lightestWeight) {
            lightestProfile = suitableProfile;
            lightestWeight = suitableProfile.weight;
            lightestType = type;
        }
    });
    
    if (lightestProfile) {
        // Add calculated properties
        const profileWy = lightestProfile.wy * 1000;
        const profileIy = lightestProfile.iy * 1000000;
        const MRd = (profileWy * yieldLimit) / (1000000 * gammaM0);
        
        return {
            ...lightestProfile,
            type: lightestType,
            MRd: MRd,
            utilizationMoment: WelRequired / profileWy,
            utilizationStiffness: IyRequired / profileIy
        };
    }
    
    return null;
}

// New function to update the suggested section display
function updateSuggestedSectionDisplay(suggestedProfile, WelRequired, IyRequired, yieldLimit, gammaM0) {
    let suggestedSectionDiv = document.getElementById('suggestedSection');
    
    if (!suggestedSectionDiv) {
        // Create the suggested section div if it doesn't exist
        const suggestedSectionHTML = `
            <div class="section-card" id="suggestedSection" style="margin-top: 1.5rem;">
                <h3 class="heading-3">🏆 Suggested Section (Lightest Across All Types)</h3>
                <div id="suggestedSectionContent"></div>
            </div>
        `;
        
        // Insert after the input section - be more specific
        const inputSection = document.querySelector('.section-card');
        if (inputSection) {
            inputSection.insertAdjacentHTML('afterend', suggestedSectionHTML);
            suggestedSectionDiv = document.getElementById('suggestedSection'); // Get reference after creation
        } else {
            return;
        }
    }
    
    const contentDiv = document.getElementById('suggestedSectionContent');
    
    if (!contentDiv) {
        return;
    }
    
    if (suggestedProfile) {
        contentDiv.innerHTML = `
            <div class="bg-green-900/30 border border-green-500/50 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-3">
                    <span class="status-icon status-ok"></span>
                    <span class="font-bold text-green-300 text-xl">${suggestedProfile.name} (${suggestedProfile.type})</span>
                </div>
                
                <div class="grid md:grid-cols-2 gap-4 mb-4">
                    <div class="space-y-2">
                        <div class="flex justify-between">
                            <span class="text-gray-400">Weight:</span>
                            <span class="font-semibold text-gray-200">${suggestedProfile.weight} kg/m</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">M<sub>Rd</sub>:</span>
                            <span class="font-semibold text-gray-200">${suggestedProfile.MRd.toFixed(1)} kNm</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">W<sub>y</sub>:</span>
                            <span class="font-semibold text-gray-200">${suggestedProfile.wy} × 10³ mm³</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">I<sub>y</sub>:</span>
                            <span class="font-semibold text-gray-200">${suggestedProfile.iy} × 10⁶ mm⁴</span>
                        </div>
                    </div>
                    
                    <div class="space-y-2">
                        <div class="bg-blue-900/30 border border-blue-500/50 rounded p-3">
                            <h4 class="font-semibold text-blue-200 mb-2">Utilization Ratios:</h4>
                            <div class="flex justify-between mb-1">
                                <span class="text-blue-300">Moment (ULS):</span>
                                <span class="font-semibold text-blue-200">${(suggestedProfile.utilizationMoment * 100).toFixed(1)}%</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-blue-300">Stiffness (SLS):</span>
                                <span class="font-semibold text-blue-200">${(suggestedProfile.utilizationStiffness * 100).toFixed(1)}%</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="bg-gray-800/50 border border-gray-600/50 rounded p-3">
                    <div class="text-sm text-gray-300">
                        <p><strong>Why this section?</strong> This is the lightest profile across all types (IPE, HEA, HEB) that satisfies both:</p>
                        <ul class="list-disc list-inside mt-2 space-y-1">
                            <li>Moment capacity: W<sub>y</sub> = ${suggestedProfile.wy} > ${(WelRequired/1000).toFixed(1)} × 10³ mm³ (required)</li>
                            <li>Stiffness: I<sub>y</sub> = ${suggestedProfile.iy} > ${(IyRequired/1000000).toFixed(1)} × 10⁶ mm⁴ (required)</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
    } else {
        contentDiv.innerHTML = `
            <div class="bg-red-900/30 border border-red-500/50 rounded-lg p-4">
                <div class="flex items-center gap-2 mb-2">
                    <span class="status-icon status-fail"></span>
                    <span class="font-semibold text-red-300">No suitable section found</span>
                </div>
                <p class="text-sm text-red-400">
                    No profile in the database (IPE, HEA, HEB) can satisfy both the moment capacity 
                    (W<sub>y</sub> ≥ ${(WelRequired/1000).toFixed(1)} × 10³ mm³) and stiffness requirements 
                    (I<sub>y</sub> ≥ ${(IyRequired/1000000).toFixed(1)} × 10⁶ mm⁴).
                </p>
                <p class="text-sm text-red-400 mt-2">
                    Consider: reducing the design moment, increasing the allowable deflection, or using custom sections.
                </p>
            </div>
        `;
    }
}

// New function to handle the suggest sections button click
function suggestSections() {
    // Get input values with validation and color coding
    const actingMomentResult = validateInputWithColor('actingMoment');
    const yieldLimitResult = validateInputWithColor('yieldLimit');
    const gammaM0Result = validateInputWithColor('gammaM0');
    const calculationMode = document.getElementById('calculationMode').value;
    
    const actingMoment = actingMomentResult.value;
    const yieldLimit = yieldLimitResult.value;
    const gammaM0 = gammaM0Result.value;
    
    // Clear any existing errors but continue with calculation even if inputs are invalid
    clearErrors();

    // Steel properties
    const fyd = yieldLimit / gammaM0;
    
    let WelRequired, IyRequired;
    
    if (calculationMode === 'utilization') {
        const stiffnessUtilizationResult = validateInputWithColor('stiffnessUtilization');
        const stiffnessUtilization = stiffnessUtilizationResult.value;
        const selectedProfileName = document.getElementById('selectedProfile').value;
        const profileType = document.getElementById('profileType').value;
        
        // Calculate requirements
        WelRequired = (actingMoment * 1000000) / fyd;
        
        if (selectedProfileName) {
            const selectedProfile = profileData[profileType].find(p => p.name === selectedProfileName);
            if (selectedProfile) {
                const profileIy = selectedProfile.iy * 1000000;
                IyRequired = stiffnessUtilization * profileIy;
            } else {
                IyRequired = WelRequired * 10;
            }
        } else {
            IyRequired = WelRequired * 10;
        }
    } else {
        // Loading model mode
        const beamLengthResult = validateInputWithColor('beamLength');
        const deflectionLimitResult = validateInputWithColor('deflectionLimit');
        const characteristicMomentResult = validateInputWithColor('characteristicMoment');
        const youngModulusResult = validateInputWithColor('youngModulus');
        const beamLength = beamLengthResult.value;
        const deflectionLimit = deflectionLimitResult.value;
        const characteristicMoment = characteristicMomentResult.value;
        const youngModulus = youngModulusResult.value;
        const staticModel = document.getElementById('staticModel').value;
        const loadModel = document.getElementById('loadModel').value;
        
        // Use ULS moment for strength check
        WelRequired = (actingMoment * 1000000) / fyd;
        
        // Use characteristic moment for deflection check - same logic as updateCalculations
        const L = beamLength * 1000; // Convert to mm
        const Mch = characteristicMoment * 1000000; // Convert to N⋅mm
        const E = youngModulus; // MPa = N/mm²
        const deltaMax = L / deflectionLimit; // Maximum allowed deflection in mm
        
        // Calculate deflection coefficient based on static and load model
        let deflectionCoefficient;
        
        if (staticModel === 'simply_supported') {
            if (loadModel === 'point_mid') {
                deflectionCoefficient = 1/12;
            } else if (loadModel === 'udl') {
                deflectionCoefficient = 5/48;
            }
        } else if (staticModel === 'cantilever') {
            if (loadModel === 'point_tip') {
                deflectionCoefficient = 1/3;
            } else if (loadModel === 'udl') {
                deflectionCoefficient = 1/4;
            }
        }
        
        IyRequired = (deflectionCoefficient * Mch * Math.pow(L, 2)) / (E * deltaMax);
    }
    
    // Update requirements display
    document.getElementById('welRequired').value = (WelRequired / 1000).toFixed(1);
    document.getElementById('iyRequired').value = (IyRequired / 1000000).toFixed(1);
    
    // Find lightest suitable sections for each type
    const lightestSections = {};
    Object.keys(profileData).forEach(type => {
        const profiles = profileData[type];
        const suitableProfile = profiles.find(profile => {
            const profileWy = profile.wy * 1000;
            const profileIy = profile.iy * 1000000;
            return profileWy > WelRequired && profileIy > IyRequired;
        });
        
        if (suitableProfile) {
            const profileWy = suitableProfile.wy * 1000;
            const profileIy = suitableProfile.iy * 1000000;
            const MRd = (profileWy * yieldLimit) / (1000000 * gammaM0);
            
            lightestSections[type] = {
                ...suitableProfile,
                type: type,
                MRd: MRd,
                utilizationMoment: WelRequired / profileWy,
                utilizationStiffness: IyRequired / profileIy
            };
        }
    });
    
    // Find the overall lightest
    let overallLightest = null;
    let minWeight = Infinity;
    Object.values(lightestSections).forEach(section => {
        if (section.weight < minWeight) {
            minWeight = section.weight;
            overallLightest = section;
        }
    });
    
    // MANUALLY ADDED 
  // Calculate utilization for selected profile (if any)
  const selectedProfileName = document.getElementById('selectedProfile').value;
  const profileType = document.getElementById('profileType').value;

  if (selectedProfileName && profileType) {
      const selectedProfile = profileData[profileType].find(p => p.name ===
  selectedProfileName);
      if (selectedProfile) {
          const profileWy = selectedProfile.wy * 1000; // mm³
          const profileIy = selectedProfile.iy * 1000000; // mm⁴
          const MRd = (profileWy * yieldLimit) / (1000000 * gammaM0);

          const ulsUtilization = actingMoment / MRd;
          const slsUtilization = IyRequired / profileIy;

          // Update the display fields
          document.getElementById('ulsUtilization').value =
  ulsUtilization.toFixed(3);
          document.getElementById('slsUtilization').value =
  slsUtilization.toFixed(3);
      }
  }




    // Display results
    displaySuggestedSections(lightestSections, overallLightest, WelRequired, IyRequired);
}

// Function to display suggested sections side by side
function displaySuggestedSections(lightestSections, overallLightest, WelRequired, IyRequired) {
    // Remove any existing suggestions
    const existingSuggestions = document.getElementById('suggestedSectionsContainer');
    if (existingSuggestions) {
        existingSuggestions.remove();
    }
    
    // Create container for suggested sections
    const containerHTML = `
        <div id="suggestedSectionsContainer" style="margin-top: 2rem;">
            <!-- Overall Winner -->
            <div class="section-card" style="margin-bottom: 1.5rem;">
                <h2 class="heading-3">🏆 Overall Winner (Lightest Across All Types)</h2>
                <div id="overallWinnerContent"></div>
            </div>
            
            <!-- Side by side comparison -->
            <div class="section-card">
                <h2 class="heading-3">💡 Lightest Options by Type</h2>
                <div class="grid md:grid-cols-3 gap-4" id="lightestByTypeGrid"></div>
            </div>
        </div>
    `;
    
    // Insert at end of main container for simplicity
    const mainContainer = document.querySelector('.main-container');
    if (mainContainer) {
        mainContainer.insertAdjacentHTML('beforeend', containerHTML);
        
        // Fill content immediately
        const overallWinnerDiv = document.getElementById('overallWinnerContent');
        if (overallLightest) {
            overallWinnerDiv.innerHTML = createSectionCard(overallLightest, WelRequired, IyRequired, true);
        } else {
            overallWinnerDiv.innerHTML = `
                <div class="bg-red-900/30 border border-red-500/50 rounded-lg p-4">
                    <p class="text-red-400">No suitable sections found for the given requirements.</p>
                </div>
            `;
        }
        
        // Fill side by side comparison
        const gridDiv = document.getElementById('lightestByTypeGrid');
        ['IPE', 'HEA', 'HEB'].forEach(type => {
            const section = lightestSections[type];
            if (section) {
                const cardHTML = createSectionCard(section, WelRequired, IyRequired, false);
                gridDiv.innerHTML += `<div class="space-y-2">${cardHTML}</div>`;
            } else {
                gridDiv.innerHTML += `
                    <div class="bg-red-900/30 border border-red-500/50 rounded-lg p-4">
                        <h3 class="font-bold text-red-300 mb-2">${type}</h3>
                        <p class="text-red-400 text-sm">No suitable section found</p>
                    </div>
                `;
            }
        });
    }
}

// Helper function to create a section card HTML
function createSectionCard(section, WelRequired, IyRequired, isWinner) {
    const bgColor = isWinner ? 'bg-yellow-900/30 border-yellow-500/50' : 'bg-green-900/30 border-green-500/50';
    const textColor = isWinner ? 'text-yellow-300' : 'text-green-300';
    const icon = isWinner ? '👑' : '✅';
    
    return `
        <div class="${bgColor} border rounded-lg p-4">
            <div class="flex items-center gap-2 mb-3">
                <span>${icon}</span>
                <span class="font-bold ${textColor} text-lg">${section.name} (${section.type})</span>
            </div>
            
            <div class="grid grid-cols-2 gap-3 mb-3">
                <div class="space-y-1">
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-400">Weight:</span>
                        <span class="font-semibold text-gray-200">${section.weight} kg/m</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-400">M<sub>Rd</sub>:</span>
                        <span class="font-semibold text-gray-200">${section.MRd.toFixed(1)} kNm</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-400">W<sub>y</sub>:</span>
                        <span class="font-semibold text-gray-200">${section.wy} × 10³ mm³</span>
                    </div>
                    <div class="flex justify-between text-sm">
                        <span class="text-gray-400">I<sub>y</sub>:</span>
                        <span class="font-semibold text-gray-200">${section.iy} × 10⁶ mm⁴</span>
                    </div>
                </div>
                
                <div class="bg-blue-900/30 border border-blue-500/50 rounded p-2">
                    <h4 class="font-semibold text-blue-200 text-sm mb-1">Utilization:</h4>
                    <div class="text-xs space-y-1">
                        <div class="flex justify-between">
                            <span class="text-blue-300">Moment:</span>
                            <span class="font-semibold text-blue-200">${(section.utilizationMoment * 100).toFixed(1)}%</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-blue-300">Stiffness:</span>
                            <span class="font-semibold text-blue-200">${(section.utilizationStiffness * 100).toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="text-xs text-gray-400">
                Satisfies: W<sub>y</sub> = ${section.wy} > ${(WelRequired/1000).toFixed(1)} × 10³ mm³, 
                I<sub>y</sub> = ${section.iy} > ${(IyRequired/1000000).toFixed(1)} × 10⁶ mm⁴
            </div>
        </div>
    `;
}