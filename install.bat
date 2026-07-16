@echo off
chcp 65001 >nul
cls
echo ========================================================
echo   Automated Setup in Progress... Please wait.
echo ========================================================

cd backend
if not exist "venv" (
    python -m venv venv >nul 2>&1
)

call venv\Scripts\activate.bat >nul 2>&1
python -m pip install --upgrade pip -i https://pypi.tuna.tsinghua.edu.cn/simple >nul 2>&1
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple >nul 2>&1

python download_model.py >nul 2>&1
python build_knowledge_base.py >nul 2>&1

if not exist ".env" (
    copy .env.example .env >nul 2>&1
)

cls
echo ========================================================
echo                   SUCCESS!
echo.
echo   Environment Setup Completed Successfully!
echo   All dependencies and models are ready.
echo.
echo   Please double click start.bat to run the server.
echo ========================================================
pause
