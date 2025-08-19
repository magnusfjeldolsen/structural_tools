# Structural Tools - Unified API System

## Super Simple Structural Calculations 🏗️

Transform complex Selenium automation into dead-simple `requests` calls!

```python
# Before (complex Selenium):
driver = webdriver.Chrome()
driver.get("file://...")
result = driver.execute_script("return window.thpCalculate(...)")

# After (super simple):
from structural_tools import calculate
result = calculate("thp", {"b_o": 188, "t_o": 25, "H": 200, ...})
```

## Quick Start

### 1. Start the Server
```bash
python structural_api_server.py
```

### 2. Use the API
```python
from structural_tools import calculate

# THP Steel Profile
result = calculate("thp", {
    "b_o": 188, "t_o": 25, "H": 200, "t_w": 6,
    "b_u": 450, "t_u": 15, "f_yk": 355,
    "gamma_M0": 1.05, "rho_steel": 7850
})

print(f"Unit Weight: {result['results']['unit_weight']} kg/m")
print(f"Moment Capacity: {result['results']['M_Rd']} kNm")
```

### 3. Run the Demo
```bash
python quickstart_all_modules.py
```

## Features

✅ **Single API** - One endpoint for all modules  
✅ **Module Selection** - Just specify module name in request  
✅ **Dictionary Input/Output** - No complex setup  
✅ **Detailed Calculations** - Every step with formulas  
✅ **Batch Processing** - Parametric studies made easy  
✅ **Error Handling** - Robust input validation  
✅ **Future-Proof** - Easy to add new modules  

## Supported Modules

| Module | Description | Status |
|--------|-------------|---------|
| `thp` | Two-sided Hat Profile steel sections | ✅ **Ready** |
| `concrete_beam` | Concrete beam ULS design | ⏳ **Pending** |
| `concrete_slab` | Concrete slab ULS design | ⏳ **Pending** |

## API Usage Examples

### Single Calculation
```python
from structural_tools import calculate

result = calculate("thp", parameters_dict)
```

### Batch Processing
```python
from structural_tools import calculate_batch

results = calculate_batch("thp", [params1, params2, params3])
```

### Module-Specific Functions
```python
from structural_tools import calculate_thp, calculate_concrete_beam

thp_result = calculate_thp(thp_params)
beam_result = calculate_concrete_beam(beam_params)
```

## Example Input Files

- `example_thp_input.py` - THP parameters & parametric studies
- `example_concrete_beam_input.py` - Concrete beam parameters
- `example_concrete_slab_input.py` - Concrete slab parameters

## Response Format

```json
{
  "success": true,
  "module": "thp",
  "input": {...},
  "results": {
    "unit_weight": 86.52,
    "unit_weight_unit": "kg/m",
    "M_Rd": 50.8,
    "M_Rd_unit": "kNm",
    "overall_classification": "Class 1"
  },
  "detailed_calculations": {
    "derived_dimensions": {...},
    "cross_sectional_areas": {...},
    "neutral_axis": {...},
    "capacities": {...}
  }
}
```

## Installation Requirements

```bash
pip install requests selenium
```

## File Structure

```
structural_tools/
├── structural_api_server.py     # HTTP server & API router
├── structural_tools.py          # Python client library
├── quickstart_all_modules.py    # Complete demo
├── example_thp_input.py         # THP examples
├── example_concrete_beam_input.py # Beam examples
├── example_concrete_slab_input.py # Slab examples
├── THP/
│   ├── index.html               # THP web calculator
│   └── script.js                # Enhanced with API support
├── concrete_beam_design/        # Beam calculator
└── concrete_slab_design/        # Slab calculator
```

## Next Steps

1. **Test THP Module**: `python quickstart_all_modules.py`
2. **Add Concrete Modules**: Implement beam & slab APIs
3. **Scale Up**: Add your new calculation modules easily

## Benefits vs Selenium Approach

| Aspect | Selenium | This API |
|--------|----------|----------|
| Setup | Complex WebDriver setup | Just `pip install requests` |
| Speed | Slow (browser overhead) | Fast (direct HTTP) |
| Dependencies | Chrome + ChromeDriver | Python requests only |
| Code Complexity | 50+ lines for setup | 1 line: `calculate()` |
| Batch Processing | Manual loops | Built-in batch support |
| Error Handling | Browser crashes | Clean JSON errors |
| Scalability | Resource intensive | Lightweight |

---

**The result**: Your structural calculations are now as simple as `calculate(module, params)`! 🎉