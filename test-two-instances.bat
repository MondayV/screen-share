@echo off
echo ========================================
echo   Screen-Share 双实例测试启动器
echo ========================================
echo.

REM 设置终端编码为 UTF-8，避免中文乱码
chcp 65001 >nul

echo [1/2] 启动主实例（默认用户数据）...
start "Screen-Share - 主实例" cmd /c "npx electron-vite preview"

REM 等待主实例完全启动（信令服务器就绪）
timeout /t 5 /nobreak >nul

echo [2/2] 启动测试实例（独立用户数据）...
start "Screen-Share - 测试实例" cmd /c "npx electron-vite preview -- --user-data-dir=%TEMP%\screen-share-test2"

echo.
echo 两个实例已启动，主实例共享屏幕，测试实例输入短码连接。
echo 注意：共享时请选择单个窗口，避免无限镜像。
echo.
pause