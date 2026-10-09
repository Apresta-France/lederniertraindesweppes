<?php

declare(strict_types=1);

final class SitePages
{
    public static function home(array $params = []): void
    {
        self::page('pages/home', 'home', 'Le Dernier Train des Weppes — Un jeu Groupe Tercium', 'Un jeu d\'aventure point & click narratif à Fournes-en-Weppes, jouable dans le navigateur. Inscrivez-vous à la liste d\'attente.', 'assets/img/gare.png');
    }

    public static function jeu(array $params = []): void
    {
        self::page('pages/jeu', 'le-jeu', 'Le jeu — Le Dernier Train des Weppes', 'L\'histoire, les lieux et les personnages du Dernier Train des Weppes.', 'assets/img/gare.png');
    }

    public static function avancement(array $params = []): void
    {
        self::page('pages/avancement', 'avancement', 'Avancement — Le Dernier Train des Weppes', 'La feuille de route du développement du Dernier Train des Weppes.', 'assets/img/gare.png');
    }

    public static function actualites(array $params = []): void
    {
        self::page('pages/actualites', 'actualites', 'Actualités — Le Dernier Train des Weppes', 'Le carnet de développement du Dernier Train des Weppes.', 'assets/img/gare.png');
    }

    public static function article(array $params = []): void
    {
        $article = find_article($params['slug'] ?? '');
        if ($article === null) {
            http_response_code(404);
            self::notFound();
            return;
        }
        Stats::track('/actualites/' . $article['slug']);
        render('pages/article', [
            'title' => $article['title'] . ' — Le Dernier Train des Weppes',
            'description' => $article['description'],
            'current' => 'actualites',
            'image' => $article['image'],
            'article' => $article,
        ]);
    }

    public static function partenaires(array $params = []): void
    {
        self::page('pages/partenaires', 'partenaires', 'Partenaires — Le Dernier Train des Weppes', 'Devenez partenaire du Dernier Train des Weppes et faites découvrir le territoire des Weppes autrement.', 'assets/img/gare.png');
    }

    public static function contact(array $params = []): void
    {
        $subjects = ['Question', 'Presse', 'Partenariat', 'Autre'];
        $asked = strtolower((string) ($_GET['sujet'] ?? ''));
        $sujet = 'Question';
        foreach ($subjects as $subject) {
            if (strtolower($subject) === $asked) {
                $sujet = $subject;
            }
        }
        Stats::track('/contact');
        render('pages/contact', [
            'title' => 'Contact — Le Dernier Train des Weppes',
            'description' => 'Contactez l\'équipe du Dernier Train des Weppes : presse, partenariat, questions.',
            'current' => 'contact',
            'image' => 'assets/img/gare.png',
            'sujet' => $sujet,
            'subjects' => $subjects,
            'okNom' => flash('contact_nom'),
            'okEmail' => flash('contact_email'),
            'error' => flash('contact_err') ?? flash('err'),
            'oldNom' => flash('contact_old_nom') ?? '',
            'oldEmail' => flash('contact_old_email') ?? '',
            'oldMessage' => flash('contact_old_message') ?? '',
        ]);
    }

    public static function mentions(array $params = []): void
    {
        self::page('pages/mentions', '', 'Mentions légales — Le Dernier Train des Weppes', 'Éditeur, hébergement et propriété intellectuelle du site Le Dernier Train des Weppes.', 'assets/img/gare.png');
    }

    public static function confidentialite(array $params = []): void
    {
        self::page('pages/confidentialite', '', 'Confidentialité — Le Dernier Train des Weppes', 'Données collectées, durées de conservation et droits des personnes.', 'assets/img/gare.png');
    }

    public static function notFound(): void
    {
        render('pages/simple', [
            'title' => 'Page introuvable — Le Dernier Train des Weppes',
            'description' => 'Cette page n\'existe pas.',
            'current' => '',
            'image' => 'assets/img/gare.png',
            'eyebrow' => '404',
            'heading' => 'Ce quai n\'existe pas',
            'text' => 'La page demandée est introuvable. Le site, lui, est toujours à l\'accueil.',
            'actionHref' => '/',
            'actionLabel' => 'Retour à l\'accueil',
        ]);
    }

    private static function page(string $view, string $current, string $title, string $description, string $image): void
    {
        Stats::track(request_path());
        render($view, [
            'title' => $title,
            'description' => $description,
            'current' => $current,
            'image' => $image,
        ]);
    }
}
