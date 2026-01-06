"""
Detailed Formula Extractor for EC2 Part 4 Standards

This script systematically extracts all formulas, factors, and requirements
from specific sections of EC2 Part 4-1 and 4-2 for fastener design.
"""

from pathlib import Path
from typing import List, Dict, Tuple
import re


class DetailedExtractor:
    """Extract detailed formulas from specific sections"""

    def __init__(self, file_path: str, standard_name: str):
        self.file_path = Path(file_path)
        self.standard_name = standard_name
        self.lines = []

    def load_file(self):
        """Load text file"""
        with open(self.file_path, 'r', encoding='utf-8') as f:
            self.lines = f.readlines()
        print(f"Loaded {len(self.lines)} lines from {self.file_path.name}")

    def extract_section(self, start_pattern: str, end_pattern: str = None,
                       max_lines: int = 500) -> Tuple[List[str], int, int]:
        """
        Extract a section between start and end patterns

        Returns: (section_lines, start_line_num, end_line_num)
        """
        section_lines = []
        start_idx = None
        end_idx = None

        # Find start
        for i, line in enumerate(self.lines):
            if re.search(start_pattern, line):
                start_idx = i
                break

        if start_idx is None:
            return [], -1, -1

        # Find end or use max_lines
        if end_pattern:
            for i in range(start_idx + 1, min(start_idx + max_lines, len(self.lines))):
                if re.search(end_pattern, self.lines[i]):
                    end_idx = i
                    break

        if end_idx is None:
            end_idx = min(start_idx + max_lines, len(self.lines))

        section_lines = [line.rstrip() for line in self.lines[start_idx:end_idx]]

        return section_lines, start_idx, end_idx

    def find_formulas_in_section(self, section_lines: List[str], section_name: str) -> List[Dict]:
        """Extract formulas from a section"""
        formulas = []

        i = 0
        while i < len(section_lines):
            line = section_lines[i]

            # Look for formula patterns:
            # 1. Lines with = signs (equations)
            # 2. Lines with formula references like (6.1), (6.1a)
            # 3. Mathematical symbols

            # Check for equation lines
            if '=' in line and any(c in line for c in ['≤', '≥', '×', '√', 'N', 'V', 'M', 'f', 'γ', 'ψ', 'α', 'β']):
                formula_context = []
                # Get context (5 lines before, current, 10 lines after)
                start = max(0, i - 5)
                end = min(len(section_lines), i + 10)
                formula_context = section_lines[start:end]

                formulas.append({
                    'section': section_name,
                    'line_in_section': i,
                    'formula_line': line.strip(),
                    'context': '\n'.join(formula_context),
                    'standard': self.standard_name
                })

            # Check for formula reference numbers like (6.1) or (6.1a)
            formula_ref_match = re.search(r'\((\d+\.[\d.]+[a-z]?)\)', line)
            if formula_ref_match:
                formula_id = formula_ref_match.group(1)
                # Get broader context
                start = max(0, i - 3)
                end = min(len(section_lines), i + 8)
                context = section_lines[start:end]

                formulas.append({
                    'section': section_name,
                    'formula_id': formula_id,
                    'line_in_section': i,
                    'formula_line': line.strip(),
                    'context': '\n'.join(context),
                    'standard': self.standard_name
                })

            i += 1

        return formulas


def create_comprehensive_spec():
    """Create comprehensive specification document"""

    base_dir = Path(__file__).parent.parent
    part_4_1_file = base_dir / "1992-4-1.txt"
    part_4_2_file = base_dir / "1992-4-2.txt"

    output_md = base_dir / "FASTENER_DESIGN_SPEC.md"

    # Initialize extractors
    ext_4_1 = DetailedExtractor(part_4_1_file, "EC2-4-1")
    ext_4_1.load_file()

    ext_4_2 = DetailedExtractor(part_4_2_file, "EC2-4-2")
    ext_4_2.load_file()

    # Define sections to extract from Part 4-2 (the main design formulas)
    # Using patterns that avoid matching table of contents
    part_4_2_sections = [
        ("6.2.3 Steel failure of fastener", r'^6\.2\.3\s+Steel failure of fastener\s*$', r'^6\.2\.4\s+Pull'),
        ("6.2.4 Pull-out failure", r'^6\.2\.4\s+Pull-out failure', r'^6\.2\.5\s+Concrete cone'),
        ("6.2.5 Concrete cone failure", r'^6\.2\.5\s+Concrete cone failure\s*$', r'^6\.2\.6\s+Splitting'),
        ("6.2.6 Splitting failure", r'^6\.2\.6\s+Splitting failure\s*$', r'^6\.2\.7\s+Blow'),
        ("6.2.7 Blow-out failure", r'^6\.2\.7\s+Blow-out failure\s*$', r'^6\.2\.8\s+Steel failure'),
        ("6.3.3 Steel failure (shear)", r'^6\.3\.3\s+Steel failure of fastener\s*$', r'^6\.3\.4\s+Concrete pry'),
        ("6.3.4 Concrete pry-out failure", r'^6\.3\.4\s+Concrete pry-out', r'^6\.3\.5\s+Concrete edge'),
        ("6.3.5 Concrete edge failure", r'^6\.3\.5\s+Concrete edge failure\s*$', r'^6\.4\s+Combined'),
    ]

    # Start building markdown
    md_lines = []
    md_lines.append("# EC2 Part 4 Fastener Design - Comprehensive Python Implementation Specification\n")
    md_lines.append(f"Generated from: {part_4_1_file.name} and {part_4_2_file.name}\n")
    md_lines.append("---\n\n")

    md_lines.append("## Overview\n\n")
    md_lines.append("This specification provides ALL formulas, factors, and requirements extracted from\n")
    md_lines.append("EC2 Part 4-1 (General) and Part 4-2 (Headed Fasteners) for implementing a complete\n")
    md_lines.append("Python-based fastener design calculation system.\n\n")

    md_lines.append("### Failure Modes for Tension Loading\n\n")
    md_lines.append("1. **Steel failure** (Section 6.2.3) - Tensile failure of fastener steel\n")
    md_lines.append("2. **Pull-out failure** (Section 6.2.4) - Fastener pulls out of concrete\n")
    md_lines.append("3. **Concrete cone failure** (Section 6.2.5) - Concrete breakout cone\n")
    md_lines.append("4. **Splitting failure** (Section 6.2.6) - Concrete splits during installation or loading\n")
    md_lines.append("5. **Blow-out failure** (Section 6.2.7) - Near-edge spalling failure\n\n")

    md_lines.append("### Failure Modes for Shear Loading\n\n")
    md_lines.append("1. **Steel failure** (Section 6.3.3) - Shear failure of fastener steel\n")
    md_lines.append("2. **Concrete pry-out failure** (Section 6.3.4) - Concrete spall opposite to load direction\n")
    md_lines.append("3. **Concrete edge failure** (Section 6.3.5) - Edge breakout under shear\n\n")

    md_lines.append("---\n\n")
    md_lines.append("## Part 4-2: Headed Fasteners - Design Formulas\n\n")

    # Extract each section
    print("\nExtracting sections from Part 4-2...")
    print("=" * 70)

    all_formulas = {}

    for section_name, start_pattern, end_pattern in part_4_2_sections:
        print(f"\nProcessing: {section_name}")

        section_lines, start_idx, end_idx = ext_4_2.extract_section(
            start_pattern, end_pattern, max_lines=600
        )

        if not section_lines:
            print(f"  [!] Section not found")
            continue

        print(f"  Lines {start_idx}-{end_idx} ({len(section_lines)} lines)")

        # Extract formulas from this section
        formulas = ext_4_2.find_formulas_in_section(section_lines, section_name)
        all_formulas[section_name] = {
            'lines': section_lines,
            'formulas': formulas,
            'line_range': (start_idx, end_idx)
        }

        print(f"  Found {len(formulas)} formula references")

        # Write to markdown
        md_lines.append(f"### {section_name}\n\n")
        md_lines.append(f"**Location**: Lines {start_idx}-{end_idx} in {ext_4_2.file_path.name}\n\n")

        # Write full section content
        md_lines.append("#### Full Section Content\n\n")
        md_lines.append("```\n")
        for i, line in enumerate(section_lines[:200]):  # Limit to 200 lines per section
            md_lines.append(f"{i:4d} | {line}\n")
        if len(section_lines) > 200:
            md_lines.append(f"... ({len(section_lines) - 200} more lines)\n")
        md_lines.append("```\n\n")

        # Write extracted formulas
        if formulas:
            md_lines.append(f"#### Extracted Formulas ({len(formulas)} found)\n\n")
            for j, formula in enumerate(formulas[:20], 1):  # Show first 20
                md_lines.append(f"**Formula {j}**")
                if 'formula_id' in formula:
                    md_lines.append(f" - Reference ({formula['formula_id']})")
                md_lines.append("\n\n")
                md_lines.append("```\n")
                md_lines.append(f"{formula['context']}\n")
                md_lines.append("```\n\n")

    # Add Python implementation structure
    md_lines.append("\n---\n\n")
    md_lines.append("## Recommended Python Implementation Structure\n\n")

    md_lines.append("### 1. Core Classes\n\n")
    md_lines.append("""```python
class Fastener:
    \"\"\"Base fastener with geometry and material properties\"\"\"
    def __init__(self, diameter, embedment_depth, steel_grade, ...):
        self.d = diameter  # Fastener diameter [mm]
        self.hef = embedment_depth  # Effective embedment depth [mm]
        self.fuk = steel_grade  # Characteristic tensile strength [MPa]
        # ... other properties

class FastenerGroup:
    \"\"\"Group of fasteners with spacing and edge distances\"\"\"
    def __init__(self, fasteners: List[Fastener], spacings, edge_distances):
        self.fasteners = fasteners
        self.s = spacings  # Spacing between fasteners [mm]
        self.c = edge_distances  # Edge distances [mm]

class ConcreteProperties:
    \"\"\"Concrete material properties\"\"\"
    def __init__(self, fck, h, cracked=False):
        self.fck = fck  # Characteristic cylinder strength [MPa]
        self.h = h  # Member thickness [mm]
        self.cracked = cracked  # Cracked/non-cracked concrete
```\n\n""")

    md_lines.append("### 2. Failure Mode Functions\n\n")
    md_lines.append("Each failure mode should be implemented as a separate function/class:\n\n")

    md_lines.append("""```python
def steel_failure_tension(fastener: Fastener, gamma_Ms=1.2) -> float:
    \"\"\"
    Calculate steel failure capacity in tension

    Standard: EC2-4-2 Section 6.2.3
    Formula: (6.1) or similar

    Args:
        fastener: Fastener object
        gamma_Ms: Partial factor for steel (default 1.2)

    Returns:
        NRk_s: Characteristic resistance [N]
    \"\"\"
    pass

def concrete_cone_failure(fastener: Fastener, concrete: ConcreteProperties,
                         group: FastenerGroup = None, gamma_Mc=1.5) -> float:
    \"\"\"
    Calculate concrete cone failure capacity

    Standard: EC2-4-2 Section 6.2.5
    Formulas: Multiple formulas for geometry effects

    Args:
        fastener: Fastener properties
        concrete: Concrete properties
        group: Optional fastener group for spacing effects
        gamma_Mc: Partial factor for concrete

    Returns:
        NRk_c: Characteristic resistance [N]
    \"\"\"
    pass

def concrete_edge_failure_shear(fastener: Fastener, concrete: ConcreteProperties,
                               edge_distance: float, gamma_Mc=1.5) -> float:
    \"\"\"
    Calculate concrete edge failure under shear

    Standard: EC2-4-2 Section 6.3.5

    Args:
        fastener: Fastener properties
        concrete: Concrete properties
        edge_distance: Distance to edge parallel to load [mm]
        gamma_Mc: Partial factor

    Returns:
        VRk_c: Characteristic shear resistance [N]
    \"\"\"
    pass

# Similar functions for:
# - pullout_failure()
# - splitting_failure()
# - blowout_failure()
# - steel_failure_shear()
# - pryout_failure()
```\n\n""")

    md_lines.append("### 3. Main Design Class\n\n")
    md_lines.append("""```python
class FastenerDesign:
    \"\"\"Main class to perform fastener design checks\"\"\"

    def __init__(self, fastener, concrete, loading, edge_distances, spacings=None):
        self.fastener = fastener
        self.concrete = concrete
        self.NEd = loading.get('tension', 0)  # Design tension [N]
        self.VEd = loading.get('shear', 0)  # Design shear [N]
        self.edge_distances = edge_distances
        self.spacings = spacings

    def check_tension(self, failure_modes='all'):
        \"\"\"
        Check all or specified tension failure modes

        Returns dict with capacity for each mode and governing mode
        \"\"\"
        results = {}

        if 'steel' in failure_modes or failure_modes == 'all':
            results['steel'] = steel_failure_tension(self.fastener)

        if 'cone' in failure_modes or failure_modes == 'all':
            results['cone'] = concrete_cone_failure(...)

        # ... check all modes

        governing = min(results, key=results.get)
        return {'capacities': results, 'governing': governing}

    def check_shear(self, failure_modes='all'):
        \"\"\"Check shear failure modes\"\"\"
        pass

    def check_combined(self):
        \"\"\"Check tension-shear interaction\"\"\"
        pass
```\n\n""")

    md_lines.append("### 4. Next Steps for Implementation\n\n")
    md_lines.append("1. Review all extracted formulas in sections above\n")
    md_lines.append("2. For each formula, identify:\n")
    md_lines.append("   - All input parameters\n")
    md_lines.append("   - All psi/alpha/beta factors and how they're calculated\n")
    md_lines.append("   - Units for all quantities\n")
    md_lines.append("   - Conditions of applicability\n")
    md_lines.append("3. Implement each formula as a Python function with:\n")
    md_lines.append("   - Complete docstring citing standard section\n")
    md_lines.append("   - Type hints\n")
    md_lines.append("   - Input validation\n")
    md_lines.append("   - Unit tests\n")
    md_lines.append("4. Create validation examples from standard worked examples\n")
    md_lines.append("5. Build user interface for input/output\n\n")

    # Write output
    print(f"\n{'=' * 70}")
    print("Writing comprehensive specification...")

    with open(output_md, 'w', encoding='utf-8') as f:
        f.writelines(md_lines)

    print(f"[OK] Written to: {output_md}")
    print(f"Total sections extracted: {len(all_formulas)}")
    print(f"Total formulas found: {sum(len(v['formulas']) for v in all_formulas.values())}")
    print("\nNext: Review the specification and implement Python functions for each formula.")


if __name__ == "__main__":
    create_comprehensive_spec()
