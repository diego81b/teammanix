/**
 * Who signed, frozen on the acceptance row at the moment of the click. The proof of acceptance outlives the
 * account (art. 17(3)(e) GDPR: defence of legal claims), so it cannot depend on the user row or on what the
 * account says later.
 */
export function signerOf(user: { name: string; surname: string; email: string }): { signerName: string; signerEmail: string } {
  return { signerName: `${user.name.trim()} ${user.surname.trim()}`.trim(), signerEmail: user.email };
}
