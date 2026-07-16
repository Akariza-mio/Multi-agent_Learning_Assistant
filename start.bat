@echo off
chcp 65001 >nul
echo ========================================================
echo   Starting OS Multi-Agent System...
echo ========================================================
echo.
echo Server is starting...
echo Please open http://127.0.0.1:8765 in your browser.
echo ========================================================
cd backend
venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8765 --reload
pause
