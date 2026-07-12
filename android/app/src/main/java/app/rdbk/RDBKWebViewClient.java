package app.rdbk;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * RDBK is a multi-page app: every route is a real directory with its own index.html
 * (/reader/, /editor/, /tripmaster/ …). Capacitor's local server collapses any
 * extension-less path to the ROOT index.html (SPA behaviour), so every tool URL served
 * the landing page instead of the tool. This client rewrites a directory request to
 * <path>/index.html so each tool page loads — the Android mirror of the iOS RDBKRouter.
 * It also mirrors the server's friendly-URL rewrite: /challenge|reader|editor|event/<slug>
 * serves the SECTION's index.html (the page reads the slug from location.pathname), so a
 * public roadbook or event opens in-app instead of 404-ing on <slug>/index.html.
 */
public class RDBKWebViewClient extends BridgeWebViewClient {

    // Friendly slug URLs, same set the .htaccess RewriteRule handles.
    private static final Pattern SLUG_ROUTE = Pattern.compile("^/(challenge|reader|editor|event)/[A-Za-z0-9_-]+/?$");

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
            String indexPath = null;
            Matcher slug = SLUG_ROUTE.matcher(path);
            if (slug.matches()) {
                indexPath = "/" + slug.group(1) + "/index.html";   // friendly slug URL → the section page
            } else {
                int lastSlash = path.lastIndexOf('/');
                String lastSegment = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
                if (!lastSegment.contains(".")) {                   // extension-less → a directory route
                    String dir = path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
                    indexPath = dir + "/index.html";
                }
            }
            if (indexPath != null) {
                Uri indexUrl = url.buildUpon().path(indexPath).build();
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
