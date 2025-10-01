"""
Create a minimal Pyodide-compatible version of PyNite
This script copies only the essential PyNite files needed for browser-based analysis
"""
import os
import shutil
import site

def create_minimal_pynite():
    # Find PyNite installation
    site_packages = site.getsitepackages()[1]
    pynite_source = os.path.join(site_packages, 'Pynite')

    if not os.path.exists(pynite_source):
        print(f"Error: PyNite not found at {pynite_source}")
        print("Install PyNite first: pip install PyNiteFEA")
        return

    # Create output directory
    output_dir = 'Pynite_minimal'
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(output_dir)

    # Essential files needed for basic FEA (no visualization)
    essential_files = [
        'FEModel3D.py',
        'Node3D.py',
        'Member3D.py',
        'Spring3D.py',
        'Plate3D.py',
        'Quad3D.py',
        'Material.py',
        'Section.py',
        'LoadCombo.py',
        'Mesh.py',
        'Rendering.py',  # May have some utilities
        'Analysis.py',
    ]

    # Copy essential files
    for filename in essential_files:
        src = os.path.join(pynite_source, filename)
        if os.path.exists(src):
            dst = os.path.join(output_dir, filename)
            shutil.copy2(src, dst)
            print(f"Copied {filename}")
        else:
            print(f"Warning: {filename} not found")

    # Create a minimal __init__.py without pip imports
    init_content = """# Minimal PyNite for Pyodide (browser environment)
# This version excludes visualization and pip dependencies

from Pynite.FEModel3D import FEModel3D

__version__ = "1.4.0-pyodide"
"""

    with open(os.path.join(output_dir, '__init__.py'), 'w') as f:
        f.write(init_content)

    print(f"\nMinimal PyNite created in {output_dir}/")
    print("Now create a wheel file:")
    print(f"  cd {output_dir}")
    print("  # Create setup.py and build wheel")

if __name__ == '__main__':
    create_minimal_pynite()
