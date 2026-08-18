import Foundation

/// Where the server is.
///
/// Deliberately without a built-in default. Crate ships one because it was
/// built around a single Pi; here the address depends on how the stack is
/// reached -- caddy on the home network, something else later. An app that
/// pretends to know is an app that fails silently against the wrong host.
///
/// Not a secret, so `UserDefaults` rather than the keychain -- and unlike a
/// key it is worth showing back in the settings.
enum ServerAddress {
    static let key = "waxstock.serverURL"

    /// What the fields offer while nothing is stored.
    ///
    /// The public address, not the one on the home network: it answers from
    /// anywhere, it carries a real certificate, and a phone is outside more
    /// often than in. `https://extern.local:5443` reaches the same stack and
    /// stays one edit away for anyone who wants it.
    static let suggested = "https://ichmussdieseplattehaben.rogzilla.eu"

    static var url: URL? {
        UserDefaults.standard.string(forKey: key).flatMap(parse)
    }

    static var isSet: Bool { url != nil }

    static var text: String {
        UserDefaults.standard.string(forKey: key) ?? ""
    }

    /// Accepts what could plausibly be a server: a scheme and a host. Without
    /// that check a bare "192.168.178.46" parses as a relative path and every
    /// request quietly goes nowhere.
    static func parse(_ text: String) -> URL? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), url.scheme != nil, url.host() != nil else { return nil }
        return url
    }

    @discardableResult
    static func store(_ text: String) -> Bool {
        guard let url = parse(text) else { return false }
        UserDefaults.standard.set(url.absoluteString, forKey: key)
        return true
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
