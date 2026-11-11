import UIKit

/// Shown in place of the web view when the page cannot load. Plain words and one action.
final class OfflineView: UIView {
    var onRetry: (() -> Void)?
    var message: String = "" {
        didSet { label.text = message }
    }

    private let label = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = AppConfig.backgroundColor

        let title = UILabel()
        title.text = "AuthorScrolls"
        title.font = UIFont(name: "Georgia", size: 28) ?? UIFont.systemFont(ofSize: 28, weight: .semibold)
        title.textColor = UIColor(red: 0xF1 / 255, green: 0xE7 / 255, blue: 0xD4 / 255, alpha: 1)
        title.textAlignment = .center

        label.font = UIFont.preferredFont(forTextStyle: .body)
        label.adjustsFontForContentSizeCategory = true
        label.textColor = UIColor(red: 0xBC / 255, green: 0xB6 / 255, blue: 0xA7 / 255, alpha: 1)
        label.textAlignment = .center
        label.numberOfLines = 0

        var config = UIButton.Configuration.filled()
        config.title = "Try again"
        config.baseBackgroundColor = UIColor(red: 0x80 / 255, green: 0x50 / 255, blue: 0x21 / 255, alpha: 1)
        config.baseForegroundColor = .white
        config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 24, bottom: 12, trailing: 24)
        let button = UIButton(configuration: config)
        button.addAction(UIAction { [weak self] _ in self?.onRetry?() }, for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [title, label, button])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: readableContentGuide.leadingAnchor),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: readableContentGuide.trailingAnchor),
            label.widthAnchor.constraint(lessThanOrEqualToConstant: 420)
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
}
