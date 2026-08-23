import SwiftUI

/// The set-aside searches, to pick one up again.
struct HistorySheet: View {
    let history: SearchHistory
    /// Handed the chosen entry; the sheet closes itself afterwards.
    let onPick: (HistoryEntry) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if history.entries.isEmpty {
                    ContentUnavailableView(
                        "Nothing put aside",
                        systemImage: "bookmark",
                        description: Text("The bookmark next to the format filter keeps a search for later.")
                    )
                } else {
                    List {
                        Section {
                            ForEach(history.entries) { entry in
                                row(entry)
                            }
                            .onDelete { history.remove(atOffsets: $0) }
                        } footer: {
                            // Double-tap is not the iOS habit, so it is worth
                            // saying once rather than leaving anyone tapping
                            // at a row that does not answer.
                            Text("Double-tap an entry to search for it again. Swipe left to delete.")
                        }
                    }
                }
            }
            .navigationTitle("History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func row(_ entry: HistoryEntry) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(entry.title.isEmpty ? entry.artist : entry.title)
                .font(.body)
            if !entry.artist.isEmpty, !entry.title.isEmpty {
                Text(entry.artist)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        // Without this only the text is tappable, and the empty half of the
        // row would swallow the taps.
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            onPick(entry)
            dismiss()
        }
        // Deletion comes from onDelete on the ForEach above, not from a
        // swipeActions here: a custom trailing action would replace the
        // standard one rather than join it, and the standard one already
        // brings the swipe, the button and edit mode with it.
    }
}

#if DEBUG
#Preview("History") {
    HistorySheet(history: .sample()) { _ in }
}

#Preview("History, empty") {
    HistorySheet(history: SearchHistory()) { _ in }
}
#endif
