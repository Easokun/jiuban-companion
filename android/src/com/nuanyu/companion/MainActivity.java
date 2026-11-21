package com.nuanyu.companion;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;

public class MainActivity extends Activity {

    private static final int REQ_FILE = 4001;

    private WebView webView;
    private TextToSpeech tts;
    private ValueCallback<Uri[]> filePathCallback;
    /* 是否正停在某个角色的聊天窗口：返回键先退到消息列表 */
    private boolean chatOpenFlag = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);

        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");
        webView.setWebViewClient(new WebViewClient());

        // 支持网页里的 <input type="file">，用于从手机选择备份文件导入
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                    return true;
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
            }
        });

        webView.loadUrl("file:///android_asset/www/index.html");

        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                if (status == TextToSpeech.SUCCESS && tts != null) {
                    tts.setLanguage(Locale.CHINA);
                    tts.setSpeechRate(0.95f);
                }
            }
        });

        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /** JS 桥：网页调用原生能力 */
    class Bridge {

        /** 保存备份文件到手机「下载/久伴备份」，返回保存位置；失败返回空串 */
        @JavascriptInterface
        public String saveBackup(String filename, String content) {
            if (content == null) return "";
            String safe = (filename == null || filename.trim().isEmpty())
                    ? "nuanyu-backup.json"
                    : filename.replaceAll("[\\\\/:*?\"<>|]", "_");
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                    cv.put(MediaStore.Downloads.MIME_TYPE, "application/octet-stream");
                    cv.put(MediaStore.Downloads.RELATIVE_PATH,
                            Environment.DIRECTORY_DOWNLOADS + "/久伴备份");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri != null) {
                        OutputStream os = getContentResolver().openOutputStream(uri);
                        if (os != null) {
                            os.write(content.getBytes("UTF-8"));
                            os.flush();
                            os.close();
                            return "手机存储/Download/久伴备份/" + safe;
                        }
                    }
                }
                File dir = new File(getExternalFilesDir(null), "backup");
                if (!dir.exists() && !dir.mkdirs()) return "";
                File f = new File(dir, safe);
                FileOutputStream fo = new FileOutputStream(f);
                fo.write(content.getBytes("UTF-8"));
                fo.flush();
                fo.close();
                return f.getAbsolutePath();
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void scheduleGoodnight(int hour, int minute, boolean on) {
            getSharedPreferences("nuanyu", MODE_PRIVATE)
                    .edit().putString("night", hour + ":" + minute + ":" + (on ? "1" : "0")).apply();
            scheduleNightAlarm(MainActivity.this, hour, minute, on);
        }

        @JavascriptInterface
        public void scheduleReminder(String id, String title, String text, String millis) {
            if (id == null) return;
            long ts;
            try {
                ts = Long.parseLong(millis);
            } catch (Exception e) {
                return;
            }
            if (ts <= System.currentTimeMillis()) return;
            // 持久化，重启手机后由 BootReceiver 恢复
            getSharedPreferences("nuanyu", MODE_PRIVATE).edit()
                    .putString("rem_" + id, ts + "\u0001" + clean(title) + "\u0001" + clean(text))
                    .apply();
            scheduleReminderAlarm(MainActivity.this, id, title, text, ts);
        }

        @JavascriptInterface
        public void cancelReminder(String id) {
            if (id == null) return;
            getSharedPreferences("nuanyu", MODE_PRIVATE).edit().remove("rem_" + id).apply();
            cancelReminderAlarm(MainActivity.this, id);
        }

        /** 通知权限是否已开（Android 24+ 支持查询） */
        @JavascriptInterface
        public boolean notificationsEnabled() {
            try {
                android.app.NotificationManager nm =
                        (android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (Build.VERSION.SDK_INT >= 24) return nm.areNotificationsEnabled();
                return true;
            } catch (Exception e) {
                return true;
            }
        }

        /** 立刻发一条测试通知，验证推送通道是否可用（走晚安渠道） */
        @JavascriptInterface
        public boolean testNotify() {
            try {
                Intent i = new Intent(MainActivity.this, GoodnightReceiver.class);
                i.putExtra("mode", "test");
                PendingIntent pi = PendingIntent.getBroadcast(MainActivity.this, 2902, i,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                pi.send(MainActivity.this, 0, null);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /* ---------- API Key：交给系统密钥库加密保存，网页侧不落地明文 ---------- */

        @JavascriptInterface
        public String getApiKey() {
            return SecureStore.get(MainActivity.this, "api_key");
        }

        @JavascriptInterface
        public boolean setApiKey(String key) {
            String k = key == null ? "" : key.trim();
            if (k.isEmpty()) {
                SecureStore.remove(MainActivity.this, "api_key");
                return true;
            }
            SecureStore.put(MainActivity.this, "api_key", k);
            return k.equals(SecureStore.get(MainActivity.this, "api_key"));
        }

        @JavascriptInterface
        public boolean hasApiKey() {
            return !SecureStore.get(MainActivity.this, "api_key").isEmpty();
        }

        @JavascriptInterface
        public void clearApiKey() {
            SecureStore.remove(MainActivity.this, "api_key");
        }

        /* ---------- 返回键：聊天页按返回先回消息列表 ---------- */
        @JavascriptInterface
        public void setChatOpen(boolean open) {
            chatOpenFlag = open;
        }

        /* ---------- 聊天记录：原生 SQLite，不再受 WebView 5MB 配额限制 ---------- */

        @JavascriptInterface
        public String getChat(String role) {
            return ChatStore.getAll(MainActivity.this, role);
        }

        @JavascriptInterface
        public boolean appendChat(String role, String who, String text, String millis) {
            long ts;
            try {
                ts = Long.parseLong(millis);
            } catch (Exception e) {
                ts = System.currentTimeMillis();
            }
            return ChatStore.append(MainActivity.this, role, who, text, ts, null);
        }

        /* 带来源标记（ai / off），用于界面上区分"模型生成"还是"本地话术" */
        @JavascriptInterface
        public boolean appendChat2(String role, String who, String text, String millis, String src) {
            long ts;
            try {
                ts = Long.parseLong(millis);
            } catch (Exception e) {
                ts = System.currentTimeMillis();
            }
            return ChatStore.append(MainActivity.this, role, who, text, ts, src);
        }

        @JavascriptInterface
        public boolean replaceChat(String role, String json) {
            return ChatStore.replace(MainActivity.this, role, json);
        }

        @JavascriptInterface
        public void trimChat(String role, int keep) {
            ChatStore.trim(MainActivity.this, role, keep);
        }

        @JavascriptInterface
        public void clearChat(String role) {
            ChatStore.clearRole(MainActivity.this, role);
        }

        @JavascriptInterface
        public int chatCount() {
            return ChatStore.count(MainActivity.this);
        }

        @JavascriptInterface
        public void clearAllChats() {
            ChatStore.clearAll(MainActivity.this);
        }

        @JavascriptInterface
        public void speak(final String text) {
            if (tts == null || text == null || text.isEmpty()) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "nuanyu");
                }
            });
        }

        @JavascriptInterface
        public void stopSpeak() {
            if (tts != null) tts.stop();
        }
    }

    private static String clean(String s) {
        if (s == null) return "";
        return s.replace("\u0001", " ").replace("\n", " ");
    }

    /** 设置每日晚安闹钟（精确闹钟，响完由 GoodnightReceiver 自己注册明天的） */
    static void scheduleNightAlarm(Context ctx, int hour, int minute, boolean on) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        Intent i = new Intent(ctx, GoodnightReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 1001, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (on) {
            java.util.Calendar c = java.util.Calendar.getInstance();
            c.set(java.util.Calendar.HOUR_OF_DAY, hour);
            c.set(java.util.Calendar.MINUTE, minute);
            c.set(java.util.Calendar.SECOND, 0);
            c.set(java.util.Calendar.MILLISECOND, 0);
            if (c.getTimeInMillis() <= System.currentTimeMillis()) {
                c.add(java.util.Calendar.DAY_OF_YEAR, 1);
            }
            try {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(), pi);
            } catch (SecurityException e) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(), pi);
            } catch (Exception e) {
                am.set(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(), pi);
            }
        } else {
            am.cancel(pi);
        }
    }

    /** 注册一次性日程提醒，供 Bridge 与 BootReceiver 共用 */
    static void scheduleReminderAlarm(Context ctx, String id, String title, String text, long ts) {
        if (id == null || ts <= System.currentTimeMillis()) return;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        Intent i = new Intent(ctx, ReminderReceiver.class);
        i.putExtra("id", id);
        i.putExtra("title", title);
        i.putExtra("text", text);
        int req = Math.abs(id.hashCode() % 100000);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, req, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ts, pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, ts, pi);
            }
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ts, pi);
        } catch (Exception e) {
            am.set(AlarmManager.RTC_WAKEUP, ts, pi);
        }
    }

    static void cancelReminderAlarm(Context ctx, String id) {
        if (id == null) return;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        Intent i = new Intent(ctx, ReminderReceiver.class);
        int req = Math.abs(id.hashCode() % 100000);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, req, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        /* 在某个角色的聊天窗口里：先退回消息列表（像微信一样） */
        if (chatOpenFlag) {
            chatOpenFlag = false;
            if (webView != null) {
                webView.evaluateJavascript("window.__nativeBack && window.__nativeBack();", null);
            }
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
