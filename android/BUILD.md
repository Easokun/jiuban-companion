# Android 壳构建说明

本项目**不使用 Gradle**，直接用 Android SDK 的命令行工具链构建。目的是在一个只有 JDK + SDK 的机器上也能打出包，且整个构建过程完全透明、可逐步验证。

## 目录

```
android/
├── AndroidManifest.xml           # 权限、组件、WebView 配置
├── build.sh                      # 一键构建脚本
├── src/com/nuanyu/companion/
│   ├── MainActivity.java         # WebView 宿主 + JS 桥（21 个方法）
│   ├── ChatStore.java            # SQLite 聊天存储
│   ├── SecureStore.java          # AndroidKeyStore + AES-GCM 加密 API Key
│   ├── GoodnightReceiver.java    # 晚安通知
│   ├── ReminderReceiver.java     # 日程提醒
│   └── BootReceiver.java         # 开机恢复闹钟
└── res/                          # 图标、通知图标、应用名
```

> `assets/www/index.html` 不放在仓库里，由 `build.sh` 从仓库根目录的 `index.html` 复制生成——**前端始终只有一份**，避免改了一处忘了另一处。

## 前置条件

| 依赖 | 说明 |
|---|---|
| JDK 8+ | 需要 `javac`；建议设置 `JAVA_HOME` |
| Android SDK Build-Tools | 提供 `aapt` / `d8` / `zipalign` / `apksigner` |
| Android Platform | 提供 `android.jar`（脚本自动挑最新版本） |

SDK 路径默认取 `$LOCALAPPDATA/Android/Sdk`，可用环境变量 `ANDROID_SDK` 覆盖。

## 构建

```bash
cd android

# 1) 未签名包（本地调试，装不上手机，仅用于验证能否构建通过）
./build.sh

# 2) 正式签名包（可覆盖安装）
KS_PATH=/path/to/release.keystore \
KS_PASS=你的密码 \
KS_ALIAS=你的别名 \
./build.sh
```

产物输出到仓库根目录，命名为 `jiuban-YYYYMMDD.apk`。

## 七个步骤详解

```
aapt package -m -J gen          →  生成 R.java（资源索引）
javac -bootclasspath android.jar →  编译 Java，产出 .class
d8 --min-api 24                 →  .class 转 Android 字节码 classes.dex
aapt package -A assets          →  打包资源 + 前端，产出 base.apk
aapt add base.apk classes.dex   →  把 dex 塞进 APK
zipalign -p 4                   →  4 字节对齐（不做的后果：无法安装 / 运行时解析变慢）
apksigner sign + verify         →  签名并校验
```

## 三个踩过的坑（重要）

**1. 资源条目必须是正斜杠**
早期版本手工把 `index.html` 逐个 `aapt add` 进 APK，Windows 下路径被写成 `assets/www\index.html`。Android 的 AssetManager 只认 `/`，于是 WebView 打开 `file:///android_asset/www/index.html` 直接报
`net::ERR_FILE_NOT_FOUND`——**代码没错，包是坏的**。
正确做法：用 `aapt package -A assets` 整目录打包，由工具自己保证分隔符。

**2. 改代码后必须重编 dex**
只改 `index.html` 时不需要动 Java，直接重跑打包（第 4–7 步）；一旦改了 `.java`，必须重新 `javac` + `d8`，否则装上去的还是旧逻辑。判断方法：`python -c "print('关键字'.encode() in open('classes.dex','rb').read())"`。

**3. 明文 HTTP 需要显式放开**
Android 9+ 默认禁止明文流量。接入自建 Flask 代理（`http://`）时，必须在 `<application>` 上加
`android:usesCleartextTraffic="true"`，否则请求直接被系统拦掉，且报错信息很不直观。

## 签名密钥

**密钥库不在仓库里，也永远不要提交。** 一旦丢失，后续版本就无法覆盖安装（系统会因签名不一致拒绝），只能卸载重装并丢数据。请离线备份 keystore 文件与密码，参照 `keystore/签名说明-务必保存.txt`（该目录已被 `.gitignore` 排除）。

## Manifest 关键点

| 配置 | 原因 |
|---|---|
| `usesCleartextTraffic="true"` | 允许访问 HTTP 代理 |
| `POST_NOTIFICATIONS` | Android 13+ 通知权限需运行时申请 |
| `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` | 精确闹钟，否则晚安/提醒会被系统合并推迟 |
| `RECEIVE_BOOT_COMPLETED` | 重启后恢复闹钟 |
| `WAKE_LOCK` | 通知触发时唤醒 CPU |
| `splashScreenTheme` + `noHistory` | 冷启动白屏过渡 |
