#!/usr/bin/env python3
"""
Local development server for structural tools
Starts HTTP server and opens browser automatically
"""

import http.server
import socketserver
import webbrowser
import threading
import time
import os
import sys

# Configuration
PORT = 8000
HOST = "localhost"
URL = f"http://{HOST}:{PORT}"

def start_server():
    """Start the HTTP server in the parent directory"""
    # Change to the parent directory (structural_tools)
    parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(parent_dir)
    
    print(f"Serving files from: {os.getcwd()}")
    print(f"Server starting on {URL}")
    
    # Create server
    handler = http.server.SimpleHTTPRequestHandler
    
    try:
        with socketserver.TCPServer(("", PORT), handler) as httpd:
            print(f"Server started successfully!")
            print(f"Open your browser to: {URL}")
            print("Press Ctrl+C to stop the server")
            
            # Start server
            httpd.serve_forever()
            
    except OSError as e:
        if e.errno == 10048:  # Port already in use on Windows
            print(f"Error: Port {PORT} is already in use.")
            print("Please close any existing server or change the PORT in this script.")
        else:
            print(f"Error starting server: {e}")
        sys.exit(1)

def open_browser():
    """Open browser after a short delay"""
    time.sleep(1.5)  # Wait for server to start
    print(f"Opening browser: {URL}")
    webbrowser.open(URL)

if __name__ == "__main__":
    print("=" * 50)
    print("  STRUCTURAL TOOLS - LOCAL DEVELOPMENT SERVER")
    print("=" * 50)
    
    # Start browser opening in separate thread
    browser_thread = threading.Thread(target=open_browser, daemon=True)
    browser_thread.start()
    
    # Start server (this will block)
    try:
        start_server()
    except KeyboardInterrupt:
        print("\n\nServer stopped by user")
        print("Goodbye!")