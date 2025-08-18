# Structural Tools - Free Engineering Calculators

A comprehensive collection of professional-grade structural engineering calculation tools, completely free to use. Built by engineers, for engineers.

## 🌟 Featured Tools

### 🔥 Steel Fire Temperature Calculator
Interactive fire resistance analysis for unprotected steel structures with Am/V ratio calculation, shadow effects, and detailed temperature-time curves.

### 🏗️ Concrete Beam Design Calculator
Ultimate Limit State (ULS) analysis for concrete beams including moment capacity, shear design, and tensile force calculations with step-by-step derivations.

### 🏢 Concrete Slab Design Calculator  
ULS moment resistance calculator for concrete slabs with detailed mathematical derivations and visual design aids.

### 📐 Two-Sided Hat Profile Calculator
Structural capacity and cross-sectional classification analysis for two-sided hat profiles with Eurocode 3 compliance.

## 🚀 Live Demo

**Visit:** [https://magnusfjeldolsen.github.io/structural_tools/](https://magnusfjeldolsen.github.io/structural_tools/)

All tools are available online with no installation required. Professional results with interactive visualizations and exportable reports.

## 🔧 API Integration

### API-Ready Modules

The following calculation engines are available for API integration:

- ✅ **Concrete Beam Design** - Complete ULS analysis with moment, shear, and tensile capacity
- ✅ **Concrete Slab Design** - Moment resistance calculations with reinforcement optimization  
- 🟡 **Steel Fire Temperature** - Coming soon

### Key Features

- **JSON Input/Output Schema** - Standardized data exchange format
- **Batch Processing Support** - Handle multiple calculations efficiently
- **Comprehensive Validation** - Engineering limits and error handling
- **Mathematical Expressions** - Support for formulas like "20*5^2/8"
- **No DOM Dependencies** - Pure calculation functions ready for server use

### Python Integration Examples

Complete examples demonstrating real-world API integration scenarios:

#### Concrete Slab Parametric Analysis
```python
# Analyze 6m slab with variable MEd and reinforcement zones
python examples/concrete_slab_parametric.py
```
- Variable reinforcement: middle 2m at cc=75mm, outer sections at cc=150mm
- Generates utilization plots and optimization recommendations
- Exports CSV data and engineering reports

#### Concrete Beam Load Envelope
```python  
# Load envelope analysis with standard beam formulas
python examples/concrete_beam_analysis.py
```
- MEd = qL²/8, VEd = qL/2 for distributed loads 10-50 kN/m
- Moment/shear capacity checks and design optimization
- Comprehensive load envelope visualization

### Quick Start

1. **Install Dependencies**
   ```bash
   pip install numpy matplotlib pandas
   ```

2. **Install Node.js** (required for JavaScript API calls)
   - Download from [nodejs.org](https://nodejs.org/)

3. **Run Examples**
   ```bash
   cd examples/
   python concrete_slab_parametric.py
   python concrete_beam_analysis.py
   ```

4. **Review Generated Files**
   - `*.png` - Visualization plots  
   - `*.txt` - Engineering reports
   - `*.csv` - Raw calculation data

### API Schema

Detailed API documentation available at: [api_schema.json](./api_schema.json)

**Example API Call:**
```json
{
  "geometry": {"b": 250, "h": 500, "c": 25},
  "loads": {"MEd": "20*5^2/8", "VEd": "20*5/2"},
  "material": {"fck": 35, "fyk": 500}
}
```

## 🎯 Use Cases

### Professional Practice
- **Design Verification** - Validate hand calculations with detailed derivations
- **Parametric Studies** - Optimize designs across multiple load scenarios  
- **Code Compliance** - Eurocode-compliant calculations with safety factors
- **Documentation** - Generate professional reports with step-by-step calculations

### Education & Research
- **Teaching Aid** - Visual step-by-step calculations for structural engineering courses
- **Research Tool** - Batch processing for parametric research studies
- **Code Development** - Integration into larger structural analysis workflows
- **Verification** - Independent verification of commercial software results

### Automation & Integration
- **API Integration** - Embed calculations in custom applications
- **Batch Processing** - Process hundreds of designs automatically
- **Report Generation** - Automated engineering report creation
- **Design Optimization** - Programmatic design space exploration
