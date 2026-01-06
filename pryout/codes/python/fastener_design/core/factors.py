"""
Material and partial safety factors for EC2 Part 4 design
"""

from typing import Dict, Optional
from enum import Enum


class LoadingType(Enum):
    """Loading type enumeration"""
    STATIC = "static"
    FATIGUE = "fatigue"
    SEISMIC = "seismic"


class MaterialFactors:
    """
    Material partial safety factors

    Standard: EC2-4-1 Section 4.4.3, Table 1

    Default values (may be modified by National Annex):
        γMs = 1.2   # Steel material factor
        γMc = 1.5   # Concrete material factor
        γMinst = 1.0  # Installation safety factor

    Example:
        >>> # Get default steel factor
        >>> gamma_Ms = MaterialFactors.get_steel_factor()
        >>> print(gamma_Ms)
        1.2

        >>> # Get seismic factor
        >>> gamma_Ms_seismic = MaterialFactors.get_steel_factor('seismic')
        >>> print(gamma_Ms_seismic)
        1.0
    """

    # Default partial factors for resistances (EC2-4-1 Table 1)
    # These may be modified by National Annex

    # Static loading
    GAMMA_MS_STATIC = 1.2   # Steel failure
    GAMMA_MC_STATIC = 1.5   # Concrete failure
    GAMMA_MINST_STATIC = 1.0  # Installation

    # Fatigue loading
    GAMMA_MS_FATIGUE = 1.0   # Steel failure under fatigue
    GAMMA_MC_FATIGUE = 1.5   # Concrete failure under fatigue

    # Seismic loading (EC2-4-1 Section 8.4)
    GAMMA_MS_SEISMIC = 1.0   # Steel failure for seismic
    GAMMA_MC_SEISMIC = 1.2   # Concrete failure for seismic
    GAMMA_MINST_SEISMIC = 1.0  # Installation for seismic

    @classmethod
    def get_steel_factor(
        cls,
        loading_type: str = 'static',
        national_annex: Optional[Dict] = None
    ) -> float:
        """
        Get partial factor for steel failure

        Args:
            loading_type: Type of loading ('static', 'fatigue', 'seismic')
            national_annex: Optional dict with National Annex values

        Returns:
            γMs: Partial factor for steel

        Standard: EC2-4-1 Section 4.4.3.1, Table 1

        Examples:
            >>> MaterialFactors.get_steel_factor('static')
            1.2
            >>> MaterialFactors.get_steel_factor('seismic')
            1.0
        """
        # Check National Annex override
        if national_annex and 'gamma_Ms' in national_annex:
            return national_annex['gamma_Ms']

        # Default values based on loading type
        loading_type = loading_type.lower()

        if loading_type == 'static':
            return cls.GAMMA_MS_STATIC
        elif loading_type == 'fatigue':
            return cls.GAMMA_MS_FATIGUE
        elif loading_type == 'seismic':
            return cls.GAMMA_MS_SEISMIC
        else:
            raise ValueError(
                f"Unknown loading_type '{loading_type}'. "
                f"Must be 'static', 'fatigue', or 'seismic'"
            )

    @classmethod
    def get_concrete_factor(
        cls,
        loading_type: str = 'static',
        national_annex: Optional[Dict] = None
    ) -> float:
        """
        Get partial factor for concrete failure

        Args:
            loading_type: Type of loading ('static', 'fatigue', 'seismic')
            national_annex: Optional dict with National Annex values

        Returns:
            γMc: Partial factor for concrete

        Standard: EC2-4-1 Section 4.4.3.1, Table 1

        Examples:
            >>> MaterialFactors.get_concrete_factor('static')
            1.5
            >>> MaterialFactors.get_concrete_factor('seismic')
            1.2
        """
        # Check National Annex override
        if national_annex and 'gamma_Mc' in national_annex:
            return national_annex['gamma_Mc']

        # Default values
        loading_type = loading_type.lower()

        if loading_type == 'static':
            return cls.GAMMA_MC_STATIC
        elif loading_type == 'fatigue':
            return cls.GAMMA_MC_FATIGUE
        elif loading_type == 'seismic':
            return cls.GAMMA_MC_SEISMIC
        else:
            raise ValueError(
                f"Unknown loading_type '{loading_type}'. "
                f"Must be 'static', 'fatigue', or 'seismic'"
            )

    @classmethod
    def get_installation_factor(
        cls,
        loading_type: str = 'static',
        national_annex: Optional[Dict] = None
    ) -> float:
        """
        Get partial factor for installation

        Args:
            loading_type: Type of loading
            national_annex: Optional dict with National Annex values

        Returns:
            γMinst: Partial factor for installation

        Standard: EC2-4-1 Section 4.4.3

        Note:
            Installation factor typically = 1.0 for all loading types
        """
        # Check National Annex override
        if national_annex and 'gamma_Minst' in national_annex:
            return national_annex['gamma_Minst']

        return cls.GAMMA_MINST_STATIC

    @classmethod
    def get_all_factors(
        cls,
        loading_type: str = 'static',
        national_annex: Optional[Dict] = None
    ) -> Dict[str, float]:
        """
        Get all material factors for a loading type

        Args:
            loading_type: Type of loading
            national_annex: Optional National Annex values

        Returns:
            Dictionary with all factors:
                {'gamma_Ms': 1.2, 'gamma_Mc': 1.5, 'gamma_Minst': 1.0}

        Example:
            >>> factors = MaterialFactors.get_all_factors('static')
            >>> print(factors)
            {'gamma_Ms': 1.2, 'gamma_Mc': 1.5, 'gamma_Minst': 1.0}
        """
        return {
            'gamma_Ms': cls.get_steel_factor(loading_type, national_annex),
            'gamma_Mc': cls.get_concrete_factor(loading_type, national_annex),
            'gamma_Minst': cls.get_installation_factor(loading_type, national_annex),
            'loading_type': loading_type
        }

    @classmethod
    def calculate_design_resistance(
        cls,
        characteristic_resistance: float,
        failure_mode: str,
        loading_type: str = 'static',
        national_annex: Optional[Dict] = None
    ) -> float:
        """
        Calculate design resistance from characteristic resistance

        Design resistance: Rd = Rk / γM

        Args:
            characteristic_resistance: Rk [N]
            failure_mode: 'steel' or 'concrete'
            loading_type: Type of loading
            national_annex: Optional National Annex values

        Returns:
            Rd: Design resistance [N]

        Standard: EC2-4-1 Section 4.4.3

        Example:
            >>> Rk = 100000  # N
            >>> Rd = MaterialFactors.calculate_design_resistance(
            ...     Rk, 'concrete', 'static'
            ... )
            >>> print(Rd)
            66666.67
        """
        if failure_mode.lower() == 'steel':
            gamma_M = cls.get_steel_factor(loading_type, national_annex)
        elif failure_mode.lower() == 'concrete':
            gamma_M = cls.get_concrete_factor(loading_type, national_annex)
        else:
            raise ValueError(
                f"Unknown failure_mode '{failure_mode}'. "
                f"Must be 'steel' or 'concrete'"
            )

        return characteristic_resistance / gamma_M

    @classmethod
    def calculate_utilization(
        cls,
        design_load: float,
        characteristic_resistance: float,
        failure_mode: str,
        loading_type: str = 'static',
        national_annex: Optional[Dict] = None
    ) -> float:
        """
        Calculate utilization ratio

        Utilization = Ed / Rd = Ed / (Rk / γM)

        Args:
            design_load: Ed [N]
            characteristic_resistance: Rk [N]
            failure_mode: 'steel' or 'concrete'
            loading_type: Type of loading
            national_annex: Optional National Annex values

        Returns:
            Utilization ratio (should be ≤ 1.0 for OK)

        Example:
            >>> Ed = 50000  # N
            >>> Rk = 100000  # N
            >>> util = MaterialFactors.calculate_utilization(
            ...     Ed, Rk, 'concrete', 'static'
            ... )
            >>> print(f"{util:.2f}")
            0.75
        """
        Rd = cls.calculate_design_resistance(
            characteristic_resistance,
            failure_mode,
            loading_type,
            national_annex
        )

        if Rd == 0:
            return float('inf')

        return design_load / Rd

    @classmethod
    def to_dict(cls, loading_type: str = 'static') -> Dict:
        """
        Get all factors as dictionary

        Args:
            loading_type: Type of loading

        Returns:
            Dictionary with all material factors
        """
        return cls.get_all_factors(loading_type)


class ActionFactors:
    """
    Partial factors for actions (loads)

    Standard: EC2-4-1 Section 4.4.2

    Note:
        Action factors are typically from EN 1990 (Basis of Structural Design)
        and EN 1991 (Actions on structures)

        Typical values:
            - Permanent actions: γG = 1.35 (unfavorable), 1.0 (favorable)
            - Variable actions: γQ = 1.5 (unfavorable), 0 (favorable)
    """

    GAMMA_G_UNFAVORABLE = 1.35  # Permanent actions (unfavorable)
    GAMMA_G_FAVORABLE = 1.0     # Permanent actions (favorable)
    GAMMA_Q = 1.5                # Variable actions

    @classmethod
    def get_permanent_action_factor(cls, favorable: bool = False) -> float:
        """
        Get partial factor for permanent actions

        Args:
            favorable: True if action is favorable

        Returns:
            γG: Partial factor for permanent actions
        """
        return cls.GAMMA_G_FAVORABLE if favorable else cls.GAMMA_G_UNFAVORABLE

    @classmethod
    def get_variable_action_factor(cls) -> float:
        """
        Get partial factor for variable actions

        Returns:
            γQ: Partial factor for variable actions (typically 1.5)
        """
        return cls.GAMMA_Q
