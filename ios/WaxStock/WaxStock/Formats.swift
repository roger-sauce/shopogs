import Foundation

/// The four categories the format filter offers.
///
/// Filtering happens here rather than on the server on purpose: switching
/// from Vinyl to CD would otherwise mean asking eight shops again, and two of
/// them would start a browser to answer.
enum VinylFormat: String, CaseIterable, Identifiable, Sendable {
    case vinyl = "Vinyl"
    case cd = "CD"
    case cassette = "Cassette"
    case download = "Download"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .vinyl: "record.circle"
        case .cd: "opticaldisc"
        case .cassette: "recordingtape"
        case .download: "arrow.down.circle"
        }
    }
}

/// Sorts a shop's own format wording into one of the four categories.
///
/// A port of src/lib/classifyFormat.ts, and it has to stay a faithful one --
/// every branch below was paid for once already:
///
///   - "3 CDs" (JPC): hence the optional trailing s.
///   - "9CD Box" (SoundOhm, Merzbow): a digit in front of CD. In the original
///     this was the bug that a leading \b could not fix, because digits count
///     as word characters themselves and there is no boundary between "9" and
///     "c". What rules a match out is a *letter* directly in front, which
///     still catches "recorded".
///
/// Written by hand rather than with a regex: the original needs a negative
/// lookbehind, and reproducing that across two regex engines is a promise
/// this code would have to keep on every OS release.
enum FormatClassifier {
    static func classify(_ raw: String?) -> VinylFormat? {
        guard let raw, !raw.isEmpty else { return nil }
        let f = raw.lowercased()

        if ["mp3", "wav", "flac", "aiff", "download", "digital"].contains(where: f.contains) {
            return .download
        }
        if f.contains("cassette") || f.contains("tape") || containsWord("mc", in: f) {
            return .cassette
        }
        if containsCD(in: f) {
            return .cd
        }
        if f.contains("lp") || f.contains("\"") || f.contains("vinyl") || endsWord("ep", in: f) {
            return .vinyl
        }
        return nil
    }

    /// With all four selected, hits whose format cannot be classified are
    /// shown as well -- when in doubt, show it. As soon as the selection is
    /// narrowed, the format has to match one of the chosen categories, or the
    /// filter would not be doing anything.
    ///
    /// An empty selection matches nothing; the caller warns about that
    /// separately rather than quietly showing everything again.
    static func matches(_ raw: String?, selected: Set<VinylFormat>) -> Bool {
        if selected.isEmpty { return false }
        if selected.count == VinylFormat.allCases.count { return true }
        guard let classified = classify(raw) else { return false }
        return selected.contains(classified)
    }

    // MARK: - Word boundaries, by hand

    private static func isWordChar(_ c: Character) -> Bool {
        c.isASCII && (c.isLetter || c.isNumber || c == "_")
    }

    private static func isAsciiLetter(_ c: Character) -> Bool {
        c.isASCII && c.isLetter
    }

    /// `\bword\b`
    private static func containsWord(_ word: String, in text: String) -> Bool {
        let chars = Array(text), needle = Array(word)
        guard chars.count >= needle.count else { return false }
        for start in 0...(chars.count - needle.count) where Array(chars[start..<start + needle.count]) == needle {
            let before = start > 0 ? chars[start - 1] : nil
            let afterIndex = start + needle.count
            let after = afterIndex < chars.count ? chars[afterIndex] : nil
            if !(before.map(isWordChar) ?? false) && !(after.map(isWordChar) ?? false) { return true }
        }
        return false
    }

    /// `word\b` -- boundary only at the end, exactly like `ep\b` in the
    /// original. Without that, "deep" would count as a hit for Vinyl.
    private static func endsWord(_ word: String, in text: String) -> Bool {
        let chars = Array(text), needle = Array(word)
        guard chars.count >= needle.count else { return false }
        for start in 0...(chars.count - needle.count) where Array(chars[start..<start + needle.count]) == needle {
            let afterIndex = start + needle.count
            let after = afterIndex < chars.count ? chars[afterIndex] : nil
            if !(after.map(isWordChar) ?? false) { return true }
        }
        return false
    }

    /// `(?<![a-z])cds?\b`
    private static func containsCD(in text: String) -> Bool {
        let chars = Array(text)
        guard chars.count >= 2 else { return false }
        for i in 0...(chars.count - 2) where chars[i] == "c" && chars[i + 1] == "d" {
            if i > 0, isAsciiLetter(chars[i - 1]) { continue }
            var end = i + 2
            if end < chars.count, chars[end] == "s" { end += 1 }
            let after = end < chars.count ? chars[end] : nil
            if !(after.map(isWordChar) ?? false) { return true }
        }
        return false
    }
}
