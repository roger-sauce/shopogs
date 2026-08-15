import SwiftUI

/// Which shops are being asked, and how quickly they answer.
///
/// Collapsed by default and tucked under the form: on a phone this is
/// reference material, not the point of the screen. In the web app the same
/// information takes up half the landing page, which works there because
/// there is room for it.
struct ShopsPanel: View {
    let shops: [Shop]

    @State private var expanded = false

    var body: some View {
        if !shops.isEmpty {
            DisclosureGroup(isExpanded: $expanded) {
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(ShopGroup.allCases, id: \.self) { group in
                        let inGroup = shops.filter { $0.group == group }
                        if !inGroup.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text(group.title.uppercased())
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                    .tracking(1.5)

                                // Split by speed inside the group, because
                                // that is what decides whether a result shows
                                // up in one second or in ten.
                                ForEach(ShopSpeed.allCases, id: \.self) { speed in
                                    let bySpeed = inGroup
                                        .filter { $0.speed == speed }
                                        .sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
                                    if !bySpeed.isEmpty {
                                        Text(speed == .fast ? "Answers quickly" : "Takes a moment")
                                            .font(.caption2)
                                            .foregroundStyle(.tertiary)

                                        ForEach(bySpeed) { shop in
                                            row(for: shop)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.top, 8)
            } label: {
                Label("Shops", systemImage: "storefront")
                    .font(.subheadline)
            }
            .padding(12)
            .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    @ViewBuilder
    private func row(for shop: Shop) -> some View {
        let content = HStack(spacing: 10) {
            LogoBadge(shop: shop, size: 24)
            Text(shop.name).font(.footnote)
            Text(shop.country).font(.caption2).foregroundStyle(.secondary)
            Spacer(minLength: 0)
            if let url = shop.homeUrl, url.host() != nil {
                Image(systemName: "arrow.up.right").font(.caption2).foregroundStyle(.tertiary)
            }
        }

        if let url = shop.homeUrl {
            Link(destination: url) { content }.buttonStyle(.plain)
        } else {
            content
        }
    }
}

#if DEBUG
#Preview("Shops panel") {
    ShopsPanel(shops: Shop.samples).padding()
}
#endif
