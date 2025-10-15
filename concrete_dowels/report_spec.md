# Concrete Dowels - Detailed Calculation Report Specification

## Page Layout
- **Page 1**: Calculation Description (optional) → Title/Timestamp → Input Parameters → Plot → Results Summary
- **Page 2**: Detailed Calculations

## Report Structure (in order of appearance)

### 1. Calculation Description (Page 1, top - optional)
- User-provided description from textarea input
- Only shown if user enters text

### 2. Title and Header (Page 1)
- Title: "Concrete Dowels Calculation"
- Reference: According to Norwegian "Betongelementboken"
- Timestamp: Calculation Date with full date/time

### 3. INPUT PARAMETERS (Page 1)
All input parameters in a 2-column grid layout with 4 subsections:

**Column 1:**
- **Load Parameters**
  - V_Ed (applied shear force in kN)
  - f_dowel (dowel factor)

- **Dowel Configuration**
  - Diameter (mm)
  - n_V,parallel (number of dowels parallel to load)
  - c/c_parallel (center-to-center spacing parallel in mm)
  - n_V,ortagonal (number of dowels perpendicular to load)
  - c/c_ortagonal (center-to-center spacing perpendicular in mm)

**Column 2:**
- **Material Properties**
  - f_ck (concrete compressive strength in MPa)
  - f_yk (steel yield strength in MPa)
  - α_cc (concrete coefficient)
  - γ_c (partial safety factor for concrete)
  - γ_s (partial safety factor for steel)
  - n-factor

- **Edge Distances**
  - Eccentricity (mm)
  - a_1 (edge distance 1 in mm)
  - a_2,h (edge distance 2 horizontal in mm)
  - a_2,v (edge distance 2 vertical in mm)

### 4. PLOT (Page 1)
- Full-width SVG visualization of dowel geometry
- Should occupy entire page width
- Shows dowels and concrete element with dimensions

### 5. RESULTS SUMMARY (Page 1)
- **Main Result Box** (prominent display):
  - V_Rd = [value] kN
  - Subtitle: "Shear Capacity of Dowel Group"

- **Utilization Grid** (3 columns):
  - **Concrete Utilization**: v_c percentage (colored: green <85%, yellow 85-100%, red >100%)
  - **Steel Utilization**: v_s percentage (colored)
  - **Bending Utilization**: m_s percentage (colored)

### 6. DETAILED CALCULATIONS (Page 2, starts with page break)
All in gray boxes (bg-gray-50) with BLACK text (text-gray-800):

- **Basic Calculations**
  - n_V,tot = n_V,parallel × n_V,ortagonal
  - A_s = π × ø² / 4
  - f_cd = α_cc × f_ck / γ_c
  - f_yd = f_yk / γ_s
  - σ_cd = 3 × f_cd

- **Steel Shear Capacity**
  - V_Rd,s = (n_V,tot × A_s × f_yd) / √3

- **Plastic Moment Capacity**
  - M_Rd,s0 = f_yd × ø³ / 6

- **Concrete Shear Capacity (Single Dowel)**
  - V_Rd,e formula and calculation
  - V_Rd,c0 = V_Rd,e

- **Distance Factors**
  - k_a calculation
  - k_s calculation
  - k = min(n_V,ortagonal, k_a × k_s)
  - ψ_f,V value

- **Final Shear Capacity** (highlighted in blue box)
  - V_Rd = f_dowel × k × ψ_f,V × V_Rd,c0
  - Final value

- **Utilization Checks**
  - Concrete: v_c = V_Ed / V_Rd
  - Steel: v_s = V_Ed / V_Rd,s
  - Bending: m_s = M_max / M_Rd,s0



## Styling Notes
- White background for print (bg-white)
- Black text for body content (text-gray-800 for all paragraph text)
- Colored headings:
  - Blue (text-blue-700) for INPUT PARAMETERS
  - Yellow (text-yellow-700) for PLOT
  - Green (text-green-700) for RESULTS SUMMARY
  - Purple (text-purple-700) for DETAILED CALCULATIONS
- Gray boxes for calculation steps (bg-gray-50 p-3 rounded)
- Utilization colors:
  - Green (text-green-900) for <85%
  - Yellow (text-yellow-900) for 85-100%
  - Red (text-red-900) for >100%
- Grid layouts:
  - 2 columns (grid-cols-2) for input parameters
  - 3 columns (grid-cols-3) for utilization results
- Page margins: 25mm 25mm 25mm 31.7mm (A4 Word standard) + 15mm left padding
- Full page width - no centered boxes or max-width constraints
