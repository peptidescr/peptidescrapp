/**
 * Legal copy.
 *
 * Re-sourced for the September 2026 rebrand from USA Peptide Depot's own site
 * (usapeptidedepot.com), whose entry gate states products are "supplied
 * strictly for in-vitro laboratory research by qualified institutions,
 * universities and licensed laboratory personnel," "NOT for human
 * consumption, clinical use, or veterinary application," and requires the
 * visitor to represent "an institution, university, corporate R&D facility,
 * or qualified researcher" — a notice at least as strict as the previous
 * client's. This app is a personal record-keeping tool that helps someone
 * organize schedules and do reconstitution arithmetic for choices they have
 * already made — it is not medical guidance, and this text says so plainly,
 * but it doesn't attribute anything to USA Peptide Depot beyond what their
 * own site actually says, and the underlying tension between that notice and
 * an app that helps track personal use is real and is the client's to
 * resolve with their own lawyer, not something drafted here can paper over.
 * Ship only after that review.
 *
 * Kept out of the normal i18n locale files on purpose — legal text has its
 * own review/versioning cadence, separate from ordinary product copy.
 *
 * Bump LEGAL_VERSION whenever the wording changes so re-acceptance is
 * enforced (Settings.legalAcceptedVersion is compared against this). Bumped
 * to 3 here: the rebrand replaces the seller's name and disclaimer wording,
 * so anyone who accepted the old (correct-at-the-time) text is asked again.
 */
export const LEGAL_VERSION = 3

export const LEGAL_CONTENT = {
  'es-CR': {
    disclaimerTitle: 'Aviso legal',
    disclaimerBody:
      'Los productos de USA Peptide Depot se ofrecen exclusivamente para investigación de laboratorio in vitro, dirigidos a instituciones, universidades, centros de investigación y desarrollo corporativos y personal de laboratorio calificado. No están destinados al consumo humano, uso clínico diagnóstico ni uso veterinario, y son solo para uso de laboratorio e investigación.\n\nUPD (esta aplicación) es una herramienta personal de organización: te ayuda a llevar el registro de horarios y a calcular la matemática de una reconstitución (cuánto diluyente agregar y cuánto extraer) para decisiones que vos ya tomaste por tu cuenta. Nada en esta aplicación —incluidas las plantillas de protocolo, sus dosis de ejemplo, ni los resultados de la calculadora— constituye asesoría médica, una recomendación de uso, ni una declaración de USA Peptide Depot sobre el uso personal o humano de sus productos. Vos sos la única persona responsable de qué compuestos usás, en qué cantidad y con qué frecuencia. Consultá a un profesional de la salud calificado antes de usar cualquier compuesto.',
    termsTitle: 'Términos de uso',
    termsBody:
      'UPD no requiere cuenta ni recopila tu identidad. Tus protocolos, dosis registradas y ajustes se guardan únicamente en este dispositivo; no hay copia en un servidor a menos que instales la aplicación y actives las notificaciones, en cuyo caso este dispositivo envía a nuestro servidor una dirección de notificaciones anónima y las horas de tus próximos recordatorios —nunca el nombre de un compuesto ni una dosis— para poder avisarte incluso con la aplicación cerrada (más detalle en Ajustes → Notificaciones). Hacer respaldos periódicos (Ajustes → Respaldo) es tu responsabilidad; desinstalar la aplicación, borrar los datos del navegador o perder el dispositivo elimina esa información de forma permanente. El catálogo de compuestos y las plantillas de protocolo son contenido informativo, no dosis clínicamente validadas. Al usar esta aplicación aceptás este aviso legal y estos términos.',
    acceptCta: 'Entiendo y acepto',
  },
  en: {
    disclaimerTitle: 'Legal disclaimer',
    disclaimerBody:
      "USA Peptide Depot's products are supplied strictly for in-vitro laboratory research, intended for institutions, universities, corporate R&D facilities and qualified researchers. They are not intended for human consumption, clinical diagnostic use, or veterinary application, and are for laboratory and research use only.\n\nUPD (this app) is a personal organizing tool: it helps you keep track of schedules and do reconstitution arithmetic (how much diluent to add and how much to draw) for decisions you have already made on your own. Nothing in this app — including protocol templates, their example doses, or the calculator's results — is medical advice, a recommendation to use anything, or a statement by USA Peptide Depot about personal or human use of its products. You are solely responsible for what you choose to use, in what amount, and how often. Consult a qualified healthcare professional before using any compound.",
    termsTitle: 'Terms of use',
    termsBody:
      "UPD doesn't require an account and doesn't collect your identity. Your protocols, logged doses and settings are stored only on this device — nothing is copied to a server unless you install the app and turn on notifications, in which case this device sends our server an anonymous notification address and the times of your upcoming reminders, never a compound name or dose, so you can be reminded even with the app closed (see Settings → Notifications for detail). Backing up regularly (Settings → Backup) is your own responsibility; uninstalling the app, clearing your browser data, or losing the device deletes this information permanently. The compound catalogue and protocol templates are informational content, not clinically validated doses. By using this app you accept this disclaimer and these terms.",
    acceptCta: 'I understand and agree',
  },
} as const
