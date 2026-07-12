import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// RDBK is a multi-page app: every route is a real directory with its own index.html
// (/reader/, /editor/, /tripmaster/ …). Capacitor's default router collapses any
// extension-less path to the ROOT index.html (SPA behaviour), so every tool URL served
// the landing page instead of the tool. This router maps an extension-less path to
// <path>/index.html, so directory routes resolve to the right page. It also mirrors the
// server's friendly-URL rewrite: /challenge|reader|editor|event/<slug> resolves to the
// SECTION's index.html (the page reads the slug from location.pathname), so a public
// roadbook or event opens in-app instead of 404-ing on <slug>/index.html.
public struct RDBKRouter: Router {
    public var basePath: String = ""

    // Friendly slug URLs, same set the .htaccess RewriteRule handles.
    private static let slugRoute = try! NSRegularExpression(pattern: "^/(challenge|reader|editor|event)/[A-Za-z0-9_-]+/?$")

    public func route(for path: String) -> String {
        let range = NSRange(path.startIndex..., in: path)
        if let match = RDBKRouter.slugRoute.firstMatch(in: path, range: range),
           let section = Range(match.range(at: 1), in: path) {
            return basePath + "/" + path[section] + "/index.html"
        }
        let pathUrl = URL(fileURLWithPath: path)
        if pathUrl.pathExtension.isEmpty {
            var dir = path
            if dir.hasSuffix("/") { dir = String(dir.dropLast()) }
            return basePath + dir + "/index.html"
        }
        return basePath + path
    }
}

class RDBKViewController: CAPBridgeViewController {
    override open func router() -> Router {
        return RDBKRouter()
    }
}
