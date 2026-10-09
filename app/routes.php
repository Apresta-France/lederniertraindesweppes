<?php

declare(strict_types=1);

$go = static function (string $target): callable {
    return static function (array $params) use ($target): void {
        redirect_preserve($target);
    };
};

$router->get('/', [SitePages::class, 'home']);
$router->get('/le-jeu', [SitePages::class, 'jeu']);
$router->get('/avancement', [SitePages::class, 'avancement']);
$router->get('/actualites', [SitePages::class, 'actualites']);
$router->get('/actualites/{slug}', [SitePages::class, 'article']);
$router->get('/partenaires', [SitePages::class, 'partenaires']);
$router->get('/contact', [SitePages::class, 'contact']);
$router->post('/contact', [Forms::class, 'contact']);
$router->get('/mentions-legales', [SitePages::class, 'mentions']);
$router->get('/confidentialite', [SitePages::class, 'confidentialite']);

$router->post('/liste-attente', [Forms::class, 'waitlist']);
$router->get('/liste-attente', $go('/#waitlist'));
$router->get('/liste-attente/confirmer', [Forms::class, 'confirmForm']);
$router->post('/liste-attente/confirmer', [Forms::class, 'confirm']);
$router->get('/liste-attente/desinscription', [Forms::class, 'unsubscribeForm']);
$router->post('/liste-attente/desinscription', [Forms::class, 'unsubscribe']);

$router->get('/index.html', $go('/'));
$router->get('/le-jeu.html', $go('/le-jeu'));
$router->get('/avancement.html', $go('/avancement'));
$router->get('/actualites.html', $go('/actualites'));
$router->get('/partenaires.html', $go('/partenaires'));
$router->get('/contact.html', $go('/contact'));
$router->get('/article-chambre-de-gisele.html', $go('/actualites/chambre-de-gisele'));
$router->get('/article-horloge.html', $go('/actualites/horloge'));
$router->get('/article-premier-prototype.html', $go('/actualites/premier-prototype'));

$router->get('/admin/connexion', [Admin::class, 'loginForm']);
$router->post('/admin/connexion', [Admin::class, 'login']);
$router->post('/admin/deconnexion', [Admin::class, 'logout']);
$router->get('/admin', [Admin::class, 'dashboard']);
$router->get('/admin/inscrits', [Admin::class, 'subscribers']);
$router->post('/admin/inscrits/renvoyer', [Admin::class, 'resend']);
$router->post('/admin/inscrits/supprimer', [Admin::class, 'deleteSubscriber']);
$router->get('/admin/inscrits/export', [Admin::class, 'export']);
$router->get('/admin/messages', [Admin::class, 'messages']);
$router->post('/admin/messages/supprimer', [Admin::class, 'deleteMessage']);
$router->get('/admin/acces', [Admin::class, 'accessKeys']);
$router->post('/admin/acces/creer', [Admin::class, 'createAccessKey']);
$router->post('/admin/acces/basculer', [Admin::class, 'toggleAccessKey']);
$router->post('/admin/acces/envoyer', [Admin::class, 'sendAccessKey']);
$router->post('/admin/acces/supprimer', [Admin::class, 'deleteAccessKey']);
$router->get('/admin/statistiques', [Admin::class, 'stats']);
$router->get('/admin/environnement', [Admin::class, 'environment']);
$router->post('/admin/environnement', [Admin::class, 'saveEnvironment']);
$router->post('/admin/environnement/essai', [Admin::class, 'testMail']);
$router->post('/admin/compte', [Admin::class, 'saveAccount']);
