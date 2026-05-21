#!/usr/bin/env bash
# ==============================================
#   PCConnect 双实例测试启动器 (Git Bash)
# ==============================================

export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8

echo "========================================"
echo "   PCConnect 双实例测试"
echo "========================================"
echo ""

if [ ! -d "node_modules" ]; then
  echo "[错误] 未找到 node_modules，请先运行 npm install"
  exit 1
fi

participant_data="/tmp/pc-connect-test-participant"

# 启动主持方（后台）
echo "[1/2] 启动主持方 (Host) ..."
npx electron-vite dev &
host_pid=$!
echo "主持方 PID: $host_pid"

# 等待主持方准备就绪
echo "等待 8 秒，确保信令/隧道服务启动..."
sleep 8

# 启动观众方（后台），使用独立用户数据
echo "[2/2] 启动观众方 (Participant) ..."
npx electron-vite dev -- --user-data-dir="$participant_data" &
participant_pid=$!
echo "观众方 PID: $participant_pid"

echo ""
echo "========================================"
echo "  两个实例已启动！"
echo "  - 主持方窗口：开始共享 → 生成公网链接"
echo "  - 观众方窗口：粘贴链接 → 观看"
echo "========================================"
echo ""
echo "测试完成后关闭两个窗口，然后回到这里按 Ctrl+C 停止后台进程"

# 等待所有后台进程（按 Ctrl+C 退出）
wait