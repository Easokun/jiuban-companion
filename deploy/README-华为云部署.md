# 暖语 · 华为云部署指南

目标：把这套东西放到华为云服务器上，做到两件事——

1. **网页版可访问**：任何设备浏览器打开域名就能用（不用装 App）
2. **API Key 不外泄**：客户端调用你自己的域名，由服务器注入百炼 Key（手机 App 里填的"Key"是假值也行）

---

## 一、买服务器（5 分钟）

1. 登录华为云 → 弹性云服务器 ECS → 购买
2. 规格建议：**2 核 2G / 40G 系统盘**（够用很久，代理几乎不吃 CPU）
3. 镜像选 **Ubuntu 22.04 64 位**（脚本按 Ubuntu 写；选 EulerOS 的话把 `apt-get` 换成 `dnf`）
4. 带宽：按流量计费，1~5 Mbps 足够
5. 创建时设置 root 密码，记下来

## 二、开放端口（关键，不做会打不开）

华为云控制台 → 该 ECS → **安全组 → 入方向规则 → 添加**：

| 协议 | 端口 | 源地址 | 说明 |
|---|---|---|---|
| TCP | 22 | 你的电脑 IP | SSH 登录 |
| TCP | 80 | 0.0.0.0/0 | HTTP |
| TCP | 443 | 0.0.0.0/0 | HTTPS（配证书后） |

## 三、上传并部署（10 分钟）

本地用 MobaXterm / Xshell / WinSCP 连上服务器，把 `deploy` 整个文件夹传到 `/root/`，然后：

```bash
cd /root/deploy
sudo bash deploy.sh sk-你的百炼Key
```

脚本会自动完成：装 Python + Nginx → 建虚拟环境 → 生成**客户端访问令牌** → 配 systemd → 配 nginx → 自检。

跑完会打印类似这样的一行，**把令牌抄下来**（App 里要填）：

```
App 的「API Key」请填写客户端令牌：3f9c2a7e5b1d4c8a9e6f0b2d7a1c5e34
```

也可以自己指定令牌：`sudo bash deploy.sh sk-你的百炼Key 我的令牌`

看到 `部署完成 ✅` 就成功了，浏览器打开 `http://你的公网IP` 即可。

## 四、手机 App 指向云端（可选，推荐）

App 里「设置 → AI 模型」：

| 字段 | 填什么 |
|---|---|
| 接口地址 | `http://你的公网IP/api`（或 `https://你的域名/api`） |
| API Key | **部署时生成的客户端令牌**（不是百炼 Key！） |
| 模型 | `qwen3.7-max` |

这样即使 APK 被分享出去，别人也拿不到你的 Key，而且**手机端不需要能直连百炼**。
令牌不对会被服务端返回 401，每小时刷太多会返回 429。

## 五、配域名 + HTTPS（可选，1 小时，不含备案）

```bash
# 1. DNS 解析：域名 A 记录指向服务器 IP
# 2. 装证书（Let's Encrypt 免费）
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

> ⚠️ 国内服务器绑定域名需要 **ICP 备案**，没备案只能用 IP 访问（HTTP）。想跳过备案可以用中国香港/新加坡节点。

## 六、常用运维命令

```bash
sudo systemctl status nuanyu          # 服务状态
sudo systemctl restart nuanyu         # 重启（改代码后）
sudo journalctl -u nuanyu -n 50       # 看日志
curl http://127.0.0.1/api/health      # 健康检查（key_configured 应为 true）
tail -f /var/log/nuanyu.err.log       # 错误日志
```

更新网页（改了 index.html）：

```bash
cp 新的index.html /opt/nuanyu/static/index.html
# 静态文件不需要重启服务
```

更换 Key：

```bash
sudo sed -i 's|DASHSCOPE_API_KEY=.*|DASHSCOPE_API_KEY=sk-新Key|' /etc/systemd/system/nuanyu.service
sudo systemctl daemon-reload && sudo systemctl restart nuanyu
```

## 七、安全机制（已内置，不用自己配）

| 机制 | 说明 | 在哪改 |
|---|---|---|
| **令牌鉴权** | 客户端必须带 `NUANYU_TOKEN`，否则 401 | `/etc/systemd/system/nuanyu.service` 的 `NUANYU_TOKEN=` |
| **应用层限流** | 单 IP 每分钟 20 次、每天 800 次，超了返回 429 | 同上，`RATE_PER_MIN` / `RATE_PER_DAY` |
| **nginx 限流** | 单 IP 每分钟 30 次，突发 10 次 | `/etc/nginx/conf.d/nuanyu.conf` |
| **请求体上限** | 单请求 256KB（应用）+ 1MB（nginx） | `< 见 app.py 的 MAX_BODY` |
| **路径校验** | 拒绝 `..` 之类的路径穿越 | `app.py` |

改完配置要重启服务：

```bash
sudo systemctl daemon-reload && sudo systemctl restart nuanyu
```

另外：

- **不要**把 Key 写进前端 JS 或提交到 GitHub，只放在服务器环境变量
- 公网暴露的代理建议再在华为云 WAF 里配访问控制（可选）
- 想彻底省心可以给域名配 HTTPS，避免令牌在公网明文传输

## 八、目录结构（部署后）

```
/opt/nuanyu/
├── app.py              # Flask 代理 + 静态托管
├── static/index.html   # 暖语前端（唯一文件）
└── venv/               # Python 依赖
/etc/nginx/conf.d/nuanyu.conf
/etc/systemd/system/nuanyu.service
```
