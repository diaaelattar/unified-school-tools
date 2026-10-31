package eg.gov.nepras.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

@CapacitorPlugin(name = "EmisBrowser")
public class EmisBrowserPlugin extends Plugin {
    private WebView emisWebView;
    private String defaultUserAgent = "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService ioPool = Executors.newCachedThreadPool();
    private final ConcurrentHashMap<String, PluginCall> pendingExecCalls = new ConcurrentHashMap<>();
    private final AtomicLong execSeq = new AtomicLong(0);
    private boolean isVisible = true;
    private SSLSocketFactory emisSslSocketFactory = null;

    private synchronized SSLSocketFactory getEmisSslSocketFactory() {
        if (emisSslSocketFactory != null) return emisSslSocketFactory;
        try {
            TrustManager[] trustAllEmis = new TrustManager[]{
                new X509TrustManager() {
                    @Override
                    public void checkClientTrusted(X509Certificate[] chain, String authType) {}
                    @Override
                    public void checkServerTrusted(X509Certificate[] chain, String authType) {}
                    @Override
                    public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                }
            };
            SSLContext sc = SSLContext.getInstance("TLS");
            sc.init(null, trustAllEmis, new SecureRandom());
            emisSslSocketFactory = sc.getSocketFactory();
        } catch (Exception ignored) {}
        return emisSslSocketFactory;
    }

    @PluginMethod
    public void init(PluginCall call) {
        mainHandler.post(() -> {
            if (emisWebView == null) {
                emisWebView = new WebView(getContext()) {
                    @Override
                    public boolean dispatchTouchEvent(MotionEvent ev) {
                        if (!isVisible) return false;
                        return super.dispatchTouchEvent(ev);
                    }
                };
                WebSettings ws = emisWebView.getSettings();
                ws.setJavaScriptEnabled(true);
                ws.setDomStorageEnabled(true);
                ws.setDatabaseEnabled(true);
                ws.setUseWideViewPort(true);
                ws.setLoadWithOverviewMode(true);
                ws.setSupportZoom(true);
                ws.setBuiltInZoomControls(true);
                ws.setDisplayZoomControls(false);
                ws.setAllowFileAccess(true);
                ws.setAllowContentAccess(true);
                ws.setJavaScriptCanOpenWindowsAutomatically(true);
                ws.setCacheMode(WebSettings.LOAD_DEFAULT);
                ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

                String ua = ws.getUserAgentString();
                if (ua != null && !ua.isEmpty()) {
                    // Clean standard browser UA without "; wv" so Ministry WAF treats it as standard Chrome
                    defaultUserAgent = ua.replace("; wv)", ")").replace("Version/4.0 ", "");
                    ws.setUserAgentString(defaultUserAgent);
                }

                CookieManager cm = CookieManager.getInstance();
                cm.setAcceptCookie(true);
                cm.setAcceptThirdPartyCookies(emisWebView, true);

                emisWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                        String url = request.getUrl().toString();
                        if (url.startsWith("http://") || url.startsWith("https://")) {
                            return false;
                        }
                        return true;
                    }

                    @Override
                    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                        try {
                            String url = request.getUrl().toString();
                            if (url.contains("emis.gov.eg")) {
                                Map<String, String> reqHeaders = request.getRequestHeaders();
                                if (reqHeaders != null && !reqHeaders.isEmpty()) {
                                    JSArray hdrArr = new JSArray();
                                    for (Map.Entry<String, String> entry : reqHeaders.entrySet()) {
                                        JSObject h = new JSObject();
                                        h.put("name", entry.getKey());
                                        h.put("value", entry.getValue());
                                        hdrArr.put(h);
                                    }
                                    JSObject details = new JSObject();
                                    details.put("url", url);
                                    details.put("method", request.getMethod());
                                    details.put("tabId", 1);
                                    details.put("requestHeaders", hdrArr);
                                    JSObject evt = new JSObject();
                                    evt.put("name", "onBeforeSendHeaders");
                                    evt.put("details", details);
                                    notifyListeners("webRequest", evt);
                                }
                            }
                        } catch (Exception ignored) {}
                        return super.shouldInterceptRequest(view, request);
                    }

                    @Override
                    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                        String url = error.getUrl();
                        if (url != null && (url.contains("emis.gov.eg") || url.contains("microsoftonline.com") || url.contains("live.com") || url.contains("microsoft.com"))) {
                            handler.proceed();
                        } else {
                            super.onReceivedSslError(view, handler, error);
                        }
                    }

                    @Override
                    public void onPageStarted(WebView view, String url, Bitmap favicon) {
                        injectBridge();
                        JSObject data = new JSObject();
                        data.put("status", "loading");
                        data.put("url", url);
                        notifyListeners("tabUpdate", data);
                    }

                    @Override
                    public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                        super.doUpdateVisitedHistory(view, url, isReload);
                        injectBridge();
                        JSObject data = new JSObject();
                        data.put("status", "complete");
                        data.put("url", url);
                        data.put("title", view.getTitle());
                        notifyListeners("tabUpdate", data);
                        notifyListeners("tabLoaded", data);
                    }

                    @Override
                    public void onPageFinished(WebView view, String url) {
                        CookieManager.getInstance().flush();
                        injectBridge();
                        JSObject data = new JSObject();
                        data.put("status", "complete");
                        data.put("url", url);
                        data.put("title", view.getTitle());
                        notifyListeners("tabUpdate", data);
                        notifyListeners("tabLoaded", data);
                    }
                });

                emisWebView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onReceivedTitle(WebView view, String title) {
                        JSObject data = new JSObject();
                        data.put("title", title);
                        data.put("url", view.getUrl());
                        notifyListeners("tabUpdate", data);
                    }
                });

                emisWebView.addJavascriptInterface(new Object() {
                    @JavascriptInterface
                    public void send(String msg) {
                        JSObject data = new JSObject();
                        data.put("raw", msg);
                        notifyListeners("tabMessage", data);
                    }

                    @JavascriptInterface
                    public void reportHeaders(String json) {
                        try {
                            JSObject parsed = new JSObject(json);
                            if (!parsed.has("tabId")) parsed.put("tabId", 1);
                            JSObject evt = new JSObject();
                            evt.put("name", "onBeforeSendHeaders");
                            evt.put("details", parsed);
                            notifyListeners("webRequest", evt);
                        } catch (Exception ignored) {}
                    }

                    @JavascriptInterface
                    public void onExecDone(String execId, boolean ok, String resultJson) {
                        PluginCall pending = pendingExecCalls.remove(execId);
                        if (pending == null) return;
                        if (ok) {
                            JSObject ret = new JSObject();
                            ret.put("result", resultJson);
                            pending.resolve(ret);
                        } else {
                            pending.reject(resultJson != null ? resultJson : "EXEC_ERROR");
                        }
                    }

                    @JavascriptInterface
                    public void requestShowBrowser() {
                        mainHandler.post(() -> {
                            applyVisibility(true);
                            JSObject evt = new JSObject();
                            evt.put("view", "browser");
                            notifyListeners("switchView", evt);
                        });
                    }
                }, "neprasNative");

                ViewGroup root = (ViewGroup) getActivity().findViewById(android.R.id.content);
                FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                );
                float density = getContext().getResources().getDisplayMetrics().density;
                lp.bottomMargin = (int) (56 * density);
                root.addView(emisWebView, lp);

                boolean startVis = call.getBoolean("visible", true);
                applyVisibility(startVis);

                String initialUrl = call.getString("url", "https://student.emis.gov.eg/");
                emisWebView.loadUrl(initialUrl);
            }
            call.resolve();
        });
    }

    private void applyVisibility(boolean visible) {
        isVisible = visible;
        if (emisWebView == null) return;
        // Keep emisWebView VISIBLE so Android Chromium never pauses its DOM, timers, or Angular rendering!
        emisWebView.setVisibility(View.VISIBLE);
        if (visible) {
            emisWebView.setAlpha(1.0f);
            emisWebView.bringToFront();
            emisWebView.requestFocus();
        } else {
            emisWebView.setAlpha(0.0f);
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().bringToFront();
                getBridge().getWebView().requestFocus();
            }
        }
    }

    private void injectBridge() {
        if (emisWebView == null) return;
        String js = "(function(){\n" +
                "  if (!window.__neprasBridgeInstalled) {\n" +
                "    window.__neprasBridgeInstalled = true;\n" +
                "    window.__neprasListeners = [];\n" +
                "    window.__neprasLastEmisHeaders = window.__neprasLastEmisHeaders || {};\n" +
                "    window.neprasBridge = {\n" +
                "      send: function(o) {\n" +
                "        try { window.neprasNative.send(JSON.stringify(o)); } catch(e){}\n" +
                "      },\n" +
                "      onMessage: function(cb) {\n" +
                "        if (typeof cb === 'function' && window.__neprasListeners.indexOf(cb) === -1) {\n" +
                "          window.__neprasListeners.push(cb);\n" +
                "        }\n" +
                "      }\n" +
                "    };\n" +
                "    window.__dispatchNepras = function(json) {\n" +
                "      try {\n" +
                "        var o = typeof json === 'string' ? JSON.parse(json) : json;\n" +
                "        var ls = window.__neprasListeners.slice();\n" +
                "        for (var i = 0; i < ls.length; i++) { try { ls[i](o); } catch(_) {} }\n" +
                "      } catch(e) {}\n" +
                "    };\n" +
                "    window.__dispatchNeprasB64 = function(b64) {\n" +
                "      try {\n" +
                "        var bin = atob(b64);\n" +
                "        var bytes = new Uint8Array(bin.length);\n" +
                "        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);\n" +
                "        var json = new TextDecoder('utf-8').decode(bytes);\n" +
                "        window.__dispatchNepras(json);\n" +
                "      } catch(e) {}\n" +
                "    };\n" +
                "    var saveHdr = function(k, v) {\n" +
                "      var lk = String(k || '').toLowerCase();\n" +
                "      if (['authorization','schoolcode','schoolstage','usertype','ut','ed','md','sc','ty'].indexOf(lk) !== -1 && v != null && String(v) !== '') {\n" +
                "        window.__neprasLastEmisHeaders[lk] = String(v);\n" +
                "      }\n" +
                "    };\n" +
                "    try {\n" +
                "      var origOpen = XMLHttpRequest.prototype.open;\n" +
                "      var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;\n" +
                "      var origSend = XMLHttpRequest.prototype.send;\n" +
                "      XMLHttpRequest.prototype.open = function(m, u) {\n" +
                "        this.__nepMethod = m || 'GET';\n" +
                "        try { this.__nepUrl = new URL(u, location.href).href; } catch(_) { this.__nepUrl = String(u || ''); }\n" +
                "        this.__nepHeaders = [];\n" +
                "        return origOpen.apply(this, arguments);\n" +
                "      };\n" +
                "      XMLHttpRequest.prototype.setRequestHeader = function(k, v) {\n" +
                "        try { saveHdr(k, v); if (this.__nepHeaders) this.__nepHeaders.push({ name: String(k), value: String(v) }); } catch(_) {}\n" +
                "        return origSetHeader.apply(this, arguments);\n" +
                "      };\n" +
                "      XMLHttpRequest.prototype.send = function() {\n" +
                "        try {\n" +
                "          if (this.__nepUrl && this.__nepUrl.indexOf('emis.gov.eg') !== -1 && this.__nepHeaders && this.__nepHeaders.length) {\n" +
                "            window.neprasNative.reportHeaders(JSON.stringify({ url: this.__nepUrl, method: this.__nepMethod, tabId: 1, requestHeaders: this.__nepHeaders }));\n" +
                "          }\n" +
                "        } catch(_) {}\n" +
                "        return origSend.apply(this, arguments);\n" +
                "      };\n" +
                "      if (typeof window.fetch === 'function') {\n" +
                "        var origFetch = window.fetch;\n" +
                "        window.fetch = function(input, init) {\n" +
                "          try {\n" +
                "            var rawUrl = (typeof input === 'string') ? input : (input && input.url) || '';\n" +
                "            var fullUrl = new URL(rawUrl, location.href).href;\n" +
                "            if (fullUrl.indexOf('emis.gov.eg') !== -1) {\n" +
                "              var hdrs = [];\n" +
                "              var hObj = (init && init.headers) || (input && input.headers);\n" +
                "              if (hObj) {\n" +
                "                if (typeof hObj.forEach === 'function') hObj.forEach(function(v, k) { saveHdr(k, v); hdrs.push({ name: String(k), value: String(v) }); });\n" +
                "                else if (Array.isArray(hObj)) hObj.forEach(function(p) { if (p && p.length >= 2) { saveHdr(p[0], p[1]); hdrs.push({ name: String(p[0]), value: String(p[1]) }); } });\n" +
                "                else if (typeof hObj === 'object') Object.keys(hObj).forEach(function(k) { saveHdr(k, hObj[k]); hdrs.push({ name: String(k), value: String(hObj[k]) }); });\n" +
                "              }\n" +
                "              if (hdrs.length) window.neprasNative.reportHeaders(JSON.stringify({ url: fullUrl, method: (init && init.method) || 'GET', tabId: 1, requestHeaders: hdrs }));\n" +
                "            }\n" +
                "          } catch(_) {}\n" +
                "          return origFetch.apply(this, arguments);\n" +
                "        };\n" +
                "      }\n" +
                "    } catch(_) {}\n" +
                "  }\n" +
                "  try {\n" +
                "    var jwtRe = /eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}/;\n" +
                "    var auth = '', scode = '', sstage = '', utype = '0';\n" +
                "    var scanObj = function(obj, d) {\n" +
                "      if (!obj || typeof obj !== 'object' || d > 4) return;\n" +
                "      Object.keys(obj).forEach(function(k) {\n" +
                "        var v = obj[k]; if (v == null) return;\n" +
                "        var lk = String(k).toLowerCase().replace(/[_-]/g, '');\n" +
                "        if (typeof v === 'string' || typeof v === 'number') {\n" +
                "          var sv = String(v).trim();\n" +
                "          if (!auth && jwtRe.test(sv)) auth = 'Bearer ' + sv.match(jwtRe)[0];\n" +
                "          if (!scode && (lk === 'schoolcode' || lk === 'schoolid' || lk === 'schcode' || lk === 'sc') && /^\\d{3,12}$/.test(sv)) scode = sv;\n" +
                "          if (!sstage && (lk === 'schoolstage' || lk === 'stagecode' || lk === 'stageid' || lk === 'stage') && /^\\d{1,3}$/.test(sv)) sstage = sv;\n" +
                "          if (utype === '0' && (lk === 'usertype' || lk === 'usertypeid') && /^\\d{1,3}$/.test(sv)) utype = sv;\n" +
                "        } else if (typeof v === 'object') scanObj(v, d + 1);\n" +
                "      });\n" +
                "    };\n" +
                "    [window.localStorage, window.sessionStorage].forEach(function(st) {\n" +
                "      if (!st) return;\n" +
                "      for (var i = 0; i < st.length; i++) {\n" +
                "        var k = st.key(i); if (!k) continue;\n" +
                "        var raw = (st.getItem(k) || '').trim(); if (!raw) continue;\n" +
                "        if (!auth && jwtRe.test(raw)) auth = 'Bearer ' + raw.match(jwtRe)[0];\n" +
                "        var lk = k.toLowerCase().replace(/[_-]/g, '');\n" +
                "        var cv = raw.replace(/^[\"']|[\"']$/g, '');\n" +
                "        if (!scode && (lk.indexOf('schoolcode') !== -1 || lk === 'schoolid' || lk === 'sc') && /^\\d{3,12}$/.test(cv)) scode = cv;\n" +
                "        if (!sstage && (lk.indexOf('schoolstage') !== -1 || lk.indexOf('stagecode') !== -1 || lk === 'stageid') && /^\\d{1,3}$/.test(cv)) sstage = cv;\n" +
                "        if (raw.charAt(0) === '{' || raw.charAt(0) === '[') { try { scanObj(JSON.parse(raw), 0); } catch(_) {} }\n" +
                "      }\n" +
                "    });\n" +
                "    if (auth) {\n" +
                "      try {\n" +
                "        var m = auth.match(jwtRe);\n" +
                "        if (m) {\n" +
                "          var b64 = m[0].split('.')[1].replace(/-/g, '+').replace(/_/g, '/');\n" +
                "          var claims = JSON.parse(decodeURIComponent(escape(atob(b64))));\n" +
                "          scanObj(claims, 0);\n" +
                "        }\n" +
                "      } catch(_) {}\n" +
                "      window.__neprasLastEmisHeaders = window.__neprasLastEmisHeaders || {};\n" +
                "      window.__neprasLastEmisHeaders.authorization = auth;\n" +
                "      if (scode) window.__neprasLastEmisHeaders.schoolcode = scode;\n" +
                "      if (sstage) window.__neprasLastEmisHeaders.schoolstage = sstage;\n" +
                "      window.__neprasLastEmisHeaders.usertype = utype;\n" +
                "      var hdrs = [{ name: 'Authorization', value: auth }, { name: 'usertype', value: utype }];\n" +
                "      if (scode) hdrs.push({ name: 'schoolcode', value: scode });\n" +
                "      if (sstage) hdrs.push({ name: 'schoolstage', value: sstage });\n" +
                "      if (location.hostname.indexOf('student.emis.gov.eg') !== -1) {\n" +
                "        window.neprasNative.reportHeaders(JSON.stringify({ url: 'https://studaapi.emis.gov.eg/api/auto', method: 'GET', tabId: 1, requestHeaders: hdrs }));\n" +
                "      }\n" +
                "    }\n" +
                "  } catch(_) {}\n" +
                "})();";
        emisWebView.evaluateJavascript(js, null);
    }

    @PluginMethod
    public void navigate(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("URL_REQUIRED");
            return;
        }
        mainHandler.post(() -> {
            if (emisWebView != null) {
                emisWebView.loadUrl(url);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setVisible(PluginCall call) {
        Boolean visible = call.getBoolean("visible", true);
        mainHandler.post(() -> {
            applyVisibility(visible != null && visible);
            call.resolve();
        });
    }

    @PluginMethod
    public void goBack(PluginCall call) {
        navigateBack();
        if (call != null) call.resolve();
    }

    public void navigateBack() {
        mainHandler.post(() -> {
            if (emisWebView != null && emisWebView.canGoBack()) {
                emisWebView.goBack();
            }
        });
    }

    public boolean canGoBack() {
        return emisWebView != null && emisWebView.canGoBack();
    }

    @PluginMethod
    public void goForward(PluginCall call) {
        mainHandler.post(() -> {
            if (emisWebView != null && emisWebView.canGoForward()) {
                emisWebView.goForward();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void reload(PluginCall call) {
        mainHandler.post(() -> {
            if (emisWebView != null) {
                emisWebView.reload();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void executeScript(PluginCall call) {
        String code = call.getString("code");
        if (code == null) {
            call.reject("CODE_REQUIRED");
            return;
        }
        mainHandler.post(() -> {
            if (emisWebView == null) {
                call.reject("WEBVIEW_NOT_INITIALIZED");
                return;
            }
            injectBridge();
            String trimmed = code.trim();
            // If the script is an async IIFE from host-core.js: (async()=>{...})()
            if (trimmed.startsWith("(async")) {
                final String execId = "ex_" + execSeq.incrementAndGet();
                pendingExecCalls.put(execId, call);
                mainHandler.postDelayed(() -> {
                    PluginCall timedOut = pendingExecCalls.remove(execId);
                    if (timedOut != null) {
                        timedOut.reject("SCRIPT_EXEC_TIMEOUT");
                    }
                }, 90000);

                String wrapped = "(function(__eid){\n" +
                        "  try {\n" +
                        "    Promise.resolve(" + code + ").then(function(__res){\n" +
                        "      var __json = 'null';\n" +
                        "      try { if (__res !== undefined) __json = JSON.stringify(__res); } catch(_) {}\n" +
                        "      window.neprasNative.onExecDone(__eid, true, __json);\n" +
                        "    }, function(__err){\n" +
                        "      window.neprasNative.onExecDone(__eid, false, String((__err && __err.message) || __err));\n" +
                        "    });\n" +
                        "  } catch (__e) {\n" +
                        "    window.neprasNative.onExecDone(__eid, false, String((__e && __e.message) || __e));\n" +
                        "  }\n" +
                        "})('" + execId + "');";
                emisWebView.evaluateJavascript(wrapped, null);
            } else {
                emisWebView.evaluateJavascript(code, val -> {
                    JSObject ret = new JSObject();
                    ret.put("result", val);
                    call.resolve(ret);
                });
            }
        });
    }

    @PluginMethod
    public void sendToTab(PluginCall call) {
        String json = call.getString("data");
        mainHandler.post(() -> {
            if (emisWebView != null && json != null) {
                injectBridge();
                String b64 = Base64.encodeToString(json.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
                emisWebView.evaluateJavascript("window.__dispatchNeprasB64 && window.__dispatchNeprasB64('" + b64 + "');", null);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void fetchUrl(PluginCall call) {
        final String urlStr = call.getString("url");
        final String method = call.getString("method", "GET");
        final String bodyStr = call.getString("body", null);
        final JSObject headersObj = call.getObject("headers", new JSObject());

        if (urlStr == null || urlStr.isEmpty()) {
            call.reject("URL_REQUIRED");
            return;
        }

        ioPool.execute(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(urlStr);
                conn = (HttpURLConnection) url.openConnection();
                String host = url.getHost() != null ? url.getHost().toLowerCase() : "";

                if (conn instanceof HttpsURLConnection && host.endsWith("emis.gov.eg")) {
                    HttpsURLConnection https = (HttpsURLConnection) conn;
                    SSLSocketFactory sf = getEmisSslSocketFactory();
                    if (sf != null) https.setSSLSocketFactory(sf);
                    https.setHostnameVerifier((hostname, session) -> hostname != null && hostname.toLowerCase().endsWith("emis.gov.eg"));
                }

                conn.setRequestMethod(method);
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(30000);
                conn.setInstanceFollowRedirects(true);

                // Standard browser headers required by Ministry API servers
                conn.setRequestProperty("User-Agent", defaultUserAgent);
                String originSite = (host.contains("professopi") || host.contains("teacher"))
                        ? "https://teacher.emis.gov.eg"
                        : "https://student.emis.gov.eg";
                conn.setRequestProperty("Origin", originSite);
                conn.setRequestProperty("Referer", originSite + "/");

                CookieManager cm = CookieManager.getInstance();
                String cookie = cm.getCookie(urlStr);
                if (cookie == null || cookie.isEmpty()) {
                    cookie = cm.getCookie(originSite);
                }
                if (cookie != null && !cookie.isEmpty()) {
                    conn.setRequestProperty("Cookie", cookie);
                }

                if (headersObj != null) {
                    Iterator<String> keys = headersObj.keys();
                    while (keys.hasNext()) {
                        String k = keys.next();
                        String v = headersObj.getString(k);
                        if (k != null && v != null) {
                            conn.setRequestProperty(k, v);
                        }
                    }
                }

                if (bodyStr != null && !method.equalsIgnoreCase("GET") && !method.equalsIgnoreCase("HEAD")) {
                    conn.setDoOutput(true);
                    byte[] outBytes = bodyStr.getBytes(StandardCharsets.UTF_8);
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(outBytes);
                    }
                }

                int status = conn.getResponseCode();
                InputStream is = (status >= 200 && status < 400) ? conn.getInputStream() : conn.getErrorStream();
                byte[] respBytes = new byte[0];
                if (is != null) {
                    try (ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = is.read(buf)) != -1) {
                            bos.write(buf, 0, n);
                        }
                        respBytes = bos.toByteArray();
                    } finally {
                        is.close();
                    }
                }

                JSObject respHeaders = new JSObject();
                for (Map.Entry<String, List<String>> entry : conn.getHeaderFields().entrySet()) {
                    if (entry.getKey() != null && entry.getValue() != null && !entry.getValue().isEmpty()) {
                        respHeaders.put(entry.getKey().toLowerCase(), entry.getValue().get(0));
                    }
                }

                JSObject ret = new JSObject();
                ret.put("ok", status >= 200 && status < 300);
                ret.put("status", status);
                ret.put("headers", respHeaders);
                ret.put("text", new String(respBytes, StandardCharsets.UTF_8));
                ret.put("base64", Base64.encodeToString(respBytes, Base64.NO_WRAP));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("FETCH_FAILED: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        final String rawFilename = call.getString("filename", "Nepras_Export.xlsx");
        final String base64 = call.getString("base64", "");
        final String mime = call.getString("mime", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        if (base64 == null || base64.isEmpty()) {
            call.reject("EMPTY_DATA");
            return;
        }

        ioPool.execute(() -> {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String normalized = rawFilename.replace("\\", "/").replaceAll("^/+", "");
                String fileNameOnly = normalized.contains("/")
                        ? normalized.substring(normalized.lastIndexOf('/') + 1)
                        : normalized;
                String subFolder = normalized.contains("/")
                        ? normalized.substring(0, normalized.lastIndexOf('/'))
                        : "Nepras";
                if (!subFolder.startsWith("Nepras")) {
                    subFolder = "Nepras/" + subFolder;
                }

                String savedPath;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = getContext().getContentResolver();
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, fileNameOnly);
                    values.put(MediaStore.Downloads.MIME_TYPE, mime);
                    values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + subFolder);
                    Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) throw new Exception("تعذر إنشاء الملف في مجلد التنزيلات");
                    try (OutputStream os = resolver.openOutputStream(uri)) {
                        if (os == null) throw new Exception("تعذر فتح مسار الحفظ");
                        os.write(bytes);
                    }
                    savedPath = Environment.DIRECTORY_DOWNLOADS + "/" + subFolder + "/" + fileNameOnly;
                } else {
                    File dlDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), subFolder);
                    if (!dlDir.exists()) dlDir.mkdirs();
                    File outFile = new File(dlDir, fileNameOnly);
                    try (FileOutputStream fos = new FileOutputStream(outFile)) {
                        fos.write(bytes);
                    }
                    savedPath = outFile.getAbsolutePath();
                }

                final String finalPath = savedPath;
                mainHandler.post(() -> Toast.makeText(getContext(), "✅ تم حفظ الملف في التنزيلات:\n" + finalPath, Toast.LENGTH_LONG).show());

                JSObject ret = new JSObject();
                ret.put("path", finalPath);
                ret.put("size", bytes.length);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("SAVE_FAILED: " + e.getMessage());
            }
        });
    }
}
