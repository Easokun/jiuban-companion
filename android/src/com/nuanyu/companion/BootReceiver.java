package com.nuanyu.companion;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import java.util.Map;

/** 开机后恢复晚安闹钟与一次性日程提醒（AlarmManager 闹钟不跨重启，需重新注册） */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        SharedPreferences sp = ctx.getSharedPreferences("nuanyu", Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();

        // 1) 晚安闹钟
        String s = sp.getString("night", "");
        if (s != null && !s.isEmpty()) {
            String[] p = s.split(":");
            if (p.length >= 3) {
                try {
                    MainActivity.scheduleNightAlarm(ctx,
                            Integer.parseInt(p[0]), Integer.parseInt(p[1]), "1".equals(p[2]));
                } catch (Exception ignored) {}
            }
        }

        // 2) 一次性日程提醒
        for (Map.Entry<String, ?> e : sp.getAll().entrySet()) {
            String k = e.getKey();
            if (k == null || !k.startsWith("rem_")) continue;
            String v = String.valueOf(e.getValue());
            String[] p = v.split("\u0001", -1);
            if (p.length < 3) continue;
            long ts;
            try {
                ts = Long.parseLong(p[0]);
            } catch (Exception ex) {
                continue;
            }
            String id = k.substring(4);
            if (ts <= now) {
                sp.edit().remove(k).apply();
                continue;
            }
            try {
                MainActivity.scheduleReminderAlarm(ctx, id, p[1], p[2], ts);
            } catch (Exception ignored) {}
        }
    }
}
