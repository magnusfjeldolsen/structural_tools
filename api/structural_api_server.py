#!/usr/bin/env python3
"""
Unified Structural Engineering API Server
==========================================

A simple HTTP server that serves the structural engineering web calculators
and provides a unified API endpoint for all calculation modules.

Supports:
- THP (Two-sided Hat Profile) calculations
- Concrete Beam ULS design calculations  
- Concrete Slab ULS design calculations

Usage:
    python structural_api_server.py
    
Then make requests to: http://localhost:8000/api/calculate

Example request:
{
    "module": "thp",
    "parameters": {
        "b_o": 188, "t_o": 25, "H": 200, "t_w": 6,
        "b_u": 450, "t_u": 15, "f_yk": 355,
        "gamma_M0": 1.05, "rho_steel": 7850
    }
}

Author: Magnus Fjeld Olsen
License: MIT
"""

import json
import os
import sys
import time
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import subprocess
import tempfile
from typing import Dict, Any, Optional

# Try to import selenium for browser-based calculations
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import WebDriverException
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False
    print("⚠️  Selenium not available. Browser-based calculations will be disabled.")

class StructuralAPIHandler(SimpleHTTPRequestHandler):
    """HTTP request handler for the structural engineering API."""
    
    def __init__(self, *args, **kwargs):
        # Set the directory to serve files from
        self.directory = str(Path(__file__).parent)
        super().__init__(*args, directory=self.directory, **kwargs)
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_POST(self):
        """Handle POST requests to API endpoints."""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api/calculate':
            self._handle_calculate_request()
        else:
            self.send_error(404, "API endpoint not found")
    
    def do_GET(self):
        """Handle GET requests - serve static files and API info."""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/api':
            self._handle_api_info()
        elif parsed_path.path == '/api/health':
            self._handle_health_check()
        else:
            # Serve static files (HTML, CSS, JS)
            super().do_GET()
    
    def _handle_api_info(self):
        """Return API information and documentation."""
        info = {
            "name": "Structural Engineering API",
            "version": "1.0.0",
            "description": "Unified API for structural engineering calculations",
            "endpoints": {
                "/api/calculate": {
                    "method": "POST",
                    "description": "Perform structural calculations",
                    "parameters": {
                        "module": "Calculation module (thp, concrete_beam, concrete_slab)",
                        "parameters": "Module-specific calculation parameters"
                    }
                },
                "/api/health": {
                    "method": "GET", 
                    "description": "Health check endpoint"
                }
            },
            "supported_modules": [
                {
                    "name": "thp",
                    "description": "Two-sided Hat Profile steel section calculations",
                    "example_parameters": {
                        "b_o": 188, "t_o": 25, "H": 200, "t_w": 6,
                        "b_u": 450, "t_u": 15, "f_yk": 355,
                        "gamma_M0": 1.05, "rho_steel": 7850
                    }
                },
                {
                    "name": "concrete_beam",
                    "description": "Concrete beam ULS design calculations",
                    "example_parameters": {
                        "geometry": {"b": 300, "h": 500, "c": 25},
                        "loads": {"MEd": 150, "VEd": 80},
                        "material": {"fck": 25, "fyk": 500}
                    }
                },
                {
                    "name": "concrete_slab", 
                    "description": "Concrete slab ULS design calculations",
                    "example_parameters": {
                        "geometry": {"MEd": 50, "t": 200, "c": 25},
                        "material": {"fcd": 16.7, "fyd": 435},
                        "reinforcement": {"phi_l": 12, "cc_l": 200}
                    }
                }
            ],
            "selenium_available": SELENIUM_AVAILABLE,
            "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
        }
        
        self._send_json_response(info)
    
    def _handle_health_check(self):
        """Return server health status."""
        health = {
            "status": "healthy",
            "timestamp": time.strftime('%Y-%m-%d %H:%M:%S'),
            "selenium_available": SELENIUM_AVAILABLE,
            "modules_available": ["thp", "concrete_beam", "concrete_slab"]
        }
        self._send_json_response(health)
    
    def _handle_calculate_request(self):
        """Handle calculation requests."""
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            # Parse JSON
            try:
                request_data = json.loads(post_data.decode('utf-8'))
            except json.JSONDecodeError as e:
                self._send_error_response(400, f"Invalid JSON: {str(e)}")
                return
            
            # Validate required fields
            if 'module' not in request_data:
                self._send_error_response(400, "Missing required field: 'module'")
                return
            
            if 'parameters' not in request_data:
                self._send_error_response(400, "Missing required field: 'parameters'")
                return
            
            module = request_data['module']
            parameters = request_data['parameters']
            
            # Route to appropriate calculation handler
            if module == 'thp':
                result = self._calculate_thp(parameters)
            elif module == 'concrete_beam':
                result = self._calculate_concrete_beam(parameters)
            elif module == 'concrete_slab':
                result = self._calculate_concrete_slab(parameters)
            else:
                self._send_error_response(400, f"Unknown module: {module}")
                return
            
            # Add metadata to result
            result['module'] = module
            result['api_version'] = '1.0.0'
            result['timestamp'] = time.strftime('%Y-%m-%d %H:%M:%S')
            
            self._send_json_response(result)
            
        except Exception as e:
            print(f"❌ Calculation error: {str(e)}")
            import traceback
            traceback.print_exc()
            self._send_error_response(500, f"Internal server error: {str(e)}")
    
    def _calculate_thp(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate THP steel profile using browser automation."""
        if not SELENIUM_AVAILABLE:
            return {
                "success": False,
                "error": "Selenium not available for THP calculations"
            }
        
        try:
            # Use headless Chrome to calculate
            options = Options()
            options.add_argument('--headless')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-gpu')
            
            driver = webdriver.Chrome(options=options)
            
            try:
                # Navigate to THP calculator
                thp_path = Path(self.directory) / "THP" / "index.html"
                driver.get(f"file://{thp_path}")
                
                # Wait for page to load
                WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.ID, "diagram"))
                )
                
                # Give time for JavaScript to initialize
                time.sleep(2)
                
                # Execute calculation
                result = driver.execute_script(
                    "return window.thpCalculate(arguments[0]);",
                    parameters
                )
                
                return result
                
            finally:
                driver.quit()
                
        except Exception as e:
            return {
                "success": False,
                "error": f"THP calculation failed: {str(e)}",
                "input": parameters
            }
    
    def _calculate_concrete_beam(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate concrete beam using browser automation."""
        if not SELENIUM_AVAILABLE:
            return {
                "success": False, 
                "error": "Selenium not available for concrete beam calculations"
            }
        
        try:
            options = Options()
            options.add_argument('--headless')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-gpu')
            
            driver = webdriver.Chrome(options=options)
            
            try:
                # Navigate to concrete beam calculator
                beam_path = Path(self.directory) / "concrete_beam_design" / "index.html"
                driver.get(f"file://{beam_path}")
                
                # Wait for page to load
                WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.TAG_NAME, "body"))
                )
                
                time.sleep(2)
                
                # Check if API function exists
                api_exists = driver.execute_script(
                    "return typeof window.concreteBeamCalculate === 'function';"
                )
                
                if api_exists:
                    result = driver.execute_script(
                        "return window.concreteBeamCalculate(arguments[0]);",
                        parameters
                    )
                else:
                    # API not yet implemented - return placeholder
                    result = {
                        "success": False,
                        "error": "Concrete beam API not yet implemented",
                        "input": parameters,
                        "note": "Will be implemented in next phase"
                    }
                
                return result
                
            finally:
                driver.quit()
                
        except Exception as e:
            return {
                "success": False,
                "error": f"Concrete beam calculation failed: {str(e)}",
                "input": parameters
            }
    
    def _calculate_concrete_slab(self, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate concrete slab using browser automation."""
        if not SELENIUM_AVAILABLE:
            return {
                "success": False,
                "error": "Selenium not available for concrete slab calculations"
            }
        
        try:
            options = Options()
            options.add_argument('--headless')
            options.add_argument('--no-sandbox') 
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-gpu')
            
            driver = webdriver.Chrome(options=options)
            
            try:
                # Navigate to concrete slab calculator
                slab_path = Path(self.directory) / "concrete_slab_design" / "index.html"
                driver.get(f"file://{slab_path}")
                
                # Wait for page to load
                WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.TAG_NAME, "body"))
                )
                
                time.sleep(2)
                
                # Check if API function exists
                api_exists = driver.execute_script(
                    "return typeof window.concreteSlabCalculate === 'function';"
                )
                
                if api_exists:
                    result = driver.execute_script(
                        "return window.concreteSlabCalculate(arguments[0]);",
                        parameters
                    )
                else:
                    # API not yet implemented - return placeholder
                    result = {
                        "success": False,
                        "error": "Concrete slab API not yet implemented",
                        "input": parameters,
                        "note": "Will be implemented in next phase"
                    }
                
                return result
                
            finally:
                driver.quit()
                
        except Exception as e:
            return {
                "success": False,
                "error": f"Concrete slab calculation failed: {str(e)}",
                "input": parameters
            }
    
    def _send_json_response(self, data: Dict[str, Any], status_code: int = 200):
        """Send JSON response with proper headers."""
        response_data = json.dumps(data, indent=2, ensure_ascii=False)
        
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(response_data)))
        self.end_headers()
        
        self.wfile.write(response_data.encode('utf-8'))
    
    def _send_error_response(self, status_code: int, message: str):
        """Send error response."""
        error_data = {
            "success": False,
            "error": message,
            "timestamp": time.strftime('%Y-%m-%d %H:%M:%S')
        }
        self._send_json_response(error_data, status_code)
    
    def log_message(self, format, *args):
        """Override log message to reduce noise."""
        if self.path.startswith('/api/'):
            print(f"{self.address_string()} - {format % args}")


def main():
    """Start the structural engineering API server."""
    
    print("🏗️  Structural Engineering API Server")
    print("=" * 50)
    print("Starting unified API server for structural calculations...")
    print()
    
    # Check if Selenium is available
    if SELENIUM_AVAILABLE:
        print("✅ Selenium WebDriver available - all modules enabled")
        
        # Test Chrome driver
        try:
            options = Options()
            options.add_argument('--headless')
            options.add_argument('--no-sandbox')
            test_driver = webdriver.Chrome(options=options)
            test_driver.quit()
            print("✅ Chrome WebDriver working correctly")
        except Exception as e:
            print(f"⚠️  Chrome WebDriver issue: {e}")
            print("   Install ChromeDriver: https://chromedriver.chromium.org/")
    else:
        print("⚠️  Selenium not available - install with: pip install selenium")
        print("   Some calculation modules may not work without Selenium")
    
    print()
    
    # Verify required files exist
    base_dir = Path(__file__).parent
    required_dirs = ["THP", "concrete_beam_design", "concrete_slab_design"]
    
    for dir_name in required_dirs:
        dir_path = base_dir / dir_name
        index_file = dir_path / "index.html"
        
        if index_file.exists():
            print(f"✅ {dir_name} module found: {index_file}")
        else:
            print(f"⚠️  {dir_name} module missing: {index_file}")
    
    print()
    
    # Start server
    server_address = ('', 8000)
    httpd = HTTPServer(server_address, StructuralAPIHandler)
    
    print("🚀 Server Configuration:")
    print(f"   • Address: http://localhost:8000")
    print(f"   • API Endpoint: http://localhost:8000/api/calculate")
    print(f"   • Health Check: http://localhost:8000/api/health") 
    print(f"   • API Info: http://localhost:8000/api")
    print()
    print("📋 Supported Modules:")
    print("   • thp - Two-sided Hat Profile calculations")
    print("   • concrete_beam - Concrete beam ULS design")
    print("   • concrete_slab - Concrete slab ULS design")
    print()
    print("🧪 Example API Request:")
    print("   POST http://localhost:8000/api/calculate")
    print("   Content-Type: application/json")
    print("   Body: {")
    print('     "module": "thp",')
    print('     "parameters": {')
    print('       "b_o": 188, "t_o": 25, "H": 200, "t_w": 6,')
    print('       "b_u": 450, "t_u": 15, "f_yk": 355,')
    print('       "gamma_M0": 1.05, "rho_steel": 7850')
    print("     }")
    print("   }")
    print()
    print("🔴 Press Ctrl+C to stop server")
    print("=" * 50)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
        httpd.server_close()


if __name__ == "__main__":
    main()