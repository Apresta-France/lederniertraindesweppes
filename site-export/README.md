# Site — Le Dernier Train des Weppes

Site statique (HTML / CSS / JS), sans dépendance ni étape de build.

## Mise en ligne
Déposez le contenu du dossier sur n'importe quel hébergement statique (OVH, Netlify, GitHub Pages…). La page d'accueil est `index.html`.

Test en local : `npx serve` dans le dossier.

## Structure
- `index.html`, `le-jeu.html`, `avancement.html`, `actualites.html`, `partenaires.html`, `contact.html`
- `article-*.html` : une page par actualité
- `css/site.css` : tous les styles (couleurs en variables en haut du fichier)
- `js/site.js` : menu mobile, galerie, filtres, formulaires
- `assets/img/` : images

## À brancher avant la mise en ligne
- **Liste d'attente** et **formulaire de contact** : simulés dans `js/site.js` (rien n'est envoyé). À relier à votre service (Brevo, Mailchimp, Formspree…).
- **Logos partenaires** : remplacer les blocs « Logo partenaire » (commentaires dans `index.html` et `partenaires.html`) par vos images dans `assets/partenaires/`.
- **Mentions légales / confidentialité** : à ajouter (le site collecte des adresses e-mail).
