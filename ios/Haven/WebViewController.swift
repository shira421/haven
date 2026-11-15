import UIKit
import WebKit

/// Hosts the bundled Haven web app. Pages are served from the app bundle through the
/// `haven://app/` scheme so the app works offline and keeps a stable origin for storage.
final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private var webView: WKWebView!
    private let device = DeviceBridge()
    private let selfTest = ProcessInfo.processInfo.arguments.contains("-HavenSelfTest")

    override func loadView() {
        let config = WKWebViewConfiguration()
        let webRoot = Bundle.main.url(forResource: "web", withExtension: nil)!
        config.setURLSchemeHandler(AssetSchemeHandler(root: webRoot), forURLScheme: AssetSchemeHandler.scheme)
        config.userContentController.addScriptMessageHandler(device, contentWorld: .page, name: "havenDevice")
        // Record script errors from the first line on, so a failed start can be diagnosed.
        let errorHook = "window.__havenErrors=[];addEventListener('error',function(e){__havenErrors.push(String(e.message)+' @'+String(e.filename||'').split('/').pop()+':'+e.lineno)});addEventListener('unhandledrejection',function(e){__havenErrors.push('rejection: '+String(e.reason&&e.reason.message||e.reason))});"
        config.userContentController.addUserScript(WKUserScript(source: errorHook, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.applicationNameForUserAgent = "HavenApp/\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0")"

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = true
        webView.backgroundColor = UIColor(named: "LaunchBackground")
        webView.scrollView.backgroundColor = webView.backgroundColor
        // The page lays itself out with env(safe-area-inset-*); stop UIKit adding its own insets.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        webView.allowsBackForwardNavigationGestures = false
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        device.host = self
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // Tell the page when Haven leaves and returns to the screen, with the time it happened. The
        // page also hears this from the web view; the time keeps a late report from being misread.
        let center = NotificationCenter.default
        center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.tellPage("hidden") }
        center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in self?.tellPage("visible") }
        webView.load(URLRequest(url: URL(string: "\(AssetSchemeHandler.scheme)://app/index.html")!))
        if selfTest { scheduleSelfTest() }
    }

    private func tellPage(_ state: String) {
        let at = Int64(Date().timeIntervalSince1970 * 1000)
        webView.evaluateJavaScript("window.__havenLifecycle&&window.__havenLifecycle('\(state)',\(at))", completionHandler: nil)
    }

    // Keep app pages inside the web view; open everything else in Safari.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
        if url.scheme == AssetSchemeHandler.scheme || url.scheme == "blob" || url.scheme == "about" || url.scheme == "data" {
            return decisionHandler(.allow)
        }
        if ["http", "https", "mailto"].contains(url.scheme ?? "") {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    // target="_blank" links arrive here; send them to Safari instead of opening a new web view.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, ["http", "https"].contains(url.scheme ?? "") {
            UIApplication.shared.open(url)
        }
        return nil
    }

    private var terminations: [Date] = []

    // iOS may stop the web content process under memory pressure. Reload, but not in a loop.
    // A running session is kept in storage, so the reloaded page picks it up where it was.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        let now = Date()
        terminations = terminations.filter { now.timeIntervalSince($0) < 60 } + [now]
        print("HAVEN_EVENT web content process terminated (\(terminations.count) in the last minute)"); fflush(stdout)
        if terminations.count <= 3 { webView.reload() }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("HAVEN_EVENT page loaded \(webView.url?.absoluteString ?? "")"); fflush(stdout)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("HAVEN_EVENT navigation failed: \(error.localizedDescription)"); fflush(stdout)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        print("HAVEN_EVENT provisional navigation failed: \(error.localizedDescription)"); fflush(stdout)
    }

    /// CI smoke test: prints what the app shows after start-up, so a simulator run can
    /// confirm the bundle loads, the device bridge answers and nothing threw.
    private func scheduleSelfTest() {
        for delay in [8.0, 20.0, 40.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                let js = "JSON.stringify(Object.assign({loaded: !!document.querySelector('#app .topbar'), bridge: !!(window.webkit && webkit.messageHandlers && webkit.messageHandlers.havenDevice), errors: window.__havenErrors}, window.__haven ? window.__haven.state() : {}))"
                self?.webView.evaluateJavaScript(js) { result, error in
                    print("HAVEN_SELFTEST t=\(Int(delay)) \(result as? String ?? "nil") \(error.map { String(describing: $0) } ?? "")")
                    fflush(stdout)
                }
            }
        }
    }
}
