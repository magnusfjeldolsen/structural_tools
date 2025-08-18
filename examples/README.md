# Structural Tools - API Integration Examples

This directory contains Python examples demonstrating how to integrate the Structural Tools calculation engines into your own workflows. The examples show practical use cases for parametric studies, batch processing, and design optimization.

## 📋 Prerequisites

### Required Software
- **Python 3.7+** - For running the analysis scripts
- **Node.js 14+** - Required for JavaScript API execution
- **Git** - For cloning the repository

### Python Dependencies
Install the required Python packages:
```bash
pip install -r requirements.txt
```

### Verify Installation
Check that Node.js is available:
```bash
node --version
```

## 🚀 Available Examples

### 1. Concrete Slab Parametric Analysis
**File:** `concrete_slab_parametric.py`

**Scenario:** Analyzes a 6m simply supported slab with varying applied moment and different reinforcement zones.

**Features:**
- Variable MEd distribution along slab length
- Two reinforcement zones: middle 2m with cc=75mm, outer sections with cc=150mm
- Capacity utilization analysis
- Comprehensive visualization and reporting

**Usage:**
```bash
python concrete_slab_parametric.py
```

**Outputs:**
- `slab_analysis_plots.png` - Comprehensive visualization
- `slab_analysis_summary.txt` - Engineering report
- `slab_analysis_results.csv` - Raw calculation data

### 2. Concrete Beam Load Envelope Analysis
**File:** `concrete_beam_analysis.py`

**Scenario:** Load envelope analysis for a 6m simply supported beam under varying distributed loads.

**Features:**
- Standard beam formulas: MEd = qL²/8, VEd = qL/2
- Load range: 10-50 kN/m in 21 steps
- Moment, shear, and tensile capacity checks
- Design optimization recommendations

**Usage:**
```bash
python concrete_beam_analysis.py
```

**Outputs:**
- `beam_load_envelope.png` - Load envelope visualization
- `beam_design_report.txt` - Comprehensive design report
- `beam_analysis_results.csv` - Detailed calculation data
- `beam_optimization.txt` - Design optimization analysis

## 📊 Example Output Features

### Visualizations
- **Moment/Shear Envelopes:** Applied loads vs capacity
- **Utilization Plots:** Color-coded capacity utilization
- **Safety Factor Analysis:** Design margins visualization
- **Reinforcement Layout:** Visual representation of reinforcement zones

### Reports
- **Engineering Summary:** Design status and recommendations
- **Detailed Calculations:** Step-by-step results with intermediate values
- **Optimization Analysis:** Cost-benefit recommendations
- **Standard Load Checks:** Eurocode load combinations

### Data Export
- **CSV Format:** Machine-readable results for further analysis
- **Batch Processing:** Multiple configurations in single run
- **API Integration:** JSON input/output for programmatic access

## 🔧 API Integration Architecture

The examples demonstrate a hybrid Python-JavaScript architecture:

```
Python Script → Node.js subprocess → JavaScript API → JSON Results → Python Analysis
```

### Key Components

1. **Python Interface Classes**
   - `ConcreteBeamAPI` - Interface to beam calculation engine
   - `ConcreteSlabAPI` - Interface to slab calculation engine
   - Error handling and validation

2. **JavaScript API Modules**
   - `concrete_beam_api.js` - Pure calculation functions
   - `concrete_slab_api.js` - Slab analysis functions
   - No DOM dependencies - server-ready

3. **Data Flow**
   - JSON input schema with comprehensive validation
   - Structured output with intermediate calculations
   - Batch processing support for parametric studies

## 📋 Input/Output Schema

### Concrete Beam Inputs
```json
{
  "geometry": {"b": 250, "h": 500, "c": 25},
  "loads": {"MEd": 62.5, "VEd": 150},
  "longitudinal_reinforcement": {"phi_l": 20, "n_l": 2},
  "shear_reinforcement": {"phi_b": 12, "cc_b": 185, "n_snitt": 2},
  "material": {"fck": 35, "fyk": 500, "alpha_cc": 0.85, "gamma_c": 1.5, "gamma_s": 1.25}
}
```

### Concrete Slab Inputs
```json
{
  "geometry": {"MEd": 62.5, "t": 200, "c": 35},
  "material": {"fcd": 19.8, "fyd": 435},
  "reinforcement": {"phi_l": 12, "cc_l": 150}
}
```

### Output Structure
```json
{
  "success": true,
  "inputs": {...},
  "intermediate_calculations": {
    "geometry": {"d": 465, "Asl": 628, "z": 442},
    "material": {"fcd": 19.8, "fyd": 400},
    "shear": {"Asw": 226, "cot_theta_final": 2.1}
  },
  "results": {
    "moment_capacity": {"MRd_c": 89.2, "MRd_s": 111.4, "MRd": 89.2},
    "shear_capacity": {"VRd_s": 195.6}
  },
  "status": {
    "overall": "OK",
    "utilizations": {"moment": 70.1, "shear": 76.8},
    "messages": ["Design is within acceptable limits"]
  }
}
```

## 🎯 Extending the Examples

### Adding New Analysis Types
1. Create new Python script following the existing patterns
2. Use the API interface classes for calculation calls
3. Implement visualization and reporting functions
4. Add to this README with usage instructions

### Batch Processing
The examples support batch processing for parametric studies:
```python
# Generate multiple input cases
inputs_list = [create_inputs(param) for param in parameter_range]

# Process in batch
results = api.calculate_batch(inputs_list)

# Analyze results
analyze_parametric_results(results)
```

### Custom Visualizations
Extend the plotting functions for specific needs:
```python
def create_custom_plot(results, custom_params):
    # Extract specific data
    data = [extract_value(r, param) for r in results]
    
    # Create visualization
    plt.figure(figsize=(12, 8))
    # ... plotting code ...
    
    plt.savefig("custom_analysis.png")
```

## 🔍 Troubleshooting

### Common Issues

**"Node.js not found"**
- Install Node.js from https://nodejs.org/
- Ensure `node` command is in your PATH

**"Module not found" errors**
- Check that the API files exist in parent directories
- Verify file paths in the Python scripts

**"Calculation failed" messages**
- Check input values are within engineering limits
- Review error messages for specific validation failures

**Import errors**
- Install required Python packages: `pip install -r requirements.txt`
- Check Python version compatibility (3.7+)

### Getting Help

1. Check the [main documentation](../api_schema.json) for API schema
2. Review the calculation source code in parent directories
3. Open an issue on GitHub for bugs or feature requests
4. Contact the author for specific implementation questions

## 📝 License

These examples are provided under the MIT License - see the main repository for details.

## 🤝 Contributing

Contributions are welcome! Please:
1. Follow the existing code style and structure
2. Add comprehensive documentation for new examples
3. Include test cases and validation
4. Update this README with new examples

---

**Author:** Magnus Fjeld Olsen  
**Project:** Structural Tools - Free Engineering Calculators  
**Repository:** https://github.com/magnusfjeldolsen/structural_tools