#!/bin/bash
# 에뮬레이터에 APK 설치 → 아이콘 누른 것처럼 실행 → 화면·로그 수집
set -x
OUT=out; mkdir -p $OUT
PKG=io.github.gmazellan123byte.ehsproposal
adb shell pm list packages | grep -iE "chrome|webview|browser|samsung" > $OUT/browsers.txt
adb shell dumpsys package com.android.chrome | grep -m2 versionName >> $OUT/browsers.txt
adb install -r ehs-proposal.apk > $OUT/install.txt 2>&1
adb logcat -c
adb shell monkey -p $PKG -c android.intent.category.LAUNCHER 1 > $OUT/monkey.txt 2>&1
for t in 3 8 20; do sleep $t; adb exec-out screencap -p > $OUT/shot-after-$t.png; done
adb shell dumpsys activity activities | grep -iE "ResumedActivity|mFocusedApp" > $OUT/top.txt
adb logcat -d > $OUT/logcat.txt
adb logcat -d -b crash > $OUT/crash.txt
grep -iE "$PKG|AndroidRuntime|browserhelper|TwaLauncher|CustomTabs|ActivityTaskManager|FATAL" $OUT/logcat.txt | head -300 > $OUT/logcat-filtered.txt
true
set +x
for f in browsers install monkey top crash logcat-filtered; do echo "=====BEGIN $f"; cat $OUT/$f.txt; echo "=====END $f"; done
# 화면 캡처(축소)를 로그로 출력
for t in 3 20; do
  python3 - "$OUT/shot-after-$t.png" <<'PY' || true
import sys,base64
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB'); im.thumbnail((360,800)); im.save('/tmp/s.jpg',quality=60)
print('=====BEGIN SHOT', sys.argv[1]); print(base64.b64encode(open('/tmp/s.jpg','rb').read()).decode()); print('=====END SHOT')
PY
done
