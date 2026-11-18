package com.shira421.haven;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Calendar;
import org.json.JSONObject;

/**
 * Notifications that arrive while Haven is closed: the end of a session, the end of a break,
 * a session lost by staying away, and the daily reminder. Each is an alarm that comes back here
 * and is shown. A finished session chimes like the app does; a lost one has its own falling chime.
 */
public final class Notifier extends BroadcastReceiver {
    private static final String CHANNEL = "haven";
    // A channel's sound cannot change once made, so each sound has its own channel.
    private static final String DONE = "haven-done";
    private static final String LOST = "haven-lost";
    private static final String PREFS = "haven-notify";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            // Alarms do not survive a restart: put the daily reminder back.
            scheduleReminder(context);
            return;
        }
        String id = intent.getStringExtra("id");
        post(context, id == null ? "haven" : id, intent.getStringExtra("title"), intent.getStringExtra("body"));
        if ("reminder".equals(id)) scheduleReminder(context);
        // Away too long: the session is lost now. Tell the server at once, so a campfire where the
        // fire goes out for everyone goes out for the others now, not when Haven is opened again.
        String session = intent.getStringExtra("session");
        if ("lost".equals(id) && session != null && !session.isEmpty()) {
            PendingResult pending = goAsync();
            new Thread(() -> {
                try {
                    reportLost(context, session);
                } finally {
                    pending.finish();
                }
            }).start();
        }
    }

    private static void reportLost(Context context, String session) {
        String[] account = Inbox.account(context);
        if (account == null) return;
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(account[0] + "/api/session/end").openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + account[1]);
            byte[] body = new JSONObject().put("id", session).put("status", "failed").toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = connection.getOutputStream()) { out.write(body); }
            if (BuildConfig.DEBUG) android.util.Log.i("Haven", "lost reported " + connection.getResponseCode());
            connection.disconnect();
        } catch (Exception ignored) {
            // Offline: Haven tells the server when it is opened again.
        }
    }

    /** Which channel, and so which sound, a notification uses. */
    private static String channelFor(String id) {
        if ("session".equals(id) || "break".equals(id)) return DONE;
        if ("lost".equals(id) || id.startsWith("lost-")) return LOST;
        return CHANNEL;
    }

    private static void channels(Context context, NotificationManager manager) {
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Reminders and friends", NotificationManager.IMPORTANCE_DEFAULT));
        AudioAttributes audio = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        NotificationChannel done = new NotificationChannel(DONE, "Session finished", NotificationManager.IMPORTANCE_HIGH);
        done.setSound(Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.chime), audio);
        NotificationChannel lost = new NotificationChannel(LOST, "Session lost", NotificationManager.IMPORTANCE_HIGH);
        lost.setSound(Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.wilt), audio);
        manager.createNotificationChannel(done);
        manager.createNotificationChannel(lost);
    }

    static boolean allowed(Context context) {
        return context.getSystemService(NotificationManager.class).areNotificationsEnabled();
    }

    static void post(Context context, String id, String title, String body) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (BuildConfig.DEBUG) android.util.Log.i("Haven", "post " + id + " allowed=" + manager.areNotificationsEnabled());
        if (!manager.areNotificationsEnabled()) return;
        channels(context, manager);
        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(context, channelFor(id))
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(title == null ? "Haven" : title)
            .setContentText(body == null ? "" : body)
            .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body))
            .setContentIntent(tap)
            .setAutoCancel(true)
            .build();
        manager.notify(id.hashCode(), notification);
    }

    private static PendingIntent alarmIntent(Context context, String id, String title, String body, String session) {
        Intent intent = new Intent(context, Notifier.class).setAction("com.shira421.haven.NOTIFY." + id)
            .putExtra("id", id).putExtra("title", title).putExtra("body", body).putExtra("session", session);
        return PendingIntent.getBroadcast(context, id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Show a notification at a time. On time where the phone allows exact alarms; a little late otherwise. */
    static void schedule(Context context, String id, long at, String title, String body) {
        schedule(context, id, at, title, body, null);
    }

    static void schedule(Context context, String id, long at, String title, String body, String session) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        PendingIntent pending = alarmIntent(context, id, title, body, session);
        boolean exact = Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms();
        if (BuildConfig.DEBUG) android.util.Log.i("Haven", "schedule " + id + " in " + (at - System.currentTimeMillis()) + " ms exact=" + exact);
        try {
            if (exact) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
            else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
        } catch (SecurityException refused) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
        }
    }

    static void cancel(Context context, String id) {
        context.getSystemService(AlarmManager.class).cancel(alarmIntent(context, id, null, null, null));
        context.getSystemService(NotificationManager.class).cancel(id.hashCode());
    }

    static void setReminder(Context context, boolean on, int hour, int minute, String title, String body) {
        SharedPreferences.Editor edit = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        edit.putBoolean("on", on).putInt("hour", hour).putInt("minute", minute).putString("title", title).putString("body", body).apply();
        scheduleReminder(context);
    }

    /** Set the alarm for the next time the reminder is due, or clear it when the reminder is off. */
    static void scheduleReminder(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("on", false)) {
            cancel(context, "reminder");
            return;
        }
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, prefs.getInt("hour", 19));
        next.set(Calendar.MINUTE, prefs.getInt("minute", 0));
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis() + 5000) next.add(Calendar.DAY_OF_YEAR, 1);
        schedule(context, "reminder", next.getTimeInMillis(), prefs.getString("title", "Time to focus"), prefs.getString("body", ""));
    }
}
