#%%
"""
Debug script to trace PyNite model assembly step by step
Helps identify why matrix becomes singular
"""

from Pynite import FEModel3D
import numpy as np

#%%
# Test data - simple supported beam
data = {
    'nodes': [
        {'name': 'N1', 'x': 0, 'y': 0, 'support': 'pinned'},
        {'name': 'N2', 'x': 5, 'y': 0, 'support': 'roller-x'}
    ],
    'elements': [
        {'name': 'E1', 'nodeI': 'N1', 'nodeJ': 'N2', 'E': 210,'A':0.002, 'Iy': 1, 'Iz': 0.5, 'IT':0.1}
    ],
    'loads': {
        'nodal': [
            {'name': 'L1', 'node': 'N2', 'fx': 100, 'fy': 0, 'mz': 0}
        ],
        'distributed': [
            {'name': 'D1', 'element': 'E1', 'direction': 'Fy', 'w1': -1, 'w2': -1, 'x1': 0, 'x2': 5}
        ],
        'elementPoint': []
    }
}

#%%
# Create model
model = FEModel3D()
print("Created FEModel3D")

#%%
# Add nodes
print("\nAdding nodes:")
for node in data['nodes']:
    model.add_node(node['name'], float(node['x']), float(node['y']), 0.0)
    print(f"   Added: {node['name']} at ({node['x']}, {node['y']}, 0)")


#%%
# Add material
print("\nAdding material:")
E = 210e9  # Pa
G = 80e9   # Pa
nu = 0.3
rho = 7850
model.add_material('Steel', E, G, nu, rho)
print(f"   Steel: E={E/1e9} GPa, G={G/1e9} GPa, nu={nu}, rho={rho} kg/m³")

#%%
# Add section BEFORE adding members
print("\nAdding section:")
A = 1  # m²
I = 2  # m⁴
IT = 1  # m⁴ (torsional constant)
model.add_section('MySection', A, I, I, IT)
print(f"   MySection: A={A} m², I={I} m⁴, IT={IT} m⁴")

#%%
# Add members
print("\nAdding members:")
for element in data['elements']:
    model.add_member(
        element['name'],
        element['nodeI'],
        element['nodeJ'],
        'Steel',
        'MySection'
    )
    member = model.members[element['name']]
    print(f"   {element['name']}: {element['nodeI']} -> {element['nodeJ']}, L={member.L():.3f} m")

#%%
# Add supports
print("\nAdding supports:")
for node in data['nodes']:
    node_obj = model.nodes[node['name']]
    if node['support'] == 'pinned':
        model.def_support(node['name'], True, True, True, True, False, False)
        print(f"   {node['name']}: PINNED (DX=T, DY=T, DZ=T, RX=T, RY=F, RZ=F)")
    elif node['support'] == 'roller-x':
        model.def_support(node['name'], False, True, True, True, False, False)
        print(f"   {node['name']}: ROLLER-X (DX=F, DY=T, DZ=T, RX=T, RY=F, RZ=F)")

#%%
# Add loads
print("\nAdding loads:")

# Nodal loads
for load in data['loads']['nodal']:
    node_name = load['node']
    fx = float(load['fx']) * 1000  # kN to N
    fy = float(load['fy']) * 1000
    mz = float(load['mz']) * 1000

    if fx != 0:
        model.add_node_load(node_name, 'FX', fx)
        print(f"   Nodal: {node_name} FX={fx/1000} kN")
    if fy != 0:
        model.add_node_load(node_name, 'FY', fy)
        print(f"   Nodal: {node_name} FY={fy/1000} kN")
    if mz != 0:
        model.add_node_load(node_name, 'MZ', mz)
        print(f"   Nodal: {node_name} MZ={mz/1000} kNm")

# Distributed loads
for load in data['loads']['distributed']:
    member_name = load['element']
    direction = load['direction']
    w1 = float(load['w1']) * 1000  # kN/m to N/m
    w2 = float(load['w2']) * 1000
    x1 = float(load.get('x1', 0))
    x2 = float(load.get('x2', model.members[member_name].L()))

    model.add_member_dist_load(member_name, direction, w1, w2, x1, x2)
    print(f"   Distributed: {member_name} {direction}, w1={w1/1000} kN/m, w2={w2/1000} kN/m, x1={x1}m, x2={x2}m")

# Element point loads
for load in data['loads']['elementPoint']:
    member_name = load['element']
    direction = load['direction']
    P = float(load['P']) * 1000  # kN to N
    x = float(load.get('x'))
    load_case = load.get('load_case')

    model.add_member_pt_load(member_name, direction, P, x,load_case)
    print(f"   Point: {member_name} {direction}, P={P/1000} kN at x={x}m")


#%%
# Inspect model before analysis
print("\n" + "=" * 80)
print("MODEL INSPECTION BEFORE ANALYSIS")
print("=" * 80)

print("\nNodes with supports:")
print(f"{'Name':<10} {'X':>10} {'Y':>10} {'Z':>10} {'DX':>5} {'DY':>5} {'DZ':>5} {'RX':>5} {'RY':>5} {'RZ':>5}")
print("-" * 80)
for name, node in model.nodes.items():
    dx = 'T' if node.support_DX else 'F'
    dy = 'T' if node.support_DY else 'F'
    dz = 'T' if node.support_DZ else 'F'
    rx = 'T' if node.support_RX else 'F'
    ry = 'T' if node.support_RY else 'F'
    rz = 'T' if node.support_RZ else 'F'
    print(f"{name:<10} {node.X:>10.3f} {node.Y:>10.3f} {node.Z:>10.3f} {dx:>5} {dy:>5} {dz:>5} {rx:>5} {ry:>5} {rz:>5}")

#%%
# Check degrees of freedom
print("\n" + "=" * 80)
print("DEGREES OF FREEDOM ANALYSIS")
print("=" * 80)

n_nodes = len(model.nodes)
total_dofs = n_nodes * 6  # 6 DOFs per node in 3D

constrained_dofs = 0
for node in model.nodes.values():
    if node.support_DX: constrained_dofs += 1
    if node.support_DY: constrained_dofs += 1
    if node.support_DZ: constrained_dofs += 1
    if node.support_RX: constrained_dofs += 1
    if node.support_RY: constrained_dofs += 1
    if node.support_RZ: constrained_dofs += 1

free_dofs = total_dofs - constrained_dofs

print(f"Total nodes: {n_nodes}")
print(f"Total DOFs: {total_dofs}")
print(f"Constrained DOFs: {constrained_dofs}")
print(f"Free DOFs: {free_dofs}")

# Check for mechanism (2D beam in XY plane)
print("\n2D Frame Check (XY plane):")
print("  Required constraints for statically determinate 2D beam:")
print("  - At least 3 constraints total (2 at one end, 1 at other)")
print("  - Must prevent rigid body motion in X, Y, and rotation about Z")

# Count relevant constraints for 2D analysis
n1_constraints = 0
n2_constraints = 0
for name, node in model.nodes.items():
    count = 0
    if node.support_DX: count += 1
    if node.support_DY: count += 1
    if node.support_RZ: count += 1  # Rotation about Z axis (in-plane rotation)

    if name == 'N1':
        n1_constraints = count
    elif name == 'N2':
        n2_constraints = count

print(f"  N1 constraints (DX, DY, RZ): {n1_constraints}")
print(f"  N2 constraints (DX, DY, RZ): {n2_constraints}")
print(f"  Total 2D constraints: {n1_constraints + n2_constraints}")

if n1_constraints + n2_constraints < 3:
    print("  ⚠️  WARNING: Insufficient constraints! Structure is a mechanism.")
elif n1_constraints + n2_constraints == 3:
    print("  ✓ Statically determinate structure")
else:
    print("  ✓ Statically indeterminate structure (stable)")

#%%
# Try to analyze
print("\n" + "=" * 80)
print("RUNNING ANALYSIS")
print("=" * 80)

try:
    model.analyze(check_statics=True)
    print("✓ Analysis completed successfully!")

    # Print results
    print("\n" + "=" * 80)
    print("RESULTS")
    print("=" * 80)

    print("\nNode displacements:")
    for name, node in model.nodes.items():
        dx = node.DX['Combo 1']
        dy = node.DY['Combo 1']
        rz = node.RZ['Combo 1']
        print(f"  {name}: DX={dx*1000:.3f} mm, DY={dy*1000:.3f} mm, RZ={rz:.6f} rad")

    print("\nNode reactions:")
    for name, node in model.nodes.items():
        fx = getattr(node, 'RxnFX', {}).get('Combo 1', 0)
        fy = getattr(node, 'RxnFY', {}).get('Combo 1', 0)
        mz = getattr(node, 'RxnMZ', {}).get('Combo 1', 0)
        if fx != 0 or fy != 0 or mz != 0:
            print(f"  {name}: FX={fx/1000:.2f} kN, FY={fy/1000:.2f} kN, MZ={mz/1000:.2f} kNm")

    print("\nMember forces at midpoint:")
    for name, member in model.members.items():
        L = member.L()
        M = member.moment('Mz', L/2)
        V = member.shear('Fy', L/2)
        N = member.axial(L/2)
        print(f"  {name}: M={M/1000:.2f} kNm, V={V/1000:.2f} kN, N={N/1000:.2f} kN")

except Exception as e:
    print(f"✗ Analysis FAILED: {str(e)}")
    import traceback
    traceback.print_exc()

#%%
# Test with class wrapper
print("\n\n" + "=" * 80)
print("TESTING WITH PyNiteWebAnalyzer CLASS")
print("=" * 80)

from debug_pynite2 import PyNiteWebAnalyzer

analyzer = PyNiteWebAnalyzer()
analyzer.create_model(
    data.get('nodes', []),
    data.get('elements', []),
    data.get('loads', [])
)

analyzer.print_model_assembly()

try:
    success = analyzer.analyze()
    if success:
        print("✓ Class-based analysis completed successfully!")
        results = analyzer.get_results()
        print(f"\nN1 reactions: FX={results['nodes']['N1']['reactions']['FX']/1000:.2f} kN, FY={results['nodes']['N1']['reactions']['FY']/1000:.2f} kN")
        print(f"N2 reactions: FX={results['nodes']['N2']['reactions']['FX']/1000:.2f} kN, FY={results['nodes']['N2']['reactions']['FY']/1000:.2f} kN")
except Exception as e:
    print(f"✗ Class-based analysis FAILED: {str(e)}")
    import traceback
    traceback.print_exc()

#%%
# Compare models
print("\n\n" + "=" * 80)
print("COMPARING MODELS")
print("=" * 80)

print("\nModel 1 (Manual) vs Model 2 (Class):")

# Compare nodes
print("\nNode comparison:")
for name in model.nodes.keys():
    n1 = model.nodes[name]
    n2 = analyzer.model.nodes[name]

    match = (
        n1.X == n2.X and n1.Y == n2.Y and n1.Z == n2.Z and
        n1.support_DX == n2.support_DX and n1.support_DY == n2.support_DY and
        n1.support_DZ == n2.support_DZ and n1.support_RX == n2.support_RX and
        n1.support_RY == n2.support_RY and n1.support_RZ == n2.support_RZ
    )

    if match:
        print(f"  {name}: ✓ Match")
    else:
        print(f"  {name}: ✗ DIFFERENT!")
        print(f"    Manual: X={n1.X}, Y={n1.Y}, Z={n1.Z}, DX={n1.support_DX}, DY={n1.support_DY}, DZ={n1.support_DZ}")
        print(f"    Class:  X={n2.X}, Y={n2.Y}, Z={n2.Z}, DX={n2.support_DX}, DY={n2.support_DY}, DZ={n2.support_DZ}")

# Compare members
print("\nMember comparison:")
for name in model.members.keys():
    m1 = model.members[name]
    m2 = analyzer.model.members[name]

    match = (
        m1.i_node.name == m2.i_node.name and
        m1.j_node.name == m2.j_node.name and
        m1.material.name == m2.material.name and
        m1.section.name == m2.section.name
    )

    if match:
        print(f"  {name}: ✓ Match")
    else:
        print(f"  {name}: ✗ DIFFERENT!")
        print(f"    Manual: {m1.i_node.name}->{m1.j_node.name}, {m1.material.name}, {m1.section.name}")
        print(f"    Class:  {m2.i_node.name}->{m2.j_node.name}, {m2.material.name}, {m2.section.name}")
