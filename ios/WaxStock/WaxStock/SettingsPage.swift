import SwiftUI

/// Where the server is, and whether it wants a key.
struct SettingsPage: View {
    @Binding var configured: Bool

    @State private var address = ServerAddress.text
    @State private var key = ""
    /// Mirrored into state rather than read from the keychain in `body`:
    /// storing and removing change nothing SwiftUI observes, so without this
    /// the status row below would keep showing the previous answer.
    @State private var keyStored = ServerKey.isSet
    @State private var probe: ProbeState = .idle

    private enum ProbeState: Equatable {
        case idle
        case checking
        case result(WaxStockAPI.ServerProbe)
    }

    var body: some View {
        Form {
            Section {
                TextField("https://example.com", text: $address)
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
                        if probe == .checking { ProgressView() }
                    }
                }
                .disabled(ServerAddress.parse(address) == nil || probe == .checking)

                if case .result(let outcome) = probe {
                    probeRow(outcome)
                }
            } header: {
                Text("Server")
            } footer: {
                // The certificate is the usual reason a correct address still
                // fails, so it is worth saying once rather than debugging
                // twice.
                Text("""
                On the home network this is caddy, with a certificate from the \
                local mkcert CA. A simulator keeps its own certificate store \
                and needs that CA added once before it will trust the server.
                """)
            }

            Section {
                // Says what is stored, not what it is. A key that can be read
                // back is a key that ends up in a screenshot.
                HStack(spacing: 8) {
                    Image(systemName: keyStored ? "key.fill" : "key")
                        .foregroundStyle(keyStored ? Color.green : Color.secondary)
                    Text(keyStored ? "Key stored" : "No key stored")
                    Spacer()
                    if keyStored {
                        Text("in the keychain")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                SecureField(keyStored ? "Enter a new key to replace it" : "Leave empty if unset",
                            text: $key)
                    .textContentType(.password)
                    .autocorrectionDisabled()

                Button("Save key") {
                    ServerKey.store(key)
                    keyStored = ServerKey.isSet
                    key = ""
                    // The old answer says nothing about the new key.
                    probe = .idle
                }
                .disabled(key.isEmpty)

                if keyStored {
                    Button("Remove key", role: .destructive) {
                        ServerKey.remove()
                        keyStored = ServerKey.isSet
                        probe = .idle
                    }
                }
            } header: {
                Text("Key")
            } footer: {
                Text("""
                Only needed once SHOPOGS_API_KEY is set on the server. Without \
                it the API is open, exactly as the web app reaches it. Whether \
                the stored key is the right one is what Test connection above \
                answers — this row only says that one exists.
                """)
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func probeRow(_ outcome: WaxStockAPI.ServerProbe) -> some View {
        switch outcome {
        case .ok:
            Label("Server answers, key accepted", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .font(.footnote)
        case .keyRefused:
            // Deliberately separate from "unreachable": the address is fine,
            // the field below it is not.
            Label("Server answers, key refused", systemImage: "key.slash")
                .foregroundStyle(.orange)
                .font(.footnote)
        case .unreachable:
            Label("No answer from that address", systemImage: "xmark.circle.fill")
                .foregroundStyle(.orange)
                .font(.footnote)
        }
    }

    private func save() {
        guard ServerAddress.store(address) else { return }
        configured = ServerAddress.isSet
    }

    /// Reachability and key in one go -- the keyless health route first, then
    /// one authenticated call.
    private func check() async {
        guard let url = ServerAddress.parse(address) else { return }
        probe = .checking
        probe = .result(await WaxStockAPI.probe(url))
    }
}

#if DEBUG
#Preview("Settings") {
    NavigationStack {
        SettingsPage(configured: .constant(true))
    }
}
#endif
