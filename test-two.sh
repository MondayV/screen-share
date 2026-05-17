#!/bin/bash
# 双实例测试脚本 - 在 Git Bash 中运行: bash test-two.sh

echo "========================================"
echo "  Screen-Share 双实例测试启动器 (Git Bash)"
echo "========================================"
echo ""

# 检查 node_modules
if [ ! -d "node_modules" ]; then
  echo "[错误] 未找到 node_modules，请先执行 npm install"
  exit 1
fi

# 清理可能残留的临时用户数据（可选）
rm -rf /tmp/screen-share-test2 2>/dev/null

echo "[1/2] 启动主实例 (Host) ..."
# 在后台启动 Host，并将日志输出到控制台
npx electron-vite dev &
HOST_PID=$!
echo "Host PID: $HOST_PID"

# 等待 Host 启动（信令服务器就绪）
echo "等待 8 秒确保 Host 就绪..."
sleep 8

echo ""
echo "[2/2] 启动测试实例 (Participant)，使用独立用户数据..."
# 启动 Participant，新终端窗口
cmd //c start "Screen-Share Participant" bash -c "cd '$(pwd)' && npx electron-vite dev -- --user-data-dir=/tmp/screen-share-test2"

echo ""
echo "两个实例已启动！"
echo "  - Host 窗口：点击“开始共享”，选择窗口，获取 6 位短码"
echo "  - Participant 窗口：输入短码，点击“加入”"
echo ""
echo "测试完成后，关闭两个窗口，然后在此终端按 Ctrl+C 停止 Host 后台进程"
echo ""

# 等待 Host 进程（防止脚本退出）
wait $HOST_PID