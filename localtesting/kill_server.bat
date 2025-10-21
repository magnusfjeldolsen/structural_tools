@echo off
REM Kill all processes using a specific port number
REM Usage: kill_server.bat [port_number]
REM Example: kill_server.bat 8000

setlocal

REM Set default port to 8000 if no argument provided
if "%1"=="" (
    set PORT=8000
) else (
    set PORT=%1
)

echo Searching for processes using port %PORT%...

REM Find the PID of the process using the port
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    echo Found process PID: %%a
    echo Killing process %%a...
    taskkill /F /PID %%a
)

echo Done! All processes on port %PORT% have been terminated.
pause
