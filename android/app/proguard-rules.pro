# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ---------------------------------------------------------------------------
# RDBK · R8 keep rules (#545)
#
# The release build is shrunk and obfuscated (minifyEnabled true). R8 follows
# real call graphs, so everything reached by REFLECTION has to be kept by hand —
# and that is precisely how Capacitor works: it reads capacitor.plugins.json at
# runtime and instantiates each plugin class by name, then calls its methods
# through the @PluginMethod annotation. Renamed or stripped, the bridge simply
# finds nothing and every native call fails at runtime.
# ---------------------------------------------------------------------------

# Annotations, generic signatures and enclosing-class info: the bridge reads them.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# Readable crash reports: keep the line table, hide the original file name.
# (The build's mapping.txt goes to Play, which de-obfuscates traces with it.)
-keepattributes SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile

# The Capacitor runtime and everything it resolves by name.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * { @com.getcapacitor.PluginMethod <methods>; }

# Cordova plugins bridged through capacitor-cordova-android-plugins.
-keep class org.apache.cordova.** { *; }

# Anything exposed to the WebView's JavaScript.
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }

# Our own activity + WebViewClient are named in AndroidManifest.xml.
-keep class app.rdbk.** { *; }
