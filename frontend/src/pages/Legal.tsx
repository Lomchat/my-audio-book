import { DocPage } from '../components/PublicLayout'
import { useConfig } from '../lib/queries'
import { useLang } from '../i18n'
import type { Lang } from '../lib/types'

type Section = { h: string; p: string }
type Doc = { title: string; updated: string; sections: Section[]; contact: string }

const PRIVACY: Record<Lang, Doc> = {
  en: {
    title: 'Privacy policy',
    updated: 'Last updated: November 2026',
    contact: 'Questions or requests? Contact me',
    sections: [
      { h: 'What we store', p: 'The audio files you upload or record, their transcripts, the summaries, tags and categories generated for them, and your account details (email, name, password hash). All of it is stored on the server that hosts this instance.' },
      { h: 'Where processing happens', p: 'Transcription and speaker detection run locally on that same server. Your audio is never sent to a third-party speech service.' },
      { h: 'AI provider', p: 'To write summaries, key points, titles, categories and to answer your chat questions, the transcript text (not the audio) is sent to the configured AI provider, an LLM API such as OpenRouter. Only the content needed for the request is sent.' },
      { h: 'No ads, no resale', p: 'There is no advertising, no tracking and no selling of data. Ever.' },
      { h: 'Cookies', p: 'A single cookie keeps you logged in. There are no analytics or advertising cookies. The interface language and theme are kept in your browser local storage.' },
      { h: 'Your control', p: 'From Settings you can export all your recordings and transcripts at any time, and delete your account, which permanently erases your audio files and data from the server.' },
    ],
  },
  fr: {
    title: 'Politique de confidentialité',
    updated: 'Dernière mise à jour : novembre 2026',
    contact: 'Une question ou une demande ? Contactez-moi',
    sections: [
      { h: 'Ce que nous conservons', p: 'Les fichiers audio que vous importez ou enregistrez, leurs transcriptions, les résumés, étiquettes et catégories générés, ainsi que les informations de votre compte (e-mail, nom, empreinte du mot de passe). Tout est stocké sur le serveur qui héberge cette instance.' },
      { h: 'Où se font les traitements', p: 'La transcription et la détection des locuteurs s’exécutent localement sur ce même serveur. Votre audio n’est jamais envoyé à un service de reconnaissance vocale tiers.' },
      { h: 'Fournisseur d’IA', p: 'Pour rédiger les résumés, points clés, titres et catégories, et pour répondre à vos questions dans le chat, le texte des transcriptions (pas l’audio) est envoyé au fournisseur d’IA configuré, une API de modèle de langage comme OpenRouter. Seul le contenu nécessaire à la requête est transmis.' },
      { h: 'Pas de publicité, pas de revente', p: 'Aucune publicité, aucun pistage, aucune vente de données. Jamais.' },
      { h: 'Cookies', p: 'Un seul cookie vous garde connecté. Aucun cookie de mesure d’audience ou de publicité. La langue et le thème de l’interface sont conservés dans le stockage local de votre navigateur.' },
      { h: 'Votre contrôle', p: 'Depuis les Réglages, vous pouvez à tout moment exporter l’ensemble de vos enregistrements et transcriptions, et supprimer votre compte, ce qui efface définitivement vos fichiers audio et vos données du serveur.' },
    ],
  },
}

const TERMS: Record<Lang, Doc> = {
  en: {
    title: 'Terms of use',
    updated: 'Last updated: November 2026',
    contact: 'Need more minutes or have a question? Contact me',
    sections: [
      { h: 'The service', p: 'This service transcribes and organizes your audio recordings. It is free up to a limited number of minutes per account. More minutes can be arranged by contacting the operator.' },
      { h: 'Provided as is', p: 'The service is provided as is, without warranty. Transcripts and AI summaries can contain mistakes: check anything important. Keep your own copy of recordings you cannot afford to lose.' },
      { h: 'Acceptable use', p: 'Do not upload illegal content, and do not abuse the service (automated flooding, attempts to break in, etc.). Accounts that do may be suspended.' },
      { h: 'Recording other people', p: 'If you record or upload conversations with other people, you are responsible for obtaining their consent wherever the law requires it.' },
      { h: 'Your content', p: 'Your recordings remain yours. You grant the service only the right to process them in order to provide the features you use. You can export or delete them at any time.' },
      { h: 'Changes', p: 'These terms may evolve. Significant changes will be announced in the app.' },
    ],
  },
  fr: {
    title: 'Conditions d’utilisation',
    updated: 'Dernière mise à jour : novembre 2026',
    contact: 'Besoin de plus de minutes ou une question ? Contactez-moi',
    sections: [
      { h: 'Le service', p: 'Ce service transcrit et organise vos enregistrements audio. Il est gratuit dans la limite d’un nombre de minutes par compte. Des minutes supplémentaires peuvent être convenues en contactant l’exploitant.' },
      { h: 'Fourni tel quel', p: 'Le service est fourni tel quel, sans garantie. Les transcriptions et résumés IA peuvent contenir des erreurs : vérifiez ce qui est important. Gardez votre propre copie des enregistrements que vous ne pouvez pas perdre.' },
      { h: 'Usage acceptable', p: 'N’importez pas de contenu illégal et n’abusez pas du service (envois automatisés massifs, tentatives d’intrusion, etc.). Les comptes concernés peuvent être suspendus.' },
      { h: 'Enregistrer d’autres personnes', p: 'Si vous enregistrez ou importez des conversations avec d’autres personnes, il vous revient d’obtenir leur consentement lorsque la loi l’exige.' },
      { h: 'Votre contenu', p: 'Vos enregistrements restent les vôtres. Vous accordez au service uniquement le droit de les traiter pour fournir les fonctionnalités que vous utilisez. Vous pouvez les exporter ou les supprimer à tout moment.' },
      { h: 'Évolutions', p: 'Ces conditions peuvent évoluer. Les changements importants seront annoncés dans l’application.' },
    ],
  },
}

function LegalPage({ docs }: { docs: Record<Lang, Doc> }) {
  const lang = useLang()
  const config = useConfig().data
  const doc = docs[lang]
  return (
    <DocPage>
      <article>
        <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
        <p className="mt-2 text-sm text-faint">{doc.updated}</p>
        <div className="mt-8 space-y-7">
          {doc.sections.map((s) => (
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
