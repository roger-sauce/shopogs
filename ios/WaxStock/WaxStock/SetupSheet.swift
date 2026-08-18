import SwiftUI

/// The first start. Nothing else works until this is answered, so it is the
/// only thing on screen.
struct SetupSheet: View {
    @Binding var configured: Bool

    /// Prefilled rather than left blank. There is exactly one server, and
    /// typing a 40-character address on a phone to reach it is a toll with
    /// nothing on the other side. Overwriting it is one tap.
    @State private var address = ServerAddress.suggested
    @State private var checking = false
    @State private var failed = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(ServerAddress.suggested, text: $address)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .onChange(of: address) { failed = false }
                } header: {
                    Text("Server address")
                } footer: {
                    Text("""
                    Where shopogs runs. The address above works from anywhere. \
                    On the home network https://extern.local:5443 reaches the \
                    same stack directly.
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
