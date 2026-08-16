import Foundation

// What the server answers with. The shapes mirror server/src/index.ts one for
// one -- when a route there changes, this file changes with it.

/// Which of the two search classes a shop belongs to.
///
/// The distinction is the whole reason this app has two loading states: the
/// fast shops answer over plain HTTP in about a second, the slow ones drive a
/// real browser through a bot challenge and take the better part of ten.
enum ShopSpeed: String, Codable, CaseIterable, Sendable {
    case fast, slow
}

enum ShopGroup: String, Codable, CaseIterable, Sendable {
    case pickupBerlin = "pickup-berlin"
    case mailOrder = "mail-order"

    var title: String {
        switch self {
        case .pickupBerlin: "Pickup in Berlin"
        case .mailOrder: "Mail order"
        }
    }
}

/// How quickly a hit can actually arrive.
///
/// There is deliberately no "sold out": the adapters drop anything that
/// cannot be ordered, so every hit that reaches this app is orderable and the
/// only open question is how long it takes.
enum Availability: String, Codable, Sendable {
    /// In stock, ships now.
    case inStock = "in_stock"
    /// In stock, but the last one.
    case lastCopy = "last_copy"
    /// Orderable, release is still ahead.
    case preorder
    /// Orderable, not in stock, delivery time unknown.
    case processing
    /// A status the server learned after this app was built. Shown as-is
    /// rather than refused -- a new value must not make the whole response
    /// undecodable and wipe out seven working shops along with it.
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Availability(rawValue: raw) ?? .unknown
    }

    var title: String {
        switch self {
        case .inStock: "In stock"
        case .lastCopy: "Last copy"
        case .preorder: "Preorder"
        case .processing: "On order"
        case .unknown: "Unknown"
        }
    }

    /// Green for "can arrive right away", amber for "may take a while".
    /// Same split as the web app, so a look at either tells the same story.
    var isImmediate: Bool {
        self == .inStock || self == .lastCopy
    }
}

/// One orderable copy at one shop.
///
/// A single release can appear several times from the same shop -- one entry
/// per format, and at Hard Wax even one per individually purchasable download
/// track.
struct Hit: Decodable, Identifiable, Sendable {
    let shopId: String
    let title: String
    let artist: String?
    /// The shop's own wording, e.g. "2LP", "3 CDs", "Black Vinyl 2LP".
    let format: String?
    let price: String?
    let currency: String?
    let url: URL?
    let status: Availability

    /// Nothing in the response is unique, so identity is built from what
    /// there is. Good enough for a list that is never reordered.
    var id: String { "\(shopId)|\(title)|\(format ?? "")|\(price ?? "")" }

    var display: String {
        guard let artist, !artist.isEmpty else { return title }
        return "\(artist) – \(title)"
    }

    var priceLabel: String? {
        guard let price else { return nil }
        guard let currency else { return price }
        return "\(price) \(currency)"
    }
}

/// One shop's answer. Carried per shop rather than as one flat list of hits
/// so a shop that failed stays visible instead of quietly disappearing.
struct ShopHits: Decodable, Identifiable, Sendable {
    let shopId: String
    let status: String
    let results: [Hit]?
    let error: String?

    var id: String { shopId }
    var hits: [Hit] { results ?? [] }
    var failed: Bool { status == "error" }
}

/// What a label search found at one shop.
///
/// `supported: false` means the shop offers no usable way to search by label
/// at all (Bis Aufs Messer) -- a statement, not a failure, which is why it is
/// not an error case.
struct LabelResult: Decodable, Sendable {
    let supported: Bool
    let count: Int?
    let url: URL?
}

struct ShopLabelHits: Decodable, Identifiable, Sendable {
    let shopId: String
    let status: String
    let result: LabelResult?
    let error: String?

    var id: String { shopId }
    var failed: Bool { status == "error" }
}

/// A shop as the server describes it. Fetched rather than hard-coded so
/// adding a shop to src/shops/index.ts is enough -- this app needs no release
/// for it.
struct Shop: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let country: String
    let group: ShopGroup
    let speed: ShopSpeed
    let homeUrl: URL?
    /// Where the shop's mark lives. Comes from the adapter in
    /// src/shops/<shop>/index.ts, so it is maintained once for the web app and
    /// this one together. Seven of the eight have one.
    ///
    /// These point at third-party CDNs -- Gravatar, Wikimedia, Twitter, the
    /// shops' own -- so loading them tells those hosts that someone is looking.
    /// Acceptable for a shop logo; anything of substance goes through our own
    /// server.
    let logoUrl: URL?
    let supportsLabelSearch: Bool

    /// Marks shipped with the app rather than fetched. Two so far, for two
    /// different reasons:
    ///
    ///   ANOST publishes no linkable image at all. Its own page header is
    ///   plain SVG paths, which the web app already embeds verbatim -- the
    ///   mark existed, it just had nowhere to be fetched from.
    ///
    ///   JPC's only mark is an SVG on Wikimedia, and AsyncImage cannot decode
    ///   SVG. Bundled, it also stops depending on a third party staying up.
    ///
    /// Checked before logoUrl, so a bundled mark always wins.
    private static let bundledMarks: [String: String] = [
        "anost": "ANOST",
        "jpc": "JPC"
    ]

    var assetName: String? {
        Shop.bundledMarks[id]
    }

    /// Initials for the placeholder badge: no mark yet, or one that failed to
    /// load.
    var initials: String {
        name.split(separator: " ").compactMap(\.first).prefix(2).map(String.init).joined().uppercased()
    }
}

#if DEBUG
extension Shop {
    /// Previews render from these and never touch the network -- which is why
    /// logoUrl is nil throughout. ANOST still shows its mark, because that one
    /// is bundled; the rest fall back to initials, so a preview shows both
    /// branches at once.
    static let samples: [Shop] = [
        Shop(id: "hard-wax", name: "Hard Wax", country: "DE", group: .pickupBerlin,
             speed: .fast, homeUrl: URL(string: "https://hardwax.com"),
             logoUrl: nil, supportsLabelSearch: true),
        Shop(id: "anost", name: "ANOST", country: "DE", group: .pickupBerlin,
             speed: .fast, homeUrl: URL(string: "https://www.anost.net"),
             logoUrl: nil, supportsLabelSearch: true),
        Shop(id: "bis-aufs-messer", name: "Bis Aufs Messer", country: "DE", group: .pickupBerlin,
             speed: .fast, homeUrl: URL(string: "https://bisaufsmesser.com"),
             logoUrl: nil, supportsLabelSearch: false),
        Shop(id: "hhv", name: "HHV", country: "DE", group: .pickupBerlin,
             speed: .slow, homeUrl: URL(string: "https://www.hhv.de"),
             logoUrl: nil, supportsLabelSearch: true),
        Shop(id: "jpc", name: "JPC", country: "DE", group: .mailOrder,
             speed: .fast, homeUrl: URL(string: "https://www.jpc.de"),
             logoUrl: nil, supportsLabelSearch: true),
        Shop(id: "soundohm", name: "SoundOhm", country: "IT", group: .mailOrder,
             speed: .fast, homeUrl: URL(string: "https://www.soundohm.com"),
             logoUrl: nil, supportsLabelSearch: true),
        Shop(id: "souffle-continu", name: "Souffle Continu", country: "FR", group: .mailOrder,
             speed: .fast, homeUrl: URL(string: "https://www.soufflecontinu.com"),
             logoUrl: nil, supportsLabelSearch: true),
        Shop(id: "boomkat", name: "Boomkat", country: "GB", group: .mailOrder,
             speed: .slow, homeUrl: URL(string: "https://boomkat.com"),
             logoUrl: nil, supportsLabelSearch: true)
    ]
}

extension ShopHits {
    static let samples: [ShopHits] = [
        ShopHits(shopId: "anost", status: "done", results: [
            Hit(shopId: "anost", title: "Selected Ambient Works Volume II", artist: "Aphex Twin",
                format: "4LP", price: "58.99", currency: "EUR",
                url: URL(string: "https://www.anost.net"), status: .inStock),
            Hit(shopId: "anost", title: "Selected Ambient Works Volume II", artist: "Aphex Twin",
                format: "3CD", price: "26.99", currency: "EUR",
                url: URL(string: "https://www.anost.net"), status: .lastCopy)
        ], error: nil),
        ShopHits(shopId: "jpc", status: "done", results: [
            Hit(shopId: "jpc", title: "Selected Ambient Works 85-92", artist: "Aphex Twin",
                format: "2 LPs", price: "28.99", currency: "EUR",
                url: URL(string: "https://www.jpc.de"), status: .processing)
        ], error: nil),
        ShopHits(shopId: "hard-wax", status: "error", results: nil, error: "HTTP 503")
    ]
}
#endif
