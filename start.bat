@echo off
chcp 65001 >nul
echo ========================================================
echo   Starting Multi-Agent Learning Support System - 多智能体学习辅助系统...
echo ========================================================
echo.
echo Server is starting...
echo Please open http://127.0.0.1:8765 in your browser.
echo ========================================================
cd backend
venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8765 --reload
pause
