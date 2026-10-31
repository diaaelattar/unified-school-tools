package eg.gov.nepras.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EmisBrowserPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onBackPressed() {
        PluginHandle handle = getBridge() != null ? getBridge().getPlugin("EmisBrowser") : null;
        if (handle != null && handle.getInstance() instanceof EmisBrowserPlugin) {
            EmisBrowserPlugin plugin = (EmisBrowserPlugin) handle.getInstance();
            if (plugin.canGoBack()) {
                plugin.navigateBack();
                return;
            }
        }
        super.onBackPressed();
    }
}
