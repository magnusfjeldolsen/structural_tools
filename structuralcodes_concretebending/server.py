"""
Flask backend server for concrete bending analysis
Runs structuralcodes locally and serves API to browser frontend
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import json
import os

# Import our existing concrete_bending module
from concrete_bending import run_analysis, get_section_visualization_data, create_rectangular_section

app = Flask(__name__)
CORS(app)  # Enable CORS for browser requests

# Serve static files
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

# API endpoint for analysis
@app.route('/api/analyze', methods=['POST'])
def analyze():
    """Run concrete bending analysis"""
    try:
        params = request.json
        print(f"Received analysis request with {len(params.get('reinforcements', []))} reinforcements")

        results = run_analysis(params)

        return jsonify({
            'success': True,
            'results': results
        })

    except Exception as e:
        print(f"Analysis error: {e}")
        import traceback
        traceback.print_exc()

        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

# API endpoint for visualization only (faster)
@app.route('/api/visualize', methods=['POST'])
def visualize():
    """Get visualization data without running full analysis"""
    try:
        params = request.json

        section, metadata = create_rectangular_section(params)
        viz_data = get_section_visualization_data(section)

        return jsonify({
            'success': True,
            'visualization': viz_data,
            'metadata': metadata
        })

    except Exception as e:
        print(f"Visualization error: {e}")
        import traceback
        traceback.print_exc()

        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# Health check
@app.route('/api/health', methods=['GET'])
def health():
    """Check if server is running"""
    return jsonify({
        'status': 'ok',
        'message': 'Concrete bending analysis server is running'
    })

if __name__ == '__main__':
    print("=" * 60)
    print("Concrete Bending Analysis Server")
    print("=" * 60)
    print("Starting server on http://localhost:5000")
    print("Open http://localhost:5000 in your browser")
    print("=" * 60)

    app.run(debug=True, port=5000, host='0.0.0.0')
