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
import socket

# Configuration
HOST = "localhost"

def find_available_port(start_port=8000):
    """Find an available port starting from start_port"""
    for port in range(start_port, start_port + 100):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind((HOST, port))
                return port
        except OSError:
            continue
    raise RuntimeError("No available ports found")

def start_server():
    """Start the HTTP server in the parent directory"""
    # Change to the parent directory (structural_tools)
    parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(parent_dir)
    
    print(f"Serving files from: {os.getcwd()}")
    
    # Find available port
    try:
        PORT = find_available_port()
        URL = f"http://{HOST}:{PORT}"
        print(f"Server starting on {URL}")
    except RuntimeError as e:
        print(f"Error: {e}")
        sys.exit(1)
    
    # Create server
    handler = http.server.SimpleHTTPRequestHandler
    
    try:
        with socketserver.TCPServer(("", PORT), handler) as httpd:
            print(f"Server started successfully!")
            print(f"Open your browser to: {URL}")
            print("Press Ctrl+C to stop the server")
            
            # Store URL globally for browser opening
            global GLOBAL_URL
            GLOBAL_URL = URL
            
            # Start server
            httpd.serve_forever()
            
    except OSError as e:
        print(f"Error starting server: {e}")
        sys.exit(1)

def open_browser():
    """Open browser after a short delay"""
    time.sleep(2)  # Wait for server to start
    try:
        url = GLOBAL_URL
        print(f"Opening browser: {url}")
        webbrowser.open(url)
    except NameError:
        # Fallback if global URL not set
        print("Server URL not available yet, skipping browser opening")

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