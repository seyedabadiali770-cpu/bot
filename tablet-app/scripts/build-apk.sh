#!/usr/bin/env bash
# ساخت APK بدون Gradle — مستقیم با ابزارهای Android SDK
# نیازمند: ANDROID_HOME (یا ANDROID_SDK_ROOT) + JDK 8/11/17
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID="${HERE}/android"
WWW="${HERE}/www"
OUT="${HERE}/build"
APK_NAME="${APK_NAME:-StarLive.apk}"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK" ]; then echo "❌ ANDROID_HOME تنظیم نشده"; exit 1; fi

# آخرین نسخه build-tools و یک platform مناسب را پیدا کن
BT_DIR="$(ls -1d "$SDK"/build-tools/* 2>/dev/null | sort -V | tail -1)"
if [ -z "$BT_DIR" ]; then echo "❌ build-tools پیدا نشد"; exit 1; fi
PLATFORM="$(ls -1d "$SDK"/platforms/android-* 2>/dev/null | sort -V | tail -1)"
if [ -z "$PLATFORM" ]; then echo "❌ platform پیدا نشد"; exit 1; fi
ANDROID_JAR="$PLATFORM/android.jar"

AAPT2="$BT_DIR/aapt2"
D8="$BT_DIR/d8"
ZIPALIGN="$BT_DIR/zipalign"
APKSIGNER="$BT_DIR/apksigner"

echo "🔧 build-tools : $BT_DIR"
echo "🔧 platform    : $PLATFORM"

rm -rf "$OUT"
mkdir -p "$OUT/res" "$OUT/gen" "$OUT/classes" "$OUT/dex" "$OUT/assets/www"

# 1) کپی فایل‌های وب داخل assets
cp -r "$WWW"/. "$OUT/assets/www/"

# 2) کامپایل منابع
"$AAPT2" compile --dir "$ANDROID/res" -o "$OUT/res/resources.zip"

# 3) لینک منابع + مانیفست + assets
"$AAPT2" link \
  -o "$OUT/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$ANDROID/AndroidManifest.xml" \
  -R "$OUT/res/resources.zip" \
  -A "$OUT/assets" \
  --java "$OUT/gen" \
  --min-sdk-version 19 \
  --target-sdk-version 22 \
  --version-code 1 \
  --version-name 1.0 \
  --auto-add-overlay

# 4) کامپایل جاوا
find "$ANDROID/java" "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -encoding UTF-8 -source 8 -target 8 -nowarn \
  -bootclasspath "$ANDROID_JAR" -classpath "$ANDROID_JAR" \
  -d "$OUT/classes" @"$OUT/sources.txt" 2>&1 | grep -v 'bootstrap class path' || true

# 5) تبدیل به dex
find "$OUT/classes" -name '*.class' > "$OUT/classes.txt"
"$D8" --lib "$ANDROID_JAR" --min-api 19 --output "$OUT/dex" @"$OUT/classes.txt"

# 6) اضافه کردن classes.dex به apk
cd "$OUT/dex" && zip -q -u "$OUT/base.apk" classes.dex && cd "$HERE"

# 7) zipalign
"$ZIPALIGN" -f 4 "$OUT/base.apk" "$OUT/aligned.apk"

# 8) امضا (کلید دیباگ؛ برای نصب دستی روی تبلت کافی است)
KS="$OUT/debug.keystore"
keytool -genkeypair -v -keystore "$KS" -storepass android -keypass android \
  -alias starlive -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=StarLive, OU=App, O=StarLive, L=Tehran, S=Tehran, C=IR" >/dev/null 2>&1

"$APKSIGNER" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --min-sdk-version 19 --v1-signing-enabled true --v2-signing-enabled true \
  --out "$OUT/$APK_NAME" "$OUT/aligned.apk"

"$APKSIGNER" verify --min-sdk-version 19 "$OUT/$APK_NAME" && echo "✅ امضا درست است"

ls -lh "$OUT/$APK_NAME"
echo "🎉 آماده: $OUT/$APK_NAME"
