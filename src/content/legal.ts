/**
 * Legal copy — DO NOT SHIP AS-IS.
 *
 * Everything below is placeholder text pending the client's lawyer. It's
 * kept out of the normal i18n locale files on purpose: it's temporary
 * content, not real product copy, and this file is the one place to swap it
 * for the final wording (which will then need translating properly into
 * both locales).
 *
 * The client's own site states their products are "research use only, not
 * for human or veterinary use." This app logs personal injections and
 * dosing history — that contradiction is the client's to resolve with
 * counsel; nothing here invents a resolution for them.
 *
 * Bump LEGAL_VERSION whenever the wording changes so re-acceptance is
 * enforced (Settings.legalAcceptedVersion is compared against this).
 */
export const LEGAL_VERSION = 1

export const LEGAL_PLACEHOLDER = {
  'es-CR': {
    disclaimerTitle: 'Aviso legal (texto provisional)',
    disclaimerBody:
      'TODO — texto provisional, pendiente de revisión legal. Debe reemplazarse antes de publicar, y debe resolver la contradicción entre el aviso del sitio del cliente ("uso exclusivo para investigación, no apto para uso humano o veterinario") y una aplicación que registra inyecciones personales del usuario.',
    termsTitle: 'Términos de uso (texto provisional)',
    termsBody: 'TODO — términos finales pendientes de redacción por el abogado del cliente.',
    acceptCta: 'Entiendo y acepto',
  },
  en: {
    disclaimerTitle: 'Legal disclaimer (placeholder)',
    disclaimerBody:
      "TODO — placeholder text, pending legal review. Must be replaced before shipping, and must resolve the contradiction between the client's site (\"research use only, not for human or veterinary use\") and an app that logs a user's personal injections.",
    termsTitle: 'Terms of use (placeholder)',
    termsBody: "TODO — final terms pending drafting by the client's lawyer.",
    acceptCta: 'I understand and agree',
  },
} as const
