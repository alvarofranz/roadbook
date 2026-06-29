package app.rdbk;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Multi-page routing fix (see RDBKWebViewClient): serve /reader/ → /reader/index.html
        // instead of Capacitor's default collapse to the root landing page.
        bridge.setWebViewClient(new RDBKWebViewClient(bridge));
    }
}
