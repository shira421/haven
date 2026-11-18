import UIKit
import UserNotifications

@main
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        AwayTracker.shared.start()
        NewsChecker.shared.register()
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = WebViewController()
        window.backgroundColor = UIColor(named: "LaunchBackground")
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    // Session and reminder notifications show as banners while Haven is open, too.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }
}

/// Remembers the last time Haven went to the background and whether that was the phone being
/// locked. A locked phone does not count as leaving a session; switching to another app does.
/// The record is kept in UserDefaults so it survives the app being closed while away.
final class AwayTracker {
    static let shared = AwayTracker()
    private let defaults = UserDefaults.standard
    private var lastLock: TimeInterval = 0

    func start() {
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(background), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(locked), name: UIApplication.protectedDataWillBecomeUnavailableNotification, object: nil)
        // The system posts this when the screen locks. It reaches us just before or just after
        // the app goes to the background, so both orders are handled.
        let callback: CFNotificationCallback = { _, observer, _, _, _ in
            guard let observer = observer else { return }
            Unmanaged<AwayTracker>.fromOpaque(observer).takeUnretainedValue().locked()
        }
        CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque(),
                                        callback, "com.apple.springboard.lockcomplete" as CFString, nil, .deliverImmediately)
    }

    @objc private func background() {
        NewsChecker.shared.scheduleFromNow()
        let now = Date().timeIntervalSince1970
        defaults.set(now * 1000, forKey: "away.at")
        defaults.set(now - lastLock < 4, forKey: "away.locked")
    }

    /// True when the phone locked in the last few seconds.
    var recentlyLocked: Bool { Date().timeIntervalSince1970 - lastLock < 4 }

    @objc func locked() {
        let now = Date().timeIntervalSince1970
        lastLock = now
        // "Come back to Haven" is for someone who switched apps. A locked phone is not leaving.
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["away", "lost"])
        let at = defaults.double(forKey: "away.at") / 1000
        if at > 0, now - at < 12 { defaults.set(true, forKey: "away.locked") }
    }

    var last: [String: Any] { ["at": defaults.double(forKey: "away.at"), "locked": defaults.bool(forKey: "away.locked")] }
}
