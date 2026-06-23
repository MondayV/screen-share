#!/usr/bin/env bash
# ============================================================
# PCConnect 双开测试脚本（Git Bash 兼容版）
# 直接从项目目录启动两个独立 PCConnect 实例，
# 用于端到端功能测试（主持人 + 观众）。
# 运行方式：在 Git Bash 中执行 bash test-two.sh
# ============================================================
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
err()   { echo -e "${RED}[ERR]${NC}   $1"; }

# ------------------------------------------------------------
# 清理函数
# ------------------------------------------------------------
cleanup() {
  echo ""
  info "清理中..."
  if [ -n "${PID_1:-}" ]; then
    kill "$PID_1" 2>/dev/null && info "已停止实例 1 (PID $PID_1)" || true
  fi
  if [ -n "${PID_2:-}" ]; then
    kill "$PID_2" 2>/dev/null && info "已停止实例 2 (PID $PID_2)" || true
  fi
}
trap cleanup EXIT

# ------------------------------------------------------------
# 检查 node_modules
# ------------------------------------------------------------
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  PCConnect 双开功能测试${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

cd "$ROOT_DIR"

if [ ! -d "node_modules" ]; then
  err "未找到 node_modules，请先运行 npm install"
  exit 1
fi

ok "node_modules 已就绪"

# ------------------------------------------------------------
# 设置独立的用户数据目录（避免配置冲突）
# ------------------------------------------------------------
PARTICIPANT_DATA_DIR="/tmp/pc-connect-test-participant"
rm -rf "$PARTICIPANT_DATA_DIR" 2>/dev/null
mkdir -p "$PARTICIPANT_DATA_DIR" 2>/dev/null

# ------------------------------------------------------------
# 启动双实例
# ------------------------------------------------------------
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  启动双实例${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 实例 1：主持人（使用默认用户数据）
info "启动实例 1 (主持人)"
npx electron-vite dev &
PID_1=$!
ok "实例 1 已启动 (PID: $PID_1)"

# 等待主持方就绪（MediaMTX + cloudflared 需要时间初始化）
info "等待 8 秒，确保主持方就绪..."
sleep 8

# 实例 2：观众（使用独立用户数据）
info "启动实例 2 (观众)"
npx electron-vite dev -- --user-data-dir="$PARTICIPANT_DATA_DIR" &
PID_2=$!
ok "实例 2 已启动 (PID: $PID_2)"

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  双实例已就绪${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "  实例 1 (PID: $PID_1) ← 角色：主持人"
echo "  实例 2 (PID: $PID_2) ← 角色：观众"
echo ""
echo "  测试流程："
echo "    1. 实例 1 点击「开始共享」启动串流"
echo "    2. 复制生成的播放链接"
echo "    3. 实例 2 切换到「观看」标签"
echo "    4. 粘贴链接并点击观看"
echo "    5. 验证画面是否正常播放"
echo ""
echo "  按 Ctrl+C 停止两个实例。"
echo ""

# 等待用户中断
wait $PID_1 $PID_2 2>/dev/null

echo ""
info "测试结束。"