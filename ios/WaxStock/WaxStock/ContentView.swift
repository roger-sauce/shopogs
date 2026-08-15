import SwiftUI

/// The frame around everything: the toolbar, and the gate that keeps the app
/// from pretending to work before it has been told where the server is.
struct ContentView: View {
    /// Re-read rather than cached: the setup sheet writes to the defaults, and
    /// this is what notices.
    @State private var configured = ServerAddress.isSet

    /// Only previews set this, see `SearchView`.
    private let preloadedShops: [Shop]?

    init(preloadedShops: [Shop]? = nil) {
        self.preloadedShops = preloadedShops
        if preloadedShops != nil { _configured = State(initialValue: true) }
    }

    var body: some View {
        NavigationStack {
            SearchView(preloadedShops: preloadedShops)
                .navigationTitle("WaxStock")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        NavigationLink {
                            SettingsPage(configured: $configured)
                        } label: {
                            Image(systemName: "gearshape")
                        }
                        .accessibilityLabel("Settings")
                    }
                }
        }
        // Deliberately not dismissible: without an address every request goes
        // nowhere, and an app that looks usable but answers nothing is worse
        // than one that says what it needs.
        .sheet(isPresented: .constant(!configured)) {
            SetupSheet(configured: $configured)
                .interactiveDismissDisabled()
        }
    }
}

#if DEBUG
#Preview("Main") {
    ContentView(preloadedShops: Shop.samples)
}
#endif
