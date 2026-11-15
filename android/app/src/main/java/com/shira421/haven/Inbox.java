package com.shira421.haven;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Checks the friends server for news while Haven is closed (friend requests, acceptances,
 * invitations, cheers, nudges, gifts) and shows each as a notification. Runs about every
 * 15 minutes, when the phone has a connection; the phone decides exactly when.
 */
public final class Inbox extends JobService {
    private static final int JOB = 4211;
    private static final String PREFS = "haven-news";
    private Thread worker;

    /** Remember where to check and as whom. An empty token stops the checks. */
    static void setAccount(Context context, String base, String token, JSONObject kinds) {
        SharedPreferences.Editor edit = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        edit.putString("base", base).putString("token", token)
            .putBoolean("friends", kinds == null || kinds.optBoolean("friends", true))
            .putBoolean("social", kinds == null || kinds.optBoolean("social", true)).apply();
        if (token.isEmpty()) context.getSystemService(JobScheduler.class).cancel(JOB);
        else schedule(context);
        android.util.Log.i("Haven", "news check " + (token.isEmpty() ? "off" : "on"));
    }

    /** Haven is going to the background: what was on screen until now has been seen. */
    static void schedule(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putLong("since", System.currentTimeMillis()).apply();
        if (prefs.getString("token", "").isEmpty()) return;
        JobScheduler jobs = context.getSystemService(JobScheduler.class);
        if (jobs.getPendingJob(JOB) != null) return;
        JobInfo job = new JobInfo.Builder(JOB, new ComponentName(context, Inbox.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(15 * 60 * 1000L)
            .setPersisted(true)
            .build();
        // Never let the background check take the app down: if Android refuses the job, the app
        // still shows news when it is opened.
        try {
            jobs.schedule(job);
        } catch (RuntimeException refused) {
            android.util.Log.w("Haven", "background check not scheduled", refused);
        }
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        worker = new Thread(() -> {
            try {
                check(this);
            } catch (Exception ignored) {
                // No connection, or the server is busy: the next run tries again.
            }
            jobFinished(params, false);
        });
        worker.start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        if (worker != null) worker.interrupt();
        return true;
    }

    private static void check(Context context) throws Exception {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String base = prefs.getString("base", ""), token = prefs.getString("token", "");
        if (base.isEmpty() || token.isEmpty() || MainActivity.inFront) return;
        long since = prefs.getLong("since", System.currentTimeMillis());
        HttpURLConnection connection = (HttpURLConnection) new URL(base + "/api/news?since=" + since).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(15000);
        connection.setRequestProperty("Authorization", "Bearer " + token);
        int status = connection.getResponseCode();
        if (status == 401) {
            // Signed out on the server: stop checking until the app signs in again.
            setAccount(context, "", "", null);
            return;
        }
        if (status != 200) return;
        JSONObject answer = new JSONObject(read(connection.getInputStream()));
        JSONArray news = answer.optJSONArray("news");
        long latest = since;
        boolean friends = prefs.getBoolean("friends", true), social = prefs.getBoolean("social", true);
        for (int i = 0; news != null && i < news.length(); i++) {
            JSONObject item = news.getJSONObject(i);
            latest = Math.max(latest, item.optLong("created"));
            String kind = item.optString("kind"), who = item.optString("name", "A friend");
            String title = null, body = null;
            boolean isFriends = true;
            switch (kind) {
                case "request": title = "New friend request"; body = who + " wants to be friends on Haven."; break;
                case "accepted": title = "Friend request accepted"; body = who + " accepted your request."; break;
                case "invite": title = "Focus together?"; body = who + " invited you to focus together."; break;
                case "sanctuary": title = "Join a sanctuary?"; body = who + " invited you to join their sanctuary."; break;
                case "cheer": title = "A cheer for you"; body = who + " cheered you on."; isFriends = false; break;
                case "nudge": title = "Time to focus?"; body = who + " is nudging you to focus."; isFriends = false; break;
                case "gift": title = "You got a gift"; body = who + " sent you something for your haven."; isFriends = false; break;
                default: break;
            }
            if (title == null || (isFriends ? !friends : !social)) continue;
            Notifier.post(context, "news-" + kind + "-" + item.optLong("created"), title, body);
        }
        prefs.edit().putLong("since", latest).apply();
    }

    private static String read(InputStream in) throws Exception {
        try (InputStream stream = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int n;
            while ((n = stream.read(buffer)) > 0) out.write(buffer, 0, n);
            return out.toString("UTF-8");
        }
    }
}
