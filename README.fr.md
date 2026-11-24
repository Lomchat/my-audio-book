# MyAudioBook

**Enregistrez ou importez de l'audio, obtenez la transcription, un résumé et un assistant de discussion. Auto-hébergé : la transcription et la détection des locuteurs tournent sur votre propre processeur.**

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

[English](README.md) | Français

![Bibliothèque](docs/screenshots/library.png)

**Démo en ligne :** https://my-audio-book.chalco.website

## Fonctionnalités

- Import de fichiers, enregistrement dans le navigateur, application web installable (PWA), partage depuis le menu Android, Raccourci iPhone via un jeton d'API.
- Transcription locale avec Whisper large-v3-turbo (faster-whisper), sur CPU, langue détectée automatiquement (français, hébreu, anglais par défaut).
- Détection locale des locuteurs (sherpa-onnx : pyannote segmentation 3.0 et WeSpeaker ResNet34).
- Notes générées par un LLM : titre, résumé, points clés, actions à mener, catégorie et étiquettes. Toute API compatible OpenAI convient (OpenRouter par défaut, Ollama pour un fonctionnement 100 % local).
- Bibliothèque avec tri, filtres et recherche plein texte (SQLite FTS5).
- Discussion avec vos enregistrements : réponses en flux, avec citations.
- Comptes (email et mot de passe, connexion Google en option), quota gratuit de minutes audio, limite quotidienne d'IA, jetons d'API, export complet des données, suppression du compte.

## Démarrage rapide (Docker Compose)

```bash
git clone https://github.com/Lomchat/my-audio-book.git
cd my-audio-book
cp .env.example .env
# éditez .env et renseignez LLM_API_KEY (clé OpenRouter : https://openrouter.ai/keys)
docker compose up -d
```

Ouvrez http://localhost:8000 et créez votre compte. Tout le monde a la même interface ; les quotas se gèrent en ligne de commande, par exemple `docker compose exec web python -m app.manage quota vous@exemple.com unlimited`. Au premier démarrage, les modèles vocaux (environ 1,7 Go) sont téléchargés ; suivez l'avancement avec `docker compose logs -f worker`.

Renseignez `PUBLIC_URL` avec l'adresse réellement utilisée, et placez l'application derrière un proxy HTTPS en production.

## Confidentialité

L'audio, les transcriptions et la base restent sur votre serveur. Seul le texte des transcriptions (pour les résumés et la discussion) est envoyé au fournisseur de LLM que vous configurez ; avec Ollama, rien ne quitte votre machine.

## Pour aller plus loin

Configuration complète, proxy inverse (Caddy, nginx), connexion Google, usage mobile, performances, licences des modèles, développement : voir le [README en anglais](README.md) et le dossier [docs/](docs/).

## Licence

[Apache 2.0](LICENSE).
