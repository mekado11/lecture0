import UIKit

enum AppConfig {
    /// Where the shell starts. Signed-out visitors are sent to the homepage by the page itself.
    static let startURL = URL(string: "https://authorscrolls.com/app.html")!

    /// Hosts the web view navigates in place. Everything else opens in an in-app Safari view.
    static let inlineHosts: Set<String> = [
        "authorscrolls.com",
        "www.authorscrolls.com",
        "writers-manuscript.firebaseapp.com"
    ]

    /// The app's `--bg` (#141710). The page reports its own colour once loaded; this is the
    /// colour before that, and behind the launch screen.
    static let backgroundColor = UIColor(red: 0x14 / 255, green: 0x17 / 255, blue: 0x10 / 255, alpha: 1)

    /// Appended to the web view's user agent, so the site can tell the shell apart in logs.
    static let userAgentSuffix = "AuthorScrolls-iOS/1.0"
}

extension UIColor {
    /// Parses the `rgb(…)` / `rgba(…)` string `getComputedStyle` returns for a background.
    convenience init?(cssRGB: String) {
        let numbers = cssRGB
            .split(whereSeparator: { !"0123456789.".contains($0) })
            .compactMap { Double($0) }
        guard numbers.count >= 3 else { return nil }
        let alpha = numbers.count >= 4 ? numbers[3] : 1
        self.init(red: numbers[0] / 255, green: numbers[1] / 255, blue: numbers[2] / 255, alpha: alpha)
    }
}
