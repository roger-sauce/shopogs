import Foundation
import SwiftUI

/// One remembered search.
struct HistoryEntry: Codable, Identifiable, Hashable, Sendable {
    let artist: String
    let title: String

    /// Artist and title together, because either alone is a legitimate
    /// search and neither is unique on its own.
    var id: String { "\(artist)|\(title)" }

    var display: String {
        if artist.isEmpty { return title }
        if title.isEmpty { return artist }
        return "\(artist) – \(title)"
    }
}

/// The records worth asking about again.
///
/// The point is the record that is nowhere today: rather than typing it out
/// again next week, it is put aside here and picked up with a tap.
///
/// Kept in `UserDefaults`, which is exactly what it is for -- a handful of
/// short strings, no secret among them, and it has to survive the app being
/// closed or the wait would be pointless.
@Observable
final class SearchHistory {
    /// Deliberately small. A list you scroll is a list you stop reading, and
    /// five is what fits on screen without one.
    static let limit = 5

    private static let key = "waxstock.history"

    private(set) var entries: [HistoryEntry] = []

    init() {
        guard let data = UserDefaults.standard.data(forKey: Self.key),
              let stored = try? JSONDecoder().decode([HistoryEntry].self, from: data) else { return }
        // Trimmed on the way in as well: should the limit ever drop, an older
        // and longer list must not survive it.
        entries = Array(stored.prefix(Self.limit))
    }

    var isFull: Bool { entries.count >= Self.limit }

    /// Puts a search aside. Answers whether there was room.
    ///
    /// A search already on the list moves back to the front rather than being
    /// refused -- it is not a new entry, so the limit has nothing to say
    /// about it, and asking again is a sign it still matters.
    @discardableResult
    func add(artist: String, title: String) -> Bool {
        let entry = HistoryEntry(
            artist: artist.trimmingCharacters(in: .whitespaces),
            title: title.trimmingCharacters(in: .whitespaces)
        )
        guard !entry.artist.isEmpty || !entry.title.isEmpty else { return false }

        if let index = entries.firstIndex(of: entry) {
            entries.remove(at: index)
            entries.insert(entry, at: 0)
            save()
            return true
        }

        guard !isFull else { return false }
        entries.insert(entry, at: 0)
        save()
        return true
    }

    func remove(_ entry: HistoryEntry) {
        entries.removeAll { $0 == entry }
        save()
    }

    func remove(atOffsets offsets: IndexSet) {
        entries.remove(atOffsets: offsets)
        save()
    }

    func contains(artist: String, title: String) -> Bool {
        entries.contains(HistoryEntry(
            artist: artist.trimmingCharacters(in: .whitespaces),
            title: title.trimmingCharacters(in: .whitespaces)
        ))
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(entries) else { return }
        UserDefaults.standard.set(data, forKey: Self.key)
    }
}

#if DEBUG
extension SearchHistory {
    /// Previews render from these and never touch the defaults.
    static func sample() -> SearchHistory {
        let history = SearchHistory()
        history.entries = [
            HistoryEntry(artist: "Björk", title: "Homogenic"),
            HistoryEntry(artist: "Aphex Twin", title: "Selected Ambient Works 85-92"),
            HistoryEntry(artist: "Rhythm & Sound", title: "w/ Paul St. Hilaire")
        ]
        return history
    }
}
#endif
