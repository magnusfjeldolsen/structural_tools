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
    // Add event listeners to input fields
    document.getElementById('profileType').addEventListener('change', function() {
        populateProfileDropdown();
        updateCalculations();
    });
    document.getElementById('selectedProfile').addEventListener('change', updateCalculations);
    document.getElementById('calculationMode').addEventListener('change', function() {
        toggleCalculationMode();
        updateCalculations();
    });
    document.getElementById('yieldLimit').addEventListener('input', updateCalculations);
    document.getElementById('actingMoment').addEventListener('input', updateCalculations);
    document.getElementById('stiffnessUtilization').addEventListener('input', updateCalculations);
    document.getElementById('beamLength').addEventListener('input', updateCalculations);
    document.getElementById('deflectionLimit').addEventListener('input', updateCalculations);
    document.getElementById('loadType').addEventListener('change', updateCalculations);

    // Initial setup
    setDefaultValues();
    populateProfileDropdown();
    toggleCalculationMode();
    updateCalculations();
});

function setDefaultValues() {
    // Set calculation mode to utilization ratios
    document.getElementById('calculationMode').value = 'utilization';
    
    // Set profile type to IPE
    document.getElementById('profileType').value = 'IPE';
}

function populateProfileDropdown() {
    const profileType = document.getElementById('profileType').value;
    const selectedProfileDropdown = document.getElementById('selectedProfile');
    
    // Clear existing options
    selectedProfileDropdown.innerHTML = '<option value="">Select a profile...</option>';
    
    // Populate with profiles of the selected type
    if (profileData[profileType]) {
        profileData[profileType].forEach(profile => {
            const option = document.createElement('option');
            option.value = profile.name;
            option.textContent = profile.name;
            selectedProfileDropdown.appendChild(option);
        });
        
        // Set default profile to IPE300 if IPE type is selected
        if (profileType === 'IPE') {
            selectedProfileDropdown.value = 'IPE300';
        }
    }
}

function toggleCalculationMode() {
    const calculationMode = document.getElementById('calculationMode').value;
    const utilizationRatioGroup = document.getElementById('utilizationRatioGroup');
    const beamLengthGroup = document.getElementById('beamLengthGroup');
    const loadingModelGroup = document.getElementById('loadingModelGroup');
    
    if (calculationMode === 'utilization') {
        // Show utilization ratio input, hide loading model inputs
        utilizationRatioGroup.style.display = 'block';
        beamLengthGroup.style.display = 'none';
        loadingModelGroup.style.display = 'none';
    } else {
        // Show loading model inputs, hide utilization ratio input
        utilizationRatioGroup.style.display = 'none';
        beamLengthGroup.style.display = 'block';
        loadingModelGroup.style.display = 'block';
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
    
    if (!selectedProfileName) {
        showError('Please select a profile');
        return;
    }
    
    // Clear any existing errors
    clearErrors();

    // Get selected profile data
    const selectedProfile = profileData[profileType].find(p => p.name === selectedProfileName);
    if (!selectedProfile) {
        showError('Selected profile not found');
        return;
    }

    // Steel properties
    const E = 210000; // MPa - Young's modulus for steel
    const gammaM0 = 1.0; // Partial factor for material
    
    // Calculate selected profile properties
    const profileWy = selectedProfile.wy * 1000; // Convert to mm³
    const profileIy = selectedProfile.iy * 1000000; // Convert to mm⁴
    const profileMRd = (profileWy * yieldLimit) / (1000000 * gammaM0); // kNm (divide by 1000000 to convert from Nmm to kNm)
    
    // Calculate ULS utilization
    const ulsUtilization = actingMoment / profileMRd;
    
    let WelRequired, IyRequired, slsUtilization;
    
    if (calculationMode === 'utilization') {
        // Utilization ratio mode
        const stiffnessUtilization = validateInput('stiffnessUtilization', 0.1, 1.0, 0.8);
        
        // Use ONLY the utilization ratios to find requirements
        // Required Wy = MEd / (fy/γM0 * ULS_utilization)
        WelRequired = (actingMoment * 1000000) / (yieldLimit / gammaM0 * ulsUtilization); // mm³
        
        // Required Iy based on stiffness utilization input
        IyRequired = (actingMoment * 1000000) / (yieldLimit / gammaM0 * stiffnessUtilization); // mm⁴ - simplified approach
        slsUtilization = stiffnessUtilization;
        
    } else {
        // Loading model mode
        const beamLength = validateInput('beamLength', 1, 20, 6.0);
        const deflectionLimit = validateInput('deflectionLimit', 150, 500, 300);
        const loadType = document.getElementById('loadType').value;
        
        if (beamLength <= 0) {
            showError('Please enter a valid beam length greater than 0 m');
            return;
        }
        
        // Calculate required section modulus for moment capacity
        WelRequired = (actingMoment * 1000000) / (yieldLimit / gammaM0); // mm³

        // Calculate required second moment of area for deflection
        const deltaMax = (beamLength * 1000) / deflectionLimit; // mm
        
        if (loadType === 'udl') {
            // For UDL: q = 8M/L² (kN/m)
            const q = (8 * actingMoment) / (beamLength * beamLength); // kN/m
            IyRequired = (5 * q * Math.pow(beamLength * 1000, 4)) / (384 * E * deltaMax); // mm⁴
        } else {
            // For point load: P = 4M/L (kN) 
            const P = (4 * actingMoment) / beamLength; // kN
            IyRequired = (P * 1000 * Math.pow(beamLength * 1000, 3)) / (48 * E * deltaMax); // mm⁴
        }
        
        // Calculate actual SLS utilization based on loading
        slsUtilization = IyRequired / profileIy;
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

    // Calculate for all profile types
    currentResults = {};
    
    Object.keys(profileData).forEach(type => {
        const profiles = profileData[type];
        const suitableProfiles = [];
        
        profiles.forEach(profile => {
            // Profile data: wy in 10³mm³, iy in 10⁶mm⁴ 
            const profileWy = profile.wy * 1000; // Convert to mm³
            const profileIy = profile.iy * 1000000; // Convert to mm⁴
            
            const MRd = (profileWy * yieldLimit) / (1000000 * gammaM0); // Moment resistance in kNm
            
            // Check suitability ONLY based on DERIVED requirements
            const momentOK = profileWy >= WelRequired;
            const stiffnessOK = profileIy >= IyRequired;
            const suitable = momentOK && stiffnessOK;
            
            suitableProfiles.push({
                ...profile,
                MRd: MRd,
                momentOK,
                stiffnessOK,
                suitable,
                utilizationMoment: WelRequired / profileWy, // Utilization based on requirements
                utilizationStiffness: IyRequired / profileIy
            });
        });
        
        // Sort by weight to find lightest profile first
        suitableProfiles.sort((a, b) => a.weight - b.weight);
        
        // Find the first (lightest) profile that meets BOTH requirements
        const lightestSuitable = suitableProfiles.find(p => 
            p.wy * 1000 >= WelRequired && p.iy * 1000000 >= IyRequired
        );
        
        currentResults[type] = {
            profiles: suitableProfiles,
            lightestSuitable: lightestSuitable
        };
    });

    // Update display
    updateResultsDisplay(profileType);
    updateComparisonDisplay(profileType);
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

// Input validation functions
function validateInput(elementId, min, max, defaultValue) {
    const element = document.getElementById(elementId);
    if (!element) return defaultValue; // Element doesn't exist
    
    let value = parseFloat(element.value);
    
    if (isNaN(value)) {
        value = defaultValue;
        element.value = defaultValue;
    } else if (value < min) {
        value = min;
        element.value = min;
        showWarning(`${elementId} value adjusted to minimum: ${min}`);
    } else if (value > max) {
        value = max;
        element.value = max;
        showWarning(`${elementId} value adjusted to maximum: ${max}`);
    }
    
    return value;
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