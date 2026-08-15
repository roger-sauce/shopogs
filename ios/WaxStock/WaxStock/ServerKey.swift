import Foundation
import Security

/// The shared secret the server expects, kept in the keychain.
///
/// Optional here, unlike in Crate: shopogs runs open as long as
/// SHOPOGS_API_KEY is unset on the server, because the web app has to reach it
/// without a login. The field exists so that switching the key on later costs
/// nothing on this side.
///
/// Not in `UserDefaults`: those end up in the unencrypted plist and in every
/// backup. The keychain is what it is for.
///
/// Marked synchronizable, so with iCloud Keychain switched on the key reaches
/// the iPad by itself -- typing a long random string twice is exactly the kind
/// of thing one gets wrong.
nonisolated enum ServerKey {
    private static let service = "de.rogerhofmann.WaxStock.server-key"
    private static let account = "waxstock"

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: kCFBooleanTrue as Any
        ]
    }

    static var value: String? {
        var query = baseQuery
        query[kSecReturnData as String] = kCFBooleanTrue
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static var isSet: Bool { value?.isEmpty == false }

    /// Written by delete-then-add rather than an update, so it works whether
    /// or not something is stored already.
    @discardableResult
    static func store(_ key: String) -> Bool {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        remove()
        guard !trimmed.isEmpty, let data = trimmed.data(using: .utf8) else { return false }

        var query = baseQuery
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    static func remove() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}
