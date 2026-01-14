"""
ConcreteProperties class for EC2 Part 4 design

Represents concrete member properties and characteristics.
"""

from typing import Optional, Dict


class ConcreteProperties:
    """
    Concrete member properties

    Attributes:
        fck: Characteristic cylinder strength [N/mm² = MPa]
        fck_cube: Characteristic cube strength [N/mm² = MPa]
        h: Member thickness [mm]
        cracked: True if cracked concrete is assumed
        reinforced: True if supplementary reinforcement is present

    Standard: EC2-4-1 Section 5.1, EC2-4-2

    Example:
        >>> concrete = ConcreteProperties(
        ...     fck=25,  # C25/30 concrete
        ...     thickness=200,
        ...     cracked=True
        ... )
        >>> print(concrete.fck_cube)  # Automatically converted
        30.0
    """

    # Standard concrete strength classes (fck / fck_cube)
    STRENGTH_CLASSES = {
        'C12/15': (12, 15),
        'C16/20': (16, 20),
        'C20/25': (20, 25),
        'C25/30': (25, 30),
        'C30/37': (30, 37),
        'C35/45': (35, 45),
        'C40/50': (40, 50),
        'C45/55': (45, 55),
        'C50/60': (50, 60),
    }

    def __init__(
        self,
        fck: Optional[float] = None,
        thickness: float = 0,
        cracked: bool = False,
        reinforced: bool = False,
        strength_class: Optional[str] = None,
        fck_cube: Optional[float] = None
    ):
        """
        Initialize ConcreteProperties

        Args:
            fck: Characteristic cylinder strength [N/mm²]
            thickness: Member thickness h [mm]
            cracked: True if cracked concrete (default False)
            reinforced: True if supplementary reinforcement present
            strength_class: Optional strength class (e.g., 'C25/30')
                          If provided, fck and fck_cube are set from class
            fck_cube: Optional cube strength [N/mm²]
                     If not provided, calculated from fck

        Raises:
            ValueError: If inputs are invalid
        """
        # Handle strength class input
        if strength_class is not None:
            if strength_class not in self.STRENGTH_CLASSES:
                raise ValueError(
                    f"Unknown strength class '{strength_class}'. "
                    f"Valid classes: {list(self.STRENGTH_CLASSES.keys())}"
                )
            fck, fck_cube = self.STRENGTH_CLASSES[strength_class]
            self.strength_class = strength_class
        else:
            self.strength_class = None

        # Set cylinder strength
        if fck is None:
            raise ValueError("Must provide either 'fck' or 'strength_class'")

        self.fck = float(fck)

        # Set or calculate cube strength
        if fck_cube is not None:
            self.fck_cube = float(fck_cube)
        else:
            self.fck_cube = self.cylinder_to_cube(self.fck)

        # Member geometry
        self.h = float(thickness)

        # Concrete condition
        self.cracked = bool(cracked)
        self.reinforced = bool(reinforced)

        # Validate
        self._validate()

    def _validate(self) -> None:
        """
        Validate concrete properties

        Raises:
            ValueError: If properties are invalid
        """
        if self.fck <= 0:
            raise ValueError(f"fck must be positive, got {self.fck} N/mm²")

        if self.fck_cube <= 0:
            raise ValueError(f"fck_cube must be positive, got {self.fck_cube} N/mm²")

        if self.h < 0:
            raise ValueError(f"Thickness must be non-negative, got {self.h} mm")

        # Check typical range
        if self.fck < 12 or self.fck > 90:
            import warnings
            warnings.warn(
                f"Concrete strength fck={self.fck} N/mm² is outside typical range "
                f"(12-90 N/mm²). Check code applicability."
            )

        # Cube strength should be >= cylinder strength
        if self.fck_cube < self.fck:
            import warnings
            warnings.warn(
                f"Cube strength ({self.fck_cube}) is less than cylinder strength "
                f"({self.fck}). This is unusual."
            )

    @staticmethod
    def cylinder_to_cube(fck: float) -> float:
        """
        Convert cylinder strength to cube strength

        Approximate conversion based on EN 1992-1-1:
            fck_cube ≈ fck + 8  (for fck ≤ 50 MPa)
            fck_cube ≈ 1.2 × fck  (for fck > 50 MPa)

        Args:
            fck: Characteristic cylinder strength [N/mm²]

        Returns:
            fck_cube: Estimated cube strength [N/mm²]

        Note:
            This is an approximation. Use actual cube strength if available.
        """
        if fck <= 50:
            return fck + 8.0
        else:
            return 1.2 * fck

    @staticmethod
    def cube_to_cylinder(fck_cube: float) -> float:
        """
        Convert cube strength to cylinder strength

        Approximate conversion (reverse of above):
            fck ≈ fck_cube - 8  (for fck_cube ≤ 58 MPa)
            fck ≈ fck_cube / 1.2  (for fck_cube > 58 MPa)

        Args:
            fck_cube: Characteristic cube strength [N/mm²]

        Returns:
            fck: Estimated cylinder strength [N/mm²]
        """
        if fck_cube <= 58:
            return max(12, fck_cube - 8.0)
        else:
            return fck_cube / 1.2

    def is_cracked(self) -> bool:
        """
        Check if concrete is cracked

        Returns:
            True if cracked concrete assumption applies

        Standard: EC2-4-1 Section 5.1.2, 5.1.3

        Notes:
            - Seismic design: Always assume cracked (5.1.3)
            - Non-cracked may be assumed if proven under service conditions (5.1.2)
        """
        return self.cracked

    def set_cracked(self, cracked: bool = True) -> None:
        """
        Set cracked concrete assumption

        Args:
            cracked: True for cracked concrete

        Standard: EC2-4-1 Section 5.1.3
        Note: For seismic loading, concrete shall always be assumed cracked
        """
        self.cracked = cracked

    def get_k_factor(self) -> float:
        """
        Get k-factor for concrete cone failure

        For cracked concrete: kcr (typically 8.5 for headed fasteners)
        For non-cracked: kucr (typically 11.9 for headed fasteners)

        Returns:
            k: Factor for concrete cone capacity calculation

        Standard: EC2-4-2 Section 6.2.5.1
        Formula: (5) for cracked, (6) for non-cracked

        Notes:
            - These are typical values for headed fasteners
            - Actual values should be from European Technical Specification
        """
        if self.cracked:
            return 8.5  # kcr for headed fasteners
        else:
            return 11.9  # kucr for headed fasteners

    def to_dict(self) -> Dict:
        """
        Convert concrete properties to dictionary

        Returns:
            Dictionary with all properties
        """
        return {
            'fck': self.fck,
            'fck_cube': self.fck_cube,
            'h': self.h,
            'cracked': self.cracked,
            'reinforced': self.reinforced,
            'strength_class': self.strength_class,
            'k_factor': self.get_k_factor()
        }

    def __repr__(self) -> str:
        """String representation"""
        condition = "cracked" if self.cracked else "non-cracked"
        return (
            f"ConcreteProperties(fck={self.fck}MPa, h={self.h}mm, "
            f"{condition})"
        )

    def __str__(self) -> str:
        """Human-readable string"""
        if self.strength_class:
            strength_desc = self.strength_class
        else:
            strength_desc = f"fck={self.fck}/fck,cube={self.fck_cube} MPa"

        condition = "Cracked" if self.cracked else "Non-cracked"
        reinf = ", with reinforcement" if self.reinforced else ""

        return f"Concrete: {strength_desc}, h={self.h}mm, {condition}{reinf}"
