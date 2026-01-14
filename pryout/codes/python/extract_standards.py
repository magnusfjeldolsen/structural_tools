"""
EC2 Part 4 Standards Extractor

This script processes EC2 Part 4-1 and 4-2 text files to extract:
- Failure modes
- Formulas and equations
- Material factors (gamma factors)
- Safety factors
- Design requirements

Output is written to a markdown specification file for code generation.
"""

import re
from pathlib import Path
from typing import List, Dict, Tuple
from dataclasses import dataclass, field


@dataclass
class Formula:
    """Represents a formula extracted from the standard"""
    formula_id: str  # e.g., "5.2.3.1(1)"
    section: str  # e.g., "5.2.3.1 Steel failure"
    formula_text: str
    context: str  # Surrounding text explaining the formula
    standard: str  # "EC2-4-1" or "EC2-4-2"


@dataclass
class FailureMode:
    """Represents a failure mode for fasteners"""
    name: str
    section: str
    description: str
    formulas: List[Formula] = field(default_factory=list)
    factors: Dict[str, str] = field(default_factory=dict)
    standard: str = ""


@dataclass
class Factor:
    """Represents a material or safety factor"""
    symbol: str
    name: str
    value: str
    section: str
    standard: str


class StandardsExtractor:
    """Extract fastener design information from EC2 Part 4 standards"""

    def __init__(self, file_path: str, standard_name: str):
        self.file_path = Path(file_path)
        self.standard_name = standard_name
        self.content = ""
        self.lines = []

    def load_file(self):
        """Load the text file"""
        with open(self.file_path, 'r', encoding='utf-8') as f:
            self.content = f.read()
            self.lines = self.content.split('\n')
        print(f"Loaded {len(self.lines)} lines from {self.file_path.name}")

    def find_table_of_contents(self) -> List[Tuple[str, int]]:
        """Extract table of contents entries"""
        toc_entries = []
        in_toc = False

        for i, line in enumerate(self.lines):
            # More flexible TOC detection
            if re.search(r'Contents\s*$', line, re.IGNORECASE):
                in_toc = True
                continue

            if in_toc:
                # Look for section numbers - more flexible pattern
                # Match "5.2.1" or "5 " followed by text
                match = re.match(r'^(\d+(?:\.\d+)*)\s+(.+?)(?:\s*\.{2,}|\s*\d+\s*$|$)', line)
                if match:
                    section_num = match.group(1)
                    section_name = match.group(2).strip()
                    if section_name:  # Only add if we have a name
                        toc_entries.append((f"{section_num} {section_name}", i))

                # Stop when we hit a major section heading or new page
                if re.match(r'^(Foreword|1\s+Scope|Introduction)', line):
                    break

                # Stop after reasonable number of lines
                if len(toc_entries) > 100:
                    break

        return toc_entries

    def find_failure_modes(self) -> List[FailureMode]:
        """Extract failure mode descriptions"""
        failure_modes = []

        # Common failure mode keywords
        keywords = [
            r'steel failure',
            r'pull-?out failure',
            r'concrete cone failure',
            r'concrete edge failure',
            r'splitting failure',
            r'blow-?out failure',
            r'pry-?out failure',
            r'local concrete failure',
            r'concrete breakout',
        ]

        for i, line in enumerate(self.lines):
            for keyword in keywords:
                if re.search(keyword, line, re.IGNORECASE):
                    # Extract context (previous and next 10 lines)
                    start = max(0, i - 5)
                    end = min(len(self.lines), i + 15)
                    context = '\n'.join(self.lines[start:end])

                    # Try to find section number
                    section = self._find_section_number(i)

                    failure_mode = FailureMode(
                        name=keyword.replace(r'\s+', ' ').replace('?', ''),
                        section=section,
                        description=context,
                        standard=self.standard_name
                    )
                    failure_modes.append(failure_mode)
                    break

        return failure_modes

    def find_formulas(self) -> List[Formula]:
        """Extract formulas with their reference numbers"""
        formulas = []

        # Pattern for formula references like (5.2), (5.2a), (Eq. 5.2), etc.
        formula_patterns = [
            r'\((\d+\.[\d.]+[a-z]?)\)',  # (5.2.3.1) or (5.2a)
            r'\(Eq\.\s*(\d+\.[\d.]+[a-z]?)\)',  # (Eq. 5.2)
            r'Equation\s+(\d+\.[\d.]+[a-z]?)',  # Equation 5.2
        ]

        for i, line in enumerate(self.lines):
            for pattern in formula_patterns:
                matches = re.finditer(pattern, line, re.IGNORECASE)
                for match in matches:
                    formula_id = match.group(1)

                    # Extract context
                    start = max(0, i - 3)
                    end = min(len(self.lines), i + 10)
                    context = '\n'.join(self.lines[start:end])

                    # Find section
                    section = self._find_section_number(i)

                    formula = Formula(
                        formula_id=formula_id,
                        section=section,
                        formula_text=line.strip(),
                        context=context,
                        standard=self.standard_name
                    )
                    formulas.append(formula)

        return formulas

    def find_factors(self) -> List[Factor]:
        """Extract material and safety factors"""
        factors = []

        # Common factor patterns
        factor_patterns = [
            r'γ[_\s]*(M[sc]|c|s|inst)',  # γMs, γMc, γc, γs, γinst
            r'α[_\s]*([a-z]+)',  # various alpha factors
            r'β[_\s]*([a-z]+)',  # various beta factors
            r'ψ[_\s]*([a-z0-9]+)',  # psi factors
            r'partial\s+factor',
            r'safety\s+factor',
            r'material\s+factor',
        ]

        for i, line in enumerate(self.lines):
            for pattern in factor_patterns:
                matches = re.finditer(pattern, line, re.IGNORECASE)
                for match in matches:
                    # Extract context
                    start = max(0, i - 2)
                    end = min(len(self.lines), i + 5)
                    context = '\n'.join(self.lines[start:end])

                    section = self._find_section_number(i)

                    factor = Factor(
                        symbol=match.group(0),
                        name=line.strip(),
                        value=context,
                        section=section,
                        standard=self.standard_name
                    )
                    factors.append(factor)

        return factors

    def _find_section_number(self, line_index: int) -> str:
        """Find the section number for a given line"""
        # Search backwards for section heading
        for i in range(line_index, max(0, line_index - 50), -1):
            line = self.lines[i]
            match = re.match(r'^(\d+\.[\d.]*)\s+[A-Z]', line)
            if match:
                return match.group(1)
        return "Unknown"

    def extract_all(self) -> Dict:
        """Extract all information from the standard"""
        self.load_file()

        print(f"\nProcessing {self.standard_name}...")
        print("=" * 60)

        toc = self.find_table_of_contents()
        print(f"\nFound {len(toc)} table of contents entries")

        failure_modes = self.find_failure_modes()
        print(f"Found {len(failure_modes)} potential failure mode references")

        formulas = self.find_formulas()
        print(f"Found {len(formulas)} formula references")

        factors = self.find_factors()
        print(f"Found {len(factors)} factor references")

        return {
            'toc': toc,
            'failure_modes': failure_modes,
            'formulas': formulas,
            'factors': factors
        }


def write_markdown_spec(part_4_1_data: Dict, part_4_2_data: Dict, output_file: Path):
    """Write extracted data to markdown specification file"""

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("# EC2 Part 4 Fastener Design - Python Implementation Specification\n\n")
        f.write("This specification document outlines all formulas, failure modes, and factors\n")
        f.write("extracted from EC2 Part 4-1 and 4-2 for implementation in Python.\n\n")
        f.write("---\n\n")

        # Part 4-1
        f.write("## EC2 Part 4-1: General\n\n")
        f.write("### Table of Contents\n\n")
        for entry, _ in part_4_1_data['toc'][:20]:  # Limit to first 20
            f.write(f"- {entry}\n")

        f.write("\n### Failure Modes\n\n")
        for fm in part_4_1_data['failure_modes']:
            f.write(f"#### {fm.name} ({fm.section})\n\n")
            f.write(f"```\n{fm.description[:500]}...\n```\n\n")

        f.write("\n### Formulas (Sample)\n\n")
        for formula in part_4_1_data['formulas'][:30]:  # Sample
            f.write(f"#### Formula {formula.formula_id} - Section {formula.section}\n\n")
            f.write(f"```\n{formula.context[:300]}...\n```\n\n")

        f.write("\n### Material and Safety Factors (Sample)\n\n")
        unique_factors = {}
        for factor in part_4_1_data['factors']:
            if factor.symbol not in unique_factors:
                unique_factors[factor.symbol] = factor

        for symbol, factor in list(unique_factors.items())[:20]:
            f.write(f"- **{factor.symbol}** (Section {factor.section})\n")

        # Part 4-2
        f.write("\n\n---\n\n")
        f.write("## EC2 Part 4-2: Headed Fasteners\n\n")
        f.write("### Table of Contents\n\n")
        for entry, _ in part_4_2_data['toc'][:20]:
            f.write(f"- {entry}\n")

        f.write("\n### Failure Modes\n\n")
        for fm in part_4_2_data['failure_modes']:
            f.write(f"#### {fm.name} ({fm.section})\n\n")
            f.write(f"```\n{fm.description[:500]}...\n```\n\n")

        f.write("\n### Formulas (Sample)\n\n")
        for formula in part_4_2_data['formulas'][:30]:
            f.write(f"#### Formula {formula.formula_id} - Section {formula.section}\n\n")
            f.write(f"```\n{formula.context[:300]}...\n```\n\n")

        f.write("\n---\n\n")
        f.write("## Implementation Plan\n\n")
        f.write("### Required Python Classes/Functions\n\n")
        f.write("Based on the extracted information, the following structure is recommended:\n\n")
        f.write("""
1. **Base Classes**
   - `Fastener`: Base fastener class with geometry and material properties
   - `FastenerGroup`: Group of fasteners with layout geometry
   - `ConcreteProperties`: Concrete strength, thickness, edge distances
   - `SupplementaryReinforcement`: Reinforcement design parameters

2. **Failure Mode Calculators** (Each as separate class/function)
   - `SteelFailure`: Calculate steel tensile/shear capacity
   - `ConcreteBreakoutFailure`: Concrete cone failure (tension)
   - `ConcreteEdgeFailure`: Edge breakout failure
   - `ConcretePryoutFailure`: Pry-out failure (shear)
   - `ConcreteBlowoutFailure`: Blowout failure (near edge)
   - `PulloutFailure`: Pullout capacity
   - `SplittingFailure`: Concrete splitting
   - `LocalConcreteFailure`: Local bearing failure

3. **Factor Handlers**
   - `MaterialFactors`: γMs, γMc, γinst
   - `GeometryFactors`: α, β, ψ factors for spacing/edge effects
   - `SafetyFactors`: Partial safety factors

4. **Main Calculation Engine**
   - `FastenerDesign`: Main class to perform combined checks
   - Select which failure modes to check
   - Apply appropriate factors
   - Return governing failure mode and capacity

5. **Utilities**
   - `validate_geometry()`: Check minimum spacing, edge distances
   - `calculate_interaction()`: N-V interaction for combined loading
   - `apply_grout_correction()`: Adjust for grout thickness effects
""")

        f.write("\n### Next Steps\n\n")
        f.write("1. Review this specification document\n")
        f.write("2. Identify additional formulas needing detailed extraction\n")
        f.write("3. Create detailed formula extraction for each failure mode\n")
        f.write("4. Generate Python implementation with full docstrings\n")
        f.write("5. Create test cases and validation\n")


def main():
    """Main execution"""
    # File paths
    base_dir = Path(__file__).parent.parent
    part_4_1_file = base_dir / "1992-4-1.txt"
    part_4_2_file = base_dir / "1992-4-2.txt"
    output_file = base_dir / "FASTENER_SPEC.md"

    # Extract from Part 4-1
    extractor_4_1 = StandardsExtractor(part_4_1_file, "EC2-4-1")
    data_4_1 = extractor_4_1.extract_all()

    # Extract from Part 4-2
    extractor_4_2 = StandardsExtractor(part_4_2_file, "EC2-4-2")
    data_4_2 = extractor_4_2.extract_all()

    # Write specification
    print(f"\n{'=' * 60}")
    print("Writing specification document...")
    write_markdown_spec(data_4_1, data_4_2, output_file)
    print(f"[OK] Specification written to: {output_file}")
    print(f"\nReview the specification and then proceed with detailed implementation.")


if __name__ == "__main__":
    main()