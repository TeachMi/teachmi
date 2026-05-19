// Build an RFC-5545 .ics file for a booked lesson. Story 4.3 (2026-05-18).
//
// Used by the approval page's "Add to calendar" button. We generate the ICS
// on the SERVER (no client crypto, no R2 round-trip) and serve it through
// a Server Action that returns the bytes to the browser.
//
// Hebrew text is fine inside ICS bodies as long as the file is UTF-8.
// Outlook/Google/Apple all handle it.

export interface IcsInput {
  uid: string; // stable, e.g. booking-{id}@teachme.co.il
  startUtc: Date;
  endUtc: Date;
  summary: string; // SUMMARY field — short title
  description: string; // DESCRIPTION field — multi-line body
  location: string; // LOCATION field — e.g. "אונליין · TeachMe"
}

/** Fold + escape per RFC-5545. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    // Code review 2026-05-19 (F7): match CRLF, bare CR, AND bare LF. The
    // previous `/\r?\n/g` silently passed a bare `\r` through, which can
    // corrupt iCalendar framing on lenient parsers that treat bare CR as
    // a line separator.
    .replace(/\r\n|\r|\n/g, "\\n");
}

function formatIcsDate(d: Date): string {
  // YYYYMMDDTHHMMSSZ
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

export function buildIcs(input: IcsInput): string {
  const dtstamp = formatIcsDate(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TeachMe//Booking//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${formatIcsDate(input.startUtc)}`,
    `DTEND:${formatIcsDate(input.endUtc)}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
    `DESCRIPTION:${escapeIcsText(input.description)}`,
    `LOCATION:${escapeIcsText(input.location)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // RFC-5545 line-fold at 75 octets (we use chars — close enough for ASCII
  // / Hebrew UTF-8 in practice; pedantically wrong for combining chars).
  return lines.map(foldLine).join("\r\n");
}

function foldLine(line: string): string {
  // Code review 2026-05-19 (F8): the previous implementation sliced on
  // UTF-16 code units, which can land between a surrogate pair if the
  // input contains a non-BMP character (most emoji, some rarer scripts).
  // The Blob writer would then UTF-8-encode unpaired surrogates as
  // U+FFFD replacement chars — destroying the character at the fold
  // boundary. Hebrew (BMP) is unaffected; emoji in a tutor's display
  // name is the realistic trigger.
  //
  // Switching to `Array.from(line)` makes the split codepoint-aware.
  // RFC-5545 actually counts OCTETS not characters; this implementation
  // is conservative (lines will be shorter than 75 bytes for multi-byte
  // UTF-8 input) but never invalid — which matches the parser leniency
  // of Outlook/Google/Apple.
  const codepoints = Array.from(line);
  if (codepoints.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  parts.push(codepoints.slice(i, i + 75).join(""));
  i += 75;
  while (codepoints.length - i > 74) {
    parts.push(" " + codepoints.slice(i, i + 74).join(""));
    i += 74;
  }
  if (i < codepoints.length) parts.push(" " + codepoints.slice(i).join(""));
  return parts.join("\r\n");
}
