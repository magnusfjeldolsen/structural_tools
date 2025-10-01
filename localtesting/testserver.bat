@echo off
echo Starting local server on port 8000...
echo.

REM Change to the repository root
cd C:\Python\structural_tools\structural_tools

REM Start the server in the background and open browser
start "Local Server" cmd /k python -m http.server 8000

REM Wait 2 seconds for server to start
timeout /t 2 /nobreak >nul

REM Open the front page in default browser
start http://localhost:8000/index.html

echo Server started! Press any key to stop the server...
pause >nul

REM Kill the server process
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)