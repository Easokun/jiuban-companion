package com.nuanyu.companion;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 聊天记录存储：SQLite（一台手机只有一个库，容量跟着手机存储走，不再受 WebView
 * localStorage 的 5MB 配额限制）。每条消息单独一行，追加写入很快。
 */
final class ChatStore extends SQLiteOpenHelper {

    private static final String DB_NAME = "nuanyu_chats.db";
    private static final int DB_VERSION = 2;

    private ChatStore(Context ctx) {
        super(ctx.getApplicationContext(), DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE IF NOT EXISTS msgs (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "role TEXT NOT NULL," +
                "who TEXT NOT NULL," +
                "text TEXT NOT NULL," +
                "ts INTEGER NOT NULL," +
                "src TEXT)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_msgs_role ON msgs(role, id)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        /* v1 -> v2：加一列记录"这条回复是模型生成的还是本地话术生成的" */
        if (oldVersion < 2) {
            try {
                db.execSQL("ALTER TABLE msgs ADD COLUMN src TEXT");
            } catch (Exception ignored) {
            }
        }
    }

    /** 取某个角色的全部消息，返回 JSON 数组字符串；失败返回 "[]" */
    static synchronized String getAll(Context ctx, String role) {
        ChatStore h = new ChatStore(ctx);
        JSONArray arr = new JSONArray();
        SQLiteDatabase db = null;
        Cursor c = null;
        try {
            db = h.getReadableDatabase();
            c = db.rawQuery(
                    "SELECT who, text, ts, src FROM msgs WHERE role=? ORDER BY id ASC",
                    new String[]{role});
            while (c.moveToNext()) {
                JSONObject o = new JSONObject();
                try {
                    o.put("role", c.getString(0));
                    o.put("text", c.getString(1));
                    o.put("ts", c.getLong(2));
                    String s = c.isNull(3) ? "" : c.getString(3);
                    if (s != null && s.length() > 0) o.put("src", s);
                } catch (Exception ignored) {}
                arr.put(o);
            }
            return arr.toString();
        } catch (Exception e) {
            return "[]";
        } finally {
            if (c != null) c.close();
            h.close();
        }
    }

    /** 追加一条消息（src 可空：ai=模型生成，off=本地话术） */
    static synchronized boolean append(Context ctx, String role, String who, String text, long ts, String src) {
        ChatStore h = new ChatStore(ctx);
        try {
            SQLiteDatabase db = h.getWritableDatabase();
            ContentValues cv = new ContentValues();
            cv.put("role", role);
            cv.put("who", who);
            cv.put("text", text);
            cv.put("ts", ts);
            if (src != null && src.length() > 0) cv.put("src", src);
            return db.insert("msgs", null, cv) != -1;
        } catch (Exception e) {
            return false;
        } finally {
            h.close();
        }
    }

    /** 用一份完整 JSON 覆盖某个角色的消息（导入备份、清理、恢复时用） */
    static synchronized boolean replace(Context ctx, String role, String json) {
        ChatStore h = new ChatStore(ctx);
        SQLiteDatabase db = null;
        try {
            db = h.getWritableDatabase();
            JSONArray arr = new JSONArray(json);
            db.beginTransaction();
            try {
                db.delete("msgs", "role=?", new String[]{role});
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject o = arr.getJSONObject(i);
                    ContentValues cv = new ContentValues();
                    cv.put("role", role);
                    cv.put("who", o.optString("role", "bot"));
                    cv.put("text", o.optString("text", ""));
                    cv.put("ts", o.optLong("ts", System.currentTimeMillis()));
                    String s = o.optString("src", "");
                    if (s != null && s.length() > 0) cv.put("src", s);
                    db.insert("msgs", null, cv);
                }
                db.setTransactionSuccessful();
            } finally {
                db.endTransaction();
            }
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            h.close();
        }
    }

    /** 只保留最近 keep 条 */
    static synchronized void trim(Context ctx, String role, int keep) {
        if (keep < 10) keep = 10;
        ChatStore h = new ChatStore(ctx);
        try {
            SQLiteDatabase db = h.getWritableDatabase();
            db.execSQL("DELETE FROM msgs WHERE role=? AND id NOT IN " +
                            "(SELECT id FROM msgs WHERE role=? ORDER BY id DESC LIMIT ?)",
                    new Object[]{role, role, keep});
        } catch (Exception ignored) {
        } finally {
            h.close();
        }
    }

    static synchronized void clearRole(Context ctx, String role) {
        ChatStore h = new ChatStore(ctx);
        try {
            h.getWritableDatabase().delete("msgs", "role=?", new String[]{role});
        } catch (Exception ignored) {
        } finally {
            h.close();
        }
    }

    static synchronized void clearAll(Context ctx) {
        ChatStore h = new ChatStore(ctx);
        try {
            h.getWritableDatabase().delete("msgs", null, null);
        } catch (Exception ignored) {
        } finally {
            h.close();
        }
    }

    static synchronized int count(Context ctx) {
        ChatStore h = new ChatStore(ctx);
        Cursor c = null;
        try {
            c = h.getReadableDatabase().rawQuery("SELECT COUNT(*) FROM msgs", null);
            return c.moveToFirst() ? c.getInt(0) : 0;
        } catch (Exception e) {
            return 0;
        } finally {
            if (c != null) c.close();
            h.close();
        }
    }
}
