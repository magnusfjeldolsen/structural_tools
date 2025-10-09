#%%
"""Quickstart example."""

from shapely import Polygon

import structuralcodes
from structuralcodes.geometry._rectangular import RectangularGeometry
from structuralcodes import set_design_code
from structuralcodes.geometry import SurfaceGeometry, add_reinforcement,add_reinforcement_line
from structuralcodes.materials.concrete import create_concrete
from structuralcodes.materials.reinforcement import create_reinforcement
from structuralcodes.sections import GenericSection

from helperfunctions import *

# Set the active design code
set_design_code('ec2_2004')
#%%
# Create a concrete and a reinforcement
fck = 45
fyk = 500
ftk = 550
Es = 200000
epsuk = 0.07

# These factory functions create concrete and reinforcement materials according
# to the globally set design code
concrete = create_concrete(fck=fck)
reinforcement = create_reinforcement(fyk=fyk, Es=Es, ftk=ftk, epsuk=epsuk)

#%%
# Create a rectangular geometry
width = 1000
height = 350
geometry = RectangularGeometry(width=width, height=height, material=concrete)
geometry
#%%
# Create reinforcement line at bottom of rectangle with cover
diameter_reinf = 12
cover = 50
s = 100

bottom_rectangle_boundary = get_bottom_boundary_of_rectangle(geometry)
bottom_rebar_endpoints = generate_reinforcement_line_coords_with_cover(
    bottom_rectangle_boundary, cover, diameter_reinf)

print(f"bottom_rectangle_boundary: {bottom_rectangle_boundary}")
print(f"bottom_rebar_endpoints: {bottom_rebar_endpoints}")

# Add reinforcement line at bottom of rectangle
geometry = add_reinforcement_line(
    geometry,
    bottom_rebar_endpoints[0],
    bottom_rebar_endpoints[1],
    diameter=diameter_reinf,
    s=s,
    material=reinforcement,
)
#print(get_rebar_area(geometry))
geometry


#%%
# Create section
section = GenericSection(geometry)

#%%
# Calculate the moment-curvature response
moment_curvature = section.section_calculator.calculate_moment_curvature()
# %%
moment_capacity = section.section_calculator.calculate_bending_strength()
#%%
MRdy=moment_capacity.m_y
MRdz=moment_capacity.m_z
print(f"Moment capacity about y-axis: {MRdy/1e6} kNm")
#rounded to 1 decimal place
print(f"Moment capacity about z-axis: {MRdz/1e6:2f} kNm")


# %%
