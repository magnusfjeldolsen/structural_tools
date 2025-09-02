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
    
    // Calculate and populate optimal stiffener width
    const bf = currentProfile.b; // flange width
    const tw = currentProfile.tw; // web thickness
    const optimalBst = (bf - tw) / 2;
    document.getElementById('bst').value = optimalBst.toFixed(1);
    
    // Calculate and update hw
    calculateWebHeight();
  }
}

// Toggle between input fields and calculated output fields
function toggleWebGeometryFields(useCalculated) {
  const hwInput = document.getElementById('hw');
  const twInput = document.getElementById('tw');
  const hwCalculated = document.getElementById('hw-calculated');
  const twCalculated = document.getElementById('tw-calculated');
  
  if (useCalculated) {
    hwInput.classList.add('hidden');
    twInput.classList.add('hidden');
    hwCalculated.classList.remove('hidden');
    twCalculated.classList.remove('hidden');
  } else {
    hwInput.classList.remove('hidden');
    twInput.classList.remove('hidden');
    hwCalculated.classList.add('hidden');
    twCalculated.classList.add('hidden');
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
  
  // Check stiffener width validation when profile changes
  validateStiffenerWidth();
}

// Validate stiffener width against flange width
function validateStiffenerWidth() {
  const bstInput = document.getElementById('bst');
  const bst = parseFloat(bstInput.value);
  
  if (!currentProfile || isNaN(bst)) {
    // Reset validation if no profile or invalid input
    bstInput.classList.remove('border-red-500', 'bg-red-900/20');
    bstInput.classList.add('border-gray-500', 'bg-gray-600');
    bstInput.removeAttribute('title');
    return;
  }
  
  const bf = currentProfile.b; // flange width
  const tw = currentProfile.tw; // web thickness
  const maxStiffenerWidth = (bf - tw) / 2;
  
  if (bst > maxStiffenerWidth) {
    // Make input red and add warning
    bstInput.classList.remove('border-gray-500', 'bg-gray-600');
    bstInput.classList.add('border-red-500', 'bg-red-900/20');
    bstInput.title = `Warning: Stiffener is wider than the flange and will stick outside of the profile. Maximum recommended width: ${maxStiffenerWidth.toFixed(1)} mm`;
  } else {
    // Reset to normal appearance
    bstInput.classList.remove('border-red-500', 'bg-red-900/20');
    bstInput.classList.add('border-gray-500', 'bg-gray-600');
    bstInput.removeAttribute('title');
  }
}

function calculateAndShow() {
  // Get inputs (from either input fields or calculated fields)
  const hw = currentProfile ? 
    parseFloat(document.getElementById('hw-calculated').textContent) : 
    parseFloat(document.getElementById('hw').value);
  const tw = currentProfile ? 
    parseFloat(document.getElementById('tw-calculated').textContent) : 
    parseFloat(document.getElementById('tw').value);
  const tst = parseFloat(document.getElementById('tst').value);
  const bst = parseFloat(document.getElementById('bst').value);
  const a = parseFloat(document.getElementById('a').value);
  const FEd = parseFloat(document.getElementById('FEd').value);
  const fyk = parseFloat(document.getElementById('fyk').value);
  const gammaM1 = parseFloat(document.getElementById('gammaM1').value);

  // Basic validations
  if (isNaN(hw) || isNaN(tw) || isNaN(tst) || isNaN(bst) || isNaN(a) || isNaN(FEd) || isNaN(fyk) || isNaN(gammaM1)) {
    alert('Please enter valid numbers for all fields');
    return;
  }

  // Calculations based on the PDF
  
  // Material calculations
  const epsilon = Math.sqrt(235 / fyk);
  
  // Effective length calculation
  const lw_option1 = 4 * 15 * epsilon * tw;
  const lw_option2 = 2 * 15 * epsilon * tw + a - tst;
  const lw = Math.min(lw_option1, lw_option2);
  
  // Effective area calculation
  const Aeff = lw * tw + 4 * tst * bst;
  
  // Resistance calculation (convert from N to kN)
  const FRd = (Aeff * fyk) / (gammaM1 * 1000);
  
  // Utilization ratio
  const etaF = FEd / FRd;
  
  // Slenderness check calculations - EC3-1-5 9.3.3(3)
  // Second moment of area calculation
  const Ist = (2 * tst * Math.pow(2 * bst + tw, 3)) / 12 + (Math.pow(tw, 3) * lw) / 12;
  
  // Minimum second moment of area calculation
  let Ist_min;
  if (a / hw < Math.sqrt(2)) {
    Ist_min = (1.5 * Math.pow(hw, 3) * Math.pow(tw, 3)) / (Math.pow(a, 2));
  } else {
    Ist_min = (0.75 * hw * Math.pow(tw, 3));
  }
  
  // Slenderness ratio
  const eta_slender = Ist / Ist_min;
  
  // Slenderness check
  let slenderness_check;
  if (eta_slender >= 1) {
    slenderness_check = "Stiffened web NOT prone to buckling before reaching yield limit, OK";
  } else {
    slenderness_check = "NB! STIFFENED SECTION IS SLENDER - CALCULATION NOT VALID!";
  }

  // Create results display
  const stepsLatex = `
    <div class="mb-6">
      <h2 class="text-2xl font-bold text-blue-400 mb-4">Transversal Forces - Stiffened Web Results</h2>
    </div>
    
    <!-- Summary Box -->
    <div class="calc-box mb-6 border-l-4 ${etaF > 1.0 ? 'border-red-500' : etaF > 0.85 ? 'border-yellow-500' : 'border-green-500'}">
      <div class="calc-header">
        <h3 class="text-lg font-semibold text-white">Summary</h3>
      </div>
      <div class="calc-content">
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <div class="calc-row">
              <span class="calc-label">Utilization Ratio (η<sub>F</sub>)</span>
              <span class="calc-equals">=</span>
              <span class="calc-value ${etaF > 1.0 ? 'text-red-400' : etaF > 0.85 ? 'text-yellow-400' : 'text-green-400'}">${toFixedIfNeeded(etaF * 100)}%</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">F<sub>Ed</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(FEd)} kN</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">F<sub>Rd</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(FRd)} kN</span>
            </div>
          </div>
          <div>
            <div class="calc-row">
              <span class="calc-label">Slenderness Check</span>
              <span class="calc-equals">=</span>
              <span class="calc-value ${eta_slender >= 1 ? 'text-green-400' : 'text-red-400'}">${eta_slender >= 1 ? 'OK' : 'NOT OK'}</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">η<sub>slender</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(eta_slender)}</span>
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
        <div class="mb-4 p-3 bg-gray-600 rounded">
          <h4 class="text-sm font-medium text-blue-200 mb-2">Selected Profile: ${currentProfile.profile}</h4>
          <div class="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <div class="calc-row">
                <span class="calc-label">h</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(currentProfile.h)} mm</span>
              </div>
              <div class="calc-row">
                <span class="calc-label">t<sub>f</sub></span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(currentProfile.tf)} mm</span>
              </div>
              <div class="calc-row">
                <span class="calc-label">r</span>
                <span class="calc-equals">=</span>
                <span class="calc-value">${toFixedIfNeeded(currentProfile.r || 0)} mm</span>
              </div>
            </div>
            <div>
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
          </div>
          <div>
            <h4 class="text-sm font-medium text-gray-300 mb-2">Stiffener Geometry</h4>
            <div class="calc-row">
              <span class="calc-label">t<sub>st</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(tst)} mm</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">b<sub>st</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(bst)} mm</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">a</span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(a)} mm</span>
            </div>
          </div>
          <div>
            <h4 class="text-sm font-medium text-gray-300 mb-2">Load & Material</h4>
            <div class="calc-row">
              <span class="calc-label">F<sub>Ed</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(FEd)} kN</span>
            </div>
            <div class="calc-row">
              <span class="calc-label">f<sub>yk</sub></span>
              <span class="calc-equals">=</span>
              <span class="calc-value">${toFixedIfNeeded(fyk)} MPa</span>
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
        <h3 class="text-lg font-semibold text-yellow-300">Detailed Calculations</h3>
      </div>
      <div class="calc-content">
        
        <h4 class="text-md font-medium text-blue-200 mb-3 border-b border-gray-600 pb-1">Material Factor</h4>
        <div class="calc-row">
          <span class="calc-label">ε</span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">√(235 / f<sub>yk</sub>) = √(235 / ${toFixedIfNeeded(fyk)})</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(epsilon)}</span>
        </div>

        <h4 class="text-md font-medium text-blue-200 mb-3 mt-6 border-b border-gray-600 pb-1">Effective Length</h4>
        <div class="calc-row">
          <span class="calc-label">l<sub>w,option1</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">4 × 15 × ε × t<sub>w</sub> = 4 × 15 × ${toFixedIfNeeded(epsilon)} × ${toFixedIfNeeded(tw)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(lw_option1)} mm</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">l<sub>w,option2</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">2 × 15 × ε × t<sub>w</sub> + a - t<sub>st</sub> = 2 × 15 × ${toFixedIfNeeded(epsilon)} × ${toFixedIfNeeded(tw)} + ${toFixedIfNeeded(a)} - ${toFixedIfNeeded(tst)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(lw_option2)} mm</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">l<sub>w</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">min(${toFixedIfNeeded(lw_option1)}, ${toFixedIfNeeded(lw_option2)})</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(lw)} mm</span>
        </div>

        <h4 class="text-md font-medium text-blue-200 mb-3 mt-6 border-b border-gray-600 pb-1">Effective Area</h4>
        <div class="calc-row">
          <span class="calc-label">A<sub>eff</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">l<sub>w</sub> × t<sub>w</sub> + 4 × t<sub>st</sub> × b<sub>st</sub> = ${toFixedIfNeeded(lw)} × ${toFixedIfNeeded(tw)} + 4 × ${toFixedIfNeeded(tst)} × ${toFixedIfNeeded(bst)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(Aeff)} mm²</span>
        </div>

        <h4 class="text-md font-medium text-blue-200 mb-3 mt-6 border-b border-gray-600 pb-1">Resistance</h4>
        <div class="calc-row">
          <span class="calc-label">F<sub>Rd</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">A<sub>eff</sub> × f<sub>yk</sub> / γ<sub>M1</sub> = ${toFixedIfNeeded(Aeff)} × ${toFixedIfNeeded(fyk)} / ${toFixedIfNeeded(gammaM1)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(FRd)} kN</span>
        </div>
        
        <div class="calc-separator"></div>
        <div class="calc-row">
          <span class="calc-label">η<sub>F</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">F<sub>Ed</sub> / F<sub>Rd</sub> = ${toFixedIfNeeded(FEd)} / ${toFixedIfNeeded(FRd)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(etaF)}</span>
        </div>
      </div>
    </div>

    <!-- Slenderness Check Box -->
    <div class="calc-box mb-6">
      <div class="calc-header">
        <h3 class="text-lg font-semibold text-purple-300">Slenderness Check (EC3-1-5 9.3.3(3))</h3>
      </div>
      <div class="calc-content">
        
        <h4 class="text-md font-medium text-blue-200 mb-3 border-b border-gray-600 pb-1">Second Moment of Area</h4>
        <div class="calc-row">
          <span class="calc-label">I<sub>st</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">[2 × t<sub>st</sub> × (2 × b<sub>st</sub> + t<sub>w</sub>)³] / 12 + [t<sub>w</sub>³ × l<sub>w</sub>] / 12</span>
        </div>
        <div class="calc-row ml-8">
          <span class="calc-equals">=</span>
          <span class="calc-expression">[2 × ${toFixedIfNeeded(tst)} × (2 × ${toFixedIfNeeded(bst)} + ${toFixedIfNeeded(tw)})³] / 12 + [${toFixedIfNeeded(tw)}³ × ${toFixedIfNeeded(lw)}] / 12</span>
        </div>
        <div class="calc-row ml-8">
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(Ist)} mm⁴</span>
        </div>

        <h4 class="text-md font-medium text-blue-200 mb-3 mt-6 border-b border-gray-600 pb-1">Minimum Second Moment of Area</h4>
        <div class="calc-row">
          <span class="calc-label">a / h<sub>w</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">${toFixedIfNeeded(a)} / ${toFixedIfNeeded(hw)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(a/hw)}</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">√2</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(Math.sqrt(2))}</span>
        </div>
        <div class="calc-row">
          <span class="calc-note text-sm">Condition: ${a/hw < Math.sqrt(2) ? 'a/hw < √2' : 'a/hw ≥ √2'}</span>
        </div>
        
        ${a/hw < Math.sqrt(2) ? 
          `<div class="calc-row">
            <span class="calc-label">I<sub>st,min</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-expression">1.5 × h<sub>w</sub>³ × t<sub>w</sub>³ / a² = 1.5 × ${toFixedIfNeeded(hw)}³ × ${toFixedIfNeeded(tw)}³ / ${toFixedIfNeeded(a)}²</span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${toFixedIfNeeded(Ist_min)} mm⁴</span>
          </div>` : 
          `<div class="calc-row">
            <span class="calc-label">I<sub>st,min</sub></span>
            <span class="calc-equals">=</span>
            <span class="calc-expression">0.75 × h<sub>w</sub> × t<sub>w</sub>³ = 0.75 × ${toFixedIfNeeded(hw)} × ${toFixedIfNeeded(tw)}³</span>
            <span class="calc-equals">=</span>
            <span class="calc-value">${toFixedIfNeeded(Ist_min)} mm⁴</span>
          </div>`
        }

        <div class="calc-separator"></div>
        <div class="calc-row">
          <span class="calc-label">η<sub>slender</sub></span>
          <span class="calc-equals">=</span>
          <span class="calc-expression">I<sub>st</sub> / I<sub>st,min</sub> = ${toFixedIfNeeded(Ist)} / ${toFixedIfNeeded(Ist_min)}</span>
          <span class="calc-equals">=</span>
          <span class="calc-value">${toFixedIfNeeded(eta_slender)}</span>
        </div>
        
        <div class="calc-row">
          <span class="calc-note text-sm">Required: η<sub>slender</sub> ≥ 1.0</span>
        </div>
        <div class="calc-row">
          <span class="calc-label">Status</span>
          <span class="calc-equals">=</span>
          <span class="calc-value ${eta_slender >= 1 ? 'text-green-400' : 'text-red-400'}">${slenderness_check}</span>
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