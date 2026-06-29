package app.rdbk;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.util.Map;

/**
 * RDBK is a multi-page app: every route is a real directory with its own index.html
 * (/reader/, /editor/, /tripmaster/ …). Capacitor's local server collapses any
 * extension-less path to the ROOT index.html (SPA behaviour), so every tool URL served
 * the landing page instead of the tool. This client rewrites a directory request to
 * <path>/index.html so each tool page loads — the Android mirror of the iOS RDBKRouter.
 */
public class RDBKWebViewClient extends BridgeWebViewClient {

    public RDBKWebViewClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        String path = url.getPath();
        // Only our own bundled pages; never touch the root, Capacitor's internal file/content
        // URLs, or cross-origin requests (e.g. the remote API).
        if ("localhost".equals(url.getHost()) && path != null && !path.equals("/") && !path.startsWith("/_capacitor")) {
            int lastSlash = path.lastIndexOf('/');
            String lastSegment = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
            if (!lastSegment.contains(".")) { // extension-less → a directory route
                String dir = path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
                Uri indexUrl = url.buildUpon().path(dir + "/index.html").build();
                request = new RewrittenRequest(request, indexUrl);
            }
        }
        return super.shouldInterceptRequest(view, request);
    }

    /** The original request with its URL swapped for the resolved index.html. */
    private static final class RewrittenRequest implements WebResourceRequest {
        private final WebResourceRequest original;
        private final Uri url;

        RewrittenRequest(WebResourceRequest original, Uri url) {
            this.original = original;
            this.url = url;
        }

        @Override
        public Uri getUrl() {
            return url;
        }

        @Override
        public boolean isForMainFrame() {
            return original.isForMainFrame();
        }

        @Override
        public boolean isRedirect() {
            return original.isRedirect();
        }

        @Override
        public boolean hasGesture() {
            return original.hasGesture();
        }

        @Override
        public String getMethod() {
            return original.getMethod();
        }

        @Override
        public Map<String, String> getRequestHeaders() {
            return original.getRequestHeaders();
        }
    }
}
