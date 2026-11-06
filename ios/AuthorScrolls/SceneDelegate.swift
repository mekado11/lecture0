import UIKit

/// One window, one web view controller. A fold, a rotation or a split-view resize reaches the
/// app as a scene size change; Auto Layout re-lays the web view and the page re-flows. Nothing
/// here reads or stores a device or window size.
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private let web = WebViewController()

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.backgroundColor = AppConfig.backgroundColor
        window.rootViewController = web
        self.window = window
        window.makeKeyAndVisible()
        if let url = connectionOptions.userActivities.first(where: { $0.activityType == NSUserActivityTypeBrowsingWeb })?.webpageURL {
            web.open(url)
        }
    }

    /// A universal link to the site opens inside the app.
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb, let url = userActivity.webpageURL else { return }
        web.open(url)
    }
}
