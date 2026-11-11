import UIKit
import WebKit
import SafariServices

/// The whole app: a web view pinned to the safe area, a bridge the page can post to, native
/// dialogs, an offline screen, and the rule that anything off the app's own hosts opens in an
/// in-app Safari view.
final class WebViewController: UIViewController {
    private var webView: WKWebView!
    private let offline = OfflineView()
    private var currentURL: URL?
    private var pendingURL: URL?
    private var statusBarDark = true

    override var preferredStatusBarStyle: UIStatusBarStyle { statusBarDark ? .lightContent : .darkContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = AppConfig.backgroundColor

        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.applicationNameForUserAgent = AppConfig.userAgentSuffix
        configuration.limitsNavigationsToAppBoundDomains = true
        // The page checks for this handler to know it is inside the shell (native-bridge.js).
        configuration.userContentController.add(WeakScriptMessageHandler(self), name: "authorscrolls")

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = AppConfig.backgroundColor
        webView.scrollView.backgroundColor = AppConfig.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        webView.allowsBackForwardNavigationGestures = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        offline.translatesAutoresizingMaskIntoConstraints = false
        offline.isHidden = true
        offline.onRetry = { [weak self] in
            guard let self else { return }
            self.load(self.currentURL ?? AppConfig.startURL)
        }
        view.addSubview(offline)

        // Pinned to the safe area, not the edges: the notch, the home indicator and any inset
        // the system reports for a hinge stay outside the page, painted in the page's colour.
        for subview: UIView in [webView, offline] {
            NSLayoutConstraint.activate([
                subview.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
                subview.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
                subview.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
                subview.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor)
            ])
        }

        load(pendingURL ?? AppConfig.startURL)
        pendingURL = nil
    }

    /// Open a site URL (from a universal link). Before the view exists it is kept for `viewDidLoad`.
    func open(_ url: URL) {
        if isViewLoaded { load(url) } else { pendingURL = url }
    }

    private func load(_ url: URL) {
        currentURL = url
        offline.isHidden = true
        webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30))
    }

    private func isInlineHost(_ url: URL?) -> Bool {
        guard let host = url?.host?.lowercased() else { return false }
        return AppConfig.inlineHosts.contains(host)
    }

    private func openExternally(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            UIApplication.shared.open(url)
            return
        }
        let safari = SFSafariViewController(url: url)
        safari.preferredBarTintColor = view.backgroundColor
        safari.preferredControlTintColor = UIColor(red: 0xCA / 255, green: 0x9A / 255, blue: 0x60 / 255, alpha: 1)
        present(safari, animated: true)
    }

    private func applyTheme(background: String?, dark: Bool) {
        statusBarDark = dark
        setNeedsStatusBarAppearanceUpdate()
        guard let background, let color = UIColor(cssRGB: background) else { return }
        view.backgroundColor = color
        view.window?.backgroundColor = color
        webView.backgroundColor = color
        webView.scrollView.backgroundColor = color
    }

    private func saveFile(_ body: [String: Any]) {
        guard let base64 = body["base64"] as? String, let data = Data(base64Encoded: base64) else { return }
        let rawName = (body["filename"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "export.txt"
        let name = rawName.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do { try data.write(to: url, options: .atomic) } catch { return }
        let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        // A popover anchor is required in a regular-width window: iPad, and a folding phone laid flat.
        if let popover = share.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - 1, width: 1, height: 1)
            popover.permittedArrowDirections = []
        }
        present(share, animated: true)
    }

    private func showOffline(_ error: Error) {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
        offline.message = nsError.code == NSURLErrorNotConnectedToInternet
            ? "You’re offline. Your manuscripts are safe in your account; reconnect to continue."
            : "AuthorScrolls couldn’t load.\n\(nsError.localizedDescription)"
        offline.isHidden = false
    }
}

// MARK: - Messages from the page (native-bridge.js)

extension WebViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "authorscrolls",
              let body = message.body as? [String: Any],
              let type = body["type"] as? String else { return }
        switch type {
        case "saveFile":
            saveFile(body)
        case "openExternal":
            if let string = body["url"] as? String, let url = URL(string: string) { openExternally(url) }
        case "theme":
            applyTheme(background: body["background"] as? String, dark: (body["dark"] as? Bool) ?? true)
        default:
            break
        }
    }
}

// MARK: - Navigation

extension WebViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.allow); return }
        let scheme = url.scheme?.lowercased() ?? ""
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        if (scheme == "http" || scheme == "https"), isMainFrame, !isInlineHost(url) {
            // Checkout, help articles, a provider's page: Safari's in-app view, not this window.
            decisionHandler(.cancel)
            openExternally(url)
            return
        }
        if !["http", "https", "about", "blob", "data"].contains(scheme) {
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        offline.isHidden = true
        currentURL = webView.url ?? currentURL
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showOffline(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showOffline(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

// MARK: - Dialogs and popups

extension WebViewController: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if isInlineHost(url) { webView.load(navigationAction.request) } else { openExternally(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        present(alert, animated: true)
    }
}

/// WKUserContentController retains its handlers; this keeps the controller from retaining itself.
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
