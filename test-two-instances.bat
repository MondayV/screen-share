@echo off
chcp 65001 >nul
echo ========================================
echo   Screen-Share 双实例测试启动器
echo ========================================
echo.

:: 检查依赖
if not exist "node_modules\" (
    echo [!] 未检测到 node_modules，正在安装依赖...
    call npm install
)

:: 检查端口占用
netstat -ano | findstr :3456 >nul
if %errorlevel%==0 (
    echo [!] 端口 3456 已被占用，请先关闭占用程序或修改端口
    pause
    exit /b
)

echo [1/2] 启动主实例（信令服务器）...
start "Screen-Share - 主实例" cmd /c "npx electron-vite preview"
echo 等待信令服务器启动（10秒）...
timeout /t 10 /nobreak >nul

echo [2/2] 启动测试实例（独立用户数据）...
start "Screen-Share - 测试实例" cmd /c "npx electron-vite preview -- --user-data-dir=%TEMP%\screen-share-test2"

echo.
echo   ✓ 两个实例已启动
echo   - 主实例窗口：用于共享屏幕，生成短码
echo   - 测试实例窗口：输入短码加入
echo   ⚠ 共享时请选择单个窗口，避免无限镜像
echo.
pause