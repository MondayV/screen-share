@echo off
:: 必须放在最前面，让所有后续输出使用 UTF-8
chcp 65001 >nul 2>&1

echo ========================================
echo   Screen-Share 双实例测试启动器
echo ========================================
echo.
echo 正在启动两个独立实例：
echo   [Host]     左侧窗口 — 用来开始共享，获取短码
echo   [Participant] 右侧窗口 — 输入短码加入观看
echo.

:: 检查 node_modules 是否存在，若无则提示安装
if not exist node_modules\ (
    echo 错误：未找到 node_modules，请先运行 npm install
    pause
    exit /b 1
)

echo [1/2] 启动主实例 (Host) ...
start "Screen-Share Host" cmd /c "cd /d %cd% && npx electron-vite dev"
echo 等待 5 秒确保 Host 就绪...
timeout /t 5 /nobreak >nul

echo [2/2] 启动测试实例 (Participant)，使用独立用户数据 ...
:: 关键修正：将完整命令放在双引号中，内部引号转义，并用 && 串联 cd 和 npx
start "Screen-Share Participant" cmd /c "cd /d %cd% && npx electron-vite dev -- --user-data-dir=%TEMP%\screen-share-test2"

echo.
echo 两个实例已启动！请按以下步骤测试：
echo   1. 在 Host 窗口点击“开始共享”，选择屏幕或窗口，记住 6 位短码
echo   2. 在 Participant 窗口输入短码，点击“加入”
echo   3. 检查 Participant 窗口是否出现共享画面
echo.
pause