i want to create different modules for calcualting minimum reinforcement in concrete structures

- plates
- beams
- columns (rectangular and circular)
- "gulv på grunn" according to gulvstøpeboka (norwegian handbook)
- surface reinforcement according to NS3473

plates and beams share a lot of the same logic, but the main difference is:
plates use maximum center distance of rebars
beams use number of rebars inside section

a typical plate calcualtion looks like this:
- user selects concrete quality (fck) --> fctm is received (look inside ec2-concrete)
- user selects fyk (reinforcement characteristic yield strength, 500MPa is default value but can be overwritten manually in the field)
- user selects concrete cover
- user selects number of layers and layer spacing. layer spacing is set to 3*bar_diameter if not overwritten. user can overwrite this parameter manually, but it is reset every time the user changes the bar diameter
- user selects relevant bar diameters, checkboxes arranged horizontally (ø5,ø6,ø7,ø8,ø10,ø12,ø16,ø20,ø25,ø32). by default, ø10,ø12,ø16 and ø20 are checked, the rest is not checked.

maximum spacing is then calcualted for different available bar diameters. 
the relevant formulas are 
- calcualte "d": d = h - c - bar_diameter/2-(n_layers-1)*layer_distance

the rest makes sense by naming.
then As,min is calcualted according to ec2:
As_min = 0.26*b*d*fctm/fyk
cc_max = pi*bar_diameter^2/4*b/As_min

input fields for Geoemtry:
h: plate height/thickness
c: cover
b: plate width, by default, 1000mm is chosen

input fields for Material Parametersfck (concrete quality, chosen from ec2concrete as a drop down. B35 by default. fctm is then referenced by ec2concrete. fctm can be overwritten manually, gives a little warning that it is manually overwritten)
fyk (rebar characteristic yield strength, 500MPa by default)

the outputs should look like plate_minimum_reinforcement.png but in the general styling of this repository. 

this module shall also have tabs to select the other types of minimum reinforcement. i will define their logic after you have created this first module. 

MAXIMUM CENTER TO CENTER DISTANCE LOGIC (norway specific AND in the international guidline)
s_max_slab = min(3*h,400mm) for main rebars
s_max_slab = min(3.5*h,450mm) for crack control rebars
in areas with concentrated loads and with largest moments (field and over supports)
s_max_slab = min(2*h,250mm)
s_max_slab = min(3*h,400mm) for crack control rebars

cc_max_slab according to EC2-1-1 9.2.1.1(1) - and add the minimum value 0.0013*b*d such that As_min = max(0.26*fctm/fyk*b*d,0.0013*b*d)

