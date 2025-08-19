#!/usr/bin/env python3
"""
Structural Tools - Unified Python API Client
============================================

Super simple Python interface for all structural engineering calculations.
Uses just the requests library to communicate with the web-based calculators.

Usage:
    from structural_tools import calculate
    
    # THP calculation
    result = calculate("thp", {
        "b_o": 188, "t_o": 25, "H": 200, "t_w": 6,
        "b_u": 450, "t_u": 15, "f_yk": 355,
        "gamma_M0": 1.05, "rho_steel": 7850
    })
    
    print(f"Unit Weight: {result['unit_weight']} {result['unit_weight_unit']}")
    print(f"Moment Capacity: {result['M_Rd']} {result['M_Rd_unit']}")

Author: Magnus Fjeld Olsen
License: MIT
"""

import json
import time
import warnings
from typing import Dict, Any, List, Optional, Union
from pathlib import Path

try:
    import requests
except ImportError:
    raise ImportError("requests library required. Install with: pip install requests")

# Default server configuration
DEFAULT_SERVER_URL = "http://localhost:8000"
DEFAULT_TIMEOUT = 30

class StructuralToolsError(Exception):
    """Custom exception for structural calculation errors."""
    pass

class StructuralToolsClient:
    """
    Client for the Structural Engineering API.
    
    Provides a simple interface to perform structural calculations
    using various modules (THP, concrete beam, concrete slab).
    """
    
    def __init__(self, server_url: str = DEFAULT_SERVER_URL, timeout: int = DEFAULT_TIMEOUT):
        """
        Initialize the client.
        
        Args:
            server_url: URL of the structural API server
            timeout: Request timeout in seconds
        """
        self.server_url = server_url.rstrip('/')
        self.timeout = timeout
        self._session = requests.Session()
        
        # Test connection on initialization
        self._test_connection()
    
    def _test_connection(self):
        """Test connection to the API server."""
        try:
            response = self._session.get(
                f"{self.server_url}/api/health", 
                timeout=self.timeout
            )
            if response.status_code != 200:
                warnings.warn(f"API server returned status {response.status_code}")
        except requests.RequestException as e:
            warnings.warn(f"Cannot connect to API server at {self.server_url}: {e}")
    
    def calculate(self, module: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """
        Perform structural calculation.
        
        Args:
            module: Calculation module ('thp', 'concrete_beam', 'concrete_slab')
            parameters: Calculation parameters as dictionary
            
        Returns:
            Dictionary containing calculation results
            
        Raises:
            StructuralToolsError: If calculation fails
        """
        try:
            # Prepare request data
            request_data = {
                "module": module,
                "parameters": parameters
            }
            
            # Make API request
            response = self._session.post(
                f"{self.server_url}/api/calculate",
                json=request_data,
                headers={'Content-Type': 'application/json'},
                timeout=self.timeout
            )
            
            # Parse response
            try:
                result = response.json()
            except json.JSONDecodeError as e:
                raise StructuralToolsError(f"Invalid JSON response: {e}")
            
            # Check for API errors
            if not result.get('success', False):
                error_msg = result.get('error', 'Unknown error occurred')
                raise StructuralToolsError(f"Calculation failed: {error_msg}")
            
            return result
            
        except requests.RequestException as e:
            raise StructuralToolsError(f"Request failed: {e}")
    
    def calculate_batch(self, module: str, parameters_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Perform batch structural calculations.
        
        Args:
            module: Calculation module ('thp', 'concrete_beam', 'concrete_slab')  
            parameters_list: List of parameter dictionaries
            
        Returns:
            Dictionary containing batch calculation results
            
        Raises:
            StructuralToolsError: If calculation fails
        """
        try:
            # Prepare request data for batch calculation
            request_data = {
                "module": module,
                "parameters": parameters_list  # Send as array for batch processing
            }
            
            response = self._session.post(
                f"{self.server_url}/api/calculate",
                json=request_data,
                headers={'Content-Type': 'application/json'},
                timeout=self.timeout * 2  # Longer timeout for batch
            )
            
            try:
                result = response.json()
            except json.JSONDecodeError as e:
                raise StructuralToolsError(f"Invalid JSON response: {e}")
            
            # Check for API errors
            if not result.get('success', False):
                error_msg = result.get('error', 'Unknown error occurred')
                raise StructuralToolsError(f"Batch calculation failed: {error_msg}")
            
            return result
            
        except requests.RequestException as e:
            raise StructuralToolsError(f"Batch request failed: {e}")
    
    def get_api_info(self) -> Dict[str, Any]:
        """
        Get API information and supported modules.
        
        Returns:
            Dictionary containing API information
        """
        try:
            response = self._session.get(
                f"{self.server_url}/api",
                timeout=self.timeout
            )
            return response.json()
            
        except requests.RequestException as e:
            raise StructuralToolsError(f"Failed to get API info: {e}")
    
    def health_check(self) -> Dict[str, Any]:
        """
        Perform health check on the API server.
        
        Returns:
            Dictionary containing server health status
        """
        try:
            response = self._session.get(
                f"{self.server_url}/api/health",
                timeout=self.timeout
            )
            return response.json()
            
        except requests.RequestException as e:
            raise StructuralToolsError(f"Health check failed: {e}")

# Global client instance for simple usage
_client = None

def _get_client() -> StructuralToolsClient:
    """Get or create global client instance."""
    global _client
    if _client is None:
        _client = StructuralToolsClient()
    return _client

def calculate(module: str, parameters: Dict[str, Any], 
              server_url: str = None) -> Dict[str, Any]:
    """
    Simple function to perform structural calculations.
    
    This is the main user-facing function for single calculations.
    
    Args:
        module: Calculation module ('thp', 'concrete_beam', 'concrete_slab')
        parameters: Calculation parameters as dictionary
        server_url: Optional server URL (uses default if not provided)
        
    Returns:
        Calculation results dictionary with 'results' key containing final values
        
    Example:
        result = calculate("thp", {
            "b_o": 188, "t_o": 25, "H": 200, "t_w": 6,
            "b_u": 450, "t_u": 15, "f_yk": 355
        })
        
        print(f"Unit Weight: {result['results']['unit_weight']} kg/m")
        print(f"Moment Resistance: {result['results']['M_Rd']} kNm")
    """
    if server_url:
        client = StructuralToolsClient(server_url)
        return client.calculate(module, parameters)
    else:
        client = _get_client()
        return client.calculate(module, parameters)

def calculate_batch(module: str, parameters_list: List[Dict[str, Any]], 
                   server_url: str = None) -> Dict[str, Any]:
    """
    Simple function to perform batch structural calculations.
    
    Args:
        module: Calculation module ('thp', 'concrete_beam', 'concrete_slab')
        parameters_list: List of parameter dictionaries  
        server_url: Optional server URL (uses default if not provided)
        
    Returns:
        Batch calculation results dictionary
        
    Example:
        results = calculate_batch("thp", [
            {"b_o": 188, "b_u": 400, "H": 200, ...},
            {"b_o": 188, "b_u": 450, "H": 200, ...},
            {"b_o": 188, "b_u": 500, "H": 200, ...}
        ])
        
        for result in results['results']:
            if result['success']:
                print(f"Weight: {result['results']['unit_weight']} kg/m")
    """
    if server_url:
        client = StructuralToolsClient(server_url)
        return client.calculate_batch(module, parameters_list)
    else:
        client = _get_client()
        return client.calculate_batch(module, parameters_list)

def get_supported_modules() -> List[str]:
    """
    Get list of supported calculation modules.
    
    Returns:
        List of module names
    """
    try:
        client = _get_client()
        api_info = client.get_api_info()
        return [module['name'] for module in api_info.get('supported_modules', [])]
    except Exception:
        return ['thp', 'concrete_beam', 'concrete_slab']  # Default list

def health_check(server_url: str = None) -> bool:
    """
    Check if the API server is healthy.
    
    Args:
        server_url: Optional server URL (uses default if not provided)
        
    Returns:
        True if server is healthy, False otherwise
    """
    try:
        if server_url:
            client = StructuralToolsClient(server_url)
        else:
            client = _get_client()
        
        health = client.health_check()
        return health.get('status') == 'healthy'
        
    except Exception:
        return False

# Convenience functions for specific modules
def calculate_thp(parameters: Dict[str, Any], server_url: str = None) -> Dict[str, Any]:
    """
    Calculate THP (Two-sided Hat Profile) steel section.
    
    Args:
        parameters: THP calculation parameters
        server_url: Optional server URL
        
    Returns:
        THP calculation results
        
    Example:
        result = calculate_thp({
            "b_o": 188,      # Upper flange width (mm)
            "t_o": 25,       # Upper flange thickness (mm)
            "H": 200,        # Web height (mm)
            "t_w": 6,        # Web thickness (mm)
            "b_u": 450,      # Lower flange width (mm)
            "t_u": 15,       # Lower flange thickness (mm)
            "f_yk": 355,     # Steel yield strength (MPa)
            "gamma_M0": 1.05,# Safety factor
            "rho_steel": 7850# Steel density (kg/m³)
        })
    """
    return calculate("thp", parameters, server_url)

def calculate_concrete_beam(parameters: Dict[str, Any], server_url: str = None) -> Dict[str, Any]:
    """
    Calculate concrete beam ULS design.
    
    Args:
        parameters: Concrete beam calculation parameters
        server_url: Optional server URL
        
    Returns:
        Concrete beam calculation results
        
    Example:
        result = calculate_concrete_beam({
            "geometry": {"b": 300, "h": 500, "c": 25},
            "loads": {"MEd": 150, "VEd": 80},
            "material": {"fck": 25, "fyk": 500}
        })
    """
    return calculate("concrete_beam", parameters, server_url)

def calculate_concrete_slab(parameters: Dict[str, Any], server_url: str = None) -> Dict[str, Any]:
    """
    Calculate concrete slab ULS design.
    
    Args:
        parameters: Concrete slab calculation parameters
        server_url: Optional server URL
        
    Returns:
        Concrete slab calculation results
        
    Example:
        result = calculate_concrete_slab({
            "geometry": {"MEd": 50, "t": 200, "c": 25},
            "material": {"fcd": 16.7, "fyd": 435},
            "reinforcement": {"phi_l": 12, "cc_l": 200}
        })
    """
    return calculate("concrete_slab", parameters, server_url)

# For quick results access
def quick_results(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract quick results from a calculation response.
    
    Args:
        result: Full calculation result dictionary
        
    Returns:
        Dictionary with just the key results and units
    """
    if 'results' in result:
        return result['results']
    else:
        return {}

def print_results(result: Dict[str, Any], module: str = None):
    """
    Print calculation results in a user-friendly format.
    
    Args:
        result: Calculation result dictionary
        module: Optional module name for specific formatting
    """
    if not result.get('success', False):
        print(f"❌ Calculation failed: {result.get('error', 'Unknown error')}")
        return
    
    results = result.get('results', {})
    module_name = result.get('module', module or 'Unknown')
    
    print(f"\n🔧 {module_name.upper()} Calculation Results:")
    print("=" * 50)
    
    if module_name == 'thp':
        print(f"📏 Geometry:")
        print(f"   • Total Height: {results.get('H_tot', 'N/A')} {results.get('H_tot_unit', '')}")
        print(f"   • Total Area: {results.get('A_total', 'N/A')} {results.get('A_total_unit', '')}")
        print(f"   • Neutral Axis: {results.get('z_NA', 'N/A')} {results.get('z_NA_unit', '')}")
        print(f"   • Moment of Inertia: {results.get('I_y', 'N/A')} {results.get('I_y_unit', '')}")
        print(f"   • Section Modulus: {results.get('W_el', 'N/A')} {results.get('W_el_unit', '')}")
        print()
        print(f"🏗️  Structural Properties:")
        print(f"   • Unit Weight: {results.get('unit_weight', 'N/A')} {results.get('unit_weight_unit', '')}")
        print(f"   • Moment Resistance: {results.get('M_Rd', 'N/A')} {results.get('M_Rd_unit', '')}")
        print(f"   • Design Strength: {results.get('f_yd', 'N/A')} {results.get('f_yd_unit', '')}")
        print()
        print(f"📋 Classification:")
        print(f"   • Overall Class: {results.get('overall_classification', 'N/A')}")
        print(f"   • Upper Flange: Class {results.get('upper_flange_class', 'N/A')}")
        print(f"   • Lower Flange (Inner): Class {results.get('lower_flange_inner_class', 'N/A')}")
        print(f"   • Lower Flange (Outer): Class {results.get('lower_flange_outer_class', 'N/A')}")
        print(f"   • Web: Class {results.get('web_class', 'N/A')}")
    else:
        # Generic result printing
        for key, value in results.items():
            if not key.endswith('_unit'):
                unit_key = f"{key}_unit"
                unit = results.get(unit_key, '')
                print(f"   • {key.replace('_', ' ').title()}: {value} {unit}")
    
    print()

# Version information
__version__ = "1.0.0"
__author__ = "Magnus Fjeld Olsen"

if __name__ == "__main__":
    # Simple test/demo when run directly
    print("🏗️  Structural Tools - Python API Client")
    print(f"Version: {__version__}")
    print()
    
    # Check if server is running
    if health_check():
        print("✅ API Server is healthy")
        
        # Show supported modules
        modules = get_supported_modules()
        print(f"📋 Supported modules: {', '.join(modules)}")
        
        # Simple THP example
        print("\n🧪 Running THP calculation example...")
        try:
            result = calculate_thp({
                "b_o": 188, "t_o": 25, "H": 200, "t_w": 6,
                "b_u": 450, "t_u": 15, "f_yk": 355,
                "gamma_M0": 1.05, "rho_steel": 7850
            })
            
            print_results(result, "thp")
            
        except StructuralToolsError as e:
            print(f"❌ Test calculation failed: {e}")
    else:
        print("❌ API Server not available")
        print("   Make sure to start the server with: python structural_api_server.py")