package com.nuanyu.companion;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** 一次性日程提醒 */
public class ReminderReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String id = intent.getStringExtra("id");
        String title = intent.getStringExtra("title");
        String text = intent.getStringExtra("text");
        if (title == null) title = "久伴提醒";

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage("com.nuanyu.companion");
        PendingIntent pi = null;
        if (open != null) {
            pi = PendingIntent.getActivity(ctx, 0, open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel("nuanyu_remind", "日程提醒",
                    NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("到了约定时间提醒你");
            nm.createNotificationChannel(ch);
            b = new Notification.Builder(ctx, "nuanyu_remind");
        } else {
            b = new Notification.Builder(ctx);
        }
        b.setSmallIcon(R.drawable.ic_notif)
                .setLargeIcon(android.graphics.BitmapFactory.decodeResource(ctx.getResources(), R.mipmap.ic_launcher))
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setDefaults(Notification.DEFAULT_ALL);
        if (pi != null) b.setContentIntent(pi);

        int nid = (id == null) ? 3001 : Math.abs(id.hashCode() % 100000) + 50000;
        nm.notify(nid, b.build());
    }
}
