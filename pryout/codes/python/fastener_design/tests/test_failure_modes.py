"""
Unit tests for failure mode calculations
"""

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.fastener import Fastener
from core.concrete import ConcreteProperties
from core.fastener_group import FastenerGroup

from failure_modes.tension.steel_failure import steel_failure_tension
from failure_modes.tension.concrete_cone import concrete_cone_failure
from failure_modes.shear.steel_failure import steel_failure_shear
from failure_modes.shear.concrete_edge import concrete_edge_failure

from design import FastenerDesign


class TestSteelFailure(unittest.TestCase):
    """Test steel failure calculations"""

    def test_steel_tension_single(self):
        """Test steel tension for single fastener"""
        fastener = Fastener(16, 100, 500, area=157)
        NRk_s = steel_failure_tension(fastener)

        # NRk_s = As × fuk = 157 × 500 = 78500 N
        self.assertAlmostEqual(NRk_s, 78500, places=0)

    def test_steel_tension_group(self):
        """Test steel tension for group"""
        fastener = Fastener(16, 100, 500, area=157)
        NRk_s = steel_failure_tension(fastener, n_fasteners=4)

        # NRk_s = 4 × 157 × 500 = 314000 N
        self.assertAlmostEqual(NRk_s, 314000, places=0)

    def test_steel_shear_single(self):
        """Test steel shear for single fastener"""
        fastener = Fastener(16, 100, 500, area=157)
        VRk_s = steel_failure_shear(fastener)

        # VRk_s = k × As × fuk = 0.6 × 157 × 500 = 47100 N
        self.assertAlmostEqual(VRk_s, 47100, places=0)


class TestConcreteFailures(unittest.TestCase):
    """Test concrete failure mode calculations"""

    def setUp(self):
        """Set up test fixtures"""
        self.fastener = Fastener(16, 100, 500)
        self.concrete_cracked = ConcreteProperties(strength_class='C25/30', thickness=200, cracked=True)
        self.concrete_noncracked = ConcreteProperties(strength_class='C25/30', thickness=200, cracked=False)

    def test_concrete_cone_cracked(self):
        """Test concrete cone for cracked concrete"""
        NRk_c = concrete_cone_failure(self.fastener, self.concrete_cracked)

        # NRk_c0 = kcr × √fck,cube × hef^1.5
        # = 8.5 × √30 × 100^1.5 = 8.5 × 5.477 × 1000 = 46550 N
        # With no edge effects, area_ratio ≈ 1.0, all psi ≈ 1.0
        self.assertGreater(NRk_c, 40000)  # Should be around 46550
        self.assertLess(NRk_c, 50000)

    def test_concrete_cone_noncracked(self):
        """Test concrete cone for non-cracked concrete"""
        NRk_c = concrete_cone_failure(self.fastener, self.concrete_noncracked)

        # NRk_c0 = kucr × √fck,cube × hef^1.5
        # = 11.9 × √30 × 1000 = 65175 N
        self.assertGreater(NRk_c, 60000)
        self.assertLess(NRk_c, 70000)

    def test_concrete_cone_edge_effect(self):
        """Test concrete cone with edge effect"""
        # Small edge distance (c1 = 100mm < ccr,N = 150mm)
        NRk_c = concrete_cone_failure(
            self.fastener, self.concrete_cracked, edge_distance=100
        )

        # Should be reduced due to edge effect
        NRk_c_no_edge = concrete_cone_failure(self.fastener, self.concrete_cracked)
        self.assertLess(NRk_c, NRk_c_no_edge)

    def test_concrete_edge_shear(self):
        """Test concrete edge failure"""
        VRk_c = concrete_edge_failure(
            self.fastener, self.concrete_cracked, edge_distance=150
        )

        # Should give reasonable shear capacity
        self.assertGreater(VRk_c, 10000)  # > 10 kN
        self.assertLess(VRk_c, 100000)  # < 100 kN


class TestFastenerDesign(unittest.TestCase):
    """Test FastenerDesign class"""

    def setUp(self):
        """Set up test design"""
        self.fastener = Fastener(16, 100, 500, area=157)
        self.concrete = ConcreteProperties(strength_class='C25/30', thickness=200, cracked=True)

    def test_tension_only(self):
        """Test design with tension only"""
        design = FastenerDesign(
            fastener=self.fastener,
            concrete=self.concrete,
            loading={'tension': 50000},  # 50 kN
            edge_distances={'c1': 150, 'c2': 150}
        )

        results = design.check_all_modes()

        self.assertIn('tension', results)
        self.assertIsNone(results['shear'])
        self.assertIn('steel', results['tension'])
        self.assertIn('cone', results['tension'])

    def test_shear_only(self):
        """Test design with shear only"""
        design = FastenerDesign(
            fastener=self.fastener,
            concrete=self.concrete,
            loading={'shear': 20000},  # 20 kN
            edge_distances={'c1': 150}
        )

        results = design.check_all_modes()

        self.assertIsNone(results['tension'])
        self.assertIn('shear', results)
        self.assertIn('steel', results['shear'])
        self.assertIn('edge', results['shear'])

    def test_combined_loading(self):
        """Test design with combined tension and shear"""
        design = FastenerDesign(
            fastener=self.fastener,
            concrete=self.concrete,
            loading={'tension': 30000, 'shear': 15000},
            edge_distances={'c1': 150, 'c2': 150}
        )

        results = design.check_all_modes()

        self.assertIn('tension', results)
        self.assertIn('shear', results)
        self.assertIn('overall_status', results)

    def test_selective_modes(self):
        """Test selecting specific failure modes"""
        design = FastenerDesign(
            fastener=self.fastener,
            concrete=self.concrete,
            loading={'tension': 50000},
            edge_distances={'c1': 150}
        )

        # Check only steel mode
        results = design.check_tension_modes(modes=['steel'])

        self.assertIn('steel', results)
        self.assertNotIn('cone', results)

    def test_available_modes(self):
        """Test getting available modes"""
        design = FastenerDesign(
            fastener=self.fastener,
            concrete=self.concrete,
            loading={'tension': 50000}
        )

        available = design.get_available_modes()

        self.assertIn('tension', available)
        self.assertIn('shear', available)
        self.assertIn('implemented', available['tension'])

    def test_utilization_calculation(self):
        """Test utilization ratios"""
        design = FastenerDesign(
            fastener=self.fastener,
            concrete=self.concrete,
            loading={'tension': 50000},
            edge_distances={'c1': 150}
        )

        results = design.check_tension_modes()

        for mode in ['steel', 'cone']:
            self.assertIn('utilization', results[mode])
            self.assertGreater(results[mode]['utilization'], 0)

    def test_summary_generation(self):
        """Test summary text generation"""
        design = FastenerDesign(
            fastener=self.fastener,
            concrete=self.concrete,
            loading={'tension': 50000, 'shear': 20000},
            edge_distances={'c1': 150}
        )

        results = design.check_all_modes()

        self.assertIn('summary', results)
        self.assertIn('FASTENER DESIGN', results['summary'])


def run_tests():
    """Run all tests"""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    suite.addTests(loader.loadTestsFromTestCase(TestSteelFailure))
    suite.addTests(loader.loadTestsFromTestCase(TestConcreteFailures))
    suite.addTests(loader.loadTestsFromTestCase(TestFastenerDesign))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
