Je vais corriger exactement ces deux points :

1. Micro dans l’APK
- Revenir à une écoute Android qui renvoie du texte pendant que vous parlez.
- Garder le bouton vert quand il n’écoute pas, rouge uniquement pendant l’écoute, puis retour automatique en vert.
- Remplir le champ avec le nom ou le numéro prononcé dès qu’un résultat vocal arrive.
- Renforcer le bip pour qu’il soit plus audible, sans phrase vocale avant l’écoute.

2. Tableau “Magasins en double”
- Le tableau ne devra afficher que les positions réellement présentes dans le plan actif.
- Corriger la lecture des zones pour que les exemples soient gérés comme demandé :
  - 8214 : PLACE 1 = 306 Zone 1, PLACE 2 = 88 Craft.
  - 9083 : PLACE 1 = 86 Débord, PLACE 2 = 92 Craft.
- Éviter que le parser mélange Débord, Craft et Zone 1 quand les mêmes numéros de travée existent dans plusieurs zones.
- Conserver l’affichage malvoyant : contour jaune, intérieur noir, numéro en blanc très grand.

Technique :
- Modifier `src/lib/voiceInput.ts` pour l’écoute native Android Capacitor.
- Modifier `src/pages/SearchPage.tsx` pour mieux gérer l’état du micro et le bip.
- Modifier `src/lib/ocr.ts` et la fonction backend `analyze-plan` pour mieux extraire Craft/Débord/Zone 1 et supprimer les faux doublons.
- Ajouter/adapter des tests sur les cas 8214 et 9083 pour éviter que le problème revienne.