<?php

declare(strict_types=1);

return [
    'version' => 'Build v0.1.0 · Prototype interne',
    'categories' => ['Acte 1', 'Cinématique', 'Prototype'],
    'gallery' => [
        ['src' => 'assets/img/orage.png', 'alt' => 'L\'orage sur Fournes-en-Weppes'],
        ['src' => 'assets/img/gare-nuit.png', 'alt' => 'La gare dans la nuit'],
        ['src' => 'assets/img/effondrement.png', 'alt' => 'L\'effondrement'],
        ['src' => 'assets/img/horloge.png', 'alt' => 'L\'horloge de la gare'],
        ['src' => 'assets/img/residence-portail.png', 'alt' => 'La résidence des Weppes'],
        ['src' => 'assets/img/aurelie.jpg', 'alt' => 'Aurélie', 'sheet' => true],
        ['src' => 'assets/img/sandrine.jpg', 'alt' => 'Sandrine', 'sheet' => true],
        ['src' => 'assets/img/eclusier.jpg', 'alt' => 'L\'éclusier, 1914', 'sheet' => true],
    ],
    'steps' => [
        [
            'status' => 'done',
            'title' => 'Prototype navigateur',
            'summary' => 'Écran d\'accueil, intro animée, menu, sauvegarde et comptes',
            'points' => [
                'Écran d\'accueil : son et cookie de sauvegarde',
                'Intros animées Groupe Tercium et logo du jeu',
                'Menu, options, chargement de partie',
                'Sauvegarde sur le navigateur ou par compte',
            ],
            'image' => 'assets/img/gare.png',
        ],
        [
            'status' => 'done',
            'title' => 'Cinématique d\'ouverture',
            'summary' => 'L\'orage, l\'effondrement de la gare, l\'horloge qui repart',
            'points' => [
                'L\'orage sur Fournes-en-Weppes',
                'L\'effondrement de la gare',
                'L\'horloge qui se remet en marche',
                'Musique, pluie, tonnerre et vent',
            ],
            'image' => 'assets/img/effondrement.png',
        ],
        [
            'status' => 'now',
            'title' => 'Acte 1 · Chapitre 1 « La panne »',
            'summary' => 'Arrivée à la résidence des Weppes, chambre de Gisèle jouable',
            'points' => [
                'Écran titre de l\'acte et arrivée à la résidence',
                'Chambre de Gisèle jouable, objets interactifs',
                'Énigmes et dialogues du chapitre',
            ],
            'image' => 'assets/img/chambre-gisele.png',
        ],
        [
            'status' => 'next',
            'title' => 'Suite de l\'Acte 1',
            'summary' => 'Énigmes, nouveaux lieux et personnages',
            'detail' => 'Nouveaux lieux, nouveaux personnages, nouvelles énigmes.',
        ],
        [
            'status' => 'next',
            'title' => 'Démo publique',
            'summary' => 'Un premier acte complet, ouvert à tous',
            'detail' => 'Un premier acte complet, ouvert d\'abord aux inscrits de la liste d\'attente.',
        ],
    ],
    'places' => [
        ['src' => 'assets/img/clos-du-moulin.png', 'title' => 'La gare de Fournes', 'text' => 'Désaffectée depuis longtemps, à deux pas du chantier du Clos du Moulin. L\'orage aura raison d\'elle.'],
        ['src' => 'assets/img/residence-facade.png', 'title' => 'La résidence des Weppes', 'text' => 'Un EHPAD calme, son jardin intérieur, son hall d\'accueil et ses longs couloirs.'],
        ['src' => 'assets/img/chambre-gisele.png', 'title' => 'La chambre de Gisèle', 'text' => 'Une pièce pleine de souvenirs. Chaque objet garde une trace de ce qui s\'est passé.'],
    ],
    'articles' => [
        [
            'slug' => 'chambre-de-gisele',
            'title' => 'La chambre de Gisèle prend vie',
            'description' => 'Premier décor jouable : la télévision, le bouton d\'appel, l\'horloge arrêtée et une boîte en fer qui garde son secret.',
            'date_label' => 'Octobre 2026',
            'category' => 'Acte 1',
            'image' => 'assets/img/chambre-gisele.png',
            'image_alt' => 'La chambre de Gisèle',
            'excerpt' => 'Premier décor jouable : la télévision, le bouton d\'appel, l\'horloge arrêtée et une boîte en fer qui garde son secret.',
            'body' => <<<'HTML'
<p class="intro">Après l'arrivée à la résidence des Weppes, le joueur entre enfin dans la chambre de Gisèle. C'est le premier décor où l'on peut vraiment jouer.</p>
<p>La pièce est composée objet par objet : le lit, le fauteuil, la commode, la télévision, le tableau des animations. Au survol, chacun s'éclaire et affiche son nom ; au clic, il livre une observation.</p>
<h2>Des objets qui changent</h2>
<p>La télévision passe du noir au journal régional, puis au reportage sur la gare effondrée. Le bouton d'appel s'allume en rouge. Et l'horloge, montée avec ses aiguilles séparées, reste figée sur l'heure exacte où tout s'est arrêté.</p>
<img src="/assets/img/boite.png" alt="La boîte en fer" style="width:min(100%,420px);align-self:center;display:block">
<p>Reste la boîte en fer peinte de fleurs, fermée par un petit cadenas. Elle aura son importance.</p>
HTML,
        ],
        [
            'slug' => 'horloge',
            'title' => 'L\'horloge s\'est remise en marche',
            'description' => 'La cinématique d\'ouverture est terminée : l\'orage, l\'effondrement de la gare et une horloge qui repart d\'elle-même.',
            'date_label' => 'Octobre 2026',
            'category' => 'Cinématique',
            'image' => 'assets/img/horloge.png',
            'image_alt' => 'L\'horloge',
            'excerpt' => 'La cinématique d\'ouverture est terminée : l\'orage, l\'effondrement de la gare et une horloge qui repart d\'elle-même.',
            'body' => <<<'HTML'
<p class="intro">La cinématique d'ouverture est terminée. Une minute de nuit, d'orage et de silence avant que le jeu ne commence.</p>
<p>Tout commence par un écran noir et une date : Fournes-en-Weppes, nuit du 1<sup>er</sup> au 2 novembre 2026. Puis les éclairs, la pluie, la gare sous l'orage, la plaque FOURNES qu'on ne distingue qu'à la lueur de la foudre.</p>
<img class="wide" src="/assets/img/effondrement.png" alt="L'effondrement de la gare" style="border:0">
<h2>Puis le noir, et un tic-tac</h2>
<p>La gare s'effondre. Dans le silence qui suit, une vieille horloge grince, s'emballe, ralentit, et s'arrête d'un coup sec. Les aiguilles avancent image par image, au rythme des tics.</p>
HTML,
        ],
        [
            'slug' => 'premier-prototype',
            'title' => 'Premier prototype jouable',
            'description' => 'Le jeu s\'ouvre dans le navigateur : écran d\'accueil, menu animé, musique et sauvegarde de partie.',
            'date_label' => 'Septembre 2026',
            'category' => 'Prototype',
            'image' => 'assets/img/gare.png',
            'image_alt' => 'Le menu du jeu',
            'excerpt' => 'Le jeu s\'ouvre dans le navigateur : écran d\'accueil, menu animé, musique et sauvegarde de partie.',
            'body' => <<<'HTML'
<p class="intro">Le Dernier Train des Weppes tourne désormais dans un simple navigateur, sans rien installer.</p>
<p>Ce premier prototype pose les fondations : un écran d'accueil pour régler le son et la sauvegarde, les intros animées de Groupe Tercium et du logo du jeu, puis le menu, sur fond de gare dans la brume.</p>
<h2>Votre partie, où vous voulez</h2>
<p>On peut jouer sans compte, avec une sauvegarde sur le navigateur. Ou créer un compte en moins d'une minute pour reprendre sa partie sur n'importe quel appareil.</p>
HTML,
        ],
    ],
];
