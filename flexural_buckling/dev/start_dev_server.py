#!/usr/bin/env python3
"""
Development Server Manager for Flexural Buckling Module
Kills existing server on port 8000 and starts a new one serving the front page
"""

import subprocess
import sys
import os
import time
import signal
import webbrowser

def kill_server_on_port(port=8000):
    """Kill any process running on the specified port"""
    try:
        if sys.platform == 'win32':
            # Windows: Use netstat and taskkill
            result = subprocess.run(
                ['netstat', '-ano'],
                capture_output=True,
                text=True
            )

            for line in result.stdout.splitlines():
                if f':{port}' in line and 'LISTENING' in line:
                    # Extract PID (last column)
                    pid = line.strip().split()[-1]
                    print(f"Killing process {pid} on port {port}...")
                    subprocess.run(['taskkill', '/F', '/PID', pid],
                                 capture_output=True)
                    time.sleep(0.5)
        else:
            # Unix-like systems
            result = subprocess.run(
                ['lsof', '-ti', f':{port}'],
                capture_output=True,
                text=True
            )

            if result.stdout.strip():
                pids = result.stdout.strip().split('\n')
                for pid in pids:
                    print(f"Killing process {pid} on port {port}...")
                    os.kill(int(pid), signal.SIGTERM)
                    time.sleep(0.5)

        print(f"✓ Cleared port {port}")
        return True

    except Exception as e:
        print(f"Warning: Could not kill existing server: {e}")
        return False

def start_server(port=8000):
    """Start HTTP server on specified port"""
    # Get the structural_tools root directory (two levels up from this script)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.abspath(os.path.join(script_dir, '..', '..'))

    print(f"Starting server at: {root_dir}")
    print(f"Port: {port}")
    print(f"URL: http://localhost:{port}/")
    print("-" * 60)

    # Change to root directory
    os.chdir(root_dir)

    # Open browser to front page
    time.sleep(1)
    webbrowser.open(f'http://localhost:{port}/index.html')

    # Start server
    try:
        if sys.version_info >= (3, 0):
            subprocess.run(['python', '-m', 'http.server', str(port)])
        else:
            subprocess.run(['python', '-m', 'SimpleHTTPServer', str(port)])
    except KeyboardInterrupt:
        print("\n\nServer stopped by user")
        sys.exit(0)

def main():
    """Main entry point"""
    port = 8000

    print("=" * 60)
    print("Flexural Buckling Development Server")
    print("=" * 60)

    # Kill existing server
    kill_server_on_port(port)

    # Start new server
    start_server(port)

if __name__ == '__main__':
    main()
