#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
暖语 · 云端代理服务
作用：
 1. 托管静态页面（暖语 H5）
 2. 反向代理大模型接口，把百炼 API Key 藏在服务端，客户端拿不到
 3. 令牌鉴权 + 按 IP 限流，防止被人白刷你的额度
 4. 解决跨域（App 在 file:// 下调用需要 CORS）

运行：gunicorn -w 2 --threads 8 -b 127.0.0.1:8000 app:app
依赖：pip install flask gunicorn requests
环境变量：
  DASHSCOPE_API_KEY  必填，百炼 Key
  NUANYU_TOKEN       必填，客户端访问令牌（App/网页里填在「API Key」那一栏）
  DASHSCOPE_BASE     可选，默认 OpenAI 兼容地址
  RATE_PER_MIN       可选，单 IP 每分钟请求数，默认 20
  RATE_PER_DAY       可选，单 IP 每日请求数，默认 800
"""
import hmac
import os
import threading
import time
from collections import defaultdict, deque

import requests
from flask import Flask, Response, jsonify, request, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

DASHSCOPE_BASE = os.environ.get(
    "DASHSCOPE_BASE", "https://dashscope.aliyuncs.com/compatible-mode/v1"
).rstrip("/")
DASHSCOPE_KEY = os.environ.get("DASHSCOPE_API_KEY", "").strip()
NUANYU_TOKEN = os.environ.get("NUANYU_TOKEN", "").strip()

RATE_PER_MIN = int(os.environ.get("RATE_PER_MIN", "20"))
RATE_PER_DAY = int(os.environ.get("RATE_PER_DAY", "800"))
MAX_BODY = 256 * 1024  # 单个请求体上限 256KB

app = Flask(__name__, static_folder=None)

# ---------------- 限流（内存滑动窗口，够单机用） ----------------
_hits = defaultdict(deque)
_hits_lock = threading.Lock()


def client_ip():
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.remote_addr or "unknown"


def rate_check(ip):
    """返回 (原因, 建议等待秒数)；放行时返回 (None, 0)"""
    now = time.time()
    day_ago = now - 86400
    with _hits_lock:
        q = _hits[ip]
        while q and q[0] < day_ago:
            q.popleft()
        if len(q) >= RATE_PER_DAY:
            return "每日额度已用完", 3600
        recent = [t for t in q if t > now - 60]
        if len(recent) >= RATE_PER_MIN:
            wait = int(60 - (now - recent[0])) + 1
            return "请求太频繁", max(wait, 1)
        q.append(now)
    return None, 0


def cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = (
        "Content-Type, Authorization, X-Nuanyu-Token"
    )
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Max-Age"] = "1800"
    return resp


def token_ok():
    """常量时间比较，避免时序侧信道"""
    if not NUANYU_TOKEN:
        return False
    got = request.headers.get("X-Nuanyu-Token", "").strip()
    if not got:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            got = auth[7:].strip()
    return hmac.compare_digest(got, NUANYU_TOKEN)


def err(status, message, wait=None):
    resp = jsonify({"error": {"message": message}})
    resp.status_code = status
    if wait:
        resp.headers["Retry-After"] = str(wait)
    return cors(resp)


# ---------------- 路由 ----------------
@app.route("/")
def index():
    return cors(send_from_directory(STATIC_DIR, "index.html"))


@app.route("/<path:filename>")
def static_files(filename):
    return cors(send_from_directory(STATIC_DIR, filename))


@app.route("/api/health")
def health():
    return cors(jsonify({
        "ok": True,
        "key_configured": bool(DASHSCOPE_KEY),
        "token_configured": bool(NUANYU_TOKEN),
        "upstream": DASHSCOPE_BASE,
        "rate_per_min": RATE_PER_MIN,
        "rate_per_day": RATE_PER_DAY,
    }))


@app.route("/api/<path:sub>", methods=["POST", "GET", "OPTIONS"])
def proxy(sub):
    """把 /api/chat/completions 转发到 https://dashscope.../chat/completions"""
    if request.method == "OPTIONS":
        return cors(Response("", status=204))

    if not DASHSCOPE_KEY:
        return err(500, "服务端未配置 DASHSCOPE_API_KEY")
    if not NUANYU_TOKEN:
        return err(503, "服务端未配置 NUANYU_TOKEN（为了安全，未配置时拒绝提供代理）")
    if not token_ok():
        return err(401, "访问令牌不正确：请在 App 的「API Key」里填写服务端配置的 NUANYU_TOKEN")
    if ".." in sub:
        return err(400, "非法路径")

    reason, wait = rate_check(client_ip())
    if reason:
        return err(429, reason, wait)

    payload = request.get_data()
    if len(payload) > MAX_BODY:
        return err(413, "请求体过大")

    url = DASHSCOPE_BASE + "/" + sub
    headers = {
        "Content-Type": request.headers.get("Content-Type", "application/json"),
        "Authorization": "Bearer " + DASHSCOPE_KEY,  # 客户端令牌不会传给上游
        "Accept": request.headers.get("Accept", "application/json"),
    }
    try:
        upstream = requests.request(
            method=request.method,
            url=url,
            data=payload,
            headers=headers,
            stream=True,
            timeout=180,
        )
    except Exception as e:
        return err(502, "上游请求失败: %s" % e)

    def generate():
        for chunk in upstream.iter_content(chunk_size=None):
            if chunk:
                yield chunk

    resp = Response(
        generate(),
        status=upstream.status_code,
        content_type=upstream.headers.get("Content-Type", "text/event-stream"),
    )
    resp.headers["X-Accel-Buffering"] = "no"   # 关闭 nginx 缓冲，保证流式输出
    resp.headers["Cache-Control"] = "no-cache"
    return cors(resp)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=False)
