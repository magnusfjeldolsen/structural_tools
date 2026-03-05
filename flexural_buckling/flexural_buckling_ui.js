/**
 * Steel Column Flexural Buckling - UI Controller
 */

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Load steel database
  await loadSteelDatabase();

  // Setup event listeners
  setupEventListeners();

  // Load saved state from localStorage (this will also update UI visibility)
  loadFormStateFromLocalStorage();
});

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  // Profile type selection
  document.getElementById('profile-type').addEventListener('change', handleProfileTypeChange);

  // Profile name selection
  document.getElementById('profile-name').addEventListener('change', handleProfileNameChange);

  // Steel grade selection
  document.getElementById('steel-grade').addEventListener('change', handleSteelGradeChange);

  // Fire checkbox
  document.getElementById('fire-enabled').addEventListener('change', updateFireInputsVisibility);

  // Fire mode radio buttons
  document.querySelectorAll('input[name="fire-mode"]').forEach(radio => {
    radio.addEventListener('change', updateFireModeVisibility);
  });

  // Am/V filter checkbox
  document.getElementById('amv-filter-enabled').addEventListener('change', updateAmVFilterInputsVisibility);

  // Form submission
  document.getElementById('buckling-form').addEventListener('submit', handleFormSubmit);

  // Find lightest section button
  document.getElementById('find-lightest-btn').addEventListener('click', handleFindLightestSection);

  // Save/Load buttons
  document.getElementById('save-json-btn').addEventListener('click', saveFormStateToJSON);
  document.getElementById('load-json-btn').addEventListener('click', () => {
    document.getElementById('load-json-input').click();
  });
  document.getElementById('load-json-input').addEventListener('change', loadFormStateFromJSON);

  // Auto-save to localStorage on input changes
  const formInputs = document.querySelectorAll('#buckling-form input, #buckling-form select');
  formInputs.forEach(input => {
    input.addEventListener('change', saveFormStateToLocalStorage);
  });
}

// ============================================================================
// PROFILE SELECTION
// ============================================================================

function handleProfileTypeChange(event) {
  const profileType = event.target.value;
  const profileNameSelect = document.getElementById('profile-name');
  const sectionPropertiesDiv = document.getElementById('section-properties');
  const findLightestBtn = document.getElementById('find-lightest-btn');
  const descriptionP = document.getElementById('profile-type-description');

  // Update description text below dropdown
  const descriptions = {
    'hea': 'European wide flange H-beams (HEA profiles)',
    'heb': 'European heavy wide flange H-beams (HEB profiles)',
    'hem': 'European extra heavy wide flange H-beams (HEM profiles)',
    'ipe': 'European I-beams (IPE profiles)',
    'hrhs': 'Hot formed rectangular hollow sections',
    'hshs': 'Hot formed square hollow sections',
    'hchs': 'Hot formed circular hollow sections',
    'crhs': 'Cold formed rectangular hollow sections',
    'cshs': 'Cold formed square hollow sections',
    'cchs': 'Cold formed circular hollow sections'
  };

  if (!profileType) {
    profileNameSelect.disabled = true;
    profileNameSelect.innerHTML = '<option value="">-- First select profile type --</option>';
    sectionPropertiesDiv.classList.add('hidden');
    findLightestBtn.disabled = true;
    descriptionP.classList.add('hidden');
    descriptionP.textContent = '';
    return;
  }

  // Show description
  if (descriptions[profileType]) {
    descriptionP.textContent = descriptions[profileType];
    descriptionP.classList.remove('hidden');
  }

  // Load profile names
  const profileNames = getProfileNames(profileType);

  profileNameSelect.innerHTML = '<option value="">-- Select profile size --</option>';
  profileNames.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name.toUpperCase();
    profileNameSelect.appendChild(option);
  });

  profileNameSelect.disabled = false;
  sectionPropertiesDiv.classList.add('hidden');

  // Enable find lightest button when profile type is selected
  findLightestBtn.disabled = false;
}

function handleProfileNameChange(event) {
  const profileType = document.getElementById('profile-type').value;
  const profileName = event.target.value;

  if (!profileName) return;

  // Get section properties
  const section = getSectionProperties(profileType, profileName);

  if (!section) {
    console.error('Section not found');
    return;
  }

  // Display section properties
  displaySectionProperties(section);

  // Update fy based on thickness
  updateYieldStrength(section);
}

function displaySectionProperties(section) {
  const sectionPropertiesDiv = document.getElementById('section-properties');

  document.getElementById('prop-A').textContent = toFixedIfNeeded(section.area, 2);
  document.getElementById('prop-Iy').textContent = toFixedIfNeeded(section.iy_moment, 1);
  document.getElementById('prop-Iz').textContent = toFixedIfNeeded(section.iz_moment, 1);
  document.getElementById('prop-iy').textContent = toFixedIfNeeded(section.iy, 2);
  document.getElementById('prop-iz').textContent = toFixedIfNeeded(section.iz, 2);

  // Display height based on section type
  if (section.h) {
    document.getElementById('prop-h').textContent = toFixedIfNeeded(section.h, 1);
  } else if (section.height) {
    document.getElementById('prop-h').textContent = toFixedIfNeeded(section.height, 1);
  } else if (section.d) {
    document.getElementById('prop-h').textContent = toFixedIfNeeded(section.d, 1);
  }

  document.getElementById('prop-curve-y').textContent = section.buckling_curve_y || 'b';
  document.getElementById('prop-curve-z').textContent = section.buckling_curve_z || 'c';

  sectionPropertiesDiv.classList.remove('hidden');
}

function updateYieldStrength(section) {
  const steelGrade = document.getElementById('steel-grade').value;

  // Get maximum flange thickness
  let thickness = 0;
  if (section.tf) {
    thickness = section.tf;
  } else if (section.t) {
    thickness = section.t;
  }

  const fy = getYieldStrength(steelGrade, thickness);

  if (fy) {
    document.getElementById('fy').value = fy;
  }
}

function handleSteelGradeChange(event) {
  const profileType = document.getElementById('profile-type').value;
  const profileName = document.getElementById('profile-name').value;

  if (!profileType || !profileName) return;

  const section = getSectionProperties(profileType, profileName);
  if (section) {
    updateYieldStrength(section);
  }
}

// ============================================================================
// FIRE INPUTS VISIBILITY
// ============================================================================

function updateFireInputsVisibility() {
  const fireEnabled = document.getElementById('fire-enabled').checked;
  const fireInputsDiv = document.getElementById('fire-inputs');

  if (fireEnabled) {
    fireInputsDiv.classList.remove('hidden');
  } else {
    fireInputsDiv.classList.add('hidden');
  }
}

function updateFireModeVisibility() {
  const fireMode = document.querySelector('input[name="fire-mode"]:checked').value;
  const temperatureInputContainer = document.getElementById('temperature-input-container');

  if (fireMode === 'specify') {
    temperatureInputContainer.classList.remove('find-critical');
  } else {
    temperatureInputContainer.classList.add('find-critical');
  }
}

function updateAmVFilterInputsVisibility() {
  const amvFilterEnabled = document.getElementById('amv-filter-enabled').checked;
  const amvFilterInputsDiv = document.getElementById('amv-filter-inputs');

  if (amvFilterEnabled) {
    amvFilterInputsDiv.classList.remove('hidden');
  } else {
    amvFilterInputsDiv.classList.add('hidden');
  }
}

// ============================================================================
// FORM SUBMISSION AND CALCULATIONS
// ============================================================================

async function handleFormSubmit(event) {
  event.preventDefault();

  // Gather inputs
  const inputs = {
    profileType: document.getElementById('profile-type').value,
    profileName: document.getElementById('profile-name').value,
    Ly: document.getElementById('Ly').value,
    Lz: document.getElementById('Lz').value,
    steelGrade: document.getElementById('steel-grade').value,
    fy: document.getElementById('fy').value,
    gamma_M1: document.getElementById('gamma-M1').value,
    NEd_ULS: document.getElementById('NEd-ULS').value,
    allowClass4: document.getElementById('class4-toggle').checked,
    fireEnabled: document.getElementById('fire-enabled').checked,
    fireMode: document.querySelector('input[name="fire-mode"]:checked').value,
    NEd_fire: document.getElementById('NEd-fire').value,
    temperature: document.getElementById('temperature').value,
    amvFilterEnabled: document.getElementById('amv-filter-enabled').checked,
    exposureConfig: document.getElementById('exposure-config').value,
    shadowFactor: document.getElementById('shadow-factor').value,
    maxAmV: document.getElementById('max-amv').value
  };

  // Validate inputs
  if (!inputs.profileType || !inputs.profileName) {
    alert('Please select a steel section');
    return;
  }

  // Perform calculations
  const results = calculateBuckling(inputs);

  if (!results.success) {
    alert('Calculation error: ' + results.error);
    return;
  }

  // Display results
  displayResults(results, inputs);
}

// ============================================================================
// FIND LIGHTEST SECTION
// ============================================================================

async function handleFindLightestSection(event) {
  event.preventDefault();

  // Gather inputs (without profileName - we'll search for it)
  const inputs = {
    profileType: document.getElementById('profile-type').value,
    profileName: '', // Will be set by search
    Ly: document.getElementById('Ly').value,
    Lz: document.getElementById('Lz').value,
    steelGrade: document.getElementById('steel-grade').value,
    fy: document.getElementById('fy').value,
    gamma_M1: document.getElementById('gamma-M1').value,
    NEd_ULS: document.getElementById('NEd-ULS').value,
    allowClass4: document.getElementById('class4-toggle').checked,
    fireEnabled: document.getElementById('fire-enabled').checked,
    fireMode: document.querySelector('input[name="fire-mode"]:checked').value,
    NEd_fire: document.getElementById('NEd-fire').value,
    temperature: document.getElementById('temperature').value,
    amvFilterEnabled: document.getElementById('amv-filter-enabled').checked,
    exposureConfig: document.getElementById('exposure-config').value,
    shadowFactor: document.getElementById('shadow-factor').value,
    maxAmV: document.getElementById('max-amv').value
  };

  // Validate profile type is selected
  if (!inputs.profileType) {
    alert('Please select a profile type first');
    return;
  }

  // Disable form during search
  const findLightestBtn = document.getElementById('find-lightest-btn');
  const calculateBtn = document.getElementById('calculate-btn');
  const searchProgress = document.getElementById('search-progress');
  const formInputs = document.querySelectorAll('#buckling-form input, #buckling-form select, #buckling-form button');

  findLightestBtn.disabled = true;
  calculateBtn.disabled = true;
  formInputs.forEach(input => input.disabled = true);
  findLightestBtn.textContent = 'Searching...';
  searchProgress.classList.remove('hidden');

  // Progress callback
  const progressCallback = (tested, total, currentProfile) => {
    searchProgress.textContent = `Testing ${currentProfile.toUpperCase()}... (${tested} of ${total})`;
  };

  // Perform search
  const searchResult = findLightestSection(inputs, progressCallback);

  // Re-enable form
  formInputs.forEach(input => input.disabled = false);
  findLightestBtn.disabled = false;
  calculateBtn.disabled = false;
  findLightestBtn.textContent = 'Find Lightest Candidate';

  if (!searchResult.success) {
    searchProgress.textContent = `Search failed: ${searchResult.error}`;
    searchProgress.classList.add('text-red-400');
    setTimeout(() => {
      searchProgress.classList.add('hidden');
      searchProgress.classList.remove('text-red-400');
    }, 5000);
    return;
  }

  // Update form with found section
  const optimalSection = searchResult.section;
  const profileNameSelect = document.getElementById('profile-name');

  // Update the profile dropdown
  profileNameSelect.value = optimalSection.profileName;

  // Trigger the change handler to update section properties display
  handleProfileNameChange({ target: profileNameSelect });

  // Display success message
  searchProgress.textContent = `✓ Found: ${inputs.profileType.toUpperCase()} ${optimalSection.profileName.toUpperCase()} (tested ${searchResult.testedCount} of ${searchResult.totalCount} sections, utilization: ${(optimalSection.maxUtilization * 100).toFixed(1)}%)`;
  searchProgress.classList.add('text-green-400');

  // Auto-calculate and display results
  // Gather fresh inputs from the form (including the just-selected profile)
  const finalInputs = {
    profileType: document.getElementById('profile-type').value,
    profileName: optimalSection.profileName,
    Ly: document.getElementById('Ly').value,
    Lz: document.getElementById('Lz').value,
    steelGrade: document.getElementById('steel-grade').value,
    fy: document.getElementById('fy').value,
    gamma_M1: document.getElementById('gamma-M1').value,
    NEd_ULS: document.getElementById('NEd-ULS').value,
    allowClass4: document.getElementById('class4-toggle').checked,
    fireEnabled: document.getElementById('fire-enabled').checked,
    fireMode: document.querySelector('input[name="fire-mode"]:checked').value,
    NEd_fire: document.getElementById('NEd-fire').value,
    temperature: document.getElementById('temperature').value,
    amvFilterEnabled: document.getElementById('amv-filter-enabled').checked,
    exposureConfig: document.getElementById('exposure-config').value,
    shadowFactor: document.getElementById('shadow-factor').value,
    maxAmV: document.getElementById('max-amv').value
  };

  // Perform the calculation
  const finalResults = calculateBuckling(finalInputs);

  if (!finalResults.success) {
    console.error('Auto-calculation failed:', finalResults.error);
    alert('Error calculating results for found section: ' + finalResults.error);
    return;
  }

  // Display the results
  displayResults(finalResults, finalInputs);

  // Scroll to results
  const resultsSection = document.getElementById('results-section');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Hide success message after 10 seconds
  setTimeout(() => {
    searchProgress.classList.add('hidden');
    searchProgress.classList.remove('text-green-400');
  }, 10000);
}

// ============================================================================
// DISPLAY RESULTS
// ============================================================================

function displayResults(results, inputs) {
  const resultsSection = document.getElementById('results-section');
  resultsSection.classList.remove('hidden');

  // Display ULS classification results
  displayClassificationResults(results.ulsResults.classification, 'uls', inputs.fy || results.ulsResults.fy_theta);

  // Display Fire classification results if enabled
  if (inputs.fireEnabled && results.fireResults) {
    displayClassificationResults(results.fireResults.classification, 'fire', results.fireResults.fy_theta);

    // Show temperature in fire classification header
    const fireTempDisplay = document.getElementById('fire-temp-display');
    if (fireTempDisplay) {
      const temp = inputs.fireMode === 'find-critical' && results.fireResults.criticalTemp
        ? results.fireResults.criticalTemp
        : inputs.temperature;
      fireTempDisplay.textContent = toFixedIfNeeded(temp, 0);
    }
  } else {
    // Hide fire classification if not enabled
    const fireClassDiv = document.getElementById('classification-results-fire');
    if (fireClassDiv) {
      fireClassDiv.classList.add('hidden');
    }
  }

  // Display Class 4 warning
  displayClass4Warning(results.ulsResults.classification.is_class4);

  // Display ULS effective properties (if Class 4)
  displayEffectiveProperties(results.ulsResults.effective_properties, 'uls');

  // Display Fire effective properties (if fire enabled and Class 4)
  if (inputs.fireEnabled && results.fireResults) {
    displayEffectiveProperties(results.fireResults.effective_properties, 'fire');
  } else {
    // Hide fire effective properties if not enabled
    const fireEffPropsDiv = document.getElementById('class4-effective-properties-fire');
    if (fireEffPropsDiv) {
      fireEffPropsDiv.classList.add('hidden');
    }
  }

  // Display ULS results
  displayULSResults(results.ulsResults, results.inputs);

  // Display fire results if enabled
  if (inputs.fireEnabled) {
    displayFireResults(results, inputs);
  } else {
    document.getElementById('fire-results').classList.add('hidden');
  }

  // Display detailed calculations
  displayDetailedCalculations(results, inputs);

  // Plot section visualization FIRST, then generate report after plot is complete
  _plotSection(results, inputs, () => {
    // Callback: Generate detailed report AFTER section plot is fully rendered
    generateDetailedReport(results, inputs);
  });

  // Scroll to results
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function _plotSection(results, inputs, onPlotComplete) {
  const container = document.getElementById('section-plot-container');
  if (!container) {
    // No container - call callback immediately if provided
    if (onPlotComplete) onPlotComplete();
    return;
  }

  // Only plot for supported profile types
  const supported = ['ipe', 'hea', 'heb', 'hem', 'hrhs', 'hshs', 'hchs', 'crhs', 'cshs', 'cchs'];
  if (!supported.includes(inputs.profileType)) {
    container.classList.add('hidden');
    // Not supported - call callback immediately if provided
    if (onPlotComplete) onPlotComplete();
    return;
  }

  try {
    // Get section from database
    const section = steelDatabase[inputs.profileType][inputs.profileName];
    if (!section) {
      container.classList.add('hidden');
      // No section - call callback immediately if provided
      if (onPlotComplete) onPlotComplete();
      return;
    }

    // Get ULS effective properties if Class 4
    const effProps = results.ulsResults && results.ulsResults.is_using_effective
      ? results.ulsResults.effective_properties
      : null;

    // Determine canvas size based on section aspect ratio
    let aspectRatio;
    if (section.D) {
      // Circular section: square aspect ratio
      aspectRatio = 1.0;
    } else {
      // I/H or hollow rectangular/square sections
      const width = section.b;
      const height = section.h || section.b;  // For SHS, h might not be set (h = b)
      aspectRatio = width / height;
    }

    const targetH = 380;
    // Give extra horizontal space so even narrow sections look good
    const targetW = Math.max(320, Math.min(600, Math.round(targetH * aspectRatio) + 220));

    container.classList.remove('hidden');

    SectionPlotter.plot('section-plot-canvas', section, effProps, {
      profileType: inputs.profileType,
      sectionName: inputs.profileName,
      canvasWidth: targetW,
      canvasHeight: targetH,
      showLegend: true,
      legendPosition: 'top-right'
    });

    // Plot is synchronous, but use requestAnimationFrame to ensure canvas is fully painted
    requestAnimationFrame(() => {
      if (onPlotComplete) onPlotComplete();
    });

  } catch (err) {
    console.error('[SectionPlotter] Failed to plot section:', err);
    container.classList.add('hidden');
    // Error - call callback anyway if provided
    if (onPlotComplete) onPlotComplete();
  }
}
function displayClass4Warning(isClass4) {
  const warningDiv = document.getElementById('class4-warning');

  if (isClass4) {
    warningDiv.classList.remove('hidden');
  } else {
    warningDiv.classList.add('hidden');
  }
}

function displayULSResults(ulsResults, inputs) {
  // Slenderness
  document.getElementById('result-lambda-y').textContent = toFixedIfNeeded(ulsResults.slenderness_y.lambda_bar, 3);
  document.getElementById('result-lambda-z').textContent = toFixedIfNeeded(ulsResults.slenderness_z.lambda_bar, 3);
  document.getElementById('result-governing-axis').textContent = ulsResults.governing_axis;

  // Reduction factors
  document.getElementById('result-chi-y').textContent = toFixedIfNeeded(ulsResults.chi_y, 3);
  document.getElementById('result-chi-z').textContent = toFixedIfNeeded(ulsResults.chi_z, 3);
  document.getElementById('result-chi-min').textContent = toFixedIfNeeded(ulsResults.chi_min, 3);

  // Capacity and utilization
  document.getElementById('result-Nb-Rd').textContent = toFixedIfNeeded(ulsResults.Nb_Rd_kN, 1) + ' kN';

  const utilization = ulsResults.utilization;
  const utilizationElement = document.getElementById('result-utilization-uls');
  utilizationElement.textContent = toFixedIfNeeded(utilization * 100, 1) + ' %';

  // Color code utilization
  if (utilization <= 1.0) {
    utilizationElement.classList.remove('text-red-400');
    utilizationElement.classList.add('text-green-400');
  } else {
    utilizationElement.classList.remove('text-green-400');
    utilizationElement.classList.add('text-red-400');
  }
}

function displayFireResults(results, inputs) {
  const fireResultsDiv = document.getElementById('fire-results');
  const fireResultsSpecifyDiv = document.getElementById('fire-results-specify');
  const fireResultsCriticalDiv = document.getElementById('fire-results-critical');

  fireResultsDiv.classList.remove('hidden');

  if (inputs.fireMode === 'specify') {
    // Show "specify temperature" mode results
    fireResultsSpecifyDiv.classList.remove('hidden');
    fireResultsCriticalDiv.classList.add('hidden');

    const fireResults = results.fireResults;

    document.getElementById('result-k-y-theta').textContent = toFixedIfNeeded(fireResults.k_y_theta, 3);
    document.getElementById('result-k-E-theta').textContent = toFixedIfNeeded(fireResults.k_E_theta, 3);
    document.getElementById('result-Nb-fi-Rd').textContent = toFixedIfNeeded(fireResults.Nb_Rd_kN, 1);
    document.getElementById('temp-display').textContent = inputs.temperature;

    const utilization = fireResults.utilization;
    const utilizationElement = document.getElementById('result-utilization-fire');
    utilizationElement.textContent = toFixedIfNeeded(utilization * 100, 1) + ' %';

    // Color code utilization
    if (utilization <= 1.0) {
      utilizationElement.classList.remove('text-red-400');
      utilizationElement.classList.add('text-green-400');
    } else {
      utilizationElement.classList.remove('text-green-400');
      utilizationElement.classList.add('text-red-400');
    }

  } else {
    // Show "find critical temperature" mode results
    fireResultsSpecifyDiv.classList.add('hidden');
    fireResultsCriticalDiv.classList.remove('hidden');

    const fireResults = results.fireResults;
    const criticalTemp = fireResults.criticalTemp;

    if (criticalTemp === null) {
      document.getElementById('result-critical-temp').textContent = '> 1000°C';
      document.getElementById('critical-temp-message').textContent = 'Section has excess capacity at all temperatures up to 1000°C';
    } else if (criticalTemp === 20) {
      document.getElementById('result-critical-temp').textContent = '< 20°C';
      document.getElementById('critical-temp-message').textContent = 'Section fails at ambient temperature';
    } else {
      document.getElementById('result-critical-temp').textContent = toFixedIfNeeded(criticalTemp, 1) + ' °C';
      if (criticalTemp >= 1000) {
        document.getElementById('critical-temp-message').textContent = 'Critical temperature exceeds 1000°C (calculation limit)';
      } else {
        document.getElementById('critical-temp-message').textContent = '';
      }
    }

    // Show reduction factors at critical temperature
    if (criticalTemp && criticalTemp > 20 && criticalTemp < 1000) {
      document.getElementById('result-k-y-theta-crit').textContent = toFixedIfNeeded(fireResults.k_y_theta, 3);
      document.getElementById('result-k-E-theta-crit').textContent = toFixedIfNeeded(fireResults.k_E_theta, 3);
      document.getElementById('result-Nb-fi-Rd-crit').textContent = toFixedIfNeeded(fireResults.Nb_Rd_kN, 1);
    } else {
      document.getElementById('result-k-y-theta-crit').textContent = '-';
      document.getElementById('result-k-E-theta-crit').textContent = '-';
      document.getElementById('result-Nb-fi-Rd-crit').textContent = '-';
    }
  }
}

function displayClassificationResults(classification, suffix = '', fyDisplay = null) {
  if (!classification) return;

  // Build element IDs with suffix
  const sid = suffix ? `-${suffix}` : '';

  const classResultsDiv = document.getElementById(`classification-results${sid}`);
  if (!classResultsDiv) return; // Element doesn't exist

  classResultsDiv.classList.remove('hidden');

  // Display fy value if provided
  if (fyDisplay !== null) {
    const fyDisplayElement = document.getElementById(`${suffix}-fy-display`);
    if (fyDisplayElement) {
      fyDisplayElement.textContent = toFixedIfNeeded(fyDisplay, 1);
    }
  }

  // Overall class
  const classElement = document.getElementById(`section-class${sid}`);
  classElement.textContent = `Class ${classification.class}`;

  // Color code the class
  classElement.classList.remove('text-green-400', 'text-yellow-400', 'text-orange-400', 'text-red-400');
  if (classification.class === 1 || classification.class === 2) {
    classElement.classList.add('text-green-400');
  } else if (classification.class === 3) {
    classElement.classList.add('text-yellow-400');
  } else if (classification.class === 4) {
    classElement.classList.add('text-orange-400');
  }

  // Epsilon
  document.getElementById(`epsilon-value${sid}`).textContent = toFixedIfNeeded(classification.epsilon, 4);

  // Governing element
  document.getElementById(`governing-element${sid}`).textContent = classification.governing_element || '-';

  // Effective area (if Class 4)
  const effAreaDisplay = document.getElementById(`effective-area-display${sid}`);
  if (classification.is_class4 && classification.effective_properties) {
    const aEff = classification.effective_properties.area;
    const aGross = classification.effective_properties.gross_area;
    effAreaDisplay.textContent =
      `${toFixedIfNeeded(aEff, 2)} cm² (${toFixedIfNeeded((aEff/aGross)*100, 1)}%)`;
  } else {
    effAreaDisplay.textContent = '-';
  }

  // Populate element details table
  const tbody = document.getElementById(`classification-table-body${sid}`);
  tbody.innerHTML = '';

  for (const elem of classification.element_results) {
    const row = document.createElement('tr');
    row.className = 'border-b border-gray-600';

    const classColor = elem.class === 1 || elem.class === 2 ? 'text-green-400' :
                       elem.class === 3 ? 'text-yellow-400' : 'text-orange-400';

    row.innerHTML = `
      <td class="py-2 px-3 text-gray-300">${elem.id}</td>
      <td class="py-2 px-3 text-right text-gray-200">${toFixedIfNeeded(elem.c, 2)}</td>
      <td class="py-2 px-3 text-right text-gray-200">${toFixedIfNeeded(elem.t, 2)}</td>
      <td class="py-2 px-3 text-right text-gray-200">${toFixedIfNeeded(elem.slenderness, 2)}</td>
      <td class="py-2 px-3 text-right text-gray-200">${toFixedIfNeeded(elem.limit_class3, 2)}</td>
      <td class="py-2 px-3 text-center font-semibold ${classColor}">${elem.class}</td>
    `;
    tbody.appendChild(row);
  }

  // Show Class 4 info banner if applicable
  const class4InfoDiv = document.getElementById(`class4-info${sid}`);
  if (classification.is_class4 && classification.effective_properties) {
    class4InfoDiv.classList.remove('hidden');
    const reductionPercent = classification.effective_properties.area_reduction_percent;
    document.getElementById(`area-reduction-percent${sid}`).textContent = toFixedIfNeeded(reductionPercent, 2);
  } else {
    class4InfoDiv.classList.add('hidden');
  }
}
function displayEffectiveProperties(effectiveProps, suffix = 'uls') {
  const sid = suffix ? `-${suffix}` : '';
  const effPropsDiv = document.getElementById(`class4-effective-properties${sid}`);

  if (!effPropsDiv) return; // Element doesn't exist

  if (!effectiveProps) {
    effPropsDiv.classList.add('hidden');
    return;
  }

  effPropsDiv.classList.remove('hidden');

  // Effective vs Gross properties
  document.getElementById(`eff-area${sid}`).textContent = toFixedIfNeeded(effectiveProps.area, 2) + ' cm²';
  document.getElementById(`gross-area${sid}`).textContent = toFixedIfNeeded(effectiveProps.gross_area, 2) + ' cm²';

  // Gross I values need to be reconstructed from i and A: I = A × i²
  const grossIy = effectiveProps.gross_area * effectiveProps.gross_iy * effectiveProps.gross_iy;
  const grossIz = effectiveProps.gross_area * effectiveProps.gross_iz * effectiveProps.gross_iz;

  document.getElementById(`eff-iy${sid}`).textContent = toFixedIfNeeded(effectiveProps.iy_moment, 2) + ' cm⁴';
  document.getElementById(`gross-iy${sid}`).textContent = toFixedIfNeeded(grossIy, 2) + ' cm⁴';

  document.getElementById(`eff-iz${sid}`).textContent = toFixedIfNeeded(effectiveProps.iz_moment, 2) + ' cm⁴';
  document.getElementById(`gross-iz${sid}`).textContent = toFixedIfNeeded(grossIz, 2) + ' cm⁴';

  document.getElementById(`removed-strips-count${sid}`).textContent = effectiveProps.removed_strips_count || '-';

  // Neutral axis shift
  const eNy = effectiveProps.neutral_axis_shift_y || 0;
  const eNz = effectiveProps.neutral_axis_shift_z || 0;
  document.getElementById(`neutral-axis-y${sid}`).textContent = toFixedIfNeeded(eNy, 4) + ' cm';
  document.getElementById(`neutral-axis-z${sid}`).textContent = toFixedIfNeeded(eNz, 4) + ' cm';

  // Reductions
  document.getElementById(`area-reduction${sid}`).textContent = toFixedIfNeeded(effectiveProps.area_reduction_percent, 2) + '%';
  document.getElementById(`iy-reduction${sid}`).textContent = toFixedIfNeeded(effectiveProps.iy_reduction_percent, 2) + '%';
  document.getElementById(`iz-reduction${sid}`).textContent = toFixedIfNeeded(effectiveProps.iz_reduction_percent, 2) + '%';
}
function toggleClassificationDetails(suffix = '') {
  const sid = suffix ? `-${suffix}` : '';
  const detailsDiv = document.getElementById(`classification-details${sid}`);
  const toggleIcon = document.getElementById(`classification-toggle-icon${sid}`);
  const button = toggleIcon.parentElement;

  detailsDiv.classList.toggle('hidden');

  // Update arrow indicator and button text
  if (detailsDiv.classList.contains('hidden')) {
    toggleIcon.textContent = '▶';
    button.childNodes[1].textContent = ' Show element classification details';
  } else {
    toggleIcon.textContent = '▼';
    button.childNodes[1].textContent = ' Hide element classification details';
  }
}

// ============================================================================
// DETAILED CALCULATIONS DISPLAY
// ============================================================================

function displayDetailedCalculations(results, inputs) {
  const calcDisplay = document.getElementById('calculations-display');
  const uls = results.ulsResults;
  const inp = results.inputs;

  // Determine which properties to use
  const isClass4 = uls.is_using_effective;
  const sectionUsed = uls.section_used || inp.section;
  const effProps = uls.effective_properties;

  let html = '';

  // Section Information
  html += '<div class="bg-gray-700 rounded p-4 mb-3">';
  html += '<h3 class="text-blue-700 font-semibold mb-2">SECTION INFORMATION</h3>';
  html += `<p>Profile: ${inp.profileType.toUpperCase()} ${inp.profileName.toUpperCase()}</p>`;

  if (isClass4 && effProps) {
    html += `<p><strong>⚠️ Class 4 Section - Using Effective Properties (EN 1993-1-5)</strong></p>`;
    html += `<p>A<sub>gross</sub> = ${toFixedIfNeeded(effProps.gross_area, 2)} cm²</p>`;
    html += `<p><strong>A<sub>eff</sub> = ${toFixedIfNeeded(effProps.area, 2)} cm²</strong> (${toFixedIfNeeded(effProps.area_reduction_percent, 1)}% reduction)</p>`;
    html += `<p>i<sub>y,eff</sub> = ${toFixedIfNeeded(sectionUsed.iy, 2)} cm, i<sub>z,eff</sub> = ${toFixedIfNeeded(sectionUsed.iz, 2)} cm</p>`;
    html += `<p>e<sub>N,y</sub> = ${toFixedIfNeeded(effProps.neutral_axis_shift_y || 0, 4)} cm, e<sub>N,z</sub> = ${toFixedIfNeeded(effProps.neutral_axis_shift_z || 0, 4)} cm</p>`;
  } else {
    html += `<p>A = ${toFixedIfNeeded(inp.section.area, 2)} cm²</p>`;
    html += `<p>i<sub>y</sub> = ${toFixedIfNeeded(inp.section.iy, 2)} cm, i<sub>z</sub> = ${toFixedIfNeeded(inp.section.iz, 2)} cm</p>`;
  }

  html += `<p>Buckling curve y-axis: ${uls.curve_y}, Buckling curve z-axis: ${uls.curve_z}</p>`;
  html += '</div>';

  // Material Properties
  html += '<div class="bg-gray-700 rounded p-4 mb-3">';
  html += '<h3 class="text-blue-700 font-semibold mb-2">MATERIAL PROPERTIES</h3>';
  html += `<p>Steel grade: ${inp.steelGrade}</p>`;
  html += `<p>f<sub>y</sub> = ${toFixedIfNeeded(inp.fy_MPa, 0)} MPa</p>`;
  html += `<p>E = 210000 MPa</p>`;
  html += `<p>γ<sub>M1</sub> = ${toFixedIfNeeded(inp.gamma_M1, 2)}</p>`;
  html += '</div>';

  // ULS Calculations
  const iySuffix = isClass4 ? ',eff' : '';
  const izSuffix = isClass4 ? ',eff' : '';
  const ASuffix = isClass4 ? '<sub>eff</sub>' : '';

  html += '<div class="bg-gray-700 rounded p-4 mb-3">';
  html += '<h3 class="text-green-700 font-semibold mb-2">ULS BUCKLING CALCULATIONS</h3>';
  html += `<p class="mt-2 font-semibold">About y-axis:</p>`;
  html += `<p>L<sub>y</sub> = ${toFixedIfNeeded(inp.Ly_m, 2)} m = ${toFixedIfNeeded(inp.Ly_m * 100, 1)} cm</p>`;
  html += `<p>λ<sub>y</sub> = L<sub>y</sub> / i<sub>y${iySuffix}</sub> = ${toFixedIfNeeded(inp.Ly_m * 100, 1)} / ${toFixedIfNeeded(sectionUsed.iy, 2)} = ${toFixedIfNeeded(uls.slenderness_y.lambda, 1)}</p>`;
  html += `<p>λ<sub>1</sub> = π√(E/f<sub>y</sub>) = π√(210000/${toFixedIfNeeded(inp.fy_MPa, 0)}) = ${toFixedIfNeeded(uls.slenderness_y.lambda_1, 1)}</p>`;
  html += `<p>λ̄<sub>y</sub> = λ<sub>y</sub> / λ<sub>1</sub> = ${toFixedIfNeeded(uls.slenderness_y.lambda, 1)} / ${toFixedIfNeeded(uls.slenderness_y.lambda_1, 1)} = ${toFixedIfNeeded(uls.slenderness_y.lambda_bar, 3)}</p>`;
  html += `<p>Buckling curve: ${uls.curve_y}, α = ${toFixedIfNeeded(uls.alpha_y, 2)}</p>`;
  html += `<p>φ<sub>y</sub> = 0.5[1 + α(λ̄<sub>y</sub> - 0.2) + λ̄<sub>y</sub>²] = 0.5[1 + ${toFixedIfNeeded(uls.alpha_y, 2)}×(${toFixedIfNeeded(uls.slenderness_y.lambda_bar, 3)} - 0.2) + ${toFixedIfNeeded(uls.slenderness_y.lambda_bar, 3)}²] = ${toFixedIfNeeded(uls.phi_y, 3)}</p>`;
  html += `<p>χ<sub>y</sub> = 1 / (φ<sub>y</sub> + √(φ<sub>y</sub>² - λ̄<sub>y</sub>²)) = 1 / (${toFixedIfNeeded(uls.phi_y, 3)} + √(${toFixedIfNeeded(uls.phi_y, 3)}² - ${toFixedIfNeeded(uls.slenderness_y.lambda_bar, 3)}²)) = ${toFixedIfNeeded(uls.chi_y, 3)}</p>`;

  html += `<p class="mt-2 font-semibold">About z-axis:</p>`;
  html += `<p>L<sub>z</sub> = ${toFixedIfNeeded(inp.Lz_m, 2)} m = ${toFixedIfNeeded(inp.Lz_m * 100, 1)} cm</p>`;
  html += `<p>λ<sub>z</sub> = L<sub>z</sub> / i<sub>z${izSuffix}</sub> = ${toFixedIfNeeded(inp.Lz_m * 100, 1)} / ${toFixedIfNeeded(sectionUsed.iz, 2)} = ${toFixedIfNeeded(uls.slenderness_z.lambda, 1)}</p>`;
  html += `<p>λ̄<sub>z</sub> = λ<sub>z</sub> / λ<sub>1</sub> = ${toFixedIfNeeded(uls.slenderness_z.lambda, 1)} / ${toFixedIfNeeded(uls.slenderness_z.lambda_1, 1)} = ${toFixedIfNeeded(uls.slenderness_z.lambda_bar, 3)}</p>`;
  html += `<p>Buckling curve: ${uls.curve_z}, α = ${toFixedIfNeeded(uls.alpha_z, 2)}</p>`;
  html += `<p>φ<sub>z</sub> = 0.5[1 + α(λ̄<sub>z</sub> - 0.2) + λ̄<sub>z</sub>²] = 0.5[1 + ${toFixedIfNeeded(uls.alpha_z, 2)}×(${toFixedIfNeeded(uls.slenderness_z.lambda_bar, 3)} - 0.2) + ${toFixedIfNeeded(uls.slenderness_z.lambda_bar, 3)}²] = ${toFixedIfNeeded(uls.phi_z, 3)}</p>`;
  html += `<p>χ<sub>z</sub> = 1 / (φ<sub>z</sub> + √(φ<sub>z</sub>² - λ̄<sub>z</sub>²)) = 1 / (${toFixedIfNeeded(uls.phi_z, 3)} + √(${toFixedIfNeeded(uls.phi_z, 3)}² - ${toFixedIfNeeded(uls.slenderness_z.lambda_bar, 3)}²)) = ${toFixedIfNeeded(uls.chi_z, 3)}</p>`;

  html += `<p class="mt-2 font-semibold">Buckling resistance:</p>`;
  html += `<p>χ<sub>min</sub> = min(χ<sub>y</sub>, χ<sub>z</sub>) = min(${toFixedIfNeeded(uls.chi_y, 3)}, ${toFixedIfNeeded(uls.chi_z, 3)}) = ${toFixedIfNeeded(uls.chi_min, 3)} (${uls.governing_axis}-axis governs)</p>`;
  html += `<p>N<sub>b,Rd</sub> = χ<sub>min</sub> × A${ASuffix} × f<sub>y</sub> / γ<sub>M1</sub> = ${toFixedIfNeeded(uls.chi_min, 3)} × ${toFixedIfNeeded(sectionUsed.area, 2)} × ${toFixedIfNeeded(inp.fy_MPa, 0)} / ${toFixedIfNeeded(inp.gamma_M1, 2)} / 10 = ${toFixedIfNeeded(uls.Nb_Rd_kN, 1)} kN</p>`;
  html += `<p class="mt-2">N<sub>Ed</sub> = ${toFixedIfNeeded(inp.NEd_ULS_kN, 1)} kN</p>`;
  html += `<p>Utilization = N<sub>Ed</sub> / N<sub>b,Rd</sub> = ${toFixedIfNeeded(inp.NEd_ULS_kN, 1)} / ${toFixedIfNeeded(uls.Nb_Rd_kN, 1)} = ${toFixedIfNeeded(uls.utilization, 3)} = ${toFixedIfNeeded(uls.utilization * 100, 1)} %</p>`;
  html += '</div>';

  // Fire Calculations
  if (inputs.fireEnabled && results.fireResults) {
    const fire = results.fireResults;

    html += '<div class="bg-gray-700 rounded p-4 mb-3">';
    html += '<h3 class="text-red-700 font-semibold mb-2">FIRE DESIGN CALCULATIONS</h3>';

    if (inputs.fireMode === 'find-critical') {
      html += `<p class="font-semibold">Critical temperature calculation:</p>`;
      html += `<p>N<sub>Ed,fi</sub> = ${toFixedIfNeeded(inp.NEd_fire_kN, 1)} kN</p>`;
      html += `<p>Using Brent's method to find θ where N<sub>Ed,fi</sub> / N<sub>b,fi,Rd</sub>(θ) = 1.0</p>`;

      if (fire.criticalTemp === null) {
        html += `<p class="text-green-700 mt-2 font-bold">θ<sub>cr</sub> > 1000°C - Section has excess capacity at all temperatures</p>`;
      } else if (fire.criticalTemp === 20) {
        html += `<p class="text-red-700 mt-2 font-bold">θ<sub>cr</sub> < 20°C - Section fails at ambient temperature</p>`;
      } else {
        html += `<p class="text-red-700 mt-2 font-bold">θ<sub>cr</sub> = ${toFixedIfNeeded(fire.criticalTemp, 1)} °C</p>`;
        html += `<p class="mt-2">At θ = ${toFixedIfNeeded(fire.criticalTemp, 1)} °C:</p>`;
        html += `<p>k<sub>y,θ</sub> = ${toFixedIfNeeded(fire.k_y_theta, 3)} (piecewise linear interpolation from EC3-1-2 Table 3.1)</p>`;
        html += `<p>k<sub>E,θ</sub> = ${toFixedIfNeeded(fire.k_E_theta, 3)} (piecewise linear interpolation from EC3-1-2 Table 3.1)</p>`;
        html += `<p>f<sub>y,θ</sub> = k<sub>y,θ</sub> × f<sub>y</sub> = ${toFixedIfNeeded(fire.k_y_theta, 3)} × ${toFixedIfNeeded(inp.fy_MPa, 0)} = ${toFixedIfNeeded(fire.fy_theta, 1)} MPa</p>`;
        html += `<p>E<sub>θ</sub> = k<sub>E,θ</sub> × E = ${toFixedIfNeeded(fire.k_E_theta, 3)} × 210000 = ${toFixedIfNeeded(fire.E_theta, 0)} MPa</p>`;
        html += `<p>N<sub>b,fi,Rd</sub> = ${toFixedIfNeeded(fire.Nb_Rd_kN, 1)} kN (calculated with reduced material properties${isClass4 ? ' and effective section' : ''})</p>`;
        html += `<p>Utilization = ${toFixedIfNeeded(inp.NEd_fire_kN, 1)} / ${toFixedIfNeeded(fire.Nb_Rd_kN, 1)} ≈ 1.00 = 100%</p>`;
      }
    } else {
      html += `<p>θ = ${inp.temperature_C} °C</p>`;
      html += `<p>k<sub>y,θ</sub> = ${toFixedIfNeeded(fire.k_y_theta, 3)} (piecewise linear interpolation from EC3-1-2 Table 3.1)</p>`;
      html += `<p>k<sub>E,θ</sub> = ${toFixedIfNeeded(fire.k_E_theta, 3)} (piecewise linear interpolation from EC3-1-2 Table 3.1)</p>`;
      html += `<p>f<sub>y,θ</sub> = k<sub>y,θ</sub> × f<sub>y</sub> = ${toFixedIfNeeded(fire.k_y_theta, 3)} × ${toFixedIfNeeded(inp.fy_MPa, 0)} = ${toFixedIfNeeded(fire.fy_theta, 1)} MPa</p>`;
      html += `<p>E<sub>θ</sub> = k<sub>E,θ</sub> × E = ${toFixedIfNeeded(fire.k_E_theta, 3)} × 210000 = ${toFixedIfNeeded(fire.E_theta, 0)} MPa</p>`;
      html += `<p class="mt-2">Buckling calculations at elevated temperature follow same procedure as ULS with reduced f<sub>y,θ</sub> and E<sub>θ</sub>${isClass4 ? ' (using effective properties)' : ''}:</p>`;
      html += `<p>χ<sub>min</sub> = ${toFixedIfNeeded(fire.chi_min, 3)}</p>`;
      html += `<p>N<sub>b,fi,Rd</sub> = χ<sub>min</sub> × A${ASuffix} × f<sub>y,θ</sub> / γ<sub>M1</sub> = ${toFixedIfNeeded(fire.Nb_Rd_kN, 1)} kN</p>`;
      html += `<p class="mt-2">N<sub>Ed,fi</sub> = ${toFixedIfNeeded(inp.NEd_fire_kN, 1)} kN</p>`;
      html += `<p>Utilization = N<sub>Ed,fi</sub> / N<sub>b,fi,Rd</sub> = ${toFixedIfNeeded(inp.NEd_fire_kN, 1)} / ${toFixedIfNeeded(fire.Nb_Rd_kN, 1)} = ${toFixedIfNeeded(fire.utilization, 3)} = ${toFixedIfNeeded(fire.utilization * 100, 1)} %</p>`;
    }

    html += '</div>';
  }

  calcDisplay.innerHTML = html;
}

// ============================================================================
// DETAILED REPORT GENERATION
// ============================================================================

function generateDetailedReport(results, inputs) {
  const reportDiv = document.getElementById('detailed-report');
  const description = document.getElementById('description').value.trim();
  const timestamp = new Date().toLocaleString();

  // Determine Class 4 status and properties to use throughout the report
  const ulsReport = results.ulsResults;
  const isClass4Report = ulsReport.is_using_effective;
  const effPropsReport = ulsReport.effective_properties;
  const sectionUsedReport = ulsReport.section_used || results.inputs.section;

  let html = '<div class="report-content bg-white text-gray-900 p-8 rounded-lg">';

  // Description (if provided)
  if (description) {
    html += `<div class="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded"><p class="text-gray-800 whitespace-pre-wrap">${escapeHtml(description)}</p></div>`;
  }

  // Title and timestamp
  html += '<div class="text-center mb-8">';
  html += '<h1 class="text-3xl font-bold text-gray-900 mb-2">Steel Column Flexural Buckling Analysis</h1>';
  html += '<p class="text-gray-600">Eurocode 3-1-1 Section 6.3.1 | Fire design per EC3-1-2</p>';
  html += `<p class="text-sm text-gray-500 mt-2">Calculation Date: ${timestamp}</p>`;
  html += '</div>';

  // Input Parameters
  html += '<div class="mb-8">';
  html += '<h2 class="text-2xl font-bold mb-4 pb-2 border-b-2" style="color: #1d4ed8;">INPUT PARAMETERS</h2>';
  html += '<div class="grid grid-cols-2 gap-6">';

  // Left column
  html += '<div>';
  html += '<h3 class="font-semibold text-gray-800 mb-3">Section & Material</h3>';
  html += '<div class="space-y-2 text-sm">';
  html += `<div><span class="text-gray-600">Profile:</span> <span class="font-semibold">${inputs.profileType.toUpperCase()} ${inputs.profileName.toUpperCase()}</span></div>`;

  // Check if Class 4 and show both gross and effective properties (using variables from top of function)
  if (isClass4Report && effPropsReport) {
    html += `<div class="bg-orange-50 border border-orange-300 rounded px-2 py-1 mt-1"><span class="text-orange-800 font-semibold text-xs">⚠️ Class 4 Section - Effective Properties Used</span></div>`;
    html += `<div><span class="text-gray-600">A<sub>gross</sub> =</span> <span class="font-mono">${toFixedIfNeeded(effPropsReport.gross_area, 2)} cm²</span></div>`;
    html += `<div><span class="text-gray-600">A<sub>eff</sub> =</span> <span class="font-semibold font-mono">${toFixedIfNeeded(effPropsReport.area, 2)} cm²</span> <span class="text-xs text-gray-500">(${toFixedIfNeeded(effPropsReport.area_reduction_percent, 1)}% reduction)</span></div>`;
    html += `<div><span class="text-gray-600">i<sub>y,eff</sub> =</span> <span class="font-semibold font-mono">${toFixedIfNeeded(ulsReport.section_used.iy, 2)} cm</span></div>`;
    html += `<div><span class="text-gray-600">i<sub>z,eff</sub> =</span> <span class="font-semibold font-mono">${toFixedIfNeeded(ulsReport.section_used.iz, 2)} cm</span></div>`;
    html += `<div><span class="text-gray-600">e<sub>N,y</sub> =</span> <span class="font-mono">${toFixedIfNeeded(effPropsReport.neutral_axis_shift_y || 0, 4)} cm</span></div>`;
    html += `<div><span class="text-gray-600">e<sub>N,z</sub> =</span> <span class="font-mono">${toFixedIfNeeded(effPropsReport.neutral_axis_shift_z || 0, 4)} cm</span></div>`;
  } else {
    html += `<div><span class="text-gray-600">A =</span> <span class="font-semibold">${toFixedIfNeeded(results.inputs.section.area, 2)} cm²</span></div>`;
    html += `<div><span class="text-gray-600">i<sub>y</sub> =</span> <span class="font-semibold">${toFixedIfNeeded(results.inputs.section.iy, 2)} cm</span></div>`;
    html += `<div><span class="text-gray-600">i<sub>z</sub> =</span> <span class="font-semibold">${toFixedIfNeeded(results.inputs.section.iz, 2)} cm</span></div>`;
  }

  html += `<div><span class="text-gray-600">Steel grade:</span> <span class="font-semibold">${results.inputs.steelGrade}</span></div>`;
  html += `<div><span class="text-gray-600">f<sub>y</sub> =</span> <span class="font-semibold">${toFixedIfNeeded(results.inputs.fy_MPa, 0)} MPa</span></div>`;
  html += `<div><span class="text-gray-600">γ<sub>M1</sub> =</span> <span class="font-semibold">${toFixedIfNeeded(results.inputs.gamma_M1, 2)}</span></div>`;
  html += '</div></div>';

  // Right column
  html += '<div>';
  html += '<h3 class="font-semibold text-gray-800 mb-3">Loading & Geometry</h3>';
  html += '<div class="space-y-2 text-sm">';
  html += `<div><span class="text-gray-600">L<sub>y</sub> =</span> <span class="font-semibold">${toFixedIfNeeded(results.inputs.Ly_m, 2)} m</span></div>`;
  html += `<div><span class="text-gray-600">L<sub>z</sub> =</span> <span class="font-semibold">${toFixedIfNeeded(results.inputs.Lz_m, 2)} m</span></div>`;
  html += `<div><span class="text-gray-600">N<sub>Ed</sub> (ULS) =</span> <span class="font-semibold">${toFixedIfNeeded(results.inputs.NEd_ULS_kN, 1)} kN</span></div>`;
  if (inputs.fireEnabled) {
    html += `<div class="pt-2 border-t border-gray-300"><span class="text-gray-600">N<sub>Ed,fi</sub> (Fire) =</span> <span class="font-semibold">${toFixedIfNeeded(results.inputs.NEd_fire_kN, 1)} kN</span></div>`;
    if (inputs.fireMode === 'specify') {
      html += `<div><span class="text-gray-600">θ (Temperature) =</span> <span class="font-semibold">${results.inputs.temperature_C} °C</span></div>`;
    }
    // Add Am/V information if filter enabled
    if (inputs.amvFilterEnabled && results.amvResult) {
      html += `<div class="pt-2 border-t border-gray-300"><span class="text-gray-600">Am/V Filter:</span> <span class="font-semibold">Enabled</span></div>`;
      html += `<div><span class="text-gray-600">Exposure:</span> <span class="font-semibold">${results.amvResult.description}</span></div>`;
      html += `<div><span class="text-gray-600">k<sub>sh</sub> =</span> <span class="font-semibold">${toFixedIfNeeded(results.amvResult.k_sh, 2)}</span>${results.amvResult.shadowNote ? ' <span class="text-xs text-gray-500">(auto)</span>' : ''}</div>`;
      html += `<div><span class="text-gray-600">Am/V =</span> <span class="font-semibold">${toFixedIfNeeded(results.amvResult.AmV, 1)} m<sup>-1</sup></span> <span class="text-xs text-gray-500">(max: ${toFixedIfNeeded(inputs.maxAmV, 0)} m<sup>-1</sup>)</span></div>`;
    }
  }
  html += '</div></div>';
  html += '</div></div>';

  // Section Visualization (if available)
  const sectionCanvas = document.getElementById('section-plot-canvas');
  if (sectionCanvas && !document.getElementById('section-plot-container').classList.contains('hidden')) {
    try {
      const sectionImageData = sectionCanvas.toDataURL('image/png');
      html += '<div class="mb-8">';
      html += '<h3 class="font-semibold text-gray-800 mb-3">Section Visualization</h3>';
      html += '<div class="flex justify-center bg-gray-50 rounded-lg p-4">';
      html += `<img src="${sectionImageData}" alt="Section visualization" style="max-width: 100%; height: auto;">`;
      html += '</div></div>';
    } catch (err) {
      console.warn('Could not capture section plot for report:', err);
    }
  }

  // Results Summary
  html += '<div class="mb-8">';
  html += '<h2 class="text-2xl font-bold mb-4 pb-2 border-b-2" style="color: #15803d;">RESULTS SUMMARY</h2>';

  const uls = results.ulsResults;
  html += '<h3 class="font-semibold text-gray-800 mb-3">ULS Buckling Capacity</h3>';

  // Summary metrics
  html += '<div class="grid grid-cols-3 gap-4 mb-4">';
  html += `<div class="bg-gray-50 border border-gray-300 rounded-lg p-4 text-center"><div class="text-sm text-gray-600 mb-1">λ̄<sub>y</sub></div><div class="text-2xl font-mono text-gray-900">${toFixedIfNeeded(uls.slenderness_y.lambda_bar, 3)}</div></div>`;
  html += `<div class="bg-gray-50 border border-gray-300 rounded-lg p-4 text-center"><div class="text-sm text-gray-600 mb-1">λ̄<sub>z</sub></div><div class="text-2xl font-mono text-gray-900">${toFixedIfNeeded(uls.slenderness_z.lambda_bar, 3)}</div></div>`;
  html += `<div class="bg-gray-50 border border-gray-300 rounded-lg p-4 text-center"><div class="text-sm text-gray-600 mb-1">Governing Axis</div><div class="text-2xl font-mono text-gray-900">${uls.governing_axis}</div></div>`;
  html += '</div>';

  // Main result box
  html += '<div class="bg-blue-100 border-2 border-blue-400 rounded-lg p-6 mb-4 text-center">';
  html += `<div class="text-4xl font-bold text-blue-900 mb-2">${toFixedIfNeeded(uls.Nb_Rd_kN, 1)} kN</div>`;
  html += '<div class="text-lg text-blue-800">Buckling Resistance (N<sub>b,Rd</sub>)</div>';
  html += '</div>';

  // Utilization
  const utilColor = uls.utilization <= 1.0 ? 'text-green-900' : 'text-red-900';
  html += '<div class="bg-gray-50 border border-gray-300 rounded-lg p-4 text-center">';
  html += '<div class="text-sm text-gray-600 mb-2">ULS Utilization</div>';
  html += `<div class="text-3xl font-bold ${utilColor}">${toFixedIfNeeded(uls.utilization * 100, 1)} %</div>`;
  html += `<div class="text-xs text-gray-500 mt-1">N<sub>Ed</sub> / N<sub>b,Rd</sub> = ${toFixedIfNeeded(results.inputs.NEd_ULS_kN, 1)} / ${toFixedIfNeeded(uls.Nb_Rd_kN, 1)}</div>`;
  html += '</div>';

  if (inputs.fireEnabled && results.fireResults) {
    const fire = results.fireResults;
    html += '<h3 class="font-semibold text-gray-800 mb-3 mt-6">Fire Design Results</h3>';

    if (inputs.fireMode === 'find-critical') {
      html += '<div class="bg-orange-100 border-2 border-orange-400 rounded-lg p-6 text-center">';
      if (fire.criticalTemp === null) {
        html += `<div class="text-gray-800 text-sm">θ<sub>cr</sub> - Critical Temperature</div><div class="text-3xl font-bold text-green-700">&gt; 1000°C</div>`;
        html += `<div class="text-sm text-gray-800 mt-2">Section has excess capacity at all temperatures</div>`;
      } else if (fire.criticalTemp === 20) {
        html += `<div class="text-gray-800 text-sm">θ<sub>cr</sub> - Critical Temperature</div><div class="text-3xl font-bold text-red-700">&lt; 20°C</div>`;
        html += `<div class="text-sm text-gray-800 mt-2">Section fails at ambient temperature</div>`;
      } else {
        html += `<div class="text-gray-800 text-sm">θ<sub>cr</sub> - Critical Temperature</div><div class="text-5xl font-bold text-orange-600">${toFixedIfNeeded(fire.criticalTemp, 1)} °C</div>`;
        html += `<div class="text-sm text-gray-800 mt-2">Temperature at which utilization reaches 100%</div>`;
      }
      html += '</div>';
    } else {
      const fireUtilColor = fire.utilization <= 1.0 ? 'text-green-900' : 'text-red-900';
      html += '<div class="bg-gray-50 border border-gray-300 rounded-lg p-4 text-center">';
      html += `<div class="text-sm text-gray-600 mb-2">Fire Utilization at θ = ${results.inputs.temperature_C}°C</div>`;
      html += `<div class="text-3xl font-bold ${fireUtilColor}">${toFixedIfNeeded(fire.utilization * 100, 1)} %</div>`;
      html += `<div class="text-xs text-gray-500 mt-1">N<sub>Ed,fi</sub> / N<sub>b,fi,Rd</sub></div>`;
      html += '</div>';
    }
  }

  html += '</div>';

  // Detailed Calculations (page break before)
  html += '<div class="page-break-before">';
  html += '<h2 class="text-2xl font-bold mb-6 pb-2 border-b-2" style="color: #6b21a8;">DETAILED CALCULATIONS</h2>';

  // ULS Calculations (reuse variables from top of function)
  const iySuffixReport = isClass4Report ? ',eff' : '';
  const izSuffixReport = isClass4Report ? ',eff' : '';
  const ASuffixReport = isClass4Report ? '<sub>eff</sub>' : '';

  html += '<div class="mb-6">';
  html += '<h3 class="text-xl font-semibold text-gray-800 mb-3">ULS Buckling Calculations</h3>';

  if (isClass4Report && effPropsReport) {
    html += '<div class="bg-orange-50 border border-orange-400 rounded-lg p-3 mb-4">';
    html += '<p class="text-sm text-orange-900 font-semibold">⚠️ Class 4 Section: Using Effective Properties per EN 1993-1-5</p>';
    html += `<p class="text-xs text-orange-800 mt-1">A<sub>eff</sub> = ${toFixedIfNeeded(effPropsReport.area, 2)} cm² (${toFixedIfNeeded(effPropsReport.area_reduction_percent, 1)}% reduction from A<sub>gross</sub> = ${toFixedIfNeeded(effPropsReport.gross_area, 2)} cm²)</p>`;
    html += '</div>';
  }

  html += '<div class="bg-gray-50 rounded-lg p-4 mb-4">';
  html += '<h4 class="font-semibold text-gray-800 mb-2">About y-axis:</h4>';
  html += `<p class="text-sm mb-1">L<sub>y</sub> = ${toFixedIfNeeded(results.inputs.Ly_m, 2)} m = ${toFixedIfNeeded(results.inputs.Ly_m * 100, 1)} cm</p>`;
  html += `<p class="text-sm mb-1">λ<sub>y</sub> = L<sub>y</sub> / i<sub>y${iySuffixReport}</sub> = ${toFixedIfNeeded(results.inputs.Ly_m * 100, 1)} / ${toFixedIfNeeded(sectionUsedReport.iy, 2)} = ${toFixedIfNeeded(uls.slenderness_y.lambda, 1)}</p>`;
  html += `<p class="text-sm mb-1">λ<sub>1</sub> = π√(E/f<sub>y</sub>) = π√(210000/${toFixedIfNeeded(results.inputs.fy_MPa, 0)}) = ${toFixedIfNeeded(uls.slenderness_y.lambda_1, 1)}</p>`;
  html += `<p class="text-sm mb-1">λ̄<sub>y</sub> = λ<sub>y</sub> / λ<sub>1</sub> = ${toFixedIfNeeded(uls.slenderness_y.lambda, 1)} / ${toFixedIfNeeded(uls.slenderness_y.lambda_1, 1)} = ${toFixedIfNeeded(uls.slenderness_y.lambda_bar, 3)}</p>`;
  html += `<p class="text-sm mb-1">Buckling curve: ${uls.curve_y}, α = ${toFixedIfNeeded(uls.alpha_y, 2)}</p>`;
  html += `<p class="text-sm mb-1">φ<sub>y</sub> = 0.5[1 + α(λ̄<sub>y</sub> - 0.2) + λ̄<sub>y</sub>²] = ${toFixedIfNeeded(uls.phi_y, 3)}</p>`;
  html += `<p class="text-sm">χ<sub>y</sub> = 1 / (φ<sub>y</sub> + √(φ<sub>y</sub>² - λ̄<sub>y</sub>²)) = ${toFixedIfNeeded(uls.chi_y, 3)}</p>`;
  html += '</div>';

  html += '<div class="bg-gray-50 rounded-lg p-4 mb-4">';
  html += '<h4 class="font-semibold text-gray-800 mb-2">About z-axis:</h4>';
  html += `<p class="text-sm mb-1">L<sub>z</sub> = ${toFixedIfNeeded(results.inputs.Lz_m, 2)} m = ${toFixedIfNeeded(results.inputs.Lz_m * 100, 1)} cm</p>`;
  html += `<p class="text-sm mb-1">λ<sub>z</sub> = L<sub>z</sub> / i<sub>z${izSuffixReport}</sub> = ${toFixedIfNeeded(results.inputs.Lz_m * 100, 1)} / ${toFixedIfNeeded(sectionUsedReport.iz, 2)} = ${toFixedIfNeeded(uls.slenderness_z.lambda, 1)}</p>`;
  html += `<p class="text-sm mb-1">λ̄<sub>z</sub> = λ<sub>z</sub> / λ<sub>1</sub> = ${toFixedIfNeeded(uls.slenderness_z.lambda, 1)} / ${toFixedIfNeeded(uls.slenderness_z.lambda_1, 1)} = ${toFixedIfNeeded(uls.slenderness_z.lambda_bar, 3)}</p>`;
  html += `<p class="text-sm mb-1">Buckling curve: ${uls.curve_z}, α = ${toFixedIfNeeded(uls.alpha_z, 2)}</p>`;
  html += `<p class="text-sm mb-1">φ<sub>z</sub> = 0.5[1 + α(λ̄<sub>z</sub> - 0.2) + λ̄<sub>z</sub>²] = ${toFixedIfNeeded(uls.phi_z, 3)}</p>`;
  html += `<p class="text-sm">χ<sub>z</sub> = 1 / (φ<sub>z</sub> + √(φ<sub>z</sub>² - λ̄<sub>z</sub>²)) = ${toFixedIfNeeded(uls.chi_z, 3)}</p>`;
  html += '</div>';

  html += '<div class="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-500">';
  html += '<h4 class="font-semibold text-gray-800 mb-2">Buckling Resistance:</h4>';
  html += `<p class="text-sm mb-1">χ<sub>min</sub> = min(χ<sub>y</sub>, χ<sub>z</sub>) = ${toFixedIfNeeded(uls.chi_min, 3)} (${uls.governing_axis}-axis governs)</p>`;
  html += `<p class="text-sm mb-1">N<sub>b,Rd</sub> = χ<sub>min</sub> × A${ASuffixReport} × f<sub>y</sub> / γ<sub>M1</sub></p>`;
  html += `<p class="text-sm mb-1">N<sub>b,Rd</sub> = ${toFixedIfNeeded(uls.chi_min, 3)} × ${toFixedIfNeeded(sectionUsedReport.area, 2)} × ${toFixedIfNeeded(results.inputs.fy_MPa, 0)} / ${toFixedIfNeeded(results.inputs.gamma_M1, 2)} / 10</p>`;
  html += `<p class="text-sm font-semibold">N<sub>b,Rd</sub> = ${toFixedIfNeeded(uls.Nb_Rd_kN, 1)} kN</p>`;
  html += `<p class="text-sm mt-2">Utilization = ${toFixedIfNeeded(results.inputs.NEd_ULS_kN, 1)} / ${toFixedIfNeeded(uls.Nb_Rd_kN, 1)} = ${toFixedIfNeeded(uls.utilization * 100, 1)}%</p>`;
  html += '</div>';
  html += '</div>';

  // Fire Design Calculations (if enabled)
  if (inputs.fireEnabled && results.fireResults) {
    const fire = results.fireResults;

    html += '<div class="mb-6 page-break-avoid">';
    html += '<h3 class="text-xl font-semibold text-gray-800 mb-3">Fire Design Calculations (EC3-1-2)</h3>';

    // Determine which temperature to show
    let displayTemp = null;
    if (inputs.fireMode === 'find-critical' && fire.criticalTemp && fire.criticalTemp > 20 && fire.criticalTemp < 1000) {
      displayTemp = fire.criticalTemp;
    } else if (inputs.fireMode === 'specify') {
      displayTemp = results.inputs.temperature_C;
    }

    // Material Reduction Factors
    html += '<div class="bg-orange-50 rounded-lg p-4 mb-4 border-l-4 border-orange-500">';
    html += '<h4 class="font-semibold text-gray-800 mb-2">Material Reduction Factors (EC3-1-2 Table 3.1):</h4>';

    if (inputs.fireMode === 'find-critical' && fire.criticalTemp && fire.criticalTemp > 20 && fire.criticalTemp < 1000) {
      html += `<p class="text-sm mb-1">Critical temperature: θ<sub>cr</sub> = ${toFixedIfNeeded(fire.criticalTemp, 1)} °C</p>`;
    } else if (inputs.fireMode === 'specify') {
      html += `<p class="text-sm mb-1">Temperature: θ = ${results.inputs.temperature_C} °C</p>`;
    }

    html += `<p class="text-sm mb-1">k<sub>y,θ</sub> = ${toFixedIfNeeded(fire.k_y_theta, 3)} (yield strength reduction)</p>`;
    html += `<p class="text-sm mb-1">k<sub>E,θ</sub> = ${toFixedIfNeeded(fire.k_E_theta, 3)} (elastic modulus reduction)</p>`;
    html += `<p class="text-sm mb-1">f<sub>y,θ</sub> = k<sub>y,θ</sub> × f<sub>y</sub> = ${toFixedIfNeeded(fire.k_y_theta, 3)} × ${toFixedIfNeeded(results.inputs.fy_MPa, 0)} = ${toFixedIfNeeded(fire.fy_theta, 1)} MPa</p>`;
    html += `<p class="text-sm">E<sub>θ</sub> = k<sub>E,θ</sub> × E = ${toFixedIfNeeded(fire.k_E_theta, 3)} × 210000 = ${toFixedIfNeeded(fire.E_theta, 0)} MPa</p>`;
    html += '</div>';

    // Show detailed calculations only if we have a valid temperature
    if (displayTemp) {
      // About y-axis
      html += '<div class="bg-gray-50 rounded-lg p-4 mb-4">';
      html += '<h4 class="font-semibold text-gray-800 mb-2">About y-axis (elevated temperature):</h4>';
      html += `<p class="text-sm mb-1">L<sub>y</sub> = ${toFixedIfNeeded(results.inputs.Ly_m, 2)} m = ${toFixedIfNeeded(results.inputs.Ly_m * 100, 1)} cm</p>`;
      html += `<p class="text-sm mb-1">λ<sub>y</sub> = L<sub>y</sub> / i<sub>y${iySuffixReport}</sub> = ${toFixedIfNeeded(results.inputs.Ly_m * 100, 1)} / ${toFixedIfNeeded(sectionUsedReport.iy, 2)} = ${toFixedIfNeeded(fire.slenderness_y.lambda, 1)}</p>`;
      html += `<p class="text-sm mb-1">λ<sub>1,θ</sub> = π√(E<sub>θ</sub>/f<sub>y,θ</sub>) = π√(${toFixedIfNeeded(fire.E_theta, 0)}/${toFixedIfNeeded(fire.fy_theta, 1)}) = ${toFixedIfNeeded(fire.slenderness_y.lambda_1, 1)}</p>`;
      html += `<p class="text-sm mb-1">λ̄<sub>y,θ</sub> = λ<sub>y</sub> / λ<sub>1,θ</sub> = ${toFixedIfNeeded(fire.slenderness_y.lambda, 1)} / ${toFixedIfNeeded(fire.slenderness_y.lambda_1, 1)} = ${toFixedIfNeeded(fire.slenderness_y.lambda_bar, 3)}</p>`;
      html += `<p class="text-sm mb-1">Buckling curve: ${fire.curve_y}, α = ${toFixedIfNeeded(fire.alpha_y, 2)}</p>`;
      html += `<p class="text-sm mb-1">φ<sub>y,θ</sub> = 0.5[1 + α(λ̄<sub>y,θ</sub> - 0.2) + λ̄<sub>y,θ</sub>²] = ${toFixedIfNeeded(fire.phi_y, 3)}</p>`;
      html += `<p class="text-sm">χ<sub>y,θ</sub> = 1 / (φ<sub>y,θ</sub> + √(φ<sub>y,θ</sub>² - λ̄<sub>y,θ</sub>²)) = ${toFixedIfNeeded(fire.chi_y, 3)}</p>`;
      html += '</div>';

      // About z-axis
      html += '<div class="bg-gray-50 rounded-lg p-4 mb-4">';
      html += '<h4 class="font-semibold text-gray-800 mb-2">About z-axis (elevated temperature):</h4>';
      html += `<p class="text-sm mb-1">L<sub>z</sub> = ${toFixedIfNeeded(results.inputs.Lz_m, 2)} m = ${toFixedIfNeeded(results.inputs.Lz_m * 100, 1)} cm</p>`;
      html += `<p class="text-sm mb-1">λ<sub>z</sub> = L<sub>z</sub> / i<sub>z${izSuffixReport}</sub> = ${toFixedIfNeeded(results.inputs.Lz_m * 100, 1)} / ${toFixedIfNeeded(sectionUsedReport.iz, 2)} = ${toFixedIfNeeded(fire.slenderness_z.lambda, 1)}</p>`;
      html += `<p class="text-sm mb-1">λ̄<sub>z,θ</sub> = λ<sub>z</sub> / λ<sub>1,θ</sub> = ${toFixedIfNeeded(fire.slenderness_z.lambda, 1)} / ${toFixedIfNeeded(fire.slenderness_z.lambda_1, 1)} = ${toFixedIfNeeded(fire.slenderness_z.lambda_bar, 3)}</p>`;
      html += `<p class="text-sm mb-1">Buckling curve: ${fire.curve_z}, α = ${toFixedIfNeeded(fire.alpha_z, 2)}</p>`;
      html += `<p class="text-sm mb-1">φ<sub>z,θ</sub> = 0.5[1 + α(λ̄<sub>z,θ</sub> - 0.2) + λ̄<sub>z,θ</sub>²] = ${toFixedIfNeeded(fire.phi_z, 3)}</p>`;
      html += `<p class="text-sm">χ<sub>z,θ</sub> = 1 / (φ<sub>z,θ</sub> + √(φ<sub>z,θ</sub>² - λ̄<sub>z,θ</sub>²)) = ${toFixedIfNeeded(fire.chi_z, 3)}</p>`;
      html += '</div>';

      // Am/V Section Factor Calculation (if filter enabled)
      if (inputs.amvFilterEnabled && results.amvResult) {
        html += '<div class="bg-blue-50 rounded-lg p-4 mb-4 border-l-4 border-blue-500">';
        html += '<h4 class="font-semibold text-gray-800 mb-2">Section Factor (Am/V) Calculation:</h4>';
        html += `<p class="text-sm mb-1">Exposure configuration: ${results.amvResult.description}</p>`;
        html += `<p class="text-sm mb-1">Exposed perimeter: Am = ${toFixedIfNeeded(results.amvResult.Am, 1)} mm</p>`;
        html += `<p class="text-sm mb-1">Cross-sectional area: A = ${toFixedIfNeeded(sectionUsedReport.area * 100, 1)} mm² <span class="text-xs text-gray-600">(= ${toFixedIfNeeded(sectionUsedReport.area, 2)} cm² × 100)</span></p>`;
        html += `<p class="text-sm mb-1">Am/V<sub>base</sub> = Am / A × 1000 = ${toFixedIfNeeded(results.amvResult.Am, 1)} / ${toFixedIfNeeded(sectionUsedReport.area * 100, 1)} × 1000 = ${toFixedIfNeeded(results.amvResult.AmV_base, 1)} m<sup>-1</sup></p>`;
        html += `<p class="text-sm mb-1">Shadow factor: k<sub>sh</sub> = ${toFixedIfNeeded(results.amvResult.k_sh, 2)}`;
        if (results.amvResult.shadowNote) {
          html += ` <span class="text-xs text-gray-600">(${results.amvResult.shadowNote})</span>`;
        }
        html += `</p>`;
        html += `<p class="text-sm font-semibold">Am/V<sub>effective</sub> = k<sub>sh</sub> × Am/V<sub>base</sub> = ${toFixedIfNeeded(results.amvResult.k_sh, 2)} × ${toFixedIfNeeded(results.amvResult.AmV_base, 1)} = ${toFixedIfNeeded(results.amvResult.AmV, 1)} m<sup>-1</sup></p>`;

        const passesAmV = results.amvResult.AmV <= parseFloat(inputs.maxAmV);
        const statusColor = passesAmV ? 'text-green-700' : 'text-red-700';
        html += `<p class="text-sm mt-2 ${statusColor}">Maximum allowed: ${toFixedIfNeeded(inputs.maxAmV, 0)} m<sup>-1</sup> → ${passesAmV ? '✓ PASS' : '✗ EXCEEDS LIMIT'}</p>`;
        html += '</div>';
      }

      // Fire Resistance
      html += '<div class="bg-orange-50 rounded-lg p-4 border-l-4 border-orange-500">';
      html += '<h4 class="font-semibold text-gray-800 mb-2">Fire Buckling Resistance:</h4>';
      html += `<p class="text-sm mb-1">χ<sub>min,θ</sub> = min(χ<sub>y,θ</sub>, χ<sub>z,θ</sub>) = ${toFixedIfNeeded(fire.chi_min, 3)} (${fire.governing_axis}-axis governs)</p>`;
      html += `<p class="text-sm mb-1">N<sub>b,fi,Rd</sub> = χ<sub>min,θ</sub> × A${ASuffixReport} × f<sub>y,θ</sub> / γ<sub>M1</sub></p>`;
      html += `<p class="text-sm mb-1">N<sub>b,fi,Rd</sub> = ${toFixedIfNeeded(fire.chi_min, 3)} × ${toFixedIfNeeded(sectionUsedReport.area, 2)} × ${toFixedIfNeeded(fire.fy_theta, 1)} / ${toFixedIfNeeded(results.inputs.gamma_M1, 2)} / 10</p>`;
      html += `<p class="text-sm font-semibold">N<sub>b,fi,Rd</sub> = ${toFixedIfNeeded(fire.Nb_Rd_kN, 1)} kN</p>`;

      if (inputs.fireMode === 'find-critical') {
        html += `<p class="text-sm mt-2">Utilization at θ<sub>cr</sub> = ${toFixedIfNeeded(results.inputs.NEd_fire_kN, 1)} / ${toFixedIfNeeded(fire.Nb_Rd_kN, 1)} ≈ 100% (by definition)</p>`;
      } else {
        html += `<p class="text-sm mt-2">Utilization = N<sub>Ed,fi</sub> / N<sub>b,fi,Rd</sub> = ${toFixedIfNeeded(results.inputs.NEd_fire_kN, 1)} / ${toFixedIfNeeded(fire.Nb_Rd_kN, 1)} = ${toFixedIfNeeded(fire.utilization * 100, 1)}%</p>`;
      }
      html += '</div>';
    }

    html += '</div>';
  }

  html += '</div>';

  html += '</div>'; // Close report-content

  reportDiv.innerHTML = html;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function toggleReport() {
  const reportDiv = document.getElementById('detailed-report');
  reportDiv.classList.toggle('hidden');
}

function toggleCalculations() {
  const calcDiv = document.getElementById('calculations-display');
  calcDiv.classList.toggle('hidden');
}

function printReport() {
  const reportDiv = document.getElementById('detailed-report');
  const wasHidden = reportDiv.classList.contains('hidden');

  // Temporarily show the report for printing
  if (wasHidden) {
    reportDiv.classList.remove('hidden');
  }

  // Restore hidden state after print dialog closes
  window.onafterprint = () => {
    if (wasHidden) {
      reportDiv.classList.add('hidden');
    }
  };

  window.print();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// LOCAL STORAGE AND SAVE/LOAD FUNCTIONALITY
// ============================================================================

/**
 * Save form state to localStorage (auto-save on input changes)
 */
function saveFormStateToLocalStorage() {
  try {
    const formState = collectFormState();
    localStorage.setItem('flexuralBucklingFormState', JSON.stringify(formState));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
}

/**
 * Load form state from localStorage (on page load)
 */
function loadFormStateFromLocalStorage() {
  try {
    const savedState = localStorage.getItem('flexuralBucklingFormState');
    if (savedState) {
      const formState = JSON.parse(savedState);
      applyFormState(formState);
    } else {
      // No saved state - initialize UI visibility based on default values
      updateFireInputsVisibility();
      updateFireModeVisibility();
      updateAmVFilterInputsVisibility();
    }
  } catch (error) {
    console.error('Failed to load from localStorage:', error);
  }
}

/**
 * Save form state to JSON file (manual save button)
 */
function saveFormStateToJSON() {
  try {
    const formState = collectFormState();
    const json = JSON.stringify(formState, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `flexural_buckling_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('Form state saved to JSON file');
  } catch (error) {
    console.error('Failed to save JSON:', error);
    alert('Error saving file. Please try again.');
  }
}

/**
 * Load form state from JSON file (manual load button)
 */
function loadFormStateFromJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const formState = JSON.parse(e.target.result);
      applyFormState(formState);
      console.log('Form state loaded from JSON file');
    } catch (error) {
      console.error('Failed to load JSON:', error);
      // Silently fail - don't load if JSON is invalid
    }
  };
  reader.onerror = () => {
    console.error('Failed to read file');
    // Silently fail
  };
  reader.readAsText(file);

  // Reset file input so the same file can be loaded again
  event.target.value = '';
}

/**
 * Collect current form state into an object
 */
function collectFormState() {
  const formState = {
    version: '1.0',
    timestamp: new Date().toISOString(),

    // Section properties
    profileType: document.getElementById('profile-type').value,
    profileName: document.getElementById('profile-name').value,

    // Buckling lengths
    Ly: document.getElementById('Ly').value,
    Lz: document.getElementById('Lz').value,

    // Material properties
    steelGrade: document.getElementById('steel-grade').value,
    fy: document.getElementById('fy').value,
    gamma_M1: document.getElementById('gamma-M1').value,

    // ULS loads
    NEd_ULS: document.getElementById('NEd-ULS').value,

    // Fire design
    fireEnabled: document.getElementById('fire-enabled').checked,
    NEd_fire: document.getElementById('NEd-fire').value,
    fireMode: document.querySelector('input[name="fire-mode"]:checked')?.value || 'specify',
    temperature: document.getElementById('temperature').value,

    // Am/V filter
    amvFilterEnabled: document.getElementById('amv-filter-enabled').checked,
    exposureConfig: document.getElementById('exposure-config').value,
    shadowFactor: document.getElementById('shadow-factor').value,
    maxAmV: document.getElementById('max-amv').value
  };

  return formState;
}

/**
 * Apply form state from object (with validation)
 */
function applyFormState(formState) {
  try {
    // Validate that formState is an object
    if (typeof formState !== 'object' || formState === null) {
      throw new Error('Invalid form state');
    }

    // Apply section properties
    if (formState.profileType) {
      const profileTypeSelect = document.getElementById('profile-type');
      if (profileTypeSelect) {
        profileTypeSelect.value = formState.profileType;
        // Create synthetic event to trigger profile name update
        handleProfileTypeChange({ target: profileTypeSelect });
      }
    }

    // Wait for profile names to load, then set profile name
    setTimeout(() => {
      if (formState.profileName) {
        const profileNameSelect = document.getElementById('profile-name');
        if (profileNameSelect) {
          profileNameSelect.value = formState.profileName;
          // Create synthetic event to trigger section property update
          handleProfileNameChange({ target: profileNameSelect });
        }
      }
    }, 100);

    // Apply buckling lengths
    if (formState.Ly) document.getElementById('Ly').value = formState.Ly;
    if (formState.Lz) document.getElementById('Lz').value = formState.Lz;

    // Apply material properties
    if (formState.steelGrade) {
      document.getElementById('steel-grade').value = formState.steelGrade;
      handleSteelGradeChange(); // Trigger fy update
    }
    if (formState.fy) document.getElementById('fy').value = formState.fy;
    if (formState.gamma_M1) document.getElementById('gamma-M1').value = formState.gamma_M1;

    // Apply ULS loads
    if (formState.NEd_ULS) document.getElementById('NEd-ULS').value = formState.NEd_ULS;

    // Apply fire design settings
    if (formState.fireEnabled !== undefined) {
      document.getElementById('fire-enabled').checked = formState.fireEnabled;
      updateFireInputsVisibility();
    }
    if (formState.NEd_fire) document.getElementById('NEd-fire').value = formState.NEd_fire;
    if (formState.fireMode) {
      const fireModeRadio = document.querySelector(`input[name="fire-mode"][value="${formState.fireMode}"]`);
      if (fireModeRadio) {
        fireModeRadio.checked = true;
      }
    }
    // Always update visibility to match current radio state
    updateFireModeVisibility();
    if (formState.temperature) document.getElementById('temperature').value = formState.temperature;

    // Apply Am/V filter settings
    if (formState.amvFilterEnabled !== undefined) {
      document.getElementById('amv-filter-enabled').checked = formState.amvFilterEnabled;
      updateAmVFilterInputsVisibility();
    }
    if (formState.exposureConfig) document.getElementById('exposure-config').value = formState.exposureConfig;
    if (formState.shadowFactor) document.getElementById('shadow-factor').value = formState.shadowFactor;
    if (formState.maxAmV) document.getElementById('max-amv').value = formState.maxAmV;

  } catch (error) {
    console.error('Failed to apply form state:', error);
    // Silently fail - don't apply if state is invalid
  }
}
