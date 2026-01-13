"""
Unit tests for core classes

Tests for Fastener, FastenerGroup, ConcreteProperties, and MaterialFactors
"""

import unittest
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.fastener import Fastener
from core.fastener_group import FastenerGroup
from core.concrete import ConcreteProperties
from core.factors import MaterialFactors


class TestFastener(unittest.TestCase):
    """Test Fastener class"""

    def test_basic_creation(self):
        """Test creating a basic fastener"""
        fastener = Fastener(
            diameter=16,
            embedment_depth=100,
            steel_grade=500
        )

        self.assertEqual(fastener.d, 16)
        self.assertEqual(fastener.hef, 100)
        self.assertEqual(fastener.fuk, 500)
        self.assertAlmostEqual(fastener.As, 201.06, places=1)  # π×16²/4

    def test_with_custom_area(self):
        """Test fastener with custom area"""
        fastener = Fastener(
            diameter=16,
            embedment_depth=100,
            steel_grade=500,
            area=157  # Threaded area (smaller)
        )

        self.assertEqual(fastener.As, 157)

    def test_headed_fastener(self):
        """Test headed fastener with head diameter"""
        fastener = Fastener(
            diameter=16,
            embedment_depth=100,
            steel_grade=500,
            fastener_type='headed',
            d_head=30
        )

        self.assertEqual(fastener.fastener_type, 'headed')
        self.assertEqual(fastener.d_head, 30)

    def test_invalid_fastener_type(self):
        """Test that invalid fastener type raises error"""
        with self.assertRaises(ValueError):
            Fastener(
                diameter=16,
                embedment_depth=100,
                steel_grade=500,
                fastener_type='invalid'
            )

    def test_invalid_dimensions(self):
        """Test that invalid dimensions raise errors"""
        with self.assertRaises(ValueError):
            Fastener(diameter=-16, embedment_depth=100, steel_grade=500)

        with self.assertRaises(ValueError):
            Fastener(diameter=16, embedment_depth=-100, steel_grade=500)

        with self.assertRaises(ValueError):
            Fastener(diameter=16, embedment_depth=100, steel_grade=-500)

    def test_characteristic_spacing(self):
        """Test characteristic spacing calculation"""
        fastener = Fastener(16, 100, 500)
        scr_N = fastener.get_characteristic_spacing()
        self.assertEqual(scr_N, 300)  # 3 × 100

    def test_characteristic_edge_distance(self):
        """Test characteristic edge distance calculation"""
        fastener = Fastener(16, 100, 500)
        ccr_N = fastener.get_characteristic_edge_distance()
        self.assertEqual(ccr_N, 150)  # 1.5 × 100

    def test_to_dict(self):
        """Test conversion to dictionary"""
        fastener = Fastener(16, 100, 500)
        data = fastener.to_dict()

        self.assertIn('d', data)
        self.assertIn('hef', data)
        self.assertIn('fuk', data)
        self.assertIn('scr_N', data)
        self.assertIn('ccr_N', data)

    def test_string_representations(self):
        """Test __repr__ and __str__"""
        fastener = Fastener(16, 100, 500, fastener_type='headed')
        repr_str = repr(fastener)
        str_str = str(fastener)

        self.assertIn('16', repr_str)
        self.assertIn('100', repr_str)
        self.assertIn('Headed', str_str)


class TestFastenerGroup(unittest.TestCase):
    """Test FastenerGroup class"""

    def test_single_fastener_group(self):
        """Test group with single fastener"""
        fastener = Fastener(16, 100, 500)
        group = FastenerGroup(
            fasteners=[fastener],
            spacings={'sx': 0, 'sy': 0},
            edge_distances={'c1': 150, 'c2': 150}
        )

        self.assertEqual(group.n_fasteners, 1)
        self.assertEqual(group.layout, '1x1')

    def test_2x2_group(self):
        """Test 2x2 fastener group"""
        fastener = Fastener(16, 100, 500)
        group = FastenerGroup(
            fasteners=[fastener] * 4,
            spacings={'sx': 200, 'sy': 200},
            edge_distances={'c1': 150, 'c2': 150},
            layout='2x2'
        )

        self.assertEqual(group.n_fasteners, 4)
        self.assertEqual(group.layout, '2x2')
        self.assertEqual(group.n_rows, 2)
        self.assertEqual(group.n_cols, 2)
        self.assertEqual(group.s_x, 200)
        self.assertEqual(group.s_y, 200)

    def test_linear_group(self):
        """Test linear (1xN) group"""
        fastener = Fastener(16, 100, 500)
        group = FastenerGroup(
            fasteners=[fastener] * 3,
            spacings={'sx': 200, 'sy': 0},
            edge_distances={'c1': 150, 'c2': 150},
            layout='1x3'
        )

        self.assertEqual(group.n_fasteners, 3)
        self.assertEqual(group.n_rows, 1)
        self.assertEqual(group.n_cols, 3)

    def test_max_spacing(self):
        """Test max spacing calculation"""
        fastener = Fastener(16, 100, 500)
        group = FastenerGroup(
            fasteners=[fastener] * 4,
            spacings={'sx': 200, 'sy': 250},
            edge_distances={'c1': 150, 'c2': 150}
        )

        self.assertEqual(group.get_max_spacing(), 250)

    def test_min_max_edge_distance(self):
        """Test min/max edge distance"""
        fastener = Fastener(16, 100, 500)
        group = FastenerGroup(
            fasteners=[fastener],
            spacings={'sx': 0, 'sy': 0},
            edge_distances={'c1': 100, 'c2': 150, 'c3': 120}
        )

        self.assertEqual(group.get_min_edge_distance(), 100)
        self.assertEqual(group.get_max_edge_distance(), 150)

    def test_projected_area_single(self):
        """Test projected area for single fastener"""
        fastener = Fastener(16, 100, 500)
        group = FastenerGroup(
            fasteners=[fastener],
            spacings={'sx': 0, 'sy': 0},
            edge_distances={'c1': 200, 'c2': 200}  # Large edges, no effect
        )

        Ac_N, Ac_N0 = group.calculate_projected_area_cone()

        # Ac_N0 = 9 × hef² = 9 × 100² = 90000
        self.assertEqual(Ac_N0, 90000)

    def test_empty_group_raises_error(self):
        """Test that empty fastener list raises error"""
        with self.assertRaises(ValueError):
            FastenerGroup(
                fasteners=[],
                spacings={'sx': 0, 'sy': 0},
                edge_distances={'c1': 100, 'c2': 100}
            )


class TestConcreteProperties(unittest.TestCase):
    """Test ConcreteProperties class"""

    def test_basic_creation(self):
        """Test creating basic concrete properties"""
        concrete = ConcreteProperties(
            fck=25,
            thickness=200,
            cracked=False
        )

        self.assertEqual(concrete.fck, 25)
        self.assertEqual(concrete.h, 200)
        self.assertFalse(concrete.cracked)
        self.assertAlmostEqual(concrete.fck_cube, 33, places=0)  # 25 + 8

    def test_strength_class(self):
        """Test using strength class"""
        concrete = ConcreteProperties(
            strength_class='C25/30',
            thickness=200
        )

        self.assertEqual(concrete.fck, 25)
        self.assertEqual(concrete.fck_cube, 30)
        self.assertEqual(concrete.strength_class, 'C25/30')

    def test_invalid_strength_class(self):
        """Test invalid strength class raises error"""
        with self.assertRaises(ValueError):
            ConcreteProperties(
                strength_class='C99/999',
                thickness=200
            )

    def test_cracked_vs_noncracked(self):
        """Test cracked vs non-cracked concrete"""
        cracked = ConcreteProperties(fck=25, thickness=200, cracked=True)
        noncracked = ConcreteProperties(fck=25, thickness=200, cracked=False)

        self.assertTrue(cracked.is_cracked())
        self.assertFalse(noncracked.is_cracked())

    def test_k_factor(self):
        """Test k-factor for cone failure"""
        cracked = ConcreteProperties(fck=25, thickness=200, cracked=True)
        noncracked = ConcreteProperties(fck=25, thickness=200, cracked=False)

        k_cr = cracked.get_k_factor()
        k_ucr = noncracked.get_k_factor()

        self.assertEqual(k_cr, 8.5)   # kcr for headed
        self.assertEqual(k_ucr, 11.9)  # kucr for headed

    def test_cylinder_cube_conversion(self):
        """Test cylinder/cube strength conversion"""
        # Test conversion for fck ≤ 50
        fck_cube = ConcreteProperties.cylinder_to_cube(25)
        self.assertAlmostEqual(fck_cube, 33, places=0)

        fck = ConcreteProperties.cube_to_cylinder(33)
        self.assertAlmostEqual(fck, 25, places=0)

        # Test conversion for fck > 50
        fck_cube = ConcreteProperties.cylinder_to_cube(60)
        self.assertAlmostEqual(fck_cube, 72, places=0)

    def test_set_cracked(self):
        """Test setting cracked state"""
        concrete = ConcreteProperties(fck=25, thickness=200, cracked=False)
        self.assertFalse(concrete.is_cracked())

        concrete.set_cracked(True)
        self.assertTrue(concrete.is_cracked())

    def test_to_dict(self):
        """Test conversion to dictionary"""
        concrete = ConcreteProperties(
            strength_class='C25/30',
            thickness=200,
            cracked=True
        )
        data = concrete.to_dict()

        self.assertIn('fck', data)
        self.assertIn('fck_cube', data)
        self.assertIn('cracked', data)
        self.assertIn('k_factor', data)


class TestMaterialFactors(unittest.TestCase):
    """Test MaterialFactors class"""

    def test_static_steel_factor(self):
        """Test steel factor for static loading"""
        gamma_Ms = MaterialFactors.get_steel_factor('static')
        self.assertEqual(gamma_Ms, 1.2)

    def test_seismic_steel_factor(self):
        """Test steel factor for seismic loading"""
        gamma_Ms = MaterialFactors.get_steel_factor('seismic')
        self.assertEqual(gamma_Ms, 1.0)

    def test_static_concrete_factor(self):
        """Test concrete factor for static loading"""
        gamma_Mc = MaterialFactors.get_concrete_factor('static')
        self.assertEqual(gamma_Mc, 1.5)

    def test_seismic_concrete_factor(self):
        """Test concrete factor for seismic loading"""
        gamma_Mc = MaterialFactors.get_concrete_factor('seismic')
        self.assertEqual(gamma_Mc, 1.2)

    def test_invalid_loading_type(self):
        """Test invalid loading type raises error"""
        with self.assertRaises(ValueError):
            MaterialFactors.get_steel_factor('invalid')

    def test_get_all_factors(self):
        """Test getting all factors"""
        factors = MaterialFactors.get_all_factors('static')

        self.assertIn('gamma_Ms', factors)
        self.assertIn('gamma_Mc', factors)
        self.assertIn('gamma_Minst', factors)
        self.assertEqual(factors['gamma_Ms'], 1.2)
        self.assertEqual(factors['gamma_Mc'], 1.5)

    def test_calculate_design_resistance(self):
        """Test calculating design resistance"""
        Rk = 100000  # N

        # Steel failure
        Rd_steel = MaterialFactors.calculate_design_resistance(
            Rk, 'steel', 'static'
        )
        self.assertAlmostEqual(Rd_steel, 100000 / 1.2, places=1)

        # Concrete failure
        Rd_concrete = MaterialFactors.calculate_design_resistance(
            Rk, 'concrete', 'static'
        )
        self.assertAlmostEqual(Rd_concrete, 100000 / 1.5, places=1)

    def test_calculate_utilization(self):
        """Test calculating utilization ratio"""
        Ed = 50000  # N
        Rk = 100000  # N

        util = MaterialFactors.calculate_utilization(
            Ed, Rk, 'concrete', 'static'
        )

        # Rd = 100000 / 1.5 = 66666.67
        # Util = 50000 / 66666.67 = 0.75
        self.assertAlmostEqual(util, 0.75, places=2)

    def test_national_annex_override(self):
        """Test National Annex factor override"""
        na = {'gamma_Ms': 1.0, 'gamma_Mc': 1.3}

        gamma_Ms = MaterialFactors.get_steel_factor('static', na)
        gamma_Mc = MaterialFactors.get_concrete_factor('static', na)

        self.assertEqual(gamma_Ms, 1.0)
        self.assertEqual(gamma_Mc, 1.3)


def run_tests():
    """Run all tests"""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    suite.addTests(loader.loadTestsFromTestCase(TestFastener))
    suite.addTests(loader.loadTestsFromTestCase(TestFastenerGroup))
    suite.addTests(loader.loadTestsFromTestCase(TestConcreteProperties))
    suite.addTests(loader.loadTestsFromTestCase(TestMaterialFactors))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
