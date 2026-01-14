"""
Fastener class for EC2 Part 4 design

Represents a single fastener with geometry and material properties.
"""

from typing import Optional, Dict
import math


class Fastener:
    """
    Represents a single fastener with geometry and material properties

    Attributes:
        d: Fastener diameter [mm]
        hef: Effective embedment depth [mm]
        fuk: Characteristic tensile strength of steel [N/mm² = MPa]
        As: Stressed cross-sectional area [mm²]
        fastener_type: Type of fastener
        d_head: Head diameter for headed fasteners [mm]
        material_grade: Steel material grade (e.g., '8.8', '5.8')

    Standard: EC2-4-1, EC2-4-2

    Example:
        >>> fastener = Fastener(
        ...     diameter=16,
        ...     embedment_depth=100,
        ...     steel_grade=500,
        ...     area=157,
        ...     fastener_type='headed'
        ... )
    """

    # Valid fastener types per EC2-4-1
    VALID_TYPES = ['headed', 'expansion', 'bonded', 'screw', 'undercut']

    def __init__(
        self,
        diameter: float,
        embedment_depth: float,
        steel_grade: float,
        area: Optional[float] = None,
        fastener_type: str = 'headed',
        d_head: Optional[float] = None,
        material_grade: Optional[str] = None
    ):
        """
        Initialize Fastener

        Args:
            diameter: Fastener diameter d [mm]
            embedment_depth: Effective embedment depth hef [mm]
            steel_grade: Characteristic tensile strength fuk [N/mm²]
            area: Stressed cross-sectional area As [mm²]
                  If None, calculated from diameter (π×d²/4)
            fastener_type: Type of fastener (default 'headed')
            d_head: Head diameter [mm] (for headed fasteners)
            material_grade: Material grade designation (e.g., '8.8')

        Raises:
            ValueError: If inputs are invalid
        """
        self.d = float(diameter)
        self.hef = float(embedment_depth)
        self.fuk = float(steel_grade)

        # Calculate area if not provided
        if area is None:
            self.As = math.pi * (self.d ** 2) / 4
        else:
            self.As = float(area)

        # Fastener type
        if fastener_type not in self.VALID_TYPES:
            raise ValueError(
                f"Invalid fastener_type '{fastener_type}'. "
                f"Must be one of {self.VALID_TYPES}"
            )
        self.fastener_type = fastener_type

        # Optional properties
        self.d_head = float(d_head) if d_head is not None else None
        self.material_grade = material_grade

        # Validate geometry
        self._validate()

    def _validate(self) -> None:
        """
        Validate fastener geometry

        Raises:
            ValueError: If geometry is invalid
        """
        if self.d <= 0:
            raise ValueError(f"Diameter must be positive, got {self.d} mm")

        if self.hef <= 0:
            raise ValueError(f"Embedment depth must be positive, got {self.hef} mm")

        if self.fuk <= 0:
            raise ValueError(f"Steel grade must be positive, got {self.fuk} N/mm²")

        if self.As <= 0:
            raise ValueError(f"Cross-sectional area must be positive, got {self.As} mm²")

        # Typical range checks (warning, not error)
        if self.d < 6 or self.d > 100:
            import warnings
            warnings.warn(
                f"Fastener diameter {self.d} mm is outside typical range (6-100 mm). "
                f"Check code applicability."
            )

        if self.hef < 20:
            import warnings
            warnings.warn(
                f"Embedment depth {self.hef} mm is very shallow. "
                f"Check minimum requirements."
            )

        # For headed fasteners, check head diameter
        if self.fastener_type == 'headed' and self.d_head is not None:
            if self.d_head <= self.d:
                raise ValueError(
                    f"Head diameter {self.d_head} mm must be larger than "
                    f"fastener diameter {self.d} mm"
                )

    def get_effective_area(self) -> float:
        """
        Get stressed cross-sectional area

        Returns:
            As: Stressed area [mm²]

        Standard: EC2-4-2 Section 6.2.3
        """
        return self.As

    def get_characteristic_spacing(self) -> float:
        """
        Get characteristic spacing scr,N for concrete cone

        scr,N = 3 × hef

        Returns:
            scr_N: Characteristic spacing [mm]

        Standard: EC2-4-2 Section 6.2.5.2
        """
        return 3.0 * self.hef

    def get_characteristic_edge_distance(self) -> float:
        """
        Get characteristic edge distance ccr,N for concrete cone

        ccr,N = 1.5 × hef

        Returns:
            ccr_N: Characteristic edge distance [mm]

        Standard: EC2-4-2 Section 6.2.5.2
        """
        return 1.5 * self.hef

    def to_dict(self) -> Dict:
        """
        Convert fastener to dictionary

        Returns:
            Dictionary with all fastener properties
        """
        return {
            'd': self.d,
            'hef': self.hef,
            'fuk': self.fuk,
            'As': self.As,
            'fastener_type': self.fastener_type,
            'd_head': self.d_head,
            'material_grade': self.material_grade,
            'scr_N': self.get_characteristic_spacing(),
            'ccr_N': self.get_characteristic_edge_distance()
        }

    def __repr__(self) -> str:
        """String representation"""
        return (
            f"Fastener(d={self.d}mm, hef={self.hef}mm, "
            f"fuk={self.fuk}MPa, type='{self.fastener_type}')"
        )

    def __str__(self) -> str:
        """Human-readable string"""
        return (
            f"{self.fastener_type.capitalize()} Fastener: "
            f"M{self.d}×{self.hef}mm, fuk={self.fuk}MPa"
        )
