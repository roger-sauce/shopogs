import Foundation

/// Every request to shopogs goes through here, so a change of address takes
/// effect everywhere at once and the error handling exists in one place.
enum WaxStockAPI {
    /// A slow search drives a Camoufox session per shop through a bot
    /// challenge; measured against the real stack it takes about nine seconds
    /// for HHV and Boomkat together, and the server gives up on a single shop
    /// after 150. A timeout that fires while the browser is still working
    /// produces the worst kind of error message -- one that blames the network
    /// because patience ran out.
    private static let slowTimeout: TimeInterval = 180
    private static let fastTimeout: TimeInterval = 45

    private static func endpoint(_ path: String, _ query: [URLQueryItem]) throws -> URL {
        guard let base = ServerAddress.url else { throw WaxStockError.notConfigured }
        var components = URLComponents(url: base.appending(path: path), resolvingAgainstBaseURL: false)
        if !query.isEmpty { components?.queryItems = query }
        guard let url = components?.url else { throw WaxStockError.notConfigured }
        return url
    }

    private static func get(_ path: String, _ query: [URLQueryItem] = [],
                            timeout: TimeInterval = fastTimeout) async throws -> Data {
        var request = URLRequest(url: try endpoint(path, query))
        request.timeoutInterval = timeout
        // The server already says no-store; this says it does not matter what
        // the server says. Without a freshness header URLSession applies a
        // heuristic of its own, and a re-served stock level is worse than none.
        request.cachePolicy = .reloadIgnoringLocalCacheData
        return try await send(request)
    }

    /// Turns the server's answer into something readable.
    ///
    /// Every problem it knows about comes back as JSON with a plain `error`
    /// message -- which shop failed, what speed was asked for. Passing that
    /// through is far more use than "HTTP 400". A 401 gets its own case: it
    /// is not a fault of the moment but a setting to correct.
    private static func send(_ request: URLRequest) async throws -> Data {
        var request = request
        // Only sent when there is one. The API is open unless SHOPOGS_API_KEY
        // is set on the server, and sending an empty bearer would look like a
        // failed attempt rather than no attempt.
        if let key = ServerKey.value {
            request.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw WaxStockError.badStatus(-1) }
        guard http.statusCode != 401 else { throw WaxStockError.unauthorized }
        guard http.statusCode == 200 else {
            if let message = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                throw WaxStockError.server(message.error)
            }
            throw WaxStockError.badStatus(http.statusCode)
        }
        return data
    }

    private struct ErrorResponse: Decodable { let error: String }

    // MARK: - Reachability

    /// Deliberately keyless and deliberately not routed through `send`.
    ///
    /// This is the one question worth asking when nothing works: is anything
    /// answering at all? Sending the key here would fold "server down" and
    /// "key wrong" back into one failure, which is exactly what the open
    /// /api/health route exists to separate.
    static func isReachable(_ base: URL) async -> Bool {
        var request = URLRequest(url: base.appending(path: "api/health"))
        request.timeoutInterval = 8
        request.cachePolicy = .reloadIgnoringLocalCacheData
        guard let (_, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse else { return false }
        return http.statusCode == 200
    }

    // MARK: - Shops

    private struct ShopsResponse: Decodable { let shops: [Shop] }

    /// The shop list, so name, country, group and speed are not maintained a
    /// second time here. Adding a shop on the server is enough.
    static func shops() async throws -> [Shop] {
        try JSONDecoder().decode(ShopsResponse.self, from: await get("api/shops")).shops
    }

    // MARK: - Search

    private struct SearchResponse: Decodable { let results: [ShopHits] }
    private struct LabelResponse: Decodable { let results: [ShopLabelHits] }

    /// All shops of one speed class at once. The caller runs the two classes
    /// side by side and shows whichever lands first.
    static func search(artist: String, title: String, speed: ShopSpeed) async throws -> [ShopHits] {
        let data = try await get(
            "api/search",
            [URLQueryItem(name: "artist", value: artist),
             URLQueryItem(name: "title", value: title),
             URLQueryItem(name: "speed", value: speed.rawValue)],
            timeout: speed == .slow ? slowTimeout : fastTimeout
        )
        return try JSONDecoder().decode(SearchResponse.self, from: data).results
    }

    /// Label search: a hit count and a jump-off link per shop, rather than a
    /// list that would run into four digits for a large label.
    static func label(_ query: String, speed: ShopSpeed) async throws -> [ShopLabelHits] {
        let data = try await get(
            "api/label",
            [URLQueryItem(name: "q", value: query),
             URLQueryItem(name: "speed", value: speed.rawValue)],
            timeout: speed == .slow ? slowTimeout : fastTimeout
        )
        return try JSONDecoder().decode(LabelResponse.self, from: data).results
    }

    // MARK: - Jump-off points

    /// Bandcamp's own search. Far more forgiving of a half-remembered title
    /// than Discogs, which is why there is no warning next to it. item_type=a
    /// restricts to albums; without it the list fills with single tracks that
    /// no record shop check is about.
    static func bandcampURL(artist: String, title: String, labelMode: Bool) -> URL? {
        let query = [artist, title].filter { !$0.isEmpty }.joined(separator: " ")
        guard !query.isEmpty, let escaped = escape(query) else { return nil }
        return URL(string: "https://bandcamp.com/search?q=\(escaped)&item_type=\(labelMode ? "b" : "a")")
    }

    /// Discogs' own search. type=label filters exactly on labels, type=release
    /// on records. Discogs matches strictly, so a shortened title finds
    /// nothing -- hence the hint next to the button.
    static func discogsURL(artist: String, title: String, labelMode: Bool) -> URL? {
        let query = [artist, title].filter { !$0.isEmpty }.joined(separator: " ")
        guard !query.isEmpty, let escaped = escape(query) else { return nil }
        return URL(string: "https://www.discogs.com/search/?q=\(escaped)&type=\(labelMode ? "label" : "release")")
    }

    private static func escape(_ text: String) -> String? {
        text.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
    }
}

enum WaxStockError: LocalizedError {
    /// No address stored yet.
    case notConfigured
    /// The key was refused.
    case unauthorized
    /// Plain text from the server.
    case server(String)
    case badStatus(Int)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            "No server set up yet. Settings → Server."
        case .unauthorized:
            "The server did not accept the key. Check Settings → Server."
        case .server(let message):
            message
        case .badStatus(let code):
            "Server replied with HTTP \(code)"
        }
    }

    var isUnauthorized: Bool {
        if case .unauthorized = self { return true }
        return false
    }
}
