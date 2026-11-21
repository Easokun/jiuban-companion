#!/usr/bin/env bash
# 暖语 · 华为云 ECS 一键部署脚本（Ubuntu 22.04 / Debian 系）
# 用法：把整个 deploy 目录上传到服务器，cd 进去后执行
#   sudo bash deploy.sh sk-你的百炼Key [客户端令牌]
# 第二个参数不填会自动生成一个随机令牌，脚本结束时会打印出来
set -e

KEY="$1"
TOKEN="$2"

if [ -z "$KEY" ]; then
  echo "用法: sudo bash deploy.sh sk-你的百炼Key [客户端令牌]"
  exit 1
fi

if [ -z "$TOKEN" ]; then
  if command -v openssl >/dev/null 2>&1; then
    TOKEN="$(openssl rand -hex 16)"
  else
    TOKEN="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  fi
  echo "==> 未指定令牌，已随机生成：$TOKEN"
fi

APP_DIR=/opt/nuanyu
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> 1/6 安装依赖"
apt-get update -y
apt-get install -y python3 python3-venv python3-pip nginx

echo "==> 2/6 准备目录"
mkdir -p "$APP_DIR/static"
cp "$SRC_DIR/app.py" "$APP_DIR/"
cp "$SRC_DIR/../index.html" "$APP_DIR/static/index.html"

echo "==> 3/6 创建虚拟环境"
python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install -q --upgrade pip
"$APP_DIR/venv/bin/pip" install -q flask gunicorn requests

echo "==> 4/6 配置 systemd 服务"
sed -e "s|sk-在此填入你的百炼Key|$KEY|" \
    -e "s|在此填入客户端访问令牌|$TOKEN|" \
    "$SRC_DIR/nuanyu.service" > /etc/systemd/system/nuanyu.service
chown -R www-data:www-data "$APP_DIR"
systemctl daemon-reload
systemctl enable nuanyu
systemctl restart nuanyu

echo "==> 5/6 配置 nginx"
cp "$SRC_DIR/nginx-nuanyu.conf" /etc/nginx/conf.d/nuanyu.conf
nginx -t && systemctl restart nginx

echo "==> 6/6 自检"
sleep 2
curl -s http://127.0.0.1/api/health || echo "健康检查失败，看 /var/log/nuanyu.err.log"

echo ""
echo "部署完成 ✅"
echo "网页地址：http://服务器公网IP"
echo "App 设置：接口地址 http://服务器公网IP/api ，模型 qwen3.7-max"
echo "App 的「API Key」请填写客户端令牌：$TOKEN"
echo "（令牌等于访问密码，可以随时改 /etc/systemd/system/nuanyu.service 里的 NUANYU_TOKEN 后重启服务）"
