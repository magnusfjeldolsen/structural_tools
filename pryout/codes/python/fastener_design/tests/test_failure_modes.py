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
from failure_modes.tension.pullout import pullout_failure
from failure_modes.tension.splitting import splitting_failure, check_splitting_risk
from failure_modes.tension.blowout import blowout_failure, check_blowout_relevance
from failure_modes.shear.steel_failure import steel_failure_shear
from failure_modes.shear.concrete_edge import concrete_edge_failure
from failure_modes.shear.pryout import pryout_failure

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

    def test_pullout_failure(self):
        """Test pull-out failure"""
        fastener = Fastener(16, 100, 500, d_head=28.8)  # dh = 1.8 × d
        NRk_p = pullout_failure(fastener, self.concrete_cracked)

        # Ah = π/4 × (28.8² - 16²) = π/4 × (829.44 - 256) = 450.3 mm²
        # NRk_p = 8.0 × 450.3 × 25 = 90060 N
        self.assertGreater(NRk_p, 85000)
        self.assertLess(NRk_p, 95000)

    def test_pullout_multiple_fasteners(self):
        """Test pull-out for multiple fasteners"""
        fastener = Fastener(16, 100, 500)
        NRk_p_single = pullout_failure(fastener, self.concrete_cracked, n_fasteners=1)
        NRk_p_group = pullout_failure(fastener, self.concrete_cracked, n_fasteners=4)

        # Group capacity should be 4× single
        self.assertAlmostEqual(NRk_p_group, 4 * NRk_p_single, places=0)

    def test_splitting_prevented(self):
        """Test splitting when requirements are met"""
        fastener = Fastener(16, 100, 500)
        concrete = ConcreteProperties(strength_class='C25/30', thickness=250, cracked=False)

        # Large edge distance (c = 200 > 1.5×16 = 24)
        # Thick member (h = 250 > 2×100 = 200)
        NRk_sp = splitting_failure(fastener, concrete, None, edge_distance=200)

        # Should return very high value (splitting prevented)
        self.assertGreater(NRk_sp, 1e8)

    def test_splitting_risk_check(self):
        """Test splitting risk assessment"""
        fastener = Fastener(16, 100, 500)
        concrete = ConcreteProperties(strength_class='C25/30', thickness=150, cracked=True)

        # Small edge distance and thin member
        risk = check_splitting_risk(fastener, concrete, edge_distance=20, spacing=30)

        self.assertEqual(risk['risk'], 'high')
        self.assertFalse(risk['requirements_met'])

    def test_blowout_not_relevant(self):
        """Test blow-out when not relevant (large edge distance)"""
        fastener = Fastener(16, 100, 500)

        # Large edge distance (c = 150 > 0.5×100 = 50)
        NRk_cb = blowout_failure(fastener, self.concrete_cracked, edge_distance=150)

        # Should return very high value (not critical)
        self.assertGreater(NRk_cb, 1e8)

    def test_blowout_relevant(self):
        """Test blow-out when relevant (small edge distance)"""
        fastener = Fastener(16, 100, 500)

        # Small edge distance (c = 40 < 0.5×100 = 50)
        NRk_cb = blowout_failure(fastener, self.concrete_cracked, edge_distance=40)

        # Should calculate actual capacity
        self.assertGreater(NRk_cb, 10000)
        self.assertLess(NRk_cb, 100000)

    def test_blowout_relevance_check(self):
        """Test blow-out relevance checking"""
        fastener = Fastener(16, 100, 500)

        # Small edge distance
        relevance_small = check_blowout_relevance(fastener, edge_distance=40)
        self.assertTrue(relevance_small['relevant'])

        # Large edge distance
        relevance_large = check_blowout_relevance(fastener, edge_distance=150)
        self.assertFalse(relevance_large['relevant'])

    def test_pryout_failure(self):
        """Test pry-out failure"""
        fastener = Fastener(16, 100, 500)

        VRk_cp = pryout_failure(fastener, self.concrete_cracked)

        # VRk_cp = k × NRk_c (k=1.0 for single fastener)
        NRk_c = concrete_cone_failure(fastener, self.concrete_cracked)

        self.assertAlmostEqual(VRk_cp, NRk_c, places=0)

    def test_pryout_group(self):
        """Test pry-out for fastener group"""
        fastener = Fastener(16, 100, 500)
        group = FastenerGroup(
            fasteners=[fastener, fastener],
            spacings={'sx': 100, 'sy': 0},
            edge_distances={'c1': 150, 'c2': 150}
        )

        VRk_cp = pryout_failure(fastener, self.concrete_cracked, group=group)

        # VRk_cp = k × NRk_c (k=2.0 for group)
        NRk_c = concrete_cone_failure(fastener, self.concrete_cracked, group)

        self.assertAlmostEqual(VRk_cp, 2.0 * NRk_c, places=0)


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

        # Check all modes are now implemented
        self.assertEqual(len(available['tension']['not_implemented']), 0)
        self.assertEqual(len(available['shear']['not_implemented']), 0)
        self.assertIn('pullout', available['tension']['implemented'])
        self.assertIn('splitting', available['tension']['implemented'])
        self.assertIn('blowout', available['tension']['implemented'])
        self.assertIn('pryout', available['shear']['implemented'])

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

    def test_all_tension_modes(self):
        """Test checking all tension modes"""
        design = FastenerDesign(
            fastener=self.fastener,
            concrete=self.concrete,
            loading={'tension': 30000},
            edge_distances={'c1': 150, 'c2': 150}
        )

        results = design.check_tension_modes()

        # Should check all 5 modes by default
        self.assertIn('steel', results)
        self.assertIn('cone', results)
        self.assertIn('pullout', results)
        self.assertIn('splitting', results)
        self.assertIn('blowout', results)
        self.assertIn('governing', results)

        # Each mode should have expected keys
        for mode in ['steel', 'cone', 'pullout', 'splitting', 'blowout']:
            self.assertIn('NRk', results[mode])
            self.assertIn('NRd', results[mode])
            self.assertIn('utilization', results[mode])
            self.assertIn('info', results[mode])

    def test_all_shear_modes(self):
        """Test checking all shear modes"""
        design = FastenerDesign(
            fastener=self.fastener,
            concrete=self.concrete,
            loading={'shear': 15000},
            edge_distances={'c1': 150}
        )

        results = design.check_shear_modes()

        # Should check all 3 modes by default
        self.assertIn('steel', results)
        self.assertIn('edge', results)
        self.assertIn('pryout', results)
        self.assertIn('governing', results)

        # Each mode should have expected keys
        for mode in ['steel', 'edge', 'pryout']:
            self.assertIn('VRk', results[mode])
            self.assertIn('VRd', results[mode])
            self.assertIn('utilization', results[mode])
            self.assertIn('info', results[mode])


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
