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
///   - "CS", "2CS", "3CS" (ANOST): the same shape again, for cassettes. Until
///     this was here, ANOST tapes only showed up with all four ticked.
///   - "10”" (ANOST): a typographic inch mark, not the ASCII quote Hard Wax
///     sends. Every ANOST 10 and 12 inch was invisible under the Vinyl filter
///     because of that one character.
///
/// Written by hand rather than with a regex: the original needs a negative
/// lookbehind, and reproducing that across two regex engines is a promise
/// this code would have to keep on every OS release.
enum FormatClassifier {
    /// Every spelling of the inch mark seen in the wild, plus the double
    /// prime that is typographically the correct one.
    private static let inchMarks: Set<Character> = ["\"", "\u{201C}", "\u{201D}", "\u{2033}"]

    static func classify(_ raw: String?) -> VinylFormat? {
        guard let raw, !raw.isEmpty else { return nil }
        let f = raw.lowercased()

        if ["mp3", "wav", "flac", "aiff", "download", "digital"].contains(where: f.contains) {
            return .download
        }
        if f.contains("cassette") || f.contains("tape")
            || containsToken("cs", in: f, plural: false)     // ANOST: "CS", "2CS", "3CS"
            || containsToken("mc", in: f, plural: false)     // JPC
            || containsToken("k7", in: f, plural: false) {   // Soufflé Continu
            return .cassette
        }
        if containsToken("cd", in: f, plural: true) {
            return .cd
        }
        // The inch mark arrives in more than one spelling: Hard Wax sends the
        // ASCII quote in "10\"", ANOST the typographic one in "10”". Both
        // count, and so does HHV's "7inch".
        if f.contains("lp") || f.contains("vinyl") || endsWord("ep", in: f)
            || f.contains("inch") || f.contains(where: Self.inchMarks.contains) {
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

    /// `(?:(?<![a-z])|(?<=\dx))<token>s?\b`
    ///
    /// A letter directly in front rules the match out, a quantity does not:
    /// "9CD Box", "2CS" and "3xCD" are the format, "classics", "discs" and
    /// "boxcd" are not. The x has to earn its exception with a digit before
    /// it, otherwise "maxcd" would count too. The trailing s is only for CD
    /// ("3 CDs"); no shop pluralises the others.
    private static func containsToken(_ token: String, in text: String, plural: Bool) -> Bool {
        let chars = Array(text), needle = Array(token)
        guard chars.count >= needle.count else { return false }
        for start in 0...(chars.count - needle.count) where Array(chars[start..<start + needle.count]) == needle {
            if start > 0, isAsciiLetter(chars[start - 1]) {
                let quantified = chars[start - 1] == "x" && start > 1 && chars[start - 2].isNumber
                if !quantified { continue }
            }
            var end = start + needle.count
            if plural, end < chars.count, chars[end] == "s" { end += 1 }
            let after = end < chars.count ? chars[end] : nil
            if !(after.map(isWordChar) ?? false) { return true }
        }
        return false
    }
}
