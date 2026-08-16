import SwiftUI

/// One shop's hits, or its failure.
///
/// A shop that failed keeps its card rather than dropping out of the list --
/// "Hard Wax did not answer" and "Hard Wax has nothing" are different
/// statements, and only one of them is worth walking to Kreuzberg for.
struct ShopCard: View {
    let shop: Shop?
    let entry: ShopHits
    let formats: Set<VinylFormat>

    private var visible: [Hit] {
        entry.hits.filter { FormatClassifier.matches($0.format, selected: formats) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header

            if entry.failed {
                Text(entry.error ?? "Unknown error")
                    .font(.caption)
                    .foregroundStyle(.orange)
            } else {
                VStack(spacing: 6) {
                    ForEach(visible) { HitRow(hit: $0) }
                }
            }
        }
        .padding(12)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
    }

    private var header: some View {
        HStack(spacing: 10) {
            LogoBadge(shop: shop, size: 26)

            if let url = firstLink {
                Link(shop?.name ?? entry.shopId, destination: url)
                    .font(.headline)
            } else {
                Text(shop?.name ?? entry.shopId).font(.headline)
            }

            if let country = shop?.country {
                Text(country).font(.caption2).foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            if entry.failed {
                Image(systemName: "exclamationmark.triangle").font(.caption).foregroundStyle(.orange)
            } else {
                Text("\(visible.count)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// The first hit's own page, so tapping the shop name lands on the record
    /// rather than the front door. Falls back to the shop itself.
    private var firstLink: URL? {
        visible.first?.url ?? shop?.homeUrl
    }
}

/// One orderable copy.
struct HitRow: View {
    let hit: Hit

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // The status is carried by a colour bar rather than a coloured
            // label, so the row still reads at a glance without turning into
            // a traffic light.
            RoundedRectangle(cornerRadius: 2)
                .fill(hit.status.isImmediate ? Color.green : Color.orange)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 3) {
                if let url = hit.url {
                    Link(hit.display, destination: url).font(.subheadline)
                } else {
                    Text(hit.display).font(.subheadline)
                }

                HStack(spacing: 6) {
                    if let format = hit.format {
                        Text(format)
                    }
                    if let price = hit.priceLabel {
                        Text("·")
                        Text(price).monospacedDigit()
                    }
                    Text("·")
                    Text(hit.status.title)
                        .foregroundStyle(hit.status.isImmediate ? Color.green : Color.orange)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(.background.opacity(0.4), in: RoundedRectangle(cornerRadius: 8))
    }
}

/// A shop's mark, or its initials where none can be had.
///
/// Three sources in order: a mark bundled with the app, the logoUrl the
/// adapter carries, and the initials. The initials are not only the last
/// resort but also what stands there while an image loads and if it never
/// arrives -- so the row never changes height, whatever the network does.
struct LogoBadge: View {
    let shop: Shop?
    var size: CGFloat = 28

    var body: some View {
        content
            .frame(width: size, height: size)
            .background(hasMark ? AnyShapeStyle(.white) : AnyShapeStyle(.quaternary),
                        in: RoundedRectangle(cornerRadius: 6))
    }

    /// White behind a mark, on purpose and in both appearances. These logos
    /// come from eight different places, several are dark ink on nothing, and
    /// on a dark background they would simply disappear. The web app puts the
    /// same white square behind them.
    private var hasMark: Bool {
        shop?.assetName != nil || shop?.logoUrl != nil
    }

    @ViewBuilder
    private var content: some View {
        if let asset = shop?.assetName {
            Image(asset)
                .resizable()
                .scaledToFit()
                .padding(2)
        } else if let url = shop?.logoUrl {
            AsyncImage(url: url) { phase in
                if case .success(let image) = phase {
                    image
                        .resizable()
                        .scaledToFit()
                        .padding(2)
                } else {
                    // Covers loading and failure alike. A logo is decoration;
                    // a spinner for it would claim more attention than it is
                    // worth, and a broken-image symbol says nothing useful.
                    initials
                }
            }
        } else {
            initials
        }
    }

    private var initials: some View {
        Text(shop?.initials ?? "?")
            .font(.system(size: size * 0.38, weight: .semibold))
            .foregroundStyle(.secondary)
    }
}

/// The label search's answer: a count per shop and a way in, rather than a
/// hit list that would run into four digits for a large label.
struct LabelResultsList: View {
    let results: [ShopLabelHits]
    let shops: [Shop]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(sorted) { entry in
                let shop = shops.first { $0.id == entry.shopId }
                HStack(spacing: 10) {
                    LogoBadge(shop: shop, size: 26)
                    Text(shop?.name ?? entry.shopId).font(.subheadline)
                    Spacer(minLength: 0)
                    trailing(for: entry)
                }
                .padding(10)
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    @ViewBuilder
    private func trailing(for entry: ShopLabelHits) -> some View {
        if entry.failed {
            Text(entry.error ?? "Error").font(.caption).foregroundStyle(.orange)
        } else if let result = entry.result {
            if !result.supported {
                // Not a failure: this shop offers no usable way to search by
                // label at all.
                Text("not supported").font(.caption).foregroundStyle(.tertiary)
            } else if let url = result.url {
                Link(destination: url) {
                    Text("\(result.count ?? 0) releases").font(.subheadline.monospacedDigit())
                }
            } else {
                Text("\(result.count ?? 0)").font(.subheadline.monospacedDigit())
            }
        }
    }

    private var sorted: [ShopLabelHits] {
        results.sorted { a, b in
            let na = shops.first { $0.id == a.shopId }?.name ?? a.shopId
            let nb = shops.first { $0.id == b.shopId }?.name ?? b.shopId
            return na.localizedCompare(nb) == .orderedAscending
        }
    }
}

#if DEBUG
#Preview("Shop cards") {
    ScrollView {
        VStack(spacing: 12) {
            ForEach(ShopHits.samples) { entry in
                ShopCard(shop: Shop.samples.first { $0.id == entry.shopId },
                         entry: entry,
                         formats: Set(VinylFormat.allCases))
            }
        }
        .padding()
    }
}
#endif
