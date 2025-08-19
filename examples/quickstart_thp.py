#!/usr/bin/env python3
"""
THP Calculator Quick Start Template

Simple example showing how to use the THP calculator API with Selenium.
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


class THPQuickStart:
    """Simple THP calculator interface."""
    
    def __init__(self):
        self.url = "file://" + str(Path(__file__).parent.parent / "THP" / "index.html")
        
    def calculate(self, params):
        """Calculate single THP configuration."""
        options = Options()
        options.add_argument('--headless')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        
        driver = webdriver.Chrome(options=options)
        try:
            driver.get(self.url)
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.ID, "diagram"))
            )
            
            # Wait for API to load
            import time
            time.sleep(2)
            
            # Call API
            result = driver.execute_script(
                "return window.thpCalculate(arguments[0]);", 
                params
            )
            return result
            
        finally:
            driver.quit()


def main():
    """Quick start example."""
    print("🔧 THP Calculator Quick Start")
    print("=" * 30)
    
    # Define your THP parameters here
    thp_params = {
        "b_o": 188,        # Upper flange width (mm)
        "t_o": 25,         # Upper flange thickness (mm)
        "H": 200,          # Web height (mm)
        "t_w": 6,          # Web thickness (mm)
        "b_u": 450,        # Lower flange width (mm)
        "t_u": 15,         # Lower flange thickness (mm)
        "f_yk": 355,       # Steel yield strength (MPa)
        "gamma_M0": 1.05,  # Safety factor
        "rho_steel": 7850  # Steel density (kg/m³)
    }
    
    calc = THPQuickStart()
    result = calc.calculate(thp_params)
    
    if result.get("success"):
        results = result["results"]["results"]
        print(f"✅ Calculation successful!")
        print(f"Unit Weight: {results['unit_weight']:.2f} kg/m")
        print(f"Moment Resistance: {results['M_Rd']:.2f} kNm")
        print(f"Total Area: {results['A_total']:.1f} mm²")
        print(f"Classification: {result['results']['classification']['overall_class']}")
    else:
        print(f"❌ Calculation failed: {result.get('error', 'Unknown error')}")


if __name__ == "__main__":
    main()