function toFixedIfNeeded(num, digits=2) {
  return num.toFixed(digits);
}

let profilesDatabase = {};
let currentProfile = null;

// Load available profile types from JSON files
async function loadAvailableProfileTypes() {
  try {
    // Try to fetch a directory listing API endpoint first (if available)
    // If not, fall back to trying common profile types
    let availableTypes = [];
    
    // First, try fetching a files list (this would work if you have a directory listing endpoint)
    try {
      const response = await fetch('../steel_cross_section_database/');
      if (response.ok) {
        const html = await response.text();
        // Parse the directory listing HTML to extract .json file names
        const jsonFiles = html.match(/href="([^"]*\.json)"/g) || [];
        availableTypes = jsonFiles.map(match => {
          const filename = match.match(/href="([^"]*\.json)"/)[1];
          return filename.replace('.json', '').toUpperCase();
        });
      }
    } catch (error) {
      // Directory listing not available or failed
    }
    
    // If directory listing didn't work, fall back to trying known types
    if (availableTypes.length === 0) {
      const potentialTypes = ['ipe', 'hea', 'heb', 'hem', 'upe', 'upn', 'shs', 'rhs', 'chs', 'he', 'hl', 'hd', 'hp', 'hn', 'hk'];
      
      for (const type of potentialTypes) {
        try {
          const response = await fetch(`../steel_cross_section_database/${type}.json`);
          if (response.ok) {
            const data = await response.json();
            // Verify it's a valid profile JSON with the expected structure
            if (data.profiles && Array.isArray(data.profiles)) {
              availableTypes.push(type.toUpperCase());
            }
          }
        } catch (error) {
          console.warn(`Failed to load ${type}.json:`, error.message);
        }
      }
    }
    
    // Populate the profile type dropdown
    const profileTypeSelect = document.getElementById('profileType');
    profileTypeSelect.innerHTML = '<option value="">Select Type</option>';
    
    // Sort alphabetically
    availableTypes.sort();
    
    availableTypes.forEach(type => {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      profileTypeSelect.appendChild(option);
    });
    
    console.log('Loaded profile types:', availableTypes);
    
  } catch (error) {
    console.error('Error loading profile types:', error);
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  loadAvailableProfileTypes();
});

// Load profiles from JSON files
async function loadProfiles() {
  const profileType = document.getElementById('profileType').value;
  const profileSection = document.getElementById('profileSection');
  
  // Clear current profile selection
  profileSection.innerHTML = '<option value="">Select Profile</option>';
  currentProfile = null;
  
  if (!profileType) {
    // Convert back to input fields when "Select Type" is chosen
    toggleWebGeometryFields(false);
    return;
  }
  
  try {
    const response = await fetch(`../steel_cross_section_database/${profileType.toLowerCase()}.json`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Validate data structure
    if (!data.profiles || !Array.isArray(data.profiles)) {
      throw new Error('Invalid profile data structure - missing profiles array');
    }
    
    profilesDatabase[profileType] = data;
    
    // Populate profile dropdown
    data.profiles.forEach(profile => {
      if (!profile.profile) {
        console.warn('Profile missing name:', profile);
        return;
      }
      const option = document.createElement('option');
      option.value = profile.profile;
      option.textContent = profile.profile;
      profileSection.appendChild(option);
    });
    
    console.log(`Loaded ${data.profiles.length} profiles for ${profileType}`);
    
  } catch (error) {
    console.error(`Error loading ${profileType} profiles:`, error);
    alert(`Error loading ${profileType} profile database: ${error.message}`);
  }
}

// Load specific profile data
function loadProfileData() {
  const profileType = document.getElementById('profileType').value;
  const profileName = document.getElementById('profileSection').value;
  
  if (!profileType || !profileName) {
    currentProfile = null;
    // Show input fields, hide calculated fields
    toggleWebGeometryFields(false);
    return;
  }
  
  const database = profilesDatabase[profileType];
  if (!database) return;
  
  currentProfile = database.profiles.find(p => p.profile === profileName);
  if (currentProfile) {
    // Show calculated fields, hide input fields
    toggleWebGeometryFields(true);
    
    // Update calculated values
    document.getElementById('tw-calculated').textContent = currentProfile.tw.toFixed(1);
    document.getElementById('tf-calculated').textContent = currentProfile.tf.toFixed(1);
    document.getElementById('bf-calculated').textContent = currentProfile.b.toFixed(1);
    
    // Calculate and update hw
    calculateWebHeight();
  }
}

// Toggle between input fields and calculated output fields
function toggleWebGeometryFields(useCalculated) {
  const hwInput = document.getElementById('hw');
  const twInput = document.getElementById('tw');
  const tfInput = document.getElementById('tf');
  const bfInput = document.getElementById('bf');
  const hwCalculated = document.getElementById('hw-calculated');
  const twCalculated = document.getElementById('tw-calculated');
  const tfCalculated = document.getElementById('tf-calculated');
  const bfCalculated = document.getElementById('bf-calculated');
  
  if (useCalculated) {
    hwInput.classList.add('hidden');
    twInput.classList.add('hidden');
    tfInput.classList.add('hidden');
    bfInput.classList.add('hidden');
    hwCalculated.classList.remove('hidden');
    twCalculated.classList.remove('hidden');
    tfCalculated.classList.remove('hidden');
    bfCalculated.classList.remove('hidden');
  } else {
    hwInput.classList.remove('hidden');
    twInput.classList.remove('hidden');
    tfInput.classList.remove('hidden');
    bfInput.classList.remove('hidden');
    hwCalculated.classList.add('hidden');
    twCalculated.classList.add('hidden');
    tfCalculated.classList.add('hidden');
    bfCalculated.classList.add('hidden');
  }
}

// Calculate web height based on profile and checkbox
function calculateWebHeight() {
  if (!currentProfile) return;
  
  const includeRadius = document.getElementById('includeRadius').checked;
  const h = currentProfile.h;
  const tf = currentProfile.tf;
  const r = currentProfile.r || 0;
  
  let hw;
  if (includeRadius) {
    hw = h - 2 * (tf + r);
  } else {
    hw = h - 2 * tf;
  }
  
  document.getElementById('hw-calculated').textContent = hw.toFixed(1);
}

function calculateAndShow() {
  // Get inputs (from either input fields or calculated fields)
  const hw = currentProfile ? 
    parseFloat(document.getElementById('hw-calculated').textContent) : 
    parseFloat(document.getElementById('hw').value);
  const tw = currentProfile ? 
    parseFloat(document.getElementById('tw-calculated').textContent) : 
    parseFloat(document.getElementById('tw').value);
  const tf = currentProfile ? 
    parseFloat(document.getElementById('tf-calculated').textContent) : 
    parseFloat(document.getElementById('tf').value);
  const bf = currentProfile ? 
    parseFloat(document.getElementById('bf-calculated').textContent) : 
    parseFloat(document.getElementById('bf').value);
    
  const type = document.getElementById('type').value;
  const FS = parseFloat(document.getElementById('FS').value);
  const a = parseFloat(document.getElementById('a').value);
  const ss = parseFloat(document.getElementById('ss').value);
  const c = parseFloat(document.getElementById('c').value);
  const fyw = parseFloat(document.getElementById('fyw').value);
  const fyf = parseFloat(document.getElementById('fyf').value);
  const E = parseFloat(document.getElementById('E').value);
  const gammaM1 = parseFloat(document.getElementById('gammaM1').value);

  // Basic validations
  if (isNaN(hw) || isNaN(tw) || isNaN(tf) || isNaN(bf) || isNaN(FS) || isNaN(a) || isNaN(ss) || isNaN(c) || isNaN(fyw) || isNaN(fyf) || isNaN(E) || isNaN(gammaM1)) {
    alert('Please enter valid numbers for all fields');
    return;
  }

  // Calculations based on the PDF
  
  // Step 1: Calculate kF based on type
  let kF;
  if (type === 'a') {
    kF = 6 + 2 * Math.pow(hw / a, 2);
  } else if (type === 'b') {
    kF = 3.5 + 2 * Math.pow(hw / a, 2);
  } else if (type === 'c') {
    kF = Math.max(2 + 6 * (ss + c) / hw, 6);
  } else {
    alert('Invalid type selected');
    return;
  }
  
  // Step 2: Calculate m1 (ratio of flange to web yield stress times flange thickness ratio)
  const m1 = (fyf * bf) / (fyw * tw);
  
  // Step 3: Calculate m2 (initial guess for iterative calculation)
  const m2_initial = 0.02 * Math.pow(hw / tf, 2);
  
  // Step 4: Calculate effective lengths for buckling
  // ly,a,b calculation (all in mm)
  const ly_a_b = Math.min(ss + 2 * tf * (1 + Math.sqrt(m1 + m2_initial)), a);
  
  // le calculation - corrected formula: le = (kF * E * tw^2) / (2 * fyw * hw)
  // E in GPa needs to be converted to MPa: E * 1000 = MPa
  // All dimensions in mm, E converted to MPa, result in mm
  const le = (kF * E * 1000 * Math.pow(tw, 2)) / (2 * fyw * hw);
  
  // ly,c calculation - corrected formula from PDF
  const term1 = le + tf * Math.sqrt(m1/2 + Math.pow(le/tf, 2) + m2_initial);
  const term2 = le + tf * Math.sqrt(m1 + m2_initial);
  const ly_c = Math.min(term1, term2);
  
  // Step 5: Select appropriate effective length based on type
  let ly_initial;
  if (type === 'a' || type === 'b') {
    ly_initial = ly_a_b;
  } else if (type === 'c') {
    ly_initial = ly_c;
  } else {
    ly_initial = ly_a_b; // fallback
  }
  
  // Step 6: Calculate critical buckling force
  // E in GPa needs to be converted to MPa: E * 1000
  // Units: MPa × mm³ / mm = N (then convert to kN)
  const Fcr = 0.9 * kF * (E * 1000) * Math.pow(tw, 3) / hw / 1000;
  
  // Step 7: Calculate slenderness parameter
  // ly_initial in mm, tw in mm, fyw in MPa, Fcr in kN (convert to N)
  const lambda_F = Math.sqrt((ly_initial * tw * fyw) / (Fcr * 1000));
  
  // Step 8: Check if λF < 0.5 for conservative approach
  let m2;
  if (lambda_F >= 0.5) {
    m2 = m2_initial;
  } else {
    m2 = 0;
  }
  
  // Step 9: Recalculate effective length with updated m2
  let ly;
  if (type === 'a' || type === 'b') {
    ly = Math.min(ss + 2 * tf * (1 + Math.sqrt(m1 + m2)), a);
  } else if (type === 'c') {
    const term1_final = le + tf * Math.sqrt(m1/2 + Math.pow(le/tf, 2) + m2);
    const term2_final = le + tf * Math.sqrt(m1 + m2);
    ly = Math.min(term1_final, term2_final);
  } else {
    ly = ly_initial;
  }
  
  // Step 10: Recalculate lambda_F with final effective length
  // ly in mm, tw in mm, fyw in MPa, Fcr in kN (convert to N)
  const lambda_F_final = Math.sqrt((ly * tw * fyw) / (Fcr * 1000));
  
  // Step 11: Calculate reduction factor chi_F
  const chi_F = Math.min(1, 0.5 / lambda_F_final);
  
  // Step 12: Calculate effective length for resistance
  const Leff = chi_F * ly;
  
  // Step 13: Calculate resistance
  // fyw in MPa (N/mm²), Leff in mm, tw in mm
  // Result in N, then convert to kN
  const FRd_N = (fyw * Leff * tw) / gammaM1; // All dimensions in mm
  const FRd = FRd_N / 1000; // Convert N to kN
  
  // Step 14: Calculate utilization ratio
  // FS in kN, FRd in kN
  const eta_unstiffened = FS / FRd;
  
  // Determine status
  let status, statusColor;
  if (eta_unstiffened <= 1.0) {
    status = "Unstiffened web capacity adequate";
    statusColor = "text-green-400";
  } else {
    status = "Unstiffened web capacity EXCEEDED - strengthening required";
    statusColor = "text-red-400";
  }

  // Create results display
  const stepsLatex = `
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-blue-400 mb-4">Transversal Forces - Unstiffened Web Results</h2>
    </div>
    
    <!-- Summary Box -->
    <div class="calc-box mb-6 border-l-4 ${eta_unstiffened > 1.0 ? 'border-red-500' : eta_unstiffened > 0.85 ? 'border-yellow-500' : 'border-green-500'}">
      <div class="calc-header">
        <h3 class="text-lg font-semibold text-white">Results Summary</h3>
      </div>
      <div class="calc-content">
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <div class="calc-row">
              <span class="calc-label">Utilization Ratio (η)</span>
              <span class="calc-equals">=</span>
              <span class="calc-value ${eta_unstiffened > 1.0 ? 'text-red-400' : eta_unstiffened > 0.85 ? 'text-yellow-400' : 'text-green-400'}">${toFixedIfNeeded(eta_unstiffened * 100)}%</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">F<sub>S</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(FS)} kN</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">F<sub>Rd</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(FRd)} kN</span>
            </div>
          </div>
          <div>
            <div class="calc-row">
              <span class="calc-label">Status</span>
              <span class="calc-equals">=</span>
              <span class="calc-value ${statusColor}">${status}</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">Load Type</span>
              <span class="calc-equals">=</span>
              <span class="calc-value">Type ${type.toUpperCase()}</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">λ<sub>F</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(lambda_F_final)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Input Values Box -->
    <div class="calc-box mb-6">
      <div class="calc-header">
        <h3 class="text-lg font-semibold text-blue-300">Input Values</h3>
      </div>
      <div class="calc-content">
        ${currentProfile ? `
        <div class="mb-4">
          <h4 class="text-md font-semibold text-blue-200 mb-3 border-b border-gray-600 pb-1">Selected Profile: ${currentProfile.profile}</h4>
          <div class="calc-row">
            <span class="calc-label">h</span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${toFixedIfNeeded(currentProfile.h)} mm</span>
            <span class="text-gray-400 text-sm ml-4">(total height)</span>
          </div>
          <div class="calc-row">
            <span class="calc-label">t<sub>f</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${toFixedIfNeeded(currentProfile.tf)} mm</span>
            <span class="text-gray-400 text-sm ml-4">(flange thickness)</span>
          </div>
          <div class="calc-row">
            <span class="calc-label">b<sub>f</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${toFixedIfNeeded(currentProfile.b)} mm</span>
            <span class="text-gray-400 text-sm ml-4">(flange width)</span>
          </div>
          <div class="calc-row">
            <span class="calc-label">r</span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${toFixedIfNeeded(currentProfile.r || 0)} mm</span>
            <span class="text-gray-400 text-sm ml-4">(root radius)</span>
          </div>
          <div class="calc-separator"></div>
          <div class="calc-row">
            <span class="calc-label">h<sub>w</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-expression">${document.getElementById('includeRadius').checked ? 
              `h - 2×(t<sub>f</sub> + r) = ${toFixedIfNeeded(currentProfile.h)} - 2×(${toFixedIfNeeded(currentProfile.tf)} + ${toFixedIfNeeded(currentProfile.r || 0)})` :
              `h - 2×t<sub>f</sub> = ${toFixedIfNeeded(currentProfile.h)} - 2×${toFixedIfNeeded(currentProfile.tf)}`
            }</span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${toFixedIfNeeded(hw)} mm</span>
          </div>
        </div>
        ` : ''}
        <div class="grid md:grid-cols-3 gap-4">
          <div>
            <h4 class="text-sm font-medium text-gray-300 mb-2">Web Geometry</h4>
            <div class="calc-row">
              <span class="calc-label">h<sub>w</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(hw)} mm</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">t<sub>w</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(tw)} mm</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">t<sub>f</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(tf)} mm</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">b<sub>f</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(bf)} mm</span>
            </div>
          </div>
          <div>
            <h4 class="text-sm font-medium text-gray-300 mb-2">Load Application</h4>
            <div class="calc-row">
              <span class="calc-label">Type</span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${type.toUpperCase()}</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">F<sub>S</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(FS)} kN</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">a</span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(a)} mm</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">s<sub>s</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(ss)} mm</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">c</span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(c)} mm</span>
            </div>
          </div>
          <div>
            <h4 class="text-sm font-medium text-gray-300 mb-2">Material Properties</h4>
            <div class="calc-row">
              <span class="calc-label">f<sub>yw</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(fyw)} MPa</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">f<sub>yf</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(fyf)} MPa</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">E</span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(E)} GPa</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">γ<sub>M1</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(gammaM1)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Detailed Calculations Box -->
    <div class="calc-box mb-6">
      <div class="calc-header">
        <h3 class="text-lg font-semibold text-yellow-300">Detailed Calculations (EC3-1-5)</h3>
      </div>
      <div class="calc-content">
        
        <h4 class="text-md font-medium text-blue-200 mb-3 border-b border-gray-600 pb-1">Step 1: Buckling Coefficient (k<sub>F</sub>)</h4>
        ${type === 'a' ? `
        <div class="calc-row">
          <span class="calc-label">Type a:</span>
          <span class="calc-expression">k<sub>F</sub> = 6 + 2×(h<sub>w</sub>/a)²</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">k<sub>F</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">6 + 2×(${toFixedIfNeeded(hw)}/${toFixedIfNeeded(a)})²</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(kF)}</span>
        </div>` : type === 'b' ? `
        <div class="calc-row">
          <span class="calc-label">Type b:</span>
          <span class="calc-expression">k<sub>F</sub> = 3.5 + 2×(h<sub>w</sub>/a)²</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">k<sub>F</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">3.5 + 2×(${toFixedIfNeeded(hw)}/${toFixedIfNeeded(a)})²</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(kF)}</span>
        </div>` : `
        <div class="calc-row">
          <span class="calc-label">Type c:</span>
          <span class="calc-expression">k<sub>F</sub> = max(2 + 6×(s<sub>s</sub> + c)/h<sub>w</sub>, 6)</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">k<sub>F</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">max(2 + 6×(${toFixedIfNeeded(ss)} + ${toFixedIfNeeded(c)})/${toFixedIfNeeded(hw)}, 6)</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(kF)}</span>
        </div>`}

        <h4 class="text-md font-medium text-blue-200 mb-3 mt-6 border-b border-gray-600 pb-1">Step 2: Material Parameter (m<sub>1</sub>)</h4>
        <div class="calc-row">
          <span class="calc-label">m<sub>1</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">f<sub>yf</sub> × b<sub>f</sub> / (f<sub>yw</sub> × t<sub>w</sub>) = ${toFixedIfNeeded(fyf)} × ${toFixedIfNeeded(bf)} / (${toFixedIfNeeded(fyw)} × ${toFixedIfNeeded(tw)})</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(m1)}</span>
        </div>

        <h4 class="text-md font-medium text-blue-200 mb-3 mt-6 border-b border-gray-600 pb-1">Step 3: Initial Geometry Parameter (m<sub>2</sub>)</h4>
        <div class="calc-row">
          <span class="calc-label">m<sub>2,initial</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">0.02 × (h<sub>w</sub>/t<sub>f</sub>)² = 0.02 × (${toFixedIfNeeded(hw)}/${toFixedIfNeeded(tf)})²</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(m2_initial)}</span>
        </div>

        <h4 class="text-md font-medium text-blue-200 mb-3 mt-6 border-b border-gray-600 pb-1">Step 4: Initial Effective Length</h4>
        ${type === 'a' || type === 'b' ? `
        <div class="calc-row">
          <span class="calc-label">l<sub>y,a,b</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">min(s<sub>s</sub> + 2×t<sub>f</sub>×(1 + √(m<sub>1</sub> + m<sub>2,initial</sub>)), a)</span>
        </div>
        <div class="calc-row ml-8">
          <span class="calc-equals">=</span>
          <span class="calc-expression">min(${toFixedIfNeeded(ss)} + 2×${toFixedIfNeeded(tf)}×(1 + √(${toFixedIfNeeded(m1)} + ${toFixedIfNeeded(m2_initial)})), ${toFixedIfNeeded(a)})</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(ly_initial)} mm</span>
        </div>` : `
        <div class="calc-row">
          <span class="calc-label">l<sub>e</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">k<sub>F</sub>×E×t<sub>w</sub>² / (2×f<sub>yw</sub>×h<sub>w</sub>) = ${toFixedIfNeeded(kF)}×${toFixedIfNeeded(E*1000)}×${toFixedIfNeeded(tw)}² / (2×${toFixedIfNeeded(fyw)}×${toFixedIfNeeded(hw)})</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(le)} mm</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">l<sub>y,c</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">min(l<sub>e</sub> + t<sub>f</sub>×√(m<sub>1</sub>/2 + (l<sub>e</sub>/t<sub>f</sub>)² + m<sub>2,initial</sub>), l<sub>e</sub> + t<sub>f</sub>×√(m<sub>1</sub> + m<sub>2,initial</sub>))</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(ly_initial)} mm</span>
        </div>`}

        <h4 class="text-md font-medium text-blue-200 mb-3 mt-6 border-b border-gray-600 pb-1">Step 5: Critical Buckling Force</h4>
        <div class="calc-row">
          <span class="calc-label">F<sub>cr</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">0.9 × k<sub>F</sub> × E × t<sub>w</sub>³ / h<sub>w</sub> = 0.9 × ${toFixedIfNeeded(kF)} × ${toFixedIfNeeded(E*1000)} × ${toFixedIfNeeded(tw)}³ / ${toFixedIfNeeded(hw)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(Fcr)} kN</span>
        </div>

        <h4 class="text-md font-medium text-blue-200 mb-3 mt-6 border-b border-gray-600 pb-1">Step 6: Slenderness Parameter</h4>
        <div class="calc-row">
          <span class="calc-label">λ<sub>F,initial</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">√(l<sub>y,initial</sub> × t<sub>w</sub> × f<sub>yw</sub> / F<sub>cr</sub>) = √(${toFixedIfNeeded(ly_initial)} × ${toFixedIfNeeded(tw)} × ${toFixedIfNeeded(fyw)} / ${toFixedIfNeeded(Fcr*1000)})</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(lambda_F)}</span>
        </div>

        <h4 class="text-md font-medium text-blue-200 mb-3 mt-6 border-b border-gray-600 pb-1">Step 7: Conservative Check</h4>
        <div class="calc-row">
          <span class="calc-note text-sm">Check: λ<sub>F</sub> ${lambda_F >= 0.5 ? '≥' : '<'} 0.5</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">m<sub>2</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">${lambda_F >= 0.5 ? `${toFixedIfNeeded(m2_initial)} (use initial)` : '0 (conservative)'}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(m2)}</span>
        </div>

        <h4 class="text-md font-medium text-blue-200 mb-3 mt-6 border-b border-gray-600 pb-1">Step 8: Final Effective Length</h4>
        <div class="calc-row">
          <span class="calc-label">l<sub>y,final</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(ly)} mm</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">λ<sub>F,final</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">√(l<sub>y,final</sub> × t<sub>w</sub> × f<sub>yw</sub> / F<sub>cr</sub>) = √(${toFixedIfNeeded(ly)} × ${toFixedIfNeeded(tw)} × ${toFixedIfNeeded(fyw)} / ${toFixedIfNeeded(Fcr*1000)})</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(lambda_F_final)}</span>
        </div>

        <h4 class="text-md font-medium text-blue-200 mb-3 mt-6 border-b border-gray-600 pb-1">Step 9: Reduction Factor</h4>
        <div class="calc-row">
          <span class="calc-label">χ<sub>F</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">min(1, 0.5/λ<sub>F</sub>) = min(1, 0.5/${toFixedIfNeeded(lambda_F_final)})</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(chi_F)}</span>
        </div>

        <h4 class="text-md font-medium text-blue-200 mb-3 mt-6 border-b border-gray-600 pb-1">Step 10: Final Resistance</h4>
        <div class="calc-row">
          <span class="calc-label">L<sub>eff</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">χ<sub>F</sub> × l<sub>y</sub> = ${toFixedIfNeeded(chi_F)} × ${toFixedIfNeeded(ly)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(Leff)} mm</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">F<sub>Rd</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">f<sub>yw</sub> × L<sub>eff</sub> × t<sub>w</sub> / γ<sub>M1</sub> = ${toFixedIfNeeded(fyw)} × ${toFixedIfNeeded(Leff)} × ${toFixedIfNeeded(tw)} / ${toFixedIfNeeded(gammaM1)}</span>
        </div>
        <div class="calc-row ml-8">
          <span class="calc-equals">=</span>
          <span class="calc-expression">${toFixedIfNeeded(FRd_N)} N = ${toFixedIfNeeded(FRd)} kN</span>
        </div>
        
        <div class="calc-separator"></div>
        <div class="calc-row">
          <span class="calc-label">η<sub>unstiffened</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">F<sub>S</sub> / F<sub>Rd</sub> = ${toFixedIfNeeded(FS)} / ${toFixedIfNeeded(FRd)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(eta_unstiffened)}</span>
        </div>
      </div>
    </div>
  `;

  const container = document.getElementById('calc-steps');
  container.innerHTML = stepsLatex;
  document.getElementById('results').style.display = 'block';

  // Typeset math with MathJax
  MathJax.typesetPromise();
}