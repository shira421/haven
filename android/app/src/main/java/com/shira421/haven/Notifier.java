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
import android.os.Build;
import java.util.Calendar;

/**
 * Notifications that arrive while Haven is closed: the end of a session, the end of a break,
 * and the daily reminder. Each is an alarm that comes back here and is shown.
 */
public final class Notifier extends BroadcastReceiver {
    private static final String CHANNEL = "haven";
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
    }

    static boolean allowed(Context context) {
        return context.getSystemService(NotificationManager.class).areNotificationsEnabled();
    }

    static void post(Context context, String id, String title, String body) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        android.util.Log.i("Haven", "post " + id + " allowed=" + manager.areNotificationsEnabled());
        if (!manager.areNotificationsEnabled()) return;
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Sessions and reminders", NotificationManager.IMPORTANCE_DEFAULT));
        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(title == null ? "Haven" : title)
            .setContentText(body == null ? "" : body)
            .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body))
            .setContentIntent(tap)
            .setAutoCancel(true)
            .build();
        manager.notify(id.hashCode(), notification);
    }

    private static PendingIntent alarmIntent(Context context, String id, String title, String body) {
        Intent intent = new Intent(context, Notifier.class).setAction("com.shira421.haven.NOTIFY." + id)
            .putExtra("id", id).putExtra("title", title).putExtra("body", body);
        return PendingIntent.getBroadcast(context, id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Show a notification at a time. On time where the phone allows exact alarms; a little late otherwise. */
    static void schedule(Context context, String id, long at, String title, String body) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        PendingIntent pending = alarmIntent(context, id, title, body);
        boolean exact = Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms();
        android.util.Log.i("Haven", "schedule " + id + " in " + (at - System.currentTimeMillis()) + " ms exact=" + exact);
        try {
            if (exact) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
            else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
        } catch (SecurityException refused) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
        }
    }

    static void cancel(Context context, String id) {
        context.getSystemService(AlarmManager.class).cancel(alarmIntent(context, id, null, null));
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
