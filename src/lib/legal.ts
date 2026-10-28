/* WHO RUNS FORGE, IN ONE PLACE.

   Every legal page, the sign-in screen and the billing fine print read from
   here, so a changed address or a new company name is one edit rather than a
   hunt through four documents that then disagree with each other.

   Blank fields are not rendered. They are blank because only the owner knows
   them — nothing here should ever be guessed. LEGAL_REVIEW.md lists which ones
   have to be filled before Forge takes money from anyone. */

export const LEGAL = {
  /* The person or company that the terms are a contract with. As an
     individual developer this is your full legal name; after forming an LLC
     it is the LLC's registered name. */
  operatorName: 'Preston Taylor Noland',
  /* A postal address for legal notices. A registered-agent or virtual-mailbox
     address is fine; it does not have to be a home address. */
  postalAddress: '10850 Hammerly Blvd, Houston, TX 77043',
  /* The US state whose law governs the terms, e.g. 'Texas'. */
  governingState: 'Texas',
  contactEmail: 'prestonnoland2020@gmail.com',
  /* Bump on any material change. Onboarding stores the version each athlete
     agreed to, so it is always possible to say who accepted which text. */
  version: '2026-10-26',
  updated: 'October 26, 2026',
} as const;

export const operatorLabel = LEGAL.operatorName || 'the developer of Forge';
