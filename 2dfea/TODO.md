
1
# Displacement shape scaling (SAME AS LOAD SCALING)
Displacement shape scaling should follow the EXACT same logic as load visibility scaling:

1. **Zoom Independence**: Displacement shapes should be rendered in world coordinates (multiplied by view.scale), so they maintain constant size relative to elements at any zoom level
2. **1.00x = 1/20 automatic scaling**: The scale control should show 1.00x when using automatic scaling (which sets max displacement = 1/20 of max element length)
3. **Manual scale as multiplier**: User's manual scale should be a MULTIPLIER of the automatic scale (2.0x = double size, 0.5x = half size)
4. **Normalization**: The UI should always display 1.00x for automatic mode, not the raw calculation value

Current issues:
- Displacement shapes likely scale with zoom (not zoom-independent)
- Scale control probably shows raw value like 0.05x instead of normalized 1.00x
- Manual scale is probably absolute instead of a multiplier

Fix needed:
- Apply `* view.scale` to displacement arrow lengths (similar to loads)
- Change manual scale to be a multiplier: `displacementScale = displacementScaleAuto * displacementScaleManual`
- Show 1.0 in UI when in automatic mode instead of raw auto scale value
- Update Toolbar.tsx displacement scale control to show normalized value


2
# Steel Cross section library
Look inside 2dframeanalysis and find out how the steel cross section database is imported. 
Create functionality inside the Elements tab, letting the user choose either custom section or a steel section type (CHS, SHS etc) from a dropdown menu.
Choosing a steel cross section type populates a second drop-down to the right with available steel sections. 
User chooses a section and A, Iy, and Iz are populated. 
User also needs to choose wheter to use strong or weak axis for I-values in the 2D plane. 

2.1
Nice if cross section drop down is searchable. 
Example: User chooses SHS type section type. User then clicks the section drop-down. User writes 150/10, or 150x10 or 150x150x10 and the dropdown reduces to sections matching that search. 

3
# Nodes modification in nodes tab to the right
Editing nodes x and y values are a bit cumbersome. 
Look at the spec below and consider either modifying the existing functinoality or finding a suitable framework for table modification:

Node editing spec:
When left clicking once on a coordinate or any other property in the nodes tab to the right, the user should automatically come into editing mode having the number marked.
It should be possible to move to the next coordinate by pressing tab. Pressing tab again actiaves support drop down. Pressing tab again activates node name on the next line.
And if a user selects a coordinate and presses enter, it is modified without moving to the next coordinate. 
If user clicks inside the model or somewhere outside the active cell, the user written value is updated. 
It should also be possible to move around in the table using key arrows. Pressing f2 activates a value for modification. 

Note that like always, node eiditing should only be possible if Structure Tab on the top is active. 



