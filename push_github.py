#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把本地仓库推到 GitHub，并为每个版本创建 Release（附对应 APK）。

用法：
    export GH_TOKEN=ghp_xxx
    python push_github.py --user 你的用户名 --repo jiuban-companion [--private]

安全：
- token 只从环境变量读取，不写进 .git/config
- push 用的是一次性 URL，完成后 remote 改回干净地址
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

API = "https://api.github.com"
UPLOADS = "https://uploads.github.com"
HERE = os.path.dirname(os.path.abspath(__file__))
APK_DIR = os.environ.get("APK_DIR", os.path.expanduser("~/nuanyu-apk"))

# tag -> APK 文件名
APKS = {
    "v1.0": "Nuanyu-v1.0.apk",
    "v1.1": "Nuanyu-v1.1.apk",
    "v1.2": "Nuanyu-v1.2.apk",
    "v1.3": "Nuanyu-v1.3.apk",
    "v1.4": "Nuanyu-v1.4.apk",
    "v1.5": "Nuanyu-v1.5.apk",
    "v1.6": "Nuanyu-v1.6.apk",
    "v1.7": "Nuanyu-v1.7.apk",
    "v1.8": "Nuanyu-v1.8.apk",
    "v1.8.1": "Nuanyu-v1.8.1.apk",
    "v1.8.2": "Nuanyu-v1.8.2.apk",
    "v1.9": "Nuanyu-v1.9.apk",
    "v1.9.1": "Nuanyu-v1.9.1.apk",
    "v1.10": "Jiuban-v1.10.apk",
}

TITLES = {
    "v1.0": "v1.0 离线情感陪伴雏形",
    "v1.1": "v1.1 长期事实抽取与纪念日",
    "v1.2": "v1.2 智能体内核：流式、工具调用、摘要压缩",
    "v1.3": "v1.3 备份导入导出与数据迁移",
    "v1.4": "v1.4 安全加固：加密备份、Key 不落盘",
    "v1.5": "v1.5 聊天记录迁入 SQLite",
    "v1.6": "v1.6 消息来源标记、未读与会话管理",
    "v1.7": "v1.7 连接状态真实化与自检",
    "v1.8": "v1.8 网页版记住访问令牌",
    "v1.8.1": "v1.8.1 修复 APK 打不开（资源路径反斜杠）",
    "v1.8.2": "v1.8.2 改用整目录打包，版本号可见化",
    "v1.9": "v1.9 设置并入角色主页，新增防漂移锚定",
    "v1.9.1": "v1.9.1 修复晚安推送不触发",
    "v1.10": "v1.10 更名久伴",
}

TOKEN = os.environ.get("GH_TOKEN", "").strip()
if not TOKEN:
    sys.exit("缺少环境变量 GH_TOKEN")


def req(method, url, data=None, raw=None, ctype="application/json"):
    if raw is not None:
        body, headers = raw, {"Content-Type": ctype, "Content-Length": str(len(raw))}
    elif data is not None:
        body, headers = json.dumps(data).encode(), {"Content-Type": "application/json"}
    else:
        body, headers = None, {}
    headers["Authorization"] = "token " + TOKEN
    headers["Accept"] = "application/vnd.github+json"
    headers["User-Agent"] = "jiuban-release-script"
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            txt = resp.read().decode("utf-8", "replace")
            return resp.status, (json.loads(txt) if txt.strip() else {})
    except urllib.error.HTTPError as e:
        txt = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, {"message": txt[:300]}


def run(cmd, env=None):
    print("$", " ".join(c if "ghp_" not in c and "@github" not in c else "<redacted>" for c in cmd))
    p = subprocess.run(cmd, cwd=HERE, env=env, capture_output=True, text=True)
    if p.returncode != 0:
        print(p.stdout[-2000:])
        print(p.stderr[-2000:], file=sys.stderr)
        raise SystemExit("命令失败：%s" % cmd[1])
    return p.stdout


def changelog_section(tag):
    """从 CHANGELOG.md 摘出该版本的说明"""
    text = io.open(os.path.join(HERE, "CHANGELOG.md"), encoding="utf-8").read()
    blocks = re.split(r"\n## ", text)
    key = tag.lstrip("v")
    for b in blocks:
        head = b.split("\n", 1)[0]
        if head.replace(" ", "").startswith(key.replace(".", ".") + "—") or (" " + key + " ") in (" " + head + " "):
            return b.split("\n", 1)[1].strip() if "\n" in b else b.strip()
    for b in blocks:
        head = b.split("\n", 1)[0]
        if key in head and re.match(r"^[\d.]+", head.replace("v", "")):
            return b.split("\n", 1)[1].strip() if "\n" in b else b.strip()
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--user", required=True)
    ap.add_argument("--repo", default="jiuban-companion")
    ap.add_argument("--private", action="store_true")
    ap.add_argument("--skip-release", action="store_true")
    args = ap.parse_args()

    # 1. 验证 token
    st, me = req("GET", API + "/user")
    if st != 200:
        sys.exit("token 无效或权限不足：%s %s" % (st, me.get("message")))
    print("已认证：", me["login"])
    user = me["login"]
    if args.user.lower() != user.lower():
        print("提示：参数 --user 与 token 归属（%s）不一致，以 token 归属为准" % user)

    # 2. 建仓库（已存在则复用）
    st, repo = req("POST", API + "/user/repos", {
        "name": args.repo,
        "description": "久伴 · 情感陪伴智能体：多角色独立记忆、WebView + 原生桥、SQLite 存储、加密备份",
        "private": bool(args.private),
        "has_issues": True,
        "has_wiki": False,
        "auto_init": False,
    })
    if st == 201:
        print("仓库已创建：", repo["html_url"])
    elif st == 422:
        st2, repo = req("GET", API + "/repos/%s/%s" % (user, args.repo))
        if st2 != 200:
            sys.exit("仓库已存在但无法访问：%s" % repo.get("message"))
        print("仓库已存在，复用：", repo["html_url"])
    else:
        sys.exit("创建仓库失败：%s %s" % (st, repo.get("message")))

    # 3. 推送
    remote = "https://%s:%s@github.com/%s/%s.git" % (user, TOKEN, user, args.repo)
    subprocess.run(["git", "remote", "remove", "origin"], cwd=HERE, capture_output=True)
    run(["git", "remote", "add", "origin", "https://github.com/%s/%s.git" % (user, args.repo)])
    run(["git", "-c", "credential.helper=", "push", "--quiet", remote, "main:main"])
    run(["git", "-c", "credential.helper=", "push", "--quiet", remote, "--tags"])
    print("代码与 14 个标签已推送")

    if args.skip_release:
        return

    # 4. 每个版本一个 Release
    for tag in sorted(APKS, key=lambda v: [int(x) for x in v.lstrip("v").split(".")]):
        body = changelog_section(tag) or TITLES.get(tag, tag)
        body += "\n\n---\n安装包：`%s`（覆盖安装不丢数据；从 v1.10 起应用名为「久伴」）" % APKS[tag]
        st, rel = req("POST", API + "/repos/%s/%s/releases" % (user, args.repo), {
            "tag_name": tag,
            "name": TITLES.get(tag, tag),
            "body": body,
            "draft": False,
            "prerelease": False,
        })
        if st == 422:  # 已存在
            print("Release 已存在，跳过：", tag)
            continue
        if st != 201:
            print("Release 创建失败 %s：%s" % (tag, rel.get("message")))
            continue

        apk = os.path.join(APK_DIR, APKS[tag])
        if os.path.exists(apk):
            with open(apk, "rb") as f:
                data = f.read()
            st2, asset = req("POST",
                             "%s/repos/%s/%s/releases/%d/assets?name=%s"
                             % (UPLOADS, user, args.repo, rel["id"], APKS[tag]),
                             raw=data, ctype="application/vnd.android.package-archive")
            print("  %-8s release ✓  APK %s" % (tag, "✓" if st2 == 201 else "✗ " + str(asset.get("message"))))
        else:
            print("  %-8s release ✓  无 APK 文件" % tag)

    print("\n完成：https://github.com/%s/%s" % (user, args.repo))


if __name__ == "__main__":
    main()
