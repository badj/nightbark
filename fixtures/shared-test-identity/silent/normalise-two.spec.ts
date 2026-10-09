// FIXTURE — the SAME number in a JSDoc in a SECOND file. Two files would normally fire; the fact
// that both are inside comments is what must keep it silent. Documenting a format is not using it.
/** Accepts "021 018 24964" and the +64 form. */
export function alsoNormalise(msisdn: string): string {
  return msisdn.trim();
}
