/**
 * Legal copy, per brand (see src/brand/brands.ts).
 *
 * USA Peptide Depot's seller notice was re-sourced for the September 2026
 * rebrand from their own site (usapeptidedepot.com), whose entry gate states
 * products are "supplied strictly for in-vitro laboratory research by
 * qualified institutions, universities and licensed laboratory personnel,"
 * "NOT for human consumption, clinical use, or veterinary application," and
 * requires the visitor to represent "an institution, university, corporate
 * R&D facility, or qualified researcher."
 *
 * Peptides Costa Rica's seller notice sticks to what their own site
 * (peptidescostarica.net) states: products are "research use only, not for
 * human or veterinary use." Before the rebrand this app only ever had
 * placeholder legal text for them, so this wording is new — it needs the
 * same lawyer review as USA Peptide Depot's before that site ships.
 *
 * The rest (what the app is, what it stores, what it isn't) is the same for
 * both brands, with only the names filled in. This app is a personal
 * record-keeping tool that helps someone organize schedules and do
 * reconstitution arithmetic for choices they have already made — it is not
 * medical guidance, and this text says so plainly, but it doesn't attribute
 * anything to either seller beyond what their own site actually says. The
 * underlying tension between those notices and an app that helps track
 * personal use is real and is the client's to resolve with their own
 * lawyer, not something drafted here can paper over. Ship only after that
 * review.
 *
 * Kept out of the normal i18n locale files on purpose — legal text has its
 * own review/versioning cadence, separate from ordinary product copy.
 *
 * Bump a brand's LEGAL_VERSION whenever its wording changes so re-acceptance
 * is enforced (Settings.legalAcceptedVersion is compared against this).
 * USA Peptide Depot is at 3 (the rebrand replaced the seller's name and
 * disclaimer wording). Peptides CR starts at 4, above anything either brand
 * has shipped, so an install that accepted a different brand's text on the
 * same origin (e.g. if a domain is ever repointed) is asked again.
 */
import type { Locale } from '../lib/units'

interface LegalText {
  disclaimerTitle: string
  disclaimerBody: string
  termsTitle: string
  termsBody: string
  acceptCta: string
}

interface LegalNames {
  /** The seller, in prose ("una declaración de …"). */
  seller: string
  /** What the app calls itself inside the legal text ("… (esta aplicación)"). */
  app: string
  sellerNotice: Record<Locale, string>
}

function buildLegal({ seller, app, sellerNotice }: LegalNames): Record<Locale, LegalText> {
  return {
    'es-CR': {
      disclaimerTitle: 'Aviso legal',
      disclaimerBody: `${sellerNotice['es-CR']}\n\n${app} (esta aplicación) es una herramienta personal de organización: te ayuda a llevar el registro de horarios y a calcular la matemática de una reconstitución (cuánto diluyente agregar y cuánto extraer) para decisiones que vos ya tomaste por tu cuenta. Nada en esta aplicación —incluidas las plantillas de protocolo, sus dosis de ejemplo, ni los resultados de la calculadora— constituye asesoría médica, una recomendación de uso, ni una declaración de ${seller} sobre el uso personal o humano de sus productos. Vos sos la única persona responsable de qué compuestos usás, en qué cantidad y con qué frecuencia. Consultá a un profesional de la salud calificado antes de usar cualquier compuesto.`,
      termsTitle: 'Términos de uso',
      termsBody: `${app} no requiere cuenta ni recopila tu identidad. Tus protocolos, dosis registradas y ajustes se guardan únicamente en este dispositivo; no hay copia en un servidor a menos que instales la aplicación y actives las notificaciones, en cuyo caso este dispositivo envía a nuestro servidor una dirección de notificaciones anónima y las horas de tus próximos recordatorios —nunca el nombre de un compuesto ni una dosis— para poder avisarte incluso con la aplicación cerrada (más detalle en Ajustes → Notificaciones). Hacer respaldos periódicos (Ajustes → Respaldo) es tu responsabilidad; desinstalar la aplicación, borrar los datos del navegador o perder el dispositivo elimina esa información de forma permanente. El catálogo de compuestos y las plantillas de protocolo son contenido informativo, no dosis clínicamente validadas. Al usar esta aplicación aceptás este aviso legal y estos términos.`,
      acceptCta: 'Entiendo y acepto',
    },
    en: {
      disclaimerTitle: 'Legal disclaimer',
      disclaimerBody: `${sellerNotice.en}\n\n${app} (this app) is a personal organizing tool: it helps you keep track of schedules and do reconstitution arithmetic (how much diluent to add and how much to draw) for decisions you have already made on your own. Nothing in this app — including protocol templates, their example doses, or the calculator's results — is medical advice, a recommendation to use anything, or a statement by ${seller} about personal or human use of its products. You are solely responsible for what you choose to use, in what amount, and how often. Consult a qualified healthcare professional before using any compound.`,
      termsTitle: 'Terms of use',
      termsBody: `${app} doesn't require an account and doesn't collect your identity. Your protocols, logged doses and settings are stored only on this device — nothing is copied to a server unless you install the app and turn on notifications, in which case this device sends our server an anonymous notification address and the times of your upcoming reminders, never a compound name or dose, so you can be reminded even with the app closed (see Settings → Notifications for detail). Backing up regularly (Settings → Backup) is your own responsibility; uninstalling the app, clearing your browser data, or losing the device deletes this information permanently. The compound catalogue and protocol templates are informational content, not clinically validated doses. By using this app you accept this disclaimer and these terms.`,
      acceptCta: 'I understand and agree',
    },
  }
}

// A literal VITE_BRAND ternary with each brand's text inline in its own
// branch, so the bundler drops the other brand's text outright — see
// src/brand/index.ts.
const LEGAL =
  import.meta.env.VITE_BRAND === 'pcr'
    ? {
        version: 4,
        content: buildLegal({
          seller: 'Peptides Costa Rica',
          app: 'Peptides CR',
          sellerNotice: {
            'es-CR':
              'Los productos de Peptides Costa Rica se ofrecen exclusivamente para uso en investigación. No están destinados al uso humano ni veterinario.',
            en: "Peptides Costa Rica's products are sold for research use only. They are not intended for human or veterinary use.",
          },
        }),
      }
    : {
        version: 3,
        content: buildLegal({
          seller: 'USA Peptide Depot',
          app: 'UPD',
          sellerNotice: {
            'es-CR':
              'Los productos de USA Peptide Depot se ofrecen exclusivamente para investigación de laboratorio in vitro, dirigidos a instituciones, universidades, centros de investigación y desarrollo corporativos y personal de laboratorio calificado. No están destinados al consumo humano, uso clínico diagnóstico ni uso veterinario, y son solo para uso de laboratorio e investigación.',
            en: "USA Peptide Depot's products are supplied strictly for in-vitro laboratory research, intended for institutions, universities, corporate R&D facilities and qualified researchers. They are not intended for human consumption, clinical diagnostic use, or veterinary application, and are for laboratory and research use only.",
          },
        }),
      }

export const LEGAL_VERSION = LEGAL.version
export const LEGAL_CONTENT = LEGAL.content
