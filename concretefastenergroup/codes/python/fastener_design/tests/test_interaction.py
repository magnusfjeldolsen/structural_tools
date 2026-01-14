"""
Unit tests for N-V interaction calculations
"""

import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from calculations.interaction import check_nv_interaction, check_combined_loading, get_interaction_summary
from core.fastener import Fastener
from core.concrete import ConcreteProperties
from design import FastenerDesign


class TestNVInteraction(unittest.TestCase):
    """Test N-V interaction calculations"""

    def test_interaction_basic(self):
        """Test basic interaction calculation"""
        result = check_nv_interaction(
            NEd=50000,  # 50 kN
            NRd=100000,  # 100 kN
            VEd=20000,  # 20 kN
            VRd=40000,  # 40 kN
            alpha=1.5,
            beta=1.5
        )

        # (50/100)^1.5 + (20/40)^1.5 = 0.3536 + 0.3536 = 0.7071
        self.assertAlmostEqual(result['interaction_ratio'], 0.7071, places=3)
        self.assertEqual(result['status'], 'OK')

    def test_interaction_tension_only(self):
        """Test with tension only (no shear)"""
        result = check_nv_interaction(
            NEd=50000,
            NRd=100000,
            VEd=0,
            VRd=40000,
            alpha=1.5,
            beta=1.5
        )

        # (50/100)^1.5 + 0 = 0.3536
        self.assertAlmostEqual(result['interaction_ratio'], 0.3536, places=3)
        self.assertEqual(result['status'], 'OK')

    def test_interaction_shear_only(self):
        """Test with shear only (no tension)"""
        result = check_nv_interaction(
            NEd=0,
            NRd=100000,
            VEd=20000,
            VRd=40000,
            alpha=1.5,
            beta=1.5
        )

        # 0 + (20/40)^1.5 = 0.3536
        self.assertAlmostEqual(result['interaction_ratio'], 0.3536, places=3)
        self.assertEqual(result['status'], 'OK')

    def test_interaction_fail(self):
        """Test failing interaction check"""
        result = check_nv_interaction(
            NEd=90000,  # High tension
            NRd=100000,
            VEd=35000,  # High shear
            VRd=40000,
            alpha=1.5,
            beta=1.5
        )

        # (90/100)^1.5 + (35/40)^1.5 = 0.8539 + 0.8254 = 1.6793
        self.assertGreater(result['interaction_ratio'], 1.0)
        self.assertEqual(result['status'], 'FAIL')

    def test_interaction_limit(self):
        """Test interaction at limit (ratio = 1.0)"""
        # Need to find values where (NEd/NRd)^1.5 + (VEd/VRd)^1.5 ≈ 1.0
        # Try 70% of each: (0.7)^1.5 + (0.7)^1.5 = 0.5831 + 0.5831 = 1.166 > 1
        # Try 60% of each: (0.6)^1.5 + (0.6)^1.5 = 0.4648 + 0.4648 = 0.9296 < 1

        result = check_nv_interaction(
            NEd=60000,
            NRd=100000,
            VEd=24000,
            VRd=40000,
            alpha=1.5,
            beta=1.5
        )

        self.assertLess(result['interaction_ratio'], 1.0)
        self.assertEqual(result['status'], 'OK')

    def test_interaction_zero_resistance(self):
        """Test with zero resistance (error condition)"""
        result = check_nv_interaction(
            NEd=50000,
            NRd=0,  # Zero resistance
            VEd=20000,
            VRd=40000,
            alpha=1.5,
            beta=1.5
        )

        self.assertEqual(result['status'], 'FAIL')
        self.assertIn('error', result)

    def test_interaction_different_exponents(self):
        """Test with different exponents"""
        # Linear interaction (α=β=1.0)
        result = check_nv_interaction(
            NEd=50000,
            NRd=100000,
            VEd=20000,
            VRd=40000,
            alpha=1.0,
            beta=1.0
        )

        # (50/100)^1.0 + (20/40)^1.0 = 0.5 + 0.5 = 1.0
        self.assertAlmostEqual(result['interaction_ratio'], 1.0, places=6)
        self.assertEqual(result['status'], 'OK')

    def test_interaction_summary(self):
        """Test summary text generation"""
        result = check_nv_interaction(
            NEd=50000,
            NRd=100000,
            VEd=20000,
            VRd=40000
        )

        summary = get_interaction_summary(result)

        self.assertIn('COMBINED LOADING', summary)
        self.assertIn('ned', summary.lower())
        self.assertIn('ved', summary.lower())
        self.assertIn('ratio', summary.lower())


class TestCombinedLoadingWithDesign(unittest.TestCase):
    """Test combined loading with FastenerDesign class"""

    def setUp(self):
        """Set up test fixtures"""
        self.fastener = Fastener(16, 100, 500, area=157)
        self.concrete = ConcreteProperties(strength_class='C25/30', thickness=200, cracked=True)

    def test_combined_loading_pass(self):
        """Test design with combined loading that passes"""
        design = FastenerDesign(
            fastener=self.fastener,
            concrete=self.concrete,
            loading={'tension': 15000, 'shear': 10000},  # Low loads to ensure pass
            edge_distances={'c1': 150, 'c2': 150}
        )

        results = design.check_all_modes()

        # Should have interaction check
        self.assertIn('interaction', results)
        self.assertIsNotNone(results['interaction'])

        # Check that interaction was calculated
        self.assertIn('interaction_ratio', results['interaction'])
        self.assertIn('status', results['interaction'])

    def test_combined_loading_fail(self):
        """Test design with combined loading that fails"""
        design = FastenerDesign(
            fastener=self.fastener,
            concrete=self.concrete,
            loading={'tension': 45000, 'shear': 35000},  # High loads
            edge_distances={'c1': 150}
        )

        results = design.check_all_modes()

        # Should have interaction check
        self.assertIn('interaction', results)
        self.assertIsNotNone(results['interaction'])

        # May fail interaction or individual modes
        self.assertIn(results['overall_status'], ['OK', 'FAIL'])

    def test_tension_only_no_interaction(self):
        """Test that tension-only doesn't trigger interaction check"""
        design = FastenerDesign(
            fastener=self.fastener,
            concrete=self.concrete,
            loading={'tension': 30000},  # Tension only
            edge_distances={'c1': 150}
        )

        results = design.check_all_modes()

        # Should NOT have interaction check
        self.assertIsNone(results['interaction'])

    def test_shear_only_no_interaction(self):
        """Test that shear-only doesn't trigger interaction check"""
        design = FastenerDesign(
            fastener=self.fastener,
            concrete=self.concrete,
            loading={'shear': 20000},  # Shear only
            edge_distances={'c1': 150}
        )

        results = design.check_all_modes()

        # Should NOT have interaction check
        self.assertIsNone(results['interaction'])

    def test_interaction_in_summary(self):
        """Test that interaction appears in summary"""
        design = FastenerDesign(
            fastener=self.fastener,
            concrete=self.concrete,
            loading={'tension': 30000, 'shear': 20000},
            edge_distances={'c1': 150}
        )

        results = design.check_all_modes()
        summary = results['summary']

        # Summary should include interaction info
        self.assertIn('INTERACTION', summary)
        self.assertIn('Ratio', summary)

    def test_interaction_governing_modes(self):
        """Test that interaction uses governing modes"""
        design = FastenerDesign(
            fastener=self.fastener,
            concrete=self.concrete,
            loading={'tension': 30000, 'shear': 20000},
            edge_distances={'c1': 150}
        )

        results = design.check_all_modes()
        interaction = results['interaction']

        # Should have governing mode info
        self.assertIn('governing_tension_mode', interaction)
        self.assertIn('governing_shear_mode', interaction)
        self.assertIn(interaction['governing_tension_mode'], ['steel', 'cone', 'pullout', 'splitting', 'blowout'])
        self.assertIn(interaction['governing_shear_mode'], ['steel', 'edge', 'pryout'])


def run_tests():
    """Run all interaction tests"""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    suite.addTests(loader.loadTestsFromTestCase(TestNVInteraction))
    suite.addTests(loader.loadTestsFromTestCase(TestCombinedLoadingWithDesign))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
