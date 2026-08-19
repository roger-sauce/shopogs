import SwiftUI

/// Where one shop stands in the current search.
///
/// `empty` and `failed` are deliberately different: "Hard Wax does not have
/// it" and "Hard Wax did not answer" lead to different decisions, and only
/// one of them is worth walking to Kreuzberg for.
enum ShopProgress: Equatable {
    case waiting
    case empty
    case found(Int)
    case failed
}

/// The row of shop marks under the search field.
///
/// Exists because a spinner saying "still searching HHV, Boomkat" tells you
/// what is missing but not what is already done. Six shops answering in a
/// second is real progress, and hiding it makes the remaining ten seconds
/// feel like the whole search. Here the marks light up one after another, so
/// the wait has something to show for itself.
struct SearchProgressStrip: View {
    let shops: [Shop]
    let progress: (Shop) -> ShopProgress
    /// Named rather than counted: "HHV, Boomkat" says why it takes this long,
    /// "2 remaining" does not.
    let pending: [Shop]

    private var ordered: [Shop] {
        shops.sorted { a, b in
            if a.speed != b.speed { return a.speed == .fast }
            return a.name.localizedCompare(b.name) == .orderedAscending
        }
    }

    private var done: Int {
        shops.filter { progress($0) != .waiting }.count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 7) {
                ForEach(ordered) { shop in
                    mark(for: shop)
                }
                Spacer(minLength: 0)
            }

            caption
        }
        // One animation for the whole row: marks fade in as their shop lands,
        // rather than appearing in a jump.
        .animation(.easeOut(duration: 0.25), value: done)
    }

    @ViewBuilder
    private func mark(for shop: Shop) -> some View {
        let state = progress(shop)
        LogoBadge(shop: shop, size: 30)
            // Two levels only: still out, or answered. Three shades competed
            // with the dots for the same statement and neither won.
            .opacity(state == .waiting ? 0.22 : 1)
            .overlay(alignment: .bottomTrailing) {
                if let colour = dotColour(state) {
                    Circle()
                        .fill(colour)
                        .frame(width: 9, height: 9)
                        .overlay(Circle().stroke(.background, lineWidth: 1.5))
                        .offset(x: 3, y: 3)
                }
            }
            .accessibilityLabel(label(shop, state))
    }

    @ViewBuilder
    private var caption: some View {
        if !pending.isEmpty {
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("\(done) of \(shops.count) searched — \(pending.map(\.name).joined(separator: ", ")) still running")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        } else if done > 0 {
            Text("\(shops.count) shops searched")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    /// Every shop that has answered gets a dot, including the ones that found
    /// nothing.
    ///
    /// Blue is the one that earns its place: a hit and a failure both leave a
    /// card in the list below, so they are visible twice over. "Searched,
    /// nothing" leaves no card at all — without a dot of its own it would be
    /// indistinguishable from a shop that has not been asked yet, which is
    /// precisely the thing this row exists to show.
    private func dotColour(_ state: ShopProgress) -> Color? {
        switch state {
        case .found: .green
        case .empty: .blue
        case .failed: .orange
        case .waiting: nil
        }
    }

    private func label(_ shop: Shop, _ state: ShopProgress) -> String {
        switch state {
        case .waiting: "\(shop.name), still searching"
        case .empty: "\(shop.name), nothing found"
        case .found(let n): "\(shop.name), \(n) found"
        case .failed: "\(shop.name), failed"
        }
    }
}

#if DEBUG
#Preview("Progress") {
    let shops = Shop.samples
    return VStack(alignment: .leading, spacing: 24) {
        SearchProgressStrip(
            shops: shops,
            progress: { shop in
                switch shop.id {
                case "hard-wax": .empty
                case "anost": .found(2)
                case "jpc": .found(4)
                case "soundohm": .failed
                case "hhv", "boomkat": .waiting
                default: .empty
                }
            },
            pending: shops.filter { $0.speed == .slow }
        )

        SearchProgressStrip(
            shops: shops,
            progress: { $0.id == "anost" ? .found(2) : .empty },
            pending: []
        )
    }
    .padding()
}
#endif
