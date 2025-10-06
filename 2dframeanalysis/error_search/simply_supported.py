# Example of a simply supported beam with a uniform distributed load.
# Units used in this example are inches and kips
# This example does not use load combinations. The program will create a
# default load combindation called 'Combo 1'
#%%
# Import `FEModel3D` from `Pynite`
from Pynite import FEModel3D

# Create a new finite element model
beam = FEModel3D()

# Add nodes (14 ft = 168 inches apart)
beam.add_node('N1', 0, 0, 0)
beam.add_node('N2', 5000, 0, 0)

# Define a material
E = 210*1e9       # Modulus of elasticity (N/mm2)
nu = 0.3        # Poisson's ratio
G = E/(2*(1+nu))  # Shear modulus (N/mm2)
rho = 7850*1e9  # Density (kg/mm3)
beam.add_material('Steel', E, G, nu, rho)

# Add a section with the following properties:
# A = 20 in^2, Iy = 100 in^4, Iz = 150 in^4, J = 250 in^4
# A = 3337/1e6
# Iy = 27.72*1e6/1e12
# Iz = 2*1e6/1e12
# IT = 89820/1e9
A = 20
Iy = 100
Iz = 150
IT = 25

beam.add_section('yo', A=A, Iy=Iy, Iz=Iz, J=IT)

#Add a members
beam.add_member('E1', 'N1', 'N2', 'Steel', 'yo')

# Provide simple supports
beam.def_support('N1', True, True, True, False, False, False)
beam.def_support('N2', False, True, True, False, False, False)

beam.add_node_load('N2','FX', 100) #100 axial load

# Add a uniform load, lower case y is local axis, upper case Y is global axis
beam.add_member_dist_load('E1', 'Fy', -1000, -1000, 0, 5)

# Alternatively the following line would do apply the load to the full
# length of the member as well
# beam.add_member_dist_load('M1', 'Fy', -200/1000/12, -200/1000/12)

# Analyze the beam
beam.analyze(check_stability=True)
# %%
beam.members['E1'].plot_shear('Fy')
beam.members['E1'].plot_moment('Mz')

# %%
