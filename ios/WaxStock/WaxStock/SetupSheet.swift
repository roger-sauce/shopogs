import SwiftUI

/// The first start. Nothing else works until this is answered, so it is the
/// only thing on screen.
struct SetupSheet: View {
    @Binding var configured: Bool

    @State private var address = ""
    @State private var checking = false
    @State private var failed = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://roon-bridge.local:5443", text: $address)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onChange(of: address) { failed = false }
                } header: {
                    Text("Server address")
                } footer: {
                    Text("""
                    Where shopogs runs. On the home network that is caddy in \
                    front of the app — the same address the browser uses.
                    """)
                }

                Section {
                    Button {
                        Task { await connect() }
                    } label: {
                        HStack {
                            Text("Connect")
                            Spacer()
                            if checking { ProgressView() }
                        }
                    }
                    .disabled(ServerAddress.parse(address) == nil || checking)

                    // Not a dead end: the address may be right while the
                    // server is simply off, and refusing to store it would
                    // mean typing it again later.
                    if failed {
                        Text("No answer from that address.")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                        Button("Use it anyway") { save() }
                    }
                }
            }
            .navigationTitle("Set up WaxStock")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func connect() async {
        guard let url = ServerAddress.parse(address) else { return }
        checking = true
        defer { checking = false }

        if await WaxStockAPI.isReachable(url) {
            save()
        } else {
            failed = true
        }
    }

    private func save() {
        guard ServerAddress.store(address) else { return }
        configured = true
    }
}

#if DEBUG
#Preview("Setup") {
    SetupSheet(configured: .constant(false))
}
#endif
