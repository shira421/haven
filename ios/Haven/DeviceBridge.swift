import UIKit
import WebKit
import UserNotifications

/// What the phone does for the page: notifications, keeping the screen on, haptics, the share
/// sheet, and whether the last time away was a locked screen. The page calls
/// `webkit.messageHandlers.havenDevice.postMessage({action: …})` and gets the answer as a promise.
/// See src/device.js for the other side.
final class DeviceBridge: NSObject, WKScriptMessageHandlerWithReply {
    weak var host: UIViewController?
    private let center = UNUserNotificationCenter.current()

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        // Only the app's own pages may use the bridge.
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == AssetSchemeHandler.scheme,
              let body = message.body as? [String: Any], let action = body["action"] as? String else {
            return replyHandler(nil, "Not allowed.")
        }
        switch action {
        case "notifyPermission":
            permission(request: body["request"] as? Bool ?? false, reply: replyHandler)
        case "schedule":
            guard let id = body["id"] as? String, let at = body["at"] as? Double else { return replyHandler(nil, "Missing id or time.") }
            let seconds = max(1, at / 1000 - Date().timeIntervalSince1970)
            add(id: id, title: body["title"] as? String ?? "Haven", text: body["body"] as? String ?? "",
                trigger: UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false), reply: replyHandler)
        case "notify":
            add(id: body["id"] as? String ?? UUID().uuidString, title: body["title"] as? String ?? "Haven", text: body["body"] as? String ?? "",
                trigger: nil, reply: replyHandler)
        case "cancel":
            if let id = body["id"] as? String {
                center.removePendingNotificationRequests(withIdentifiers: [id])
                center.removeDeliveredNotifications(withIdentifiers: [id])
            }
            replyHandler(true, nil)
        case "reminder":
            center.removePendingNotificationRequests(withIdentifiers: ["reminder"])
            guard body["on"] as? Bool == true else { return replyHandler(true, nil) }
            var when = DateComponents()
            when.hour = body["hour"] as? Int ?? 19
            when.minute = body["minute"] as? Int ?? 0
            add(id: "reminder", title: body["title"] as? String ?? "Time to focus", text: body["body"] as? String ?? "",
                trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: true), reply: replyHandler)
        case "keepAwake":
            UIApplication.shared.isIdleTimerDisabled = body["on"] as? Bool ?? false
            replyHandler(true, nil)
        case "haptic":
            switch body["kind"] as? String {
            case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
            case "warning": UINotificationFeedbackGenerator().notificationOccurred(.warning)
            default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
            replyHandler(true, nil)
        case "share":
            guard let text = body["text"] as? String, let host = host else { return replyHandler(false, nil) }
            let sheet = UIActivityViewController(activityItems: [text], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = host.view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: host.view.bounds.midX, y: host.view.bounds.midY, width: 0, height: 0)
            host.present(sheet, animated: true)
            replyHandler(true, nil)
        case "away":
            replyHandler(AwayTracker.shared.last, nil)
        default:
            replyHandler(nil, "Unknown action.")
        }
    }

    private func permission(request: Bool, reply: @escaping (Any?, String?) -> Void) {
        center.getNotificationSettings { settings in
            let answer: (UNAuthorizationStatus) -> String = { status in
                switch status {
                case .authorized, .provisional, .ephemeral: return "granted"
                case .denied: return "denied"
                default: return "default"
                }
            }
            if request, settings.authorizationStatus == .notDetermined {
                self.center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
                    DispatchQueue.main.async { reply(granted ? "granted" : "denied", nil) }
                }
            } else {
                DispatchQueue.main.async { reply(answer(settings.authorizationStatus), nil) }
            }
        }
    }

    private func add(id: String, title: String, text: String, trigger: UNNotificationTrigger?, reply: @escaping (Any?, String?) -> Void) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = text
        content.sound = .default
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger)) { error in
            DispatchQueue.main.async { reply(error == nil, nil) }
        }
    }
}
