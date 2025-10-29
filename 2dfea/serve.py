#!/usr/bin/env python3
"""
Simple HTTP server for testing 2dfea worker
Serves from the 2dfea directory root

Usage:
    python serve.py

Then open: http://localhost:8000/test/worker-test.html
"""

import http.server
import socketserver
import os
import sys

PORT = 8000

# Change to the script's directory (2dfea root)
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler to add CORS headers and better logging"""

    def end_headers(self):
        # Add CORS headers for worker access
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # Important for SharedArrayBuffer (future Pyodide optimization)
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        super().end_headers()

    def log_message(self, format, *args):
        """Custom logging with colors"""
        msg = format % args
        if '.py' in msg:
            color = '\033[94m'  # Blue for Python files
        elif '.js' in msg:
            color = '\033[93m'  # Yellow for JS files
        elif '.html' in msg:
            color = '\033[92m'  # Green for HTML files
        else:
            color = '\033[0m'   # Default

        print(f"{color}[{self.log_date_time_string()}] {msg}\033[0m")

if __name__ == '__main__':
    print("=" * 60)
    print("2dfea Development Server")
    print("=" * 60)
    print(f"Serving from: {os.getcwd()}")
    print(f"Server running at: http://localhost:{PORT}")
    print(f"\nTest URLs:")
    print(f"  Worker Test: http://localhost:{PORT}/test/worker-test.html")
    print(f"\nPress Ctrl+C to stop")
    print("=" * 60)
    print()

    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nServer stopped.")
            sys.exit(0)
