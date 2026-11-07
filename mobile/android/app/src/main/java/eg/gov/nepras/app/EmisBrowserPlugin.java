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
    private final ConcurrentHashMap<String, PluginCall> pendingFetchCalls = new ConcurrentHashMap<>();
    private final AtomicLong execSeq = new AtomicLong(0);
    private final AtomicLong fetchSeq = new AtomicLong(0);
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

                emisWebView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
                    handleDownloadFromPage(url, contentDisposition, mimetype);
                });

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
                        String url = error != null ? error.getUrl() : null;
                        String host = "";
                        if (url != null) {
                            try {
                                Uri parsed = Uri.parse(url);
                                if (parsed.getHost() != null) {
                                    host = parsed.getHost().toLowerCase();
                                }
                            } catch (Exception ignored) {}
                        }
                        if (!host.isEmpty() && (
                                host.equals("emis.gov.eg") || host.endsWith(".emis.gov.eg") ||
                                host.endsWith(".microsoftonline.com") || host.endsWith(".live.com") ||
                                host.endsWith(".msauth.net") || host.endsWith(".msftauth.net")
                        )) {
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
                    public void onFetchDone(String fetchId, boolean ok, int status, String b64, String headersJson) {
                        PluginCall pending = pendingFetchCalls.remove(fetchId);
                        if (pending == null) return;
                        if (ok) {
                            JSObject ret = new JSObject();
                            ret.put("ok", status >= 200 && status < 300);
                            ret.put("status", status);
                            ret.put("base64", b64 != null ? b64 : "");
                            String text = "";
                            if (b64 != null && !b64.isEmpty()) {
                                try {
                                    byte[] raw = Base64.decode(b64, Base64.DEFAULT);
                                    text = new String(raw, StandardCharsets.UTF_8);
                                } catch (Exception ignored) {}
                            }
                            ret.put("text", text);
                            try {
                                ret.put("headers", new JSObject(headersJson));
                            } catch (Exception ignored) {
                                ret.put("headers", new JSObject());
                            }
                            pending.resolve(ret);
                        } else {
                            ioPool.execute(() -> executeHttpUrlConnection(pending));
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
            } else {
                String requestedUrl = call.getString("url");
                if (requestedUrl != null && !requestedUrl.isEmpty()) {
                    emisWebView.loadUrl(requestedUrl);
                }
                boolean startVis = call.getBoolean("visible", true);
                applyVisibility(startVis);
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
                "    if (!window.__neprasAuthScannerActive) {\n" +
                "      window.__neprasAuthScannerActive = true;\n" +
                "      var lastSentAuth = '';\n" +
                "      var lastSentScode = '';\n" +
                "      var scanAndReportAuth = function() {\n" +
                "        try {\n" +
                "          var jwtRe = /eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}/;\n" +
                "          var auth = '', scode = '', sname = '', sstage = '', utype = '0';\n" +
                "          var scanObj = function(obj, d) {\n" +
                "            if (!obj || typeof obj !== 'object' || d > 5) return;\n" +
                "            Object.keys(obj).forEach(function(k) {\n" +
                "              var v = obj[k]; if (v == null) return;\n" +
                "              var lk = String(k).toLowerCase().replace(/[_-]/g, '');\n" +
                "              if (typeof v === 'string' || typeof v === 'number') {\n" +
                "                var sv = String(v).trim();\n" +
                "                if (!auth && jwtRe.test(sv)) auth = 'Bearer ' + sv.match(jwtRe)[0];\n" +
                "                if (!scode && (lk === 'schoolcode' || lk === 'schoolid' || lk === 'schcode' || lk === 'sc' || lk === 'school_code') && /^\\d{4,12}$/.test(sv)) scode = sv;\n" +
                "                if (!sname && (lk === 'schoolname' || lk === 'arabicschoolname' || lk === 'school_name') && sv.length >= 3 && !/^\\d+$/.test(sv)) sname = sv;\n" +
                "                if (!sstage && (lk === 'schoolstage' || lk === 'stagecode' || lk === 'stageid' || lk === 'stage') && /^\\d{1,3}$/.test(sv)) sstage = sv;\n" +
                "                if (utype === '0' && (lk === 'usertype' || lk === 'usertypeid') && /^\\d{1,3}$/.test(sv)) utype = sv;\n" +
                "              } else if (typeof v === 'object') scanObj(v, d + 1);\n" +
                "            });\n" +
                "          };\n" +
                "          [window.localStorage, window.sessionStorage].forEach(function(st) {\n" +
                "            if (!st) return;\n" +
                "            for (var i = 0; i < st.length; i++) {\n" +
                "              var k = st.key(i); if (!k) continue;\n" +
                "              var raw = (st.getItem(k) || '').trim(); if (!raw) continue;\n" +
                "              if (!auth && jwtRe.test(raw)) auth = 'Bearer ' + raw.match(jwtRe)[0];\n" +
                "              var lk = k.toLowerCase().replace(/[_-]/g, '');\n" +
                "              var cv = raw.replace(/^[\"']|[\"']$/g, '');\n" +
                "              if (!scode && (lk.indexOf('schoolcode') !== -1 || lk === 'schoolid' || lk === 'sc' || lk === 'school_code') && /^\\d{4,12}$/.test(cv)) scode = cv;\n" +
                "              if (!sname && (lk.indexOf('schoolname') !== -1 || lk === 'arabicschoolname') && cv.length >= 3 && !/^\\d+$/.test(cv)) sname = cv;\n" +
                "              if (!sstage && (lk.indexOf('schoolstage') !== -1 || lk.indexOf('stagecode') !== -1 || lk === 'stageid') && /^\\d{1,3}$/.test(cv)) sstage = cv;\n" +
                "              if (raw.charAt(0) === '{' || raw.charAt(0) === '[') { try { scanObj(JSON.parse(raw), 0); } catch(_) {} }\n" +
                "            }\n" +
                "          });\n" +
                "          if (auth) {\n" +
                "            try {\n" +
                "              var m = auth.match(jwtRe);\n" +
                "              if (m) {\n" +
                "                var b64 = m[0].split('.')[1].replace(/-/g, '+').replace(/_/g, '/');\n" +
                "                var claims = JSON.parse(decodeURIComponent(escape(atob(b64))));\n" +
                "                scanObj(claims, 0);\n" +
                "              }\n" +
                "            } catch(_) {}\n" +
                "          }\n" +
                "          var normArD = function(str){ return String(str||'').replace(/[٠-٩]/g, function(d){ return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }); };\n" +
                "          var domNodes = document.querySelectorAll('.badge, .badge-pill, header span, header div, nav span, nav div, .navbar span, .navbar div, b, strong, h1, h2, h3, h4, p, label, a, .dropdown-menu, .dropdown-item');\n" +
                "          for (var di = 0; di < domNodes.length; di++) {\n" +
                "            var dt = (domNodes[di].textContent || '').trim();\n" +
                "            if (!scode) {\n" +
                "              var mSc = normArD(dt).match(/([0-9]{4,12})@[a-z0-9.]*emis\\.gov\\.eg/i) || normArD(dt).match(/(?:كود\\s*(?:المدرسة|المؤسسة)|الرقم\\s*التعريفي)\\s*[:\\-]?\\s*([0-9]{4,12})/);\n" +
                "              if (mSc) scode = mSc[1];\n" +
                "            }\n" +
                "            if (!sname) {\n" +
                "              var mSn = dt.match(/(?:اسم\\s*المدرسة|المدرسة)\\s*[:\\-]?\\s*([^\\n\\r<>|•]+)/);\n" +
                "              if (mSn && mSn[1].trim().length >= 3 && !/^\\d+$/.test(mSn[1].trim())) {\n" +
                "                sname = mSn[1].replace(/المرحل[ةه].*$/, '').replace(/التبعي[ةه].*$/, '').replace(/الرقم\\s*المسلسل.*$/, '').trim();\n" +
                "              }\n" +
                "            }\n" +
                "          }\n" +
                "          var authChanged = (auth && auth !== lastSentAuth);\n" +
                "          var scodeChanged = (scode && scode !== lastSentScode);\n" +
                "          if (authChanged || scodeChanged) {\n" +
                "            if (auth) lastSentAuth = auth;\n" +
                "            if (scode) lastSentScode = scode;\n" +
                "            window.__neprasLastEmisHeaders = window.__neprasLastEmisHeaders || {};\n" +
                "            if (auth) window.__neprasLastEmisHeaders.authorization = auth;\n" +
                "            if (scode) window.__neprasLastEmisHeaders.schoolcode = scode;\n" +
                "            if (sname) window.__neprasLastEmisHeaders.schoolname = sname;\n" +
                "            if (sstage) window.__neprasLastEmisHeaders.schoolstage = sstage;\n" +
                "            window.__neprasLastEmisHeaders.usertype = utype;\n" +
                "            var hdrs = [{ name: 'usertype', value: utype }];\n" +
                "            if (auth) hdrs.push({ name: 'Authorization', value: auth });\n" +
                "            if (scode) hdrs.push({ name: 'schoolcode', value: scode });\n" +
                "            if (sname) hdrs.push({ name: 'schoolname', value: sname });\n" +
                "            if (sstage) hdrs.push({ name: 'schoolstage', value: sstage });\n" +
                "            var targetUrl = (location.hostname.indexOf('teacher.emis.gov.eg') !== -1)\n" +
                "              ? 'https://professopi.emis.gov.eg/api/auto'\n" +
                "              : 'https://studaapi.emis.gov.eg/api/auto';\n" +
                "            window.neprasNative.reportHeaders(JSON.stringify({ url: targetUrl, method: 'GET', tabId: 1, requestHeaders: hdrs }));\n" +
                "          }\n" +
                "        } catch(_) {}\n" +
                "      };\n" +
                "      scanAndReportAuth();\n" +
                "      setInterval(scanAndReportAuth, 1500);\n" +
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
        if (urlStr == null || urlStr.isEmpty()) {
            call.reject("URL_REQUIRED");
            return;
        }

        mainHandler.post(() -> {
            String currentUrl = (emisWebView != null) ? emisWebView.getUrl() : null;
            boolean canUseInPage = (emisWebView != null &&
                    currentUrl != null &&
                    currentUrl.toLowerCase().contains("emis.gov.eg") &&
                    urlStr.toLowerCase().contains("emis.gov.eg"));

            if (canUseInPage) {
                executeInPageFetch(call);
            } else {
                ioPool.execute(() -> executeHttpUrlConnection(call));
            }
        });
    }

    private void executeInPageFetch(PluginCall call) {
        final String fetchId = "fc_" + fetchSeq.incrementAndGet();
        pendingFetchCalls.put(fetchId, call);

        // Safety timeout of 35 seconds: fallback to background connection if in-page fetch stalls
        mainHandler.postDelayed(() -> {
            PluginCall timeoutCall = pendingFetchCalls.remove(fetchId);
            if (timeoutCall != null) {
                ioPool.execute(() -> executeHttpUrlConnection(timeoutCall));
            }
        }, 35000);

        String urlStr = call.getString("url", "");
        String method = call.getString("method", "GET").toUpperCase();
        String bodyStr = call.getString("body", null);
        JSObject headersObj = call.getObject("headers", new JSObject());

        String b64Url = Base64.encodeToString(urlStr.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
        String b64Hdrs = headersObj != null ? Base64.encodeToString(headersObj.toString().getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP) : "";
        String b64Body = bodyStr != null ? Base64.encodeToString(bodyStr.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP) : "";

        // Executes natively inside student.emis.gov.eg or teacher.emis.gov.eg Chromium context
        // so the Ministry's F5 BIG-IP WAF sees genuine browser TLS fingerprints and cookies.
        String js = "(function(fid, b64Url, method, b64Hdrs, b64Body) {\n" +
                "  try {\n" +
                "    function b64ToUtf8(b64) {\n" +
                "      if (!b64) return '';\n" +
                "      var bin = atob(b64);\n" +
                "      var bytes = new Uint8Array(bin.length);\n" +
                "      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);\n" +
                "      return new TextDecoder('utf-8').decode(bytes);\n" +
                "    }\n" +
                "    var u = b64ToUtf8(b64Url);\n" +
                "    var h = {};\n" +
                "    if (b64Hdrs) {\n" +
                "      try { h = JSON.parse(b64ToUtf8(b64Hdrs)); } catch(_) {}\n" +
                "    }\n" +
                "    var opts = { method: method, headers: h };\n" +
                "    if (b64Body && method !== 'GET' && method !== 'HEAD') {\n" +
                "      opts.body = b64ToUtf8(b64Body);\n" +
                "    }\n" +
                "    fetch(u, opts).then(function(res) {\n" +
                "      var st = res.status;\n" +
                "      var hdrs = {};\n" +
                "      try { res.headers.forEach(function(v, k) { hdrs[k] = v; }); } catch(_) {}\n" +
                "      var hJson = JSON.stringify(hdrs);\n" +
                "      return res.blob().then(function(blob) {\n" +
                "        var reader = new FileReader();\n" +
                "        reader.onloadend = function() {\n" +
                "          var d = reader.result || '';\n" +
                "          var c = d.indexOf(',');\n" +
                "          var b64 = c >= 0 ? d.substring(c + 1) : '';\n" +
                "          window.neprasNative.onFetchDone(fid, true, st, b64, hJson);\n" +
                "        };\n" +
                "        reader.onerror = function() {\n" +
                "          window.neprasNative.onFetchDone(fid, true, st, '', hJson);\n" +
                "        };\n" +
                "        reader.readAsDataURL(blob);\n" +
                "      });\n" +
                "    }).catch(function(err) {\n" +
                "      window.neprasNative.onFetchDone(fid, false, 0, '', String((err && err.message) || err));\n" +
                "    });\n" +
                "  } catch(e) {\n" +
                "    window.neprasNative.onFetchDone(fid, false, 0, '', String((e && e.message) || e));\n" +
                "  }\n" +
                "})('" + fetchId + "', '" + b64Url + "', '" + method + "', '" + b64Hdrs + "', '" + b64Body + "');";

        emisWebView.evaluateJavascript(js, null);
    }

    private void executeHttpUrlConnection(PluginCall call) {
        final String urlStr = call.getString("url");
        final String method = call.getString("method", "GET");
        final String bodyStr = call.getString("body", null);
        final JSObject headersObj = call.getObject("headers", new JSObject());

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
            conn.setRequestProperty("Accept-Language", "ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7");
            conn.setRequestProperty("Sec-Ch-Ua-Mobile", "?1");
            conn.setRequestProperty("Sec-Ch-Ua-Platform", "\"Android\"");
            conn.setRequestProperty("Sec-Fetch-Dest", "empty");
            conn.setRequestProperty("Sec-Fetch-Mode", "cors");
            conn.setRequestProperty("Sec-Fetch-Site", "same-site");

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
            if (conn.getRequestProperty("Accept") == null) {
                conn.setRequestProperty("Accept", "application/json, text/plain, */*");
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
    }

    private void handleDownloadFromPage(String url, String contentDisposition, String mimetype) {
        if (url == null || url.isEmpty()) return;
        ioPool.execute(() -> {
            try {
                String fileName = "download";
                if (contentDisposition != null && contentDisposition.contains("filename=")) {
                    int idx = contentDisposition.indexOf("filename=");
                    fileName = contentDisposition.substring(idx + 9).replace("\"", "").trim();
                    if (fileName.contains(";")) fileName = fileName.substring(0, fileName.indexOf(';')).trim();
                } else {
                    try {
                        String cleanUrl = url.split("\\?")[0];
                        String lastSeg = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1);
                        if (!lastSeg.isEmpty()) fileName = lastSeg;
                    } catch (Exception ignored) {}
                }
                if (fileName.isEmpty() || fileName.equalsIgnoreCase("download") || !fileName.contains(".")) {
                    String ext = ".bin";
                    if (mimetype != null) {
                        if (mimetype.contains("pdf")) ext = ".pdf";
                        else if (mimetype.contains("sheet") || mimetype.contains("excel") || mimetype.contains("xlsx")) ext = ".xlsx";
                        else if (mimetype.contains("zip")) ext = ".zip";
                        else if (mimetype.contains("image/png")) ext = ".png";
                        else if (mimetype.contains("image/jpeg")) ext = ".jpg";
                    }
                    fileName = "emis_report_" + System.currentTimeMillis() + ext;
                }

                byte[] bytes = null;
                if (url.startsWith("data:")) {
                    int comma = url.indexOf(',');
                    if (comma != -1) {
                        bytes = Base64.decode(url.substring(comma + 1), Base64.DEFAULT);
                    }
                } else if (url.startsWith("http://") || url.startsWith("https://")) {
                    URL u = new URL(url);
                    HttpURLConnection conn = (HttpURLConnection) u.openConnection();
                    String host = u.getHost() != null ? u.getHost().toLowerCase() : "";
                    if (conn instanceof HttpsURLConnection && host.endsWith("emis.gov.eg")) {
                        HttpsURLConnection https = (HttpsURLConnection) conn;
                        SSLSocketFactory sf = getEmisSslSocketFactory();
                        if (sf != null) https.setSSLSocketFactory(sf);
                        https.setHostnameVerifier((hostname, session) -> hostname != null && hostname.toLowerCase().endsWith("emis.gov.eg"));
                    }
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(30000);
                    conn.setReadTimeout(30000);
                    conn.setRequestProperty("User-Agent", defaultUserAgent);
                    String originSite = host.contains("teacher") ? "https://teacher.emis.gov.eg" : "https://student.emis.gov.eg";
                    conn.setRequestProperty("Origin", originSite);
                    conn.setRequestProperty("Referer", originSite + "/");
                    CookieManager cm = CookieManager.getInstance();
                    String cookie = cm.getCookie(url);
                    if (cookie == null || cookie.isEmpty()) cookie = cm.getCookie(originSite);
                    if (cookie != null && !cookie.isEmpty()) conn.setRequestProperty("Cookie", cookie);

                    int status = conn.getResponseCode();
                    if (status >= 200 && status < 400) {
                        try (InputStream is = conn.getInputStream();
                             ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
                            byte[] buf = new byte[8192];
                            int n;
                            while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
                            bytes = bos.toByteArray();
                        }
                    }
                    conn.disconnect();
                }

                if (bytes != null && bytes.length > 0) {
                    saveBytesDirectly("Nepras/" + fileName, bytes, mimetype);
                }
            } catch (Exception e) {
                mainHandler.post(() -> Toast.makeText(getContext(), "تعذر تنزيل الملف: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        });
    }

    private String saveBytesDirectly(String rawFilename, byte[] bytes, String mime) throws Exception {
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

        if (mime == null || mime.isEmpty() || mime.equals("application/octet-stream")) {
            String lower = fileNameOnly.toLowerCase();
            if (lower.endsWith(".xlsx")) mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            else if (lower.endsWith(".pdf")) mime = "application/pdf";
            else if (lower.endsWith(".zip")) mime = "application/zip";
            else if (lower.endsWith(".csv")) mime = "text/csv";
            else if (lower.endsWith(".png")) mime = "image/png";
            else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) mime = "image/jpeg";
            else mime = "application/octet-stream";
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
            try (OutputStream os = resolver.openOutputStream(uri, "w")) {
                if (os == null) throw new Exception("تعذر فتح مسار الحفظ");
                os.write(bytes);
                os.flush();
            }
            savedPath = Environment.DIRECTORY_DOWNLOADS + "/" + subFolder + "/" + fileNameOnly;
        } else {
            File dlDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), subFolder);
            if (!dlDir.exists()) dlDir.mkdirs();
            File outFile = new File(dlDir, fileNameOnly);
            try (FileOutputStream fos = new FileOutputStream(outFile)) {
                fos.write(bytes);
                fos.flush();
            }
            savedPath = outFile.getAbsolutePath();
        }

        final String finalPath = savedPath;
        mainHandler.post(() -> Toast.makeText(getContext(), "✅ تم حفظ الملف في التنزيلات:\n" + finalPath, Toast.LENGTH_LONG).show());
        return savedPath;
    }

    @PluginMethod
    public void saveAppState(PluginCall call) {
        final String state = call.getString("state", "");
        ioPool.execute(() -> {
            try {
                File dir = getContext().getFilesDir();
                File target = new File(dir, "nepras_mobile_state.json");
                File tmp = new File(dir, "nepras_mobile_state.json.tmp");
                try (FileOutputStream fos = new FileOutputStream(tmp)) {
                    fos.write(state.getBytes(StandardCharsets.UTF_8));
                    fos.flush();
                }
                if (tmp.renameTo(target) || (target.delete() && tmp.renameTo(target))) {
                    JSObject ret = new JSObject();
                    ret.put("ok", true);
                    ret.put("bytes", state.length());
                    call.resolve(ret);
                } else {
                    call.reject("RENAME_FAILED");
                }
            } catch (Exception e) {
                call.reject("SAVE_APP_STATE_FAILED: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void loadAppState(PluginCall call) {
        ioPool.execute(() -> {
            try {
                File target = new File(getContext().getFilesDir(), "nepras_mobile_state.json");
                if (!target.exists() || target.length() == 0) {
                    JSObject ret = new JSObject();
                    ret.put("state", (String) null);
                    call.resolve(ret);
                    return;
                }
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                try (InputStream fis = new java.io.FileInputStream(target)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = fis.read(buf)) != -1) {
                        baos.write(buf, 0, n);
                    }
                }
                String state = baos.toString("UTF-8");
                JSObject ret = new JSObject();
                ret.put("state", state);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("LOAD_APP_STATE_FAILED: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        final String rawFilename = call.getString("filename", "Nepras_Export.xlsx");
        final String base64 = call.getString("base64", "");
        final String mime = call.getString("mime", "");

        if (base64 == null || base64.isEmpty()) {
            call.reject("EMPTY_DATA");
            return;
        }

        ioPool.execute(() -> {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String path = saveBytesDirectly(rawFilename, bytes, mime);
                JSObject ret = new JSObject();
                ret.put("path", path);
                ret.put("size", bytes.length);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("SAVE_FAILED: " + e.getMessage());
            }
        });
    }
}
