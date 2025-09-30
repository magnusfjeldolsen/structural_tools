# PyNite 2D Frame Analysis Tool

A browser-based structural analysis tool powered by PyNite and Pyodide, enabling professional-grade finite element analysis directly in your web browser.

## 🚀 Features

- **Browser-based**: No installation required - runs entirely in your web browser
- **PyNite Integration**: Uses the powerful PyNite library for structural analysis
- **Interactive Interface**: Easy-to-use forms for defining nodes, elements, and loads
- **Real-time Visualization**: D3.js-powered frame visualization with live updates
- **Multiple Examples**: Pre-built examples including simple beam, cantilever, and portal frame
- **Comprehensive Results**: Detailed displacement and force results with formatted tables
- **Modular Design**: Separated Python modules for easy testing and development

## 📁 File Structure

```
pynite-pyodide/
├── index.html              # Main web interface
├── pynite-interface.js      # JavaScript frontend logic
├── frame_analysis.py        # Core PyNite analysis module
├── web_interface.py         # Web-specific interface functions
├── test_frame_analysis.py   # Test suite for Python modules
└── README.md               # This file
```

## 🛠️ Setup and Testing

### 1. Test Python Modules Locally

First, test the core functionality locally to ensure PyNite works correctly:

```bash
# Install PyNite locally for testing
pip install PyNiteFEA

# Run the test suite
python test_frame_analysis.py

# Test individual examples
python frame_analysis.py
```

The test script will run several test cases:
- Simple supported beam
- Cantilever beam
- Portal frame
- Moment diagram generation

### 2. Run in Browser

1. Start a local web server in the pynite-pyodide directory:
   ```bash
   # Python 3
   python -m http.server 8000

   # Or use Node.js
   npx serve .
   ```

2. Open your browser and navigate to `http://localhost:8000`

3. Wait for PyNite to load (may take 30-60 seconds on first load)

4. Try the example structures or create your own

## 🧪 Testing Examples

### Example 1: Simple Supported Beam
- 5m span beam with center point load
- Pinned support at left end
- Roller support at right end
- 10 kN downward load at center

**Expected Results:**
- Center deflection: ~3-5 mm downward
- Maximum moment: ~12.5 kNm at center
- Reactions: 5 kN at each support

### Example 2: Cantilever Beam
- 4m cantilever beam
- Fixed support at left end
- 15 kN load at free end

**Expected Results:**
- Tip deflection: ~15-20 mm downward
- Maximum moment: 60 kNm at fixed end
- Fixed end reaction: 15 kN upward

### Example 3: Portal Frame
- 6m span × 4m height portal frame
- Fixed supports at both bases
- 25 kN vertical load at beam center
- 10 kN horizontal load at left column top

## 🔧 Development

### Adding New Examples

To add new structural examples:

1. **In Python** (for testing):
   ```python
   # Add to test_frame_analysis.py
   def test_new_structure():
       nodes = [...]
       elements = [...]
       loads = [...]
       # Test logic here
   ```

2. **In JavaScript** (for web interface):
   ```javascript
   // Add to pynite-interface.js
   function loadNewExample() {
       clearAll();
       // Add nodes, elements, loads
       updateVisualization();
   }
   ```

### Modifying Analysis Parameters

Edit `frame_analysis.py` to:
- Add new element properties
- Modify support types
- Add distributed loads
- Include temperature effects

### Customizing Visualization

Edit `pynite-interface.js` to:
- Change color schemes
- Add deformation plots
- Include moment diagrams
- Show force vectors

## 📊 Output Format

### Node Results
- **DX, DY**: Displacements in X and Y directions (converted to mm)
- **RZ**: Rotation about Z-axis (in radians)
- **Reactions**: Support reactions (converted to kN)

### Element Results
- **Max Moment**: Maximum moment along element (converted to kNm)
- **Max Shear**: Maximum shear force (converted to kN)
- **Axial Force**: Axial force (converted to kN)
- **Length**: Element length (m)

## 🚨 Troubleshooting

### Common Issues

1. **PyNite fails to load**
   - Check browser console for errors
   - Ensure you have a good internet connection (for CDN packages)
   - Try refreshing the page

2. **Analysis fails**
   - Check that structure has sufficient supports
   - Verify node names match in elements
   - Ensure all required fields are filled

3. **Unexpected results**
   - Verify units (force in kN, length in m)
   - Check element properties (E, I, A values)
   - Ensure support conditions are correct

### Debug Mode

Enable debug output by opening browser console (F12) to see:
- PyNite loading progress
- Analysis execution details
- Error messages and stack traces

## 🎯 Use Cases

### Educational
- Teaching structural analysis concepts
- Demonstrating finite element method
- Comparing hand calculations with computer results

### Professional
- Quick preliminary design checks
- Concept verification
- Client presentations with interactive models

### Research
- Testing new analysis methods
- Prototyping structural configurations
- Validation of theoretical models

## 🔄 Future Enhancements

### Planned Features
- [ ] 3D frame analysis capability
- [ ] Distributed loads on elements
- [ ] Modal analysis and dynamics
- [ ] Export to common analysis formats
- [ ] Import from spreadsheet/CSV
- [ ] Moment and shear diagrams
- [ ] Deflection shape plotting
- [ ] Load combinations
- [ ] Steel/concrete design checks

### Integration Ideas
- Excel/CSV import functionality
- Python code generation for analysis
- Connection to existing CAD tools
- Integration with design codes (EC3, EC2, AISC)

## 📝 Notes

- This tool uses PyNiteFEA (the updated version of PyNite)
- All calculations follow standard finite element methods
- Results should be verified by qualified engineers for actual projects
- The tool is designed for educational and preliminary analysis purposes

## 🤝 Contributing

To contribute to this project:
1. Test new features locally using the Python test scripts
2. Add appropriate test cases to `test_frame_analysis.py`
3. Update both Python and JavaScript interfaces
4. Document new features in this README

## 📧 Support

For issues and questions:
- Check the browser console for error messages
- Run local Python tests to isolate problems
- Verify input data format and units
- Ensure all dependencies are properly loaded