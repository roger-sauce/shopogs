import SwiftUI

/// Whether the input names a record or a label.
///
/// One mode rather than two screens, because it is the same question asked at
/// a different scale -- and because in label mode the artist field simply
/// becomes the label field, exactly as in the web app.
enum SearchMode: String, CaseIterable, Identifiable {
    case album, label

    var id: String { rawValue }

    var title: String {
        switch self {
        case .album: "Album"
        case .label: "Label"
        }
    }
}

/// What one speed class is currently doing.
///
/// Two of these live side by side: the fast one is usually finished while the
/// slow one is still starting a browser. That is the whole point of splitting
/// them -- the results that exist should not wait for the results that do not.
enum SearchPhase {
    case idle
    case running
    case albums([ShopHits])
    case labels([ShopLabelHits])
    case failed(String)

    var isRunning: Bool { if case .running = self { return true }; return false }

    var hits: [ShopHits] { if case .albums(let h) = self { return h }; return [] }

    var labelHits: [ShopLabelHits] { if case .labels(let l) = self { return l }; return [] }

    var error: String? { if case .failed(let message) = self { return message }; return nil }
}

/// The one screen this app has.
struct SearchView: View {
    @State private var artist = ""
    @State private var title = ""
    /// Vinyl alone by default, as in the web app -- anything else has to be
    /// asked for.
    @State private var formats: Set<VinylFormat> = [.vinyl]
    @State private var mode: SearchMode = .album
    @State private var formatsOpen = false

    @State private var suggestions: [TitleSuggestion] = []
    /// Which query the current list belongs to. Applying a suggestion writes
    /// the chosen title here, so the change to `title` does not immediately
    /// fetch suggestions for the text that was just accepted.
    @State private var suggestionsFor = ""

    @State private var fast: SearchPhase = .idle
    @State private var slow: SearchPhase = .idle
    @State private var searchTask: Task<Void, Never>?
    @State private var hasSearched = false

    @State private var shops: [Shop] = []
    @FocusState private var focusedField: Field?

    private enum Field { case artist, title }

    private let preloadedShops: [Shop]?

    init(preloadedShops: [Shop]? = nil) {
        self.preloadedShops = preloadedShops
        _shops = State(initialValue: preloadedShops ?? [])
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                inputCard
                jumpOffRow
                ShopsPanel(shops: shops)

                if hasSearched {
                    Divider()
                    resultsSection
                }
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
        .task {
            guard preloadedShops == nil, shops.isEmpty else { return }
            shops = (try? await WaxStockAPI.shops()) ?? []
        }
        // The debounce, without a timer to manage: SwiftUI cancels and
        // restarts this task on every change to `title`, so the sleep only
        // runs out once typing pauses. Each call asks six shops -- firing per
        // keystroke would make "Homogenic" nine rounds of that.
        .task(id: title) {
            let query = trimmedTitle
            guard mode == .album, query.count >= 3 else {
                suggestions = []
                // Also forget which query the list belonged to, so retyping
                // the same title after clearing the field offers again.
                suggestionsFor = ""
                return
            }
            guard query != suggestionsFor else { return }

            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }

            let found = (try? await WaxStockAPI.suggest(query, formats: formats)) ?? []
            guard !Task.isCancelled else { return }
            suggestions = found
            suggestionsFor = query
        }
    }

    // MARK: - Input

    private var inputCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            // One field pair, not two rows. Both speed classes start from the
            // same input; keeping a second copy in sync was the web app's
            // problem, not a feature worth carrying over.
            TextField(mode == .album ? "Artist / band" : "Label", text: $artist)
                .textFieldStyle(.plain)
                .focused($focusedField, equals: .artist)
                .submitLabel(mode == .album ? .next : .search)
                .onSubmit { mode == .album ? focusedField = .title : runSearch() }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))

            if mode == .album {
                TextField("Album", text: $title)
                    .textFieldStyle(.plain)
                    .focused($focusedField, equals: .title)
                    .submitLabel(.search)
                    .onSubmit { runSearch() }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))

                suggestionList
            }

            HStack(spacing: 8) {
                Picker("Mode", selection: $mode) {
                    ForEach(SearchMode.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 180)

                // Irrelevant for a label search -- a label hit is a count, it
                // has no format to filter on.
                if mode == .album { formatChip }

                Spacer(minLength: 0)
            }

            if mode == .album, formats.isEmpty {
                Text("No format selected — that will find nothing.")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            HStack(spacing: 12) {
                Button(action: runSearch) {
                    Label("Search", systemImage: "magnifyingglass")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canSearch)

                if hasSearched {
                    Button("Reset", action: reset)
                        .buttonStyle(.bordered)
                }
            }
        }
        .textInputAutocapitalization(.words)
        .autocorrectionDisabled()
    }

    /// A popover rather than a Menu.
    ///
    /// A Menu closes on the first tap, which makes picking two formats a
    /// matter of opening it twice. A popover stays put until it is dismissed
    /// by tapping outside it -- so the whole selection is one visit.
    private var formatChip: some View {
        Button {
            formatsOpen = true
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "line.3.horizontal.decrease")
                Text(formatLabel)
            }
            .font(.caption)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(.regularMaterial, in: Capsule())
        }
        .buttonStyle(.plain)
        .popover(isPresented: $formatsOpen) {
            formatPicker
                // Without this a popover turns into a sheet on a phone, and a
                // sheet for four checkboxes is a lot of furniture.
                .presentationCompactAdaptation(.popover)
        }
    }

    private var formatPicker: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Sets all four rather than toggling. "All" is a destination, not
            // a switch -- the way back is unticking what is not wanted, which
            // is the same gesture as narrowing down from anywhere else.
            formatRow(title: "All", symbol: nil, isOn: formats.count == VinylFormat.allCases.count) {
                formats = Set(VinylFormat.allCases)
            }

            Divider().padding(.horizontal, 14)

            ForEach(VinylFormat.allCases) { format in
                formatRow(title: format.rawValue, symbol: format.symbol,
                          isOn: formats.contains(format)) {
                    if formats.contains(format) {
                        formats.remove(format)
                    } else {
                        formats.insert(format)
                    }
                }
            }
        }
        .padding(.vertical, 6)
        .frame(minWidth: 230)
    }

    private func formatRow(title: String, symbol: String?, isOn: Bool,
                           action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isOn ? Color.accentColor : Color.secondary)
                if let symbol {
                    Image(systemName: symbol)
                        .foregroundStyle(.secondary)
                        .frame(width: 22)
                }
                Text(title)
                Spacer(minLength: 0)
            }
            // Without this only the label itself is tappable, and the row
            // reads as one target.
            .contentShape(Rectangle())
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
        }
        .buttonStyle(.plain)
    }

    /// Only while the album field has focus. Tapping one hands the fields
    /// over to the shops' own spelling.
    @ViewBuilder
    private var suggestionList: some View {
        if focusedField == .title, !suggestions.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                // Catalogue, not stock -- and the wording has to say so.
                // /api/suggest reads the shops' search endpoints and takes
                // the titles from whatever comes back; four of the six never
                // look at availability at all. A shop knowing "Homogenic
                // Live" says nothing about a copy being there, which is the
                // question the search below answers.
                Text("Titles shops know but might not be in stock")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                    .padding(.bottom, 2)

                ForEach(Array(suggestions.enumerated()), id: \.element.id) { index, suggestion in
                    if index > 0 { Divider().padding(.leading, 12) }
                    Button {
                        apply(suggestion)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(suggestion.title)
                                .font(.subheadline)
                            // The artist is shown even when there is none,
                            // because taking this suggestion overwrites the
                            // artist field either way. Seeing that beforehand
                            // turns a surprise into a decision.
                            HStack(spacing: 6) {
                                if let artist = suggestion.artist, !artist.isEmpty {
                                    Text(artist)
                                        .foregroundStyle(.secondary)
                                } else {
                                    Text("no artist given")
                                        .foregroundStyle(.tertiary)
                                }
                                if let format = suggestion.format {
                                    Text("·").foregroundStyle(.tertiary)
                                    Text(format).foregroundStyle(.secondary)
                                }
                            }
                            .font(.caption)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
        }
    }

    /// The suggestion decides both fields, the artist included.
    ///
    /// That is the whole point: a suggestion carries the shops' own spelling,
    /// so picking one repairs "Bjoerk" into "Björk" in the artist field too.
    /// Where a suggestion brings no artist -- ANOST never does -- the field is
    /// cleared rather than left alone, because the old artist plus a foreign
    /// title is a combination no shop can have.
    private func apply(_ suggestion: TitleSuggestion) {
        artist = suggestion.artist ?? ""
        title = suggestion.title
        suggestionsFor = suggestion.title
        suggestions = []
        focusedField = nil
    }

    private var formatLabel: String {
        if formats.isEmpty { return "None" }
        if formats.count == VinylFormat.allCases.count { return "All formats" }
        return VinylFormat.allCases.filter(formats.contains).map(\.rawValue).joined(separator: ", ")
    }

    /// Both jump-offs leave the app on purpose, as an explicit tap rather than
    /// a side effect of searching -- which is how the web app got into
    /// trouble with focus once.
    @ViewBuilder
    private var jumpOffRow: some View {
        if hasQuery {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 10) {
                    if let url = WaxStockAPI.bandcampURL(artist: trimmedArtist, title: trimmedTitle,
                                                         labelMode: mode == .label) {
                        Link(destination: url) {
                            Label("Bandcamp", systemImage: "arrow.up.right")
                        }
                        .buttonStyle(.bordered)
                    }
                    if let url = WaxStockAPI.discogsURL(artist: trimmedArtist, title: trimmedTitle,
                                                        labelMode: mode == .label) {
                        Link(destination: url) {
                            Label("Discogs", systemImage: "arrow.up.right")
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .font(.caption)

                // Discogs matches strictly, so a half-remembered title finds
                // nothing there. Bandcamp is far more forgiving, which is why
                // the hint names Discogs alone.
                Text(mode == .label ? "Both search by label" : "Discogs needs the full title")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Results

    @ViewBuilder
    private var resultsSection: some View {
        // Above the results, not below them: while the slow shops are still
        // out there may be nothing to scroll past yet, and this is the part
        // that says the search is under way.
        if !shops.isEmpty {
            SearchProgressStrip(shops: shops, progress: progress(for:), pending: pendingShops)
        }

        if mode == .label {
            LabelResultsList(results: fast.labelHits + slow.labelHits, shops: shops)
            errorNotes
        } else {
            ForEach(ShopGroup.allCases, id: \.self) { group in
                let cards = visibleCards(in: group)
                if !cards.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(group.title.uppercased())
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .tracking(1.5)

                        ForEach(cards) { card in
                            ShopCard(shop: shop(for: card.shopId), entry: card, formats: formats)
                        }
                    }
                }
            }

            errorNotes
            emptyNote
        }
    }

    /// A whole class failing, as opposed to a single shop -- that case never
    /// reaches the strip, because the server answers per shop and a class-wide
    /// failure means there was no answer at all.
    ///
    /// The other class keeps its results either way.
    @ViewBuilder
    private var errorNotes: some View {
        if let error = fast.error {
            Label("Fast shops: \(error)", systemImage: "exclamationmark.triangle")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        if let error = slow.error {
            Label("\(slowShopNames.isEmpty ? "Slow shops" : slowShopNames): \(error)",
                  systemImage: "exclamationmark.triangle")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    /// The former "Searched, nothing found at: …" line is gone -- the strip
    /// says the same thing with the marks themselves, and saying it twice was
    /// once too often.
    @ViewBuilder
    private var emptyNote: some View {
        if !fast.isRunning, !slow.isRunning,
           ShopGroup.allCases.allSatisfy({ visibleCards(in: $0).isEmpty }) {
            ContentUnavailableView(
                "Nowhere in stock",
                systemImage: "questionmark.circle",
                description: Text(formats.isEmpty
                                  ? "No format is selected."
                                  : "None of the shops has this on \(formatLabel.lowercased()).")
            )
        }
    }

    /// Where a single shop stands right now. Reads from the phase of its own
    /// speed class, so the fast shops report as soon as that request lands,
    /// long before the slow one does.
    private func progress(for shop: Shop) -> ShopProgress {
        let phase = shop.speed == .fast ? fast : slow
        switch phase {
        case .idle, .running:
            return .waiting
        case .failed:
            return .failed
        case .albums(let entries):
            guard let entry = entries.first(where: { $0.shopId == shop.id }) else { return .waiting }
            if entry.failed { return .failed }
            // Counted after the format filter, so the mark agrees with the
            // cards below it rather than with the raw answer.
            let n = entry.hits.filter { FormatClassifier.matches($0.format, selected: formats) }.count
            return n > 0 ? .found(n) : .empty
        case .labels(let entries):
            guard let entry = entries.first(where: { $0.shopId == shop.id }) else { return .waiting }
            if entry.failed { return .failed }
            guard let result = entry.result, result.supported, let count = result.count, count > 0 else {
                return .empty
            }
            return .found(count)
        }
    }

    private var pendingShops: [Shop] {
        shops.filter { progress(for: $0) == .waiting && (fast.isRunning || slow.isRunning) }
    }

    // MARK: - Deriving what to show

    private var allEntries: [ShopHits] { fast.hits + slow.hits }

    /// Only shops with something to say: a hit that survives the format filter,
    /// or a failure worth admitting to. Fast shops first, then slow, each
    /// alphabetically -- otherwise the order is whatever the server happened
    /// to return.
    private func visibleCards(in group: ShopGroup) -> [ShopHits] {
        allEntries
            .filter { entry in
                guard let shop = shop(for: entry.shopId), shop.group == group else { return false }
                if entry.failed { return true }
                return entry.hits.contains { FormatClassifier.matches($0.format, selected: formats) }
            }
            .sorted { a, b in
                guard let sa = shop(for: a.shopId), let sb = shop(for: b.shopId) else { return false }
                if sa.speed != sb.speed { return sa.speed == .fast }
                return sa.name.localizedCompare(sb.name) == .orderedAscending
            }
    }

    private func shop(for id: String) -> Shop? { shops.first { $0.id == id } }

    private var slowShopNames: String {
        shops.filter { $0.speed == .slow }.map(\.name).joined(separator: ", ")
    }

    private var trimmedArtist: String { artist.trimmingCharacters(in: .whitespaces) }
    private var trimmedTitle: String { title.trimmingCharacters(in: .whitespaces) }
    private var hasQuery: Bool { !trimmedArtist.isEmpty || !trimmedTitle.isEmpty }
    private var canSearch: Bool {
        mode == .label ? !trimmedArtist.isEmpty : hasQuery && !formats.isEmpty
    }

    // MARK: - Searching

    private func reset() {
        searchTask?.cancel()
        artist = ""
        title = ""
        suggestions = []
        suggestionsFor = ""
        fast = .idle
        slow = .idle
        hasSearched = false
    }

    /// One tap, two requests, landing independently.
    private func runSearch() {
        guard canSearch else { return }
        focusedField = nil
        searchTask?.cancel()

        hasSearched = true
        fast = .running
        slow = .running

        searchTask = Task {
            // Both start immediately and each writes its own result the
            // moment it has one -- the fast class never waits on the slow.
            // `async let` rather than a task group on purpose: it inherits
            // this view's main-actor isolation, so the assignments in
            // `load` need no hop and no sendability gymnastics.
            async let quick: Void = load(.fast)
            async let patient: Void = load(.slow)
            _ = await (quick, patient)
        }
    }

    private func load(_ speed: ShopSpeed) async {
        let phase: SearchPhase
        do {
            if mode == .label {
                phase = .labels(try await WaxStockAPI.label(trimmedArtist, speed: speed))
            } else {
                phase = .albums(try await WaxStockAPI.search(artist: trimmedArtist,
                                                             title: trimmedTitle,
                                                             speed: speed))
            }
        } catch is CancellationError {
            return
        } catch {
            phase = .failed(error.localizedDescription)
        }

        guard !Task.isCancelled else { return }
        switch speed {
        case .fast: fast = phase
        case .slow: slow = phase
        }
    }
}

#if DEBUG
#Preview("Search") {
    NavigationStack {
        SearchView(preloadedShops: Shop.samples)
            .navigationTitle("WaxStock")
            .navigationBarTitleDisplayMode(.inline)
    }
}
#endif
