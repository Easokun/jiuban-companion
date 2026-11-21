package com.nuanyu.companion;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * 敏感信息加密存储。
 * 密钥由 AndroidKeyStore 生成并保管，明文密钥不出安全硬件/TEE，应用也无法导出，
 * 即使拿到 SharedPreferences 文件也解不开。
 */
final class SecureStore {

    private static final String PREF = "nuanyu_secure";
    private static final String ALIAS = "nuanyu.sensitive.v1";

    private SecureStore() {}

    private static SecretKey getKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (!ks.containsAlias(ALIAS)) {
            KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            kg.init(new KeyGenParameterSpec.Builder(ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build());
            kg.generateKey();
        }
        return (SecretKey) ks.getKey(ALIAS, null);
    }

    static void put(Context ctx, String name, String value) {
        if (value == null || value.isEmpty()) {
            remove(ctx, name);
            return;
        }
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, getKey());
            byte[] iv = c.getIV();
            byte[] ct = c.doFinal(value.getBytes("UTF-8"));
            String enc = Base64.encodeToString(iv, Base64.NO_WRAP) + ":"
                    + Base64.encodeToString(ct, Base64.NO_WRAP);
            ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putString(name, enc).apply();
        } catch (Exception ignored) {
        }
    }

    static String get(Context ctx, String name) {
        String enc = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(name, null);
        if (enc == null || enc.isEmpty()) return "";
        try {
            String[] p = enc.split(":");
            if (p.length != 2) return "";
            byte[] iv = Base64.decode(p[0], Base64.NO_WRAP);
            byte[] ct = Base64.decode(p[1], Base64.NO_WRAP);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, getKey(), new GCMParameterSpec(128, iv));
            return new String(c.doFinal(ct), "UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    static void remove(Context ctx, String name) {
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().remove(name).apply();
    }

    static void clear(Context ctx) {
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().clear().apply();
    }
}
