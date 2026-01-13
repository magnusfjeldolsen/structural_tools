"""
Pyodide environment setup for PyNite
Mocks pip/pkg_resources to avoid browser incompatibilities

This module must be run in Pyodide BEFORE installing PyNite.
It creates mock pip and pkg_resources modules that PyNite expects.

Usage in Pyodide:
    await pyodide.runPythonAsync(setup_code)
    await pyodide.runPythonAsync('setup_package_mocking()')
"""

import sys
from types import ModuleType


class MockDistribution:
    """Mock package distribution for pkg_resources"""

    def __init__(self, name: str, version: str = '1.4.0'):
        self.project_name = name
        self.version = version
        self.key = name.lower()


class MockWorkingSet:
    """Mock working set of installed packages"""

    def __init__(self):
        self.packages = [
            MockDistribution('PyNiteFEA', '1.0.11'),
            MockDistribution('numpy', '1.25.2'),
            MockDistribution('scipy', '1.11.0'),
            MockDistribution('matplotlib', '3.7.0'),
            MockDistribution('prettytable', '3.0.0'),
        ]

    def __iter__(self):
        return iter(self.packages)

    def by_key(self):
        """Return dict of packages by key"""
        return {p.key: p for p in self.packages}


def setup_package_mocking():
    """
    Setup mock pip and pkg_resources modules

    This is required for PyNite to work in Pyodide because:
    1. PyNite tries to import pip._vendor.pkg_resources
    2. pip is not available in Pyodide browser environment
    3. We create lightweight mocks that satisfy PyNite's needs

    Returns:
        bool: True if setup successful
    """
    # Create mock pkg_resources module
    pkg_resources = ModuleType('pkg_resources')
    pkg_resources.get_distribution = lambda name: MockDistribution(name)
    pkg_resources.working_set = MockWorkingSet()
    pkg_resources.DistributionNotFound = Exception
    pkg_resources.VersionConflict = Exception
    pkg_resources.RequirementParseError = Exception
    pkg_resources.parse_version = lambda v: v
    pkg_resources.Requirement = type('Requirement', (), {'parse': lambda s: s})

    # Create mock pip structure
    pip = ModuleType('pip')
    pip._vendor = ModuleType('pip._vendor')
    pip._vendor.pkg_resources = pkg_resources

    # Register all modules in sys.modules
    sys.modules['pip'] = pip
    sys.modules['pip._vendor'] = pip._vendor
    sys.modules['pip._vendor.pkg_resources'] = pkg_resources
    sys.modules['pkg_resources'] = pkg_resources  # Also make available as standalone

    print("* Package mocking complete - pip and pkg_resources installed")
    print(f"  Mocked packages: {[p.project_name for p in MockWorkingSet().packages]}")

    return True


# For standalone testing (won't work outside Pyodide, but good for syntax checking)
if __name__ == '__main__':
    print("Package Mocking Setup Module")
    print("="*60)
    print("This module is designed to run in Pyodide (browser environment)")
    print("It mocks pip and pkg_resources for PyNite compatibility")
    print()
    print("Testing mock classes...")

    # Test MockDistribution
    dist = MockDistribution('TestPackage', '1.0.0')
    print(f"  MockDistribution: {dist.project_name} v{dist.version}")

    # Test MockWorkingSet
    ws = MockWorkingSet()
    print(f"  MockWorkingSet: {len(list(ws))} packages")
    print(f"  Packages: {[p.project_name for p in ws]}")

    print()
    print("To use in Pyodide:")
    print("  1. Load this file into Pyodide")
    print("  2. Run: setup_package_mocking()")
    print("  3. Install PyNite: await micropip.install('PyniteFEA')")
