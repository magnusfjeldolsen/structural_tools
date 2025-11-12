
1
# Load visibility scaling
Load scaling (how large the loads look) are now relative to the size of the load.
They should be relative to each other. The largest visible load arrow (point loads) should be 1/20 of the longest visible element (from element lengths.)
The largest visible line load should also be 1/20 of the longest visible element. 
Create a strategy to change the rendering strategy of loads. The load size should be independent of zoom level. In the loads panel, the user should have some manual scaling controls of loads, allowing the user to make loads look larger or smaller, but standard scaling is 1/20 of max element length.


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



