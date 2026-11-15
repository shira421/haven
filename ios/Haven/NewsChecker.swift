import BackgroundTasks
import Foundation
import Security
import UserNotifications

/// Checks the friends server for news while Haven is closed (friend requests, acceptances,
/// invitations, cheers, nudges, gifts) and shows each as a notification. iOS decides when the
/// check runs, usually some time after Haven was last used; it is asked for every 15 minutes.
final class NewsChecker {
    static let shared = NewsChecker()
    static let task = "com.shira421.haven.news"
    private let defaults = UserDefaults.standard

    /// Must be called before the app finishes launching.
    func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: NewsChecker.task, using: nil) { task in
            guard let refresh = task as? BGAppRefreshTask else { return task.setTaskCompleted(success: false) }
            self.run(refresh)
        }
    }

    /// Where to check and as whom. An empty token stops the checks.
    func setAccount(base: String, token: String, friends: Bool, social: Bool) {
        defaults.set(base, forKey: "news.base")
        defaults.set(friends, forKey: "news.friends")
        defaults.set(social, forKey: "news.social")
        Keychain.set(token, for: "news.token")
        if token.isEmpty { BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: NewsChecker.task) }
    }

    /// Haven went to the background: what was on screen until now has been seen.
    func scheduleFromNow() {
        defaults.set(Date().timeIntervalSince1970 * 1000, forKey: "news.since")
        schedule()
    }

    private func schedule() {
        guard !(Keychain.get("news.token") ?? "").isEmpty else { return }
        let request = BGAppRefreshTaskRequest(identifier: NewsChecker.task)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private func run(_ task: BGAppRefreshTask) {
        schedule()
        guard let base = defaults.string(forKey: "news.base"), !base.isEmpty,
              let token = Keychain.get("news.token"), !token.isEmpty else { return task.setTaskCompleted(success: true) }
        let since = Int64(defaults.double(forKey: "news.since"))
        guard let url = URL(string: "\(base)/api/news?since=\(since)") else { return task.setTaskCompleted(success: false) }
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let job = URLSession.shared.dataTask(with: request) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 { self.setAccount(base: "", token: "", friends: false, social: false) }
            guard status == 200, let data = data,
                  let answer = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let news = answer["news"] as? [[String: Any]] else { return task.setTaskCompleted(success: status == 200) }
            var latest = Double(since)
            let friends = self.defaults.object(forKey: "news.friends") as? Bool ?? true
            let social = self.defaults.object(forKey: "news.social") as? Bool ?? true
            for item in news {
                let created = (item["created"] as? Double) ?? 0
                latest = max(latest, created)
                guard let words = NewsChecker.words(item) else { continue }
                let (title, body, isFriends) = words
                if (isFriends && !friends) || (!isFriends && !social) { continue }
                let content = UNMutableNotificationContent()
                content.title = title
                content.body = body
                content.sound = .default
                let kind = item["kind"] as? String ?? "news"
                UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "news-\(kind)-\(Int64(created))", content: content, trigger: nil))
            }
            self.defaults.set(latest, forKey: "news.since")
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = { job.cancel() }
        job.resume()
    }

    /// The words for one piece of news, and whether it is about friends (rather than cheers and gifts).
    static func words(_ item: [String: Any]) -> (String, String, Bool)? {
        let who = item["name"] as? String ?? "A friend"
        switch item["kind"] as? String {
        case "request": return ("New friend request", "\(who) wants to be friends on Haven.", true)
        case "accepted": return ("Friend request accepted", "\(who) accepted your request.", true)
        case "invite": return ("Focus together?", "\(who) invited you to focus together.", true)
        case "sanctuary": return ("Join a sanctuary?", "\(who) invited you to join their sanctuary.", true)
        case "cheer": return ("A cheer for you", "\(who) cheered you on.", false)
        case "nudge": return ("Time to focus?", "\(who) is nudging you to focus.", false)
        case "gift": return ("You got a gift", "\(who) sent you something for your haven.", false)
        default: return nil
        }
    }
}

/// The sign-in token is kept in the Keychain, readable only on this device after it is first unlocked.
enum Keychain {
    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.shira421.haven", kSecAttrAccount as String: key]
    }

    static func set(_ value: String, for key: String) {
        SecItemDelete(query(key) as CFDictionary)
        guard !value.isEmpty else { return }
        var add = query(key)
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
    }

    static func get(_ key: String) -> String? {
        var read = query(key)
        read[kSecReturnData as String] = true
        read[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(read as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
