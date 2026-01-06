"""
Main FastenerDesign class for EC2 Part 4 calculations

This module provides a user-friendly interface for performing complete
fastener design checks with selectable failure modes.
"""

from typing import List, Dict, Optional, Tuple
import sys
from pathlib import Path

from core.fastener import Fastener
from core.fastener_group import FastenerGroup
from core.concrete import ConcreteProperties
from core.factors import MaterialFactors

# Import failure mode functions
from failure_modes.tension.steel_failure import steel_failure_tension, get_steel_capacity_info
from failure_modes.tension.concrete_cone import concrete_cone_failure, get_concrete_cone_capacity_info
from failure_modes.tension.pullout import pullout_failure, get_pullout_capacity_info
from failure_modes.tension.splitting import splitting_failure, get_splitting_capacity_info
from failure_modes.tension.blowout import blowout_failure, get_blowout_capacity_info
from failure_modes.shear.steel_failure import steel_failure_shear, get_shear_steel_capacity_info
from failure_modes.shear.concrete_edge import concrete_edge_failure, get_concrete_edge_capacity_info
from failure_modes.shear.pryout import pryout_failure, get_pryout_capacity_info


class FastenerDesign:
    """
    Main class for fastener design calculations

    This class provides a UI-friendly interface for:
    - Setting up fastener geometry and properties
    - Selecting which failure modes to check
    - Performing design calculations
    - Generating detailed reports

    Attributes:
        fastener: Fastener object
        concrete: ConcreteProperties object
        group: Optional FastenerGroup
        loading: Dict with 'tension' and 'shear' loads [N]
        edge_distances: Dict with edge distances [mm]
        loading_type: 'static', 'fatigue', or 'seismic'

    Example:
        >>> design = FastenerDesign(
        ...     fastener=my_fastener,
        ...     concrete=my_concrete,
        ...     loading={'tension': 50000, 'shear': 20000},
        ...     edge_distances={'c1': 150, 'c2': 150}
        ... )
        >>> results = design.check_all_modes()
        >>> print(results['summary'])
    """

    # Available failure modes
    TENSION_MODES = ['steel', 'cone', 'pullout', 'splitting', 'blowout']
    SHEAR_MODES = ['steel', 'edge', 'pryout']

    def __init__(
        self,
        fastener: Fastener,
        concrete: ConcreteProperties,
        loading: Dict[str, float],
        edge_distances: Optional[Dict[str, float]] = None,
        spacings: Optional[Dict[str, float]] = None,
        loading_type: str = 'static',
        eccentricity: Dict[str, float] = None,
        load_angle: float = 0.0
    ):
        """
        Initialize FastenerDesign

        Args:
            fastener: Fastener object
            concrete: ConcreteProperties object
            loading: Dict with loads {'tension': NEd, 'shear': VEd} [N]
            edge_distances: Dict {'c1': ..., 'c2': ...} [mm]
            spacings: Optional dict {'sx': ..., 'sy': ...} [mm] for groups
            loading_type: 'static', 'fatigue', or 'seismic'
            eccentricity: Optional dict {'eN': ..., 'eV': ...} [mm]
            load_angle: Angle of shear load relative to edge [degrees]
        """
        self.fastener = fastener
        self.concrete = concrete
        self.loading = loading
        self.edge_distances = edge_distances or {}
        self.loading_type = loading_type
        self.eccentricity = eccentricity or {'eN': 0.0, 'eV': 0.0}
        self.load_angle = load_angle

        # Design loads
        self.NEd = loading.get('tension', 0.0)
        self.VEd = loading.get('shear', 0.0)

        # Create group if spacings provided
        if spacings and (spacings.get('sx', 0) > 0 or spacings.get('sy', 0) > 0):
            # Infer number of fasteners (can be overridden)
            n_fasteners = loading.get('n_fasteners', 1)
            self.group = FastenerGroup(
                fasteners=[fastener] * n_fasteners,
                spacings=spacings,
                edge_distances=edge_distances
            )
        else:
            self.group = None

        # Material factors
        self.gamma_Ms = MaterialFactors.get_steel_factor(loading_type)
        self.gamma_Mc = MaterialFactors.get_concrete_factor(loading_type)

    def check_tension_modes(
        self,
        modes: List[str] = None
    ) -> Dict:
        """
        Check specified tension failure modes

        Args:
            modes: List of modes to check. Options:
                   - 'steel': Steel failure
                   - 'cone': Concrete cone failure
                   - 'pullout': Pull-out failure
                   - 'splitting': Splitting failure
                   - 'blowout': Blow-out failure
                   If None, checks all implemented modes

        Returns:
            Dictionary with results for each mode:
                {
                    'steel': {'NRk': ..., 'NRd': ..., 'utilization': ..., ...},
                    'cone': {...},
                    'governing': 'cone',
                    'min_capacity': 66667,
                    'status': 'OK' or 'FAIL'
                }
        """
        if modes is None:
            # Check all implemented modes
            modes = ['steel', 'cone', 'pullout', 'splitting', 'blowout']

        results = {}

        # Get edge distance for calculations
        edge_dist = self.edge_distances.get('c1', None)

        # Steel failure
        if 'steel' in modes:
            n = self.group.n_fasteners if self.group else 1
            NRk_s = steel_failure_tension(self.fastener, n)
            NRd_s = NRk_s / self.gamma_Ms

            results['steel'] = {
                'NRk': NRk_s,
                'NRk_kN': NRk_s / 1000,
                'NRd': NRd_s,
                'NRd_kN': NRd_s / 1000,
                'utilization': self.NEd / NRd_s if NRd_s > 0 else float('inf'),
                'gamma_M': self.gamma_Ms,
                'info': get_steel_capacity_info(self.fastener)
            }

        # Concrete cone failure
        if 'cone' in modes:
            NRk_c = concrete_cone_failure(
                self.fastener,
                self.concrete,
                self.group,
                edge_dist,
                self.eccentricity.get('eN', 0.0)
            )
            NRd_c = NRk_c / self.gamma_Mc

            results['cone'] = {
                'NRk': NRk_c,
                'NRk_kN': NRk_c / 1000,
                'NRd': NRd_c,
                'NRd_kN': NRd_c / 1000,
                'utilization': self.NEd / NRd_c if NRd_c > 0 else float('inf'),
                'gamma_M': self.gamma_Mc,
                'info': get_concrete_cone_capacity_info(
                    self.fastener, self.concrete, self.group, edge_dist,
                    self.eccentricity.get('eN', 0.0)
                )
            }

        # Pull-out failure
        if 'pullout' in modes:
            n = self.group.n_fasteners if self.group else 1
            NRk_p = pullout_failure(self.fastener, self.concrete, n)
            NRd_p = NRk_p / self.gamma_Mc

            results['pullout'] = {
                'NRk': NRk_p,
                'NRk_kN': NRk_p / 1000,
                'NRd': NRd_p,
                'NRd_kN': NRd_p / 1000,
                'utilization': self.NEd / NRd_p if NRd_p > 0 else float('inf'),
                'gamma_M': self.gamma_Mc,
                'info': get_pullout_capacity_info(self.fastener, self.concrete)
            }

        # Splitting failure
        if 'splitting' in modes:
            spacing = self.group.get_max_spacing() if self.group else None
            NRk_sp = splitting_failure(
                self.fastener, self.concrete, self.group, edge_dist,
                has_reinforcement=False
            )
            NRd_sp = NRk_sp / self.gamma_Mc

            results['splitting'] = {
                'NRk': NRk_sp,
                'NRk_kN': NRk_sp / 1000,
                'NRd': NRd_sp,
                'NRd_kN': NRd_sp / 1000,
                'utilization': self.NEd / NRd_sp if NRd_sp > 0 else float('inf'),
                'gamma_M': self.gamma_Mc,
                'info': get_splitting_capacity_info(
                    self.fastener, self.concrete, self.group, edge_dist,
                    has_reinforcement=False
                )
            }

        # Blow-out failure
        if 'blowout' in modes:
            NRk_cb = blowout_failure(
                self.fastener, self.concrete, edge_dist, self.group
            )
            NRd_cb = NRk_cb / self.gamma_Mc

            results['blowout'] = {
                'NRk': NRk_cb,
                'NRk_kN': NRk_cb / 1000,
                'NRd': NRd_cb,
                'NRd_kN': NRd_cb / 1000,
                'utilization': self.NEd / NRd_cb if NRd_cb > 0 else float('inf'),
                'gamma_M': self.gamma_Mc,
                'info': get_blowout_capacity_info(
                    self.fastener, self.concrete, edge_dist, self.group
                )
            }

        # Find governing mode
        if results:
            governing = min(results.keys(), key=lambda k: results[k]['NRd'])
            results['governing'] = governing
            results['min_capacity'] = results[governing]['NRd']
            results['min_capacity_kN'] = results[governing]['NRd_kN']
            results['status'] = 'OK' if self.NEd <= results['min_capacity'] else 'FAIL'
        else:
            results['status'] = 'No modes checked'

        return results

    def check_shear_modes(
        self,
        modes: List[str] = None
    ) -> Dict:
        """
        Check specified shear failure modes

        Args:
            modes: List of modes to check. Options:
                   - 'steel': Steel shear failure
                   - 'edge': Concrete edge failure
                   - 'pryout': Pry-out failure
                   If None, checks all implemented modes

        Returns:
            Dictionary with results for each mode
        """
        if modes is None:
            modes = ['steel', 'edge', 'pryout']

        results = {}

        # Get edge distance
        edge_dist = self.edge_distances.get('c1', 150)  # Default if not specified

        # Steel shear failure
        if 'steel' in modes:
            n = self.group.n_fasteners if self.group else 1
            VRk_s = steel_failure_shear(self.fastener, n)
            VRd_s = VRk_s / self.gamma_Ms

            results['steel'] = {
                'VRk': VRk_s,
                'VRk_kN': VRk_s / 1000,
                'VRd': VRd_s,
                'VRd_kN': VRd_s / 1000,
                'utilization': self.VEd / VRd_s if VRd_s > 0 else float('inf'),
                'gamma_M': self.gamma_Ms,
                'info': get_shear_steel_capacity_info(self.fastener)
            }

        # Concrete edge failure
        if 'edge' in modes:
            VRk_c = concrete_edge_failure(
                self.fastener,
                self.concrete,
                edge_dist,
                self.group,
                self.eccentricity.get('eV', 0.0),
                self.load_angle
            )
            VRd_c = VRk_c / self.gamma_Mc

            results['edge'] = {
                'VRk': VRk_c,
                'VRk_kN': VRk_c / 1000,
                'VRd': VRd_c,
                'VRd_kN': VRd_c / 1000,
                'utilization': self.VEd / VRd_c if VRd_c > 0 else float('inf'),
                'gamma_M': self.gamma_Mc,
                'info': get_concrete_edge_capacity_info(
                    self.fastener, self.concrete, edge_dist, self.group,
                    self.eccentricity.get('eV', 0.0), self.load_angle
                )
            }

        # Pry-out failure
        if 'pryout' in modes:
            VRk_cp = pryout_failure(
                self.fastener, self.concrete, self.group, edge_dist
            )
            VRd_cp = VRk_cp / self.gamma_Mc

            results['pryout'] = {
                'VRk': VRk_cp,
                'VRk_kN': VRk_cp / 1000,
                'VRd': VRd_cp,
                'VRd_kN': VRd_cp / 1000,
                'utilization': self.VEd / VRd_cp if VRd_cp > 0 else float('inf'),
                'gamma_M': self.gamma_Mc,
                'info': get_pryout_capacity_info(
                    self.fastener, self.concrete, self.group, edge_dist
                )
            }

        # Find governing mode
        if results:
            governing = min(results.keys(), key=lambda k: results[k]['VRd'])
            results['governing'] = governing
            results['min_capacity'] = results[governing]['VRd']
            results['min_capacity_kN'] = results[governing]['VRd_kN']
            results['status'] = 'OK' if self.VEd <= results['min_capacity'] else 'FAIL'
        else:
            results['status'] = 'No modes checked'

        return results

    def check_all_modes(
        self,
        tension_modes: List[str] = None,
        shear_modes: List[str] = None
    ) -> Dict:
        """
        Check all specified failure modes

        Args:
            tension_modes: List of tension modes to check (None = all)
            shear_modes: List of shear modes to check (None = all)

        Returns:
            Complete results dictionary with:
                - 'tension': Tension mode results
                - 'shear': Shear mode results
                - 'overall_status': 'OK' or 'FAIL'
                - 'summary': Text summary
        """
        results = {}

        # Check tension if load present
        if self.NEd > 0:
            results['tension'] = self.check_tension_modes(tension_modes)
        else:
            results['tension'] = None

        # Check shear if load present
        if self.VEd > 0:
            results['shear'] = self.check_shear_modes(shear_modes)
        else:
            results['shear'] = None

        # Overall status
        statuses = []
        if results['tension']:
            statuses.append(results['tension']['status'])
        if results['shear']:
            statuses.append(results['shear']['status'])

        results['overall_status'] = 'OK' if all(s == 'OK' for s in statuses) else 'FAIL'

        # Generate summary
        results['summary'] = self._generate_summary(results)

        return results

    def _generate_summary(self, results: Dict) -> str:
        """Generate text summary of results"""
        lines = []
        lines.append("=" * 60)
        lines.append("FASTENER DESIGN CHECK SUMMARY")
        lines.append("=" * 60)

        # Fastener info
        lines.append(f"\nFastener: {self.fastener}")
        lines.append(f"Concrete: {self.concrete}")
        if self.group:
            lines.append(f"Group: {self.group}")

        # Loading
        lines.append(f"\nLoading ({self.loading_type}):")
        if self.NEd > 0:
            lines.append(f"  Tension: NEd = {self.NEd/1000:.1f} kN")
        if self.VEd > 0:
            lines.append(f"  Shear:   VEd = {self.VEd/1000:.1f} kN")

        # Tension results
        if results.get('tension'):
            lines.append("\nTENSION FAILURE MODES:")
            for mode, data in results['tension'].items():
                if mode not in ['governing', 'min_capacity', 'min_capacity_kN', 'status']:
                    util = data['utilization']
                    status = 'OK' if util <= 1.0 else 'FAIL'
                    lines.append(
                        f"  {mode.capitalize():12s}: NRd = {data['NRd_kN']:6.1f} kN, "
                        f"Util = {util:5.2f} [{status}]"
                    )
            lines.append(f"  Governing: {results['tension']['governing']} - {results['tension']['status']}")

        # Shear results
        if results.get('shear'):
            lines.append("\nSHEAR FAILURE MODES:")
            for mode, data in results['shear'].items():
                if mode not in ['governing', 'min_capacity', 'min_capacity_kN', 'status']:
                    util = data['utilization']
                    status = 'OK' if util <= 1.0 else 'FAIL'
                    lines.append(
                        f"  {mode.capitalize():12s}: VRd = {data['VRd_kN']:6.1f} kN, "
                        f"Util = {util:5.2f} [{status}]"
                    )
            lines.append(f"  Governing: {results['shear']['governing']} - {results['shear']['status']}")

        # Overall
        lines.append(f"\nOVERALL STATUS: {results['overall_status']}")
        lines.append("=" * 60)

        return '\n'.join(lines)

    def get_available_modes(self) -> Dict[str, List[str]]:
        """
        Get list of available failure modes

        Returns:
            Dictionary with:
                - 'tension': List of available tension modes
                - 'shear': List of available shear modes
                - 'implemented': Lists which are currently implemented

        Useful for UI to show which modes can be selected
        """
        return {
            'tension': {
                'all': self.TENSION_MODES,
                'implemented': ['steel', 'cone', 'pullout', 'splitting', 'blowout'],
                'not_implemented': []
            },
            'shear': {
                'all': self.SHEAR_MODES,
                'implemented': ['steel', 'edge', 'pryout'],
                'not_implemented': []
            }
        }
