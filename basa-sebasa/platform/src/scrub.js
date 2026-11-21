// No contact sharing: phone numbers, emails and "call/whatsapp me" handles are removed
// from every message passed between a customer and a pro.
const PATTERNS = [
  /(?:\+?\d[\s\-().]*){7,}/g,                                  // phone numbers, with or without spaces/dashes
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,                                  // email addresses
  /\b(?:wa\.me|whatsapp\.com|t\.me|facebook\.com|fb\.com|instagram\.com)\/\S+/gi, // social links
  /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|oh)(?:[\s,-]+(?:zero|one|two|three|four|five|six|seven|eight|nine|oh)){6,}\b/gi, // numbers spelt out
];
export function scrub(text) {
  let out = String(text || ""), hit = false;
  for (const p of PATTERNS) out = out.replace(p, () => { hit = true; return "[contact removed]"; });
  return { text: out, scrubbed: hit };
}
