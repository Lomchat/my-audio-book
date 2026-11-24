import { DocPage } from '../components/PublicLayout'
import { useConfig } from '../lib/queries'
import { useLang } from '../i18n'
import type { Lang } from '../lib/types'

type Section = { h: string; p: string }
type Doc = { title: string; updated: string; sections: Section[]; contact: string; review?: Section }

const PRIVACY: Record<Lang, Doc> = {
  en: {
    title: 'Privacy',
    updated: 'Last updated: November 2026',
    contact: 'Questions? Contact us',
    review: { h: 'Review during the beta', p: 'During the beta, to check transcription quality, the team receives a copy of each finished transcript (text only, never the audio) through WhatsApp. It is only used to improve the service.' },
    sections: [
      { h: 'What we store', p: 'Your audio files, their transcripts, summaries, tags and categories, and your account details (email, name, password hash). Everything is stored on this server.' },
      { h: 'Where processing happens', p: 'Transcription and speaker detection run on this server. Your audio is never sent to a third-party speech service.' },
      { h: 'AI provider', p: 'To write summaries, titles and categories, and to answer your questions, transcript text (never the audio) is sent to an AI provider such as OpenRouter. Only what the request needs is sent.' },
      { h: 'No ads, no resale', p: 'No ads, no tracking, no selling of data.' },
      { h: 'Cookies', p: 'One cookie keeps you logged in. No analytics or ad cookies. Your language and theme are saved in your browser.' },
      { h: 'Your control', p: 'In Settings you can export your recordings and transcripts at any time. You can also delete your account, which erases your audio and data for good.' },
    ],
  },
  fr: {
    title: 'Confidentialité',
    updated: 'Dernière mise à jour : novembre 2026',
    contact: 'Une question ? Contactez-nous',
    review: { h: 'Relecture pendant la bêta', p: 'Pendant la bêta, pour vérifier la qualité de la transcription, l’équipe reçoit une copie de chaque transcription terminée (le texte seulement, jamais l’audio) par WhatsApp. Elle sert uniquement à améliorer le service.' },
    sections: [
      { h: 'Ce que nous conservons', p: 'Vos fichiers audio, leurs transcriptions, résumés, étiquettes et catégories, et les informations de votre compte (e-mail, nom, empreinte du mot de passe). Tout est stocké sur ce serveur.' },
      { h: 'Où se font les traitements', p: 'La transcription et la détection des intervenants tournent sur ce serveur. Votre audio n’est jamais envoyé à un service vocal tiers.' },
      { h: 'Fournisseur d’IA', p: 'Pour écrire les résumés, titres et catégories, et répondre à vos questions, le texte des transcriptions (jamais l’audio) est envoyé à un fournisseur d’IA comme OpenRouter. Seul le nécessaire est transmis.' },
      { h: 'Pas de publicité, pas de revente', p: 'Pas de publicité, pas de pistage, pas de vente de données.' },
      { h: 'Cookies', p: 'Un cookie vous garde connecté. Aucun cookie de mesure ou de publicité. La langue et le thème sont enregistrés dans votre navigateur.' },
      { h: 'Votre contrôle', p: 'Dans les Réglages, vous pouvez exporter vos enregistrements et transcriptions à tout moment. Vous pouvez aussi supprimer votre compte, ce qui efface vos audios et vos données définitivement.' },
    ],
  },
}

const TERMS: Record<Lang, Doc> = {
  en: {
    title: 'Terms',
    updated: 'Last updated: November 2026',
    contact: 'Need more minutes, or have a question? Contact us',
    sections: [
      { h: 'The service', p: 'This service transcribes and organizes your audio. Each account gets a number of free minutes. Contact us for more.' },
      { h: 'Provided as is', p: 'The service comes without warranty. Transcripts and summaries can contain mistakes, so check anything important. Keep your own copy of recordings you cannot lose.' },
      { h: 'Acceptable use', p: 'Do not upload illegal content or abuse the service (flooding, break-in attempts). Such accounts may be suspended.' },
      { h: 'Recording other people', p: 'If you record other people, you must get their consent where the law requires it.' },
      { h: 'Your content', p: 'Your recordings stay yours. The service only processes them to provide its features. You can export or delete them at any time.' },
      { h: 'Changes', p: 'These terms may change. Major changes will be announced in the app.' },
    ],
  },
  fr: {
    title: 'Conditions',
    updated: 'Dernière mise à jour : novembre 2026',
    contact: 'Besoin de minutes, ou une question ? Contactez-nous',
    sections: [
      { h: 'Le service', p: 'Ce service transcrit et organise vos audios. Chaque compte a des minutes gratuites. Contactez-nous pour en obtenir davantage.' },
      { h: 'Fourni tel quel', p: 'Le service est fourni sans garantie. Les transcriptions et résumés peuvent contenir des erreurs : vérifiez ce qui compte. Gardez votre propre copie des enregistrements importants.' },
      { h: 'Usage acceptable', p: 'N’importez pas de contenu illégal et n’abusez pas du service (envois massifs, tentatives d’intrusion). Les comptes concernés peuvent être suspendus.' },
      { h: 'Enregistrer d’autres personnes', p: 'Si vous enregistrez d’autres personnes, vous devez obtenir leur accord quand la loi l’exige.' },
      { h: 'Votre contenu', p: 'Vos enregistrements restent les vôtres. Le service les traite seulement pour fournir ses fonctions. Vous pouvez les exporter ou les supprimer à tout moment.' },
      { h: 'Évolutions', p: 'Ces conditions peuvent changer. Les changements importants seront annoncés dans l’app.' },
    ],
  },
}

function LegalPage({ docs }: { docs: Record<Lang, Doc> }) {
  const lang = useLang()
  const config = useConfig().data
  const doc = docs[lang]
  // The review notice only appears on instances that actually send transcripts to their operator.
  const sections = doc.review && config?.transcript_review ? [...doc.sections.slice(0, 3), doc.review, ...doc.sections.slice(3)] : doc.sections
  return (
    <DocPage>
      <article>
        <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-2 text-sm text-faint">{doc.updated}</p>
        <div className="mt-8 space-y-7">
          {sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-lg font-semibold">{s.h}</h2>
              <p className="mt-1.5 leading-relaxed text-muted">{s.p}</p>
            </section>
          ))}
        </div>
        {config?.contact_url && (
          <p className="mt-10 text-sm">
            <a href={config.contact_url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-text hover:underline">
              {doc.contact} →
            </a>
          </p>
        )}
      </article>
    </DocPage>
  )
}

export const Privacy = () => <LegalPage docs={PRIVACY} />
export const Terms = () => <LegalPage docs={TERMS} />
