import SwiftUI

/// Where the server is, and whether it wants a key.
struct SettingsPage: View {
    @Binding var configured: Bool

    @State private var address = ServerAddress.text
    @State private var key = ""
    @State private var probe: Probe = .idle

    private enum Probe: Equatable {
        case idle, checking, reachable, unreachable
    }

    var body: some View {
        Form {
            Section {
                TextField("https://roon-bridge.local:5443", text: $address)
                    .textContentType(.URL)
                    .keyboardType(.URL)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .onChange(of: address) { probe = .idle }

                Button("Save address") { save() }
                    .disabled(ServerAddress.parse(address) == nil)

                Button {
                    Task { await check() }
                } label: {
                    HStack {
                        Text("Test connection")
                        Spacer()
                        switch probe {
                        case .idle: EmptyView()
                        case .checking: ProgressView()
                        case .reachable: Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                        case .unreachable: Image(systemName: "xmark.circle.fill").foregroundStyle(.orange)
                        }
                    }
                }
                .disabled(ServerAddress.parse(address) == nil || probe == .checking)
            } header: {
                Text("Server")
            } footer: {
                // Worth saying once: the certificate is the usual reason a
                // correct address still fails.
                Text("""
                On the home network this is caddy, with a certificate from the \
                local mkcert CA. A simulator keeps its own certificate store \
                and needs that CA added once before it will trust the server.
                """)
            }

            Section {
                SecureField("Leave empty if unset", text: $key)
                    .textContentType(.password)
                    .autocorrectionDisabled()

                Button("Save key") {
                    ServerKey.store(key)
                    key = ""
                }
                .disabled(key.isEmpty)

                if ServerKey.isSet {
                    Button("Remove key", role: .destructive) { ServerKey.remove() }
                }
            } header: {
                Text("Key")
            } footer: {
                Text("""
                Only needed once SHOPOGS_API_KEY is set on the server. Without \
                it the API is open, exactly as the web app reaches it.
                """)
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func save() {
        guard ServerAddress.store(address) else { return }
        configured = ServerAddress.isSet
    }

    /// Deliberately against the keyless health route: this answers "is
    /// anything there at all", separately from "is the key right".
    private func check() async {
        guard let url = ServerAddress.parse(address) else { return }
        probe = .checking
        probe = await WaxStockAPI.isReachable(url) ? .reachable : .unreachable
    }
}

#if DEBUG
#Preview("Settings") {
    NavigationStack {
        SettingsPage(configured: .constant(true))
    }
}
#endif
