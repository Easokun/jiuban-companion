#!/usr/bin/env bash
# 久伴 Android APK 一键构建脚本（不依赖 Gradle，直接调用 SDK 工具链）
#
# 用法：
#   ./build.sh                      # 构建未签名 APK（可用于本地调试）
#   KS_PATH=../keys/my.jks \
#   KS_PASS=你的密码 \
#   KS_ALIAS=你的别名 ./build.sh    # 构建并签名（可覆盖安装）
#
# 依赖：Android SDK build-tools（aapt / d8 / zipalign / apksigner）+ JDK 8 及以上
set -e

cd "$(dirname "$0")"

# ---------- 1. 定位工具链 ----------
SDK="${ANDROID_SDK:-$LOCALAPPDATA/Android/Sdk}"
BT="$(ls -d "$SDK"/build-tools/* 2>/dev/null | sort -V | tail -1)"
[ -n "$BT" ] || { echo "找不到 build-tools，请设置 ANDROID_SDK"; exit 1; }

PLATFORM="$(ls -d "$SDK"/platforms/android-* 2>/dev/null | sort -V | tail -1)"
AJ="$PLATFORM/android.jar"
[ -f "$AJ" ] || { echo "找不到 android.jar，请先安装一个 Platform SDK"; exit 1; }

JC="${JAVA_HOME:+$JAVA_HOME/bin/javac}"
[ -x "$JC" ] || JC="$(command -v javac)"
[ -n "$JC" ] || { echo "找不到 javac，请安装 JDK 并设置 JAVA_HOME"; exit 1; }

echo "build-tools : $BT"
echo "android.jar : $AJ"
echo "javac       : $JC"

# ---------- 2. 同步前端资源 ----------
# 前端只有一份（根目录 index.html），构建时复制进 assets，避免两份不同步
mkdir -p assets/www
cp ../index.html assets/www/index.html
echo "已同步 index.html -> assets/www/"

# ---------- 3. 生成 R.java ----------
rm -rf gen classes out
mkdir -p gen classes out
"$BT/aapt" package -m -J gen -M AndroidManifest.xml -S res -I "$AJ"

# ---------- 4. 编译 Java ----------
find src gen -name "*.java" > sources.txt
"$JC" -encoding UTF-8 -source 8 -target 8 -nowarn \
      -bootclasspath "$AJ" -d classes @sources.txt

# ---------- 5. 转换 dex ----------
find classes -name "*.class" > classes.txt
"$BT/d8" --min-api 24 --lib "$AJ" --output out @classes.txt

# ---------- 6. 打包资源（-A 整目录，保证条目使用正斜杠）----------
"$BT/aapt" package -f -M AndroidManifest.xml -S res -A assets -I "$AJ" -F out/base.apk

# ---------- 7. 写入 dex ----------
cp out/classes.dex out/
( cd out && "$BT/aapt" add base.apk classes.dex > /dev/null )

# ---------- 8. 对齐 ----------
"$BT/zipalign" -f -p 4 out/base.apk out/aligned.apk

# ---------- 9. 签名 ----------
NAME="jiuban-$(date +%Y%m%d).apk"
if [ -n "$KS_PATH" ]; then
  [ -f "$KS_PATH" ] || { echo "密钥库不存在：$KS_PATH"; exit 1; }
  "$BT/apksigner" sign --ks "$KS_PATH" --ks-pass "pass:$KS_PASS" \
      --ks-key-alias "$KS_ALIAS" --out "../$NAME" out/aligned.apk
  "$BT/apksigner" verify "../$NAME"
  echo "已签名输出：$(cd .. && pwd)/$NAME"
else
  cp out/aligned.apk "../$NAME"
  echo "⚠️ 未签名输出：$(cd .. && pwd)/$NAME"
  echo "   未签名包无法安装，正式分发请通过 KS_PATH / KS_PASS / KS_ALIAS 提供密钥库"
fi

# ---------- 10. 校验资源条目 ----------
echo "--- APK 内资源条目 ---"
"$BT/aapt" list "../$NAME" | grep -E "assets|classes.dex"
