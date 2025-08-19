#!/usr/bin/env python3
"""
Concrete Slab Calculator Quick Start Template

Simple example showing how to use the concrete slab calculator API with Selenium.
Copy this template and modify the parameters to suit your needs.

Requirements: pip install selenium webdriver-manager
"""

import sys
from pathlib import Path

try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
except ImportError:
    print("❌ Please install selenium: pip install selenium webdriver-manager")
    sys.exit(1)


class ConcreteSlabQuickStart:
    """Simple concrete slab calculator interface."""
    
    def __init__(self):
        self.url = "file://" + str(Path(__file__).parent.parent / "concrete_slab_design" / "index.html")
        
    def calculate(self, params):
        """Calculate single concrete slab configuration."""
        options = Options()
        options.add_argument('--headless')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        
        driver = webdriver.Chrome(options=options)
        try:
            driver.get(self.url)
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "results"))
            )
            
            # Wait for API to load
            import time
            time.sleep(2)
            
            # Call API
            result = driver.execute_script(
                "return window.concreteSlabCalculate(arguments[0]);", 
                params
            )
            return result
            
        finally:
            driver.quit()


def main():
    """Quick start example."""
    print("🧱 Concrete Slab Calculator Quick Start")
    print("=" * 40)
    
    # Define your slab parameters here
    slab_params = {
        "h": 200,          # Slab thickness (mm)
        "d": 170,          # Effective depth (mm)
        "fck": 25,         # Concrete compressive strength (MPa)
        "fyk": 500,        # Steel yield strength (MPa)
        "MEd": 50,         # Design moment (kNm/m)
        "gammaC": 1.5,     # Concrete safety factor
        "gammaS": 1.15,    # Steel safety factor
        "cover": 25,       # Concrete cover (mm)
        "phi": 12,         # Rebar diameter (mm)
        "spacing": 200,    # Rebar spacing (mm)
        "exposure": "XC1"  # Exposure class
    }
    
    calc = ConcreteSlabQuickStart()
    result = calc.calculate(slab_params)
    
    if result.get("success"):
        results = result["results"]
        print(f"✅ Calculation successful!")
        print(f"Required reinforcement: {results['As_req']:.1f} mm²/m")
        print(f"Provided reinforcement: {results['As_prov']:.1f} mm²/m")
        print(f"Moment resistance: {results['MRd']:.2f} kNm/m")
        print(f"Utilization: {results['utilization']:.1f}%")
    else:
        print(f"❌ Calculation failed: {result.get('error', 'Unknown error')}")


if __name__ == "__main__":
    main()