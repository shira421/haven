package com.shira421.haven;

import android.Manifest;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.view.HapticFeedbackConstants;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.WebViewAssetLoader;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/** Hosts the bundled Haven web app and gives it what only the phone can do. See src/device.js. */
public final class MainActivity extends Activity {
    private static final int REQUEST_NOTIFICATIONS = 1;
    private static final String PREFS = "haven-away";
    private static final String CRASH = "haven-crash";
    private static int rendererLosses = 0;
    /** True while Haven is on screen; background news checks then leave it to the app. */
    static volatile boolean inFront = false;
    private WebView webView;
    private final List<String> notifyWaiting = new ArrayList<>();

    private final class Bridge {
        /** Called from the page as HavenNative.device(id, json). Answers through window.__havenReply. */
        @JavascriptInterface
        public void device(final String id, final String json) {
            runOnUiThread(() -> handle(id, json));
        }
    }

    private void handle(String id, String json) {
        JSONObject m;
        try {
            m = new JSONObject(json);
        } catch (Exception error) {
            reply(id, null, "Bad request");
            return;
        }
        android.util.Log.i("Haven", "bridge " + m.optString("action") + " " + m.optString("id", ""));
        try {
            switch (m.optString("action")) {
                case "notifyPermission":
                    notificationPermission(id, m.optBoolean("request"));
                    break;
                case "schedule": {
                    String which = m.optString("id", "session");
                    // "Come back to Haven" is only for someone who switched apps, not for a locked phone.
                    if ("away".equals(which) && phoneLocked()) {
                        reply(id, false, null);
                        break;
                    }
                    Notifier.schedule(this, which, m.optLong("at"), m.optString("title", "Haven"), m.optString("body"));
                    reply(id, true, null);
                    break;
                }
                case "notify":
                    Notifier.post(this, m.optString("id", "haven"), m.optString("title", "Haven"), m.optString("body"));
                    reply(id, true, null);
                    break;
                case "cancel":
                    Notifier.cancel(this, m.optString("id", "session"));
                    reply(id, true, null);
                    break;
                case "reminder":
                    Notifier.setReminder(this, m.optBoolean("on"), m.optInt("hour", 19), m.optInt("minute", 0), m.optString("title", "Time to focus"), m.optString("body"));
                    reply(id, true, null);
                    break;
                case "account":
                    // The friends server and this device's sign-in, for checking for news while Haven is closed.
                    Inbox.setAccount(this, m.optString("base", ""), m.optString("token", ""), m.optJSONObject("kinds"));
                    reply(id, true, null);
                    break;
                case "openSettings": {
                    // Haven's notification settings, where notifications refused earlier can be turned on.
                    Intent settings = new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName());
                    startActivity(settings);
                    reply(id, true, null);
                    break;
                }
                case "lastCrash": {
                    // What went wrong the last time Haven closed unexpectedly, once.
                    SharedPreferences crash = getSharedPreferences(CRASH, Context.MODE_PRIVATE);
                    String text = crash.getString("text", "");
                    crash.edit().clear().apply();
                    reply(id, text.isEmpty() ? null : text, null);
                    break;
                }
                case "keepAwake":
                    if (m.optBoolean("on")) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    reply(id, true, null);
                    break;
                case "haptic": {
                    String kind = m.optString("kind");
                    int effect = Build.VERSION.SDK_INT >= 30 && "success".equals(kind) ? HapticFeedbackConstants.CONFIRM
                        : Build.VERSION.SDK_INT >= 30 && "warning".equals(kind) ? HapticFeedbackConstants.REJECT
                        : HapticFeedbackConstants.KEYBOARD_TAP;
                    if (webView != null) webView.performHapticFeedback(effect);
                    reply(id, true, null);
                    break;
                }
                case "share": {
                    Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, m.optString("text"));
                    startActivity(Intent.createChooser(send, null));
                    reply(id, true, null);
                    break;
                }
                case "away": {
                    SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                    JSONObject value = new JSONObject();
                    value.put("at", prefs.getLong("at", 0));
                    value.put("locked", prefs.getBoolean("locked", false));
                    reply(id, value, null);
                    break;
                }
                default:
                    reply(id, null, "Unknown action");
            }
        } catch (Exception error) {
            reply(id, null, "The phone could not do that. Try again.");
        }
    }

    private void reply(String id, Object value, String error) {
        JSONObject answer = new JSONObject();
        try {
            if (error != null) answer.put("error", error);
            else answer.put("value", value == null ? JSONObject.NULL : value);
        } catch (Exception ignored) { }
        if (webView != null) webView.evaluateJavascript("window.__havenReply&&window.__havenReply(" + JSONObject.quote(id) + "," + answer + ")", null);
    }

    private void notificationPermission(String id, boolean request) {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            if (!request) {
                reply(id, "default", null);
                return;
            }
            notifyWaiting.add(id);
            if (notifyWaiting.size() == 1) requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
            return;
        }
        reply(id, Notifier.allowed(this) ? "granted" : "denied", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQUEST_NOTIFICATIONS) return;
        boolean granted = false;
        for (int result : results) granted |= result == PackageManager.PERMISSION_GRANTED;
        List<String> waiting = new ArrayList<>(notifyWaiting);
        notifyWaiting.clear();
        for (String id : waiting) reply(id, granted && Notifier.allowed(this) ? "granted" : "denied", null);
    }

    /** Keep what went wrong if Haven is about to close, so it can say so the next time it opens. */
    private void recordCrashes() {
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        final Context app = getApplicationContext();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                StringWriter trace = new StringWriter();
                error.printStackTrace(new PrintWriter(trace));
                String text = "Haven " + BuildConfig.VERSION_NAME + " on Android " + Build.VERSION.RELEASE + " (" + Build.MODEL + ")\n" + trace;
                app.getSharedPreferences(CRASH, Context.MODE_PRIVATE).edit().putString("text", text.length() > 6000 ? text.substring(0, 6000) : text).commit();
            } catch (Throwable ignored) { }
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        recordCrashes();
        if (BuildConfig.WEB_DEBUG) WebView.setWebContentsDebuggingEnabled(true);
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        webView = new WebView(this);
        webView.setBackgroundColor(night ? 0xff14152b : 0xfff5f5fb);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setTextZoom(100);
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        webView.addJavascriptInterface(new Bridge(), "HavenNative");
        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            /**
             * Android can stop the web view's page process, for example when memory runs low. Without
             * this the whole app closes. Start the page again instead; a running session is in storage.
             */
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                rendererLosses++;
                if (webView == view) {
                    webView = null;
                    view.destroy();
                    if (rendererLosses <= 3) recreate(); else finish();
                }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("https".equals(scheme) && "appassets.androidplatform.net".equals(uri.getHost())
                    && uri.getPath() != null && uri.getPath().startsWith("/assets/")) return false;
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (ActivityNotFoundException ignored) {
                        // Devices without a browser keep the application open.
                    }
                }
                return true;
            }
        });
        webView.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(webView);
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    /**
     * Haven is no longer in front. Note when, and whether the phone was locked or its screen
     * turned off: that does not count as leaving a session, while switching to another app does.
     */
    @Override
    protected void onStart() {
        super.onStart();
        inFront = true;
    }

    @Override
    protected void onStop() {
        super.onStop();
        inFront = false;
        boolean locked = phoneLocked();
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putLong("at", System.currentTimeMillis()).putBoolean("locked", locked).apply();
        // The page may have asked for "come back" before the screen went dark. A locked phone is not leaving.
        if (locked) Notifier.cancel(this, "away");
        Inbox.schedule(this);
    }

    private boolean phoneLocked() {
        boolean screenOff = !getSystemService(PowerManager.class).isInteractive();
        boolean keyguard = getSystemService(KeyguardManager.class).isKeyguardLocked();
        return screenOff || keyguard;
    }

    // The page sees itself hidden and visible again through these.
    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    /** Back closes an open sheet first; otherwise Haven goes to the background and keeps its state. */
    @Override
    public void onBackPressed() {
        if (webView == null) { moveTaskToBack(true); return; }
        webView.evaluateJavascript("(function(){var d=document.querySelector('dialog[open]');if(d&&d.querySelector('[data-action=\"close-dialog\"]')){d.close();return true}return false})()",
            closed -> { if (!"true".equals(closed)) moveTaskToBack(true); });
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("HavenNative");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
