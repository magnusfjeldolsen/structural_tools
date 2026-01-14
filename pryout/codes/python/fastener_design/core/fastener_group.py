"""
FastenerGroup class for EC2 Part 4 design

Represents a group of fasteners with layout geometry.
"""

from typing import List, Dict, Optional, Tuple
import math
from .fastener import Fastener


class FastenerGroup:
    """
    Represents a group of fasteners with layout geometry

    Attributes:
        fasteners: List of Fastener objects in the group
        s_x: Spacing in x-direction [mm]
        s_y: Spacing in y-direction [mm]
        c1: Edge distance in direction of load [mm]
        c2: Edge distance perpendicular to load [mm]
        c3: Edge distance (if applicable) [mm]
        c4: Edge distance (if applicable) [mm]
        layout: Layout description (e.g., '2x2', '1x4')
        n_rows: Number of rows
        n_cols: Number of columns

    Standard: EC2-4-1 Section 5.2, EC2-4-2 Section 6.2.5.2

    Example:
        >>> from fastener_design import Fastener, FastenerGroup
        >>> fastener = Fastener(16, 100, 500)
        >>> group = FastenerGroup(
        ...     fasteners=[fastener] * 4,
        ...     spacings={'sx': 200, 'sy': 200},
        ...     edge_distances={'c1': 150, 'c2': 150},
        ...     layout='2x2'
        ... )
    """

    def __init__(
        self,
        fasteners: List[Fastener],
        spacings: Dict[str, float],
        edge_distances: Dict[str, float],
        layout: Optional[str] = None
    ):
        """
        Initialize FastenerGroup

        Args:
            fasteners: List of Fastener objects
            spacings: Dictionary with spacing values
                     {'sx': 200, 'sy': 200} [mm]
            edge_distances: Dictionary with edge distances
                           {'c1': 150, 'c2': 150, ...} [mm]
            layout: Optional layout description (e.g., '2x2')

        Raises:
            ValueError: If inputs are invalid
        """
        if not fasteners:
            raise ValueError("FastenerGroup must contain at least one fastener")

        self.fasteners = fasteners
        self.n_fasteners = len(fasteners)

        # Extract spacings
        self.s_x = spacings.get('sx', 0.0)
        self.s_y = spacings.get('sy', 0.0)

        # Extract edge distances
        self.c1 = edge_distances.get('c1', 0.0)
        self.c2 = edge_distances.get('c2', 0.0)
        self.c3 = edge_distances.get('c3', None)
        self.c4 = edge_distances.get('c4', None)

        # Reference fastener (assume all same type)
        self.reference_fastener = fasteners[0]

        # Layout
        self.layout = layout
        self._infer_layout()

        # Validate
        self._validate()

    def _infer_layout(self) -> None:
        """Infer layout dimensions from number of fasteners"""
        if self.layout is None:
            # Try to infer layout
            n = self.n_fasteners
            if n == 1:
                self.layout = '1x1'
                self.n_rows = 1
                self.n_cols = 1
            elif n == 2:
                self.layout = '1x2' if self.s_x > 0 else '2x1'
                self.n_rows = 1 if self.s_x > 0 else 2
                self.n_cols = 2 if self.s_x > 0 else 1
            elif n == 4:
                self.layout = '2x2'
                self.n_rows = 2
                self.n_cols = 2
            else:
                # Assume single row
                self.layout = f'1x{n}'
                self.n_rows = 1
                self.n_cols = n
        else:
            # Parse layout string like '2x3'
            try:
                parts = self.layout.split('x')
                self.n_rows = int(parts[0])
                self.n_cols = int(parts[1])
            except:
                # Fallback
                self.n_rows = 1
                self.n_cols = self.n_fasteners

    def _validate(self) -> None:
        """
        Validate fastener group geometry

        Raises:
            ValueError: If geometry is invalid
        """
        # Check spacing requirements
        ref_fastener = self.reference_fastener
        s_min = 2.0 * ref_fastener.d  # Typical minimum spacing

        if self.s_x > 0 and self.s_x < s_min:
            import warnings
            warnings.warn(
                f"Spacing sx={self.s_x}mm is less than recommended minimum "
                f"{s_min}mm (2×d). Check code requirements."
            )

        if self.s_y > 0 and self.s_y < s_min:
            import warnings
            warnings.warn(
                f"Spacing sy={self.s_y}mm is less than recommended minimum "
                f"{s_min}mm (2×d). Check code requirements."
            )

        # Check edge distances
        c_min = 1.5 * ref_fastener.d  # Typical minimum edge distance

        for edge_name, edge_val in [('c1', self.c1), ('c2', self.c2)]:
            if edge_val > 0 and edge_val < c_min:
                import warnings
                warnings.warn(
                    f"Edge distance {edge_name}={edge_val}mm is less than "
                    f"recommended minimum {c_min}mm (1.5×d). Check requirements."
                )

    def get_max_spacing(self) -> float:
        """
        Get maximum spacing in group

        Returns:
            smax: Maximum spacing [mm]
        """
        return max(self.s_x, self.s_y) if (self.s_x > 0 or self.s_y > 0) else 0.0

    def get_min_edge_distance(self) -> float:
        """
        Get minimum edge distance in group

        Returns:
            cmin: Minimum edge distance [mm]
        """
        edges = [self.c1, self.c2]
        if self.c3 is not None:
            edges.append(self.c3)
        if self.c4 is not None:
            edges.append(self.c4)

        valid_edges = [c for c in edges if c > 0]
        return min(valid_edges) if valid_edges else 0.0

    def get_max_edge_distance(self) -> float:
        """
        Get maximum edge distance in group

        Returns:
            cmax: Maximum edge distance [mm]
        """
        edges = [self.c1, self.c2]
        if self.c3 is not None:
            edges.append(self.c3)
        if self.c4 is not None:
            edges.append(self.c4)

        valid_edges = [c for c in edges if c > 0]
        return max(valid_edges) if valid_edges else 0.0

    def calculate_projected_area_cone(self) -> Tuple[float, float]:
        """
        Calculate projected concrete area for cone failure

        Returns:
            (Ac_N, Ac_N0): Actual and reference projected areas [mm²]

        Standard: EC2-4-2 Section 6.2.5.2
        Formulas: (7), (8), (9) and Figures 3, 4

        Notes:
            - Ac_N0 = scr,N² = (3×hef)² = 9×hef² for single fastener
            - Ac_N accounts for overlapping cones and edge effects
        """
        hef = self.reference_fastener.hef
        scr_N = 3.0 * hef  # Characteristic spacing
        ccr_N = 1.5 * hef  # Characteristic edge distance

        # Reference area for single fastener (no edge effects)
        Ac_N0 = scr_N ** 2  # = 9 × hef²

        # Actual projected area (simplified calculation)
        # This is a basic implementation - full implementation needs
        # detailed geometry considering all fasteners and edges

        if self.n_fasteners == 1:
            # Single fastener
            # Consider edge effects
            c_actual = min(self.c1, self.c2) if (self.c1 > 0 and self.c2 > 0) else 0

            if c_actual > 0 and c_actual < ccr_N:
                # Edge effect reduces area
                # Simplified: Ac_N ≈ (1.5×hef + c1) × (1.5×hef + c2)
                Ac_N = (ccr_N + self.c1) * (ccr_N + self.c2)
            else:
                # No edge effect
                Ac_N = Ac_N0

        else:
            # Group of fasteners - simplified rectangular layout
            # Full implementation in calculations/geometry.py

            # Estimate based on layout
            if self.n_rows == 1:
                # Single row
                length = scr_N + (self.n_cols - 1) * self.s_x
                width = 2 * scr_N
            elif self.n_cols == 1:
                # Single column
                length = 2 * scr_N
                width = scr_N + (self.n_rows - 1) * self.s_y
            else:
                # Rectangular array
                length = scr_N + (self.n_cols - 1) * self.s_x
                width = scr_N + (self.n_rows - 1) * self.s_y

            Ac_N = length * width

            # Apply edge effects (simplified)
            if self.c1 > 0 and self.c1 < ccr_N:
                Ac_N *= (self.c1 / ccr_N)
            if self.c2 > 0 and self.c2 < ccr_N:
                Ac_N *= (self.c2 / ccr_N)

        return Ac_N, Ac_N0

    def to_dict(self) -> Dict:
        """
        Convert fastener group to dictionary

        Returns:
            Dictionary with all group properties
        """
        return {
            'n_fasteners': self.n_fasteners,
            'layout': self.layout,
            'n_rows': self.n_rows,
            'n_cols': self.n_cols,
            'sx': self.s_x,
            'sy': self.s_y,
            'c1': self.c1,
            'c2': self.c2,
            'c3': self.c3,
            'c4': self.c4,
            'max_spacing': self.get_max_spacing(),
            'min_edge': self.get_min_edge_distance(),
            'max_edge': self.get_max_edge_distance()
        }

    def __repr__(self) -> str:
        """String representation"""
        return (
            f"FastenerGroup(n={self.n_fasteners}, layout='{self.layout}', "
            f"sx={self.s_x}mm, sy={self.s_y}mm)"
        )

    def __str__(self) -> str:
        """Human-readable string"""
        return (
            f"Fastener Group: {self.layout} layout with {self.n_fasteners} fasteners, "
            f"spacing={self.s_x}×{self.s_y}mm, edges=c1:{self.c1}mm c2:{self.c2}mm"
        )
