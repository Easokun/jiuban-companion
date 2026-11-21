package com.nuanyu.companion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class GoodnightReceiver extends BroadcastReceiver {

    private static final String[] LINES = {
            "今天辛苦啦，盖好被子，梦里我陪你 🌙",
            "晚安，把今天的烦恼说给月亮听，然后好好睡一觉 ✨",
            "又到了要说晚安的时候，想我的话梦里见呀 💫",
            "夜深了，手机放下，闭上眼睛，明天我第一个跟你说早安 ☾",
            "今天也要好好休息呀，你已经很棒了，晚安 🌟"
    };

    @Override
    public void onReceive(Context ctx, Intent intent) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        String text = LINES[(int) (Math.random() * LINES.length)];

        /* 「测试通知」走同一个接收器但用固定文案，方便用户验证推送通道 */
        boolean isTest = "test".equals(intent.getStringExtra("mode"));
        if (isTest) text = "收到这条就说明推送通道是通的 ✅ 晚上到点也会这样提醒你 🌙";

        Intent open = ctx.getPackageManager().getLaunchIntentForPackage("com.nuanyu.companion");
        PendingIntent pi = null;
        if (open != null) {
            pi = PendingIntent.getActivity(ctx, 0, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel("nuanyu_night", "每日晚安",
                    NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("每天定时的晚安陪伴");
            nm.createNotificationChannel(ch);
            b = new Notification.Builder(ctx, "nuanyu_night");
        } else {
            b = new Notification.Builder(ctx);
        }
        b.setSmallIcon(R.drawable.ic_notif)
                .setLargeIcon(android.graphics.BitmapFactory.decodeResource(ctx.getResources(), R.mipmap.ic_launcher))
                .setContentTitle(isTest ? "久伴 · 测试通知" : "久伴 · 晚安")
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true);
        if (pi != null) b.setContentIntent(pi);
        nm.notify(isTest ? 2901 : 2001, b.build());

        /* 测试通知不参与日常链路；真正的晚安发完后，注册明天的闹钟（精确闹钟是一次性的） */
        if (!isTest) {
            String s = ctx.getSharedPreferences("nuanyu", Context.MODE_PRIVATE).getString("night", "");
            if (s != null && !s.isEmpty()) {
                String[] p = s.split(":");
                if (p.length >= 3 && "1".equals(p[2])) {
                    try {
                        MainActivity.scheduleNightAlarm(ctx,
                                Integer.parseInt(p[0]), Integer.parseInt(p[1]), true);
                    } catch (Exception ignored) {}
                }
            }
        }
    }
}
