

# Plan : Préparer l'application pour installation sur Android (APK)

## Objectif
Configurer Capacitor pour que vous puissiez compiler l'app en fichier APK et l'installer directement sur votre téléphone Android.

## Ce que je vais faire dans le code

1. **Installer Capacitor** : Ajouter les dépendances `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`
2. **Initialiser Capacitor** : Créer le fichier de configuration `capacitor.config.ts` avec les bons paramètres
3. **Configurer le hot-reload** : Pointer vers le serveur de prévisualisation pour tester en direct

## Ce que VOUS devrez faire sur votre ordinateur

Une fois que j'ai terminé la configuration, vous devrez suivre ces étapes :

1. **Exporter le projet** : Cliquez sur le bouton "Export to Github" dans Lovable, puis clonez le repo sur votre PC
2. **Installer les outils** :
   - Installer [Node.js](https://nodejs.org)
   - Installer [Android Studio](https://developer.android.com/studio)
3. **Lancer ces commandes** dans le dossier du projet :
   ```text
   npm install
   npx cap add android
   npx cap update android
   npm run build
   npx cap sync
   npx cap run android
   ```
4. **Générer l'APK** : Dans Android Studio, ouvrir le dossier `android/`, puis Build > Build APK
5. **Installer l'APK** : Transférer le fichier APK sur votre téléphone et l'installer

Guide complet : [blog Lovable sur Capacitor](https://lovable.dev/blog/mobile-app-with-lovable-and-capacitor)

## Fichiers modifiés
- `package.json` : ajout des dépendances Capacitor
- `capacitor.config.ts` : nouveau fichier de configuration

