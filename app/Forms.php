<?php

declare(strict_types=1);

final class Forms
{
    private const SUBJECTS = ['Question', 'Presse', 'Partenariat', 'Autre'];

    public static function waitlist(array $params = []): void
    {
        if (honeypot_tripped()) {
            self::waitlistDone(true, 'Merci. Ouvrez le message que nous venons d\'envoyer pour confirmer votre place.');
        }
        Csrf::check();
        $email = strtolower(trim((string) ($_POST['email'] ?? '')));
        if (!valid_email($email)) {
            self::waitlistDone(false, 'Adresse e-mail invalide.');
        }
        if (rate_limited('waitlist', 6, 3600)) {
            self::waitlistDone(false, 'Trop d\'inscriptions depuis cette connexion. Réessayez dans un moment.', 429);
        }
        rate_limit_hit('waitlist');

        $now = date('Y-m-d H:i:s');
        $source = self::sourcePath();
        $existing = Database::one('SELECT * FROM subscribers WHERE email = ?', [$email]);

        if ($existing && $existing['status'] === 'confirmed') {
            self::waitlistDone(true, 'Vous êtes déjà sur la liste. Nous vous écrirons à l\'ouverture du quai.');
        }

        if ($existing && $existing['status'] === 'unsubscribed') {
            $token = bin2hex(random_bytes(32));
            Database::exec(
                'UPDATE subscribers SET status = ?, token = ?, source = ?, mail_error = NULL, unsubscribed_at = NULL, confirmed_at = NULL, created_at = ? WHERE id = ?',
                ['pending', $token, $source, $now, $existing['id']]
            );
            $existing = Database::one('SELECT * FROM subscribers WHERE id = ?', [$existing['id']]);
        } elseif (!$existing) {
            $token = bin2hex(random_bytes(32));
            try {
                $id = Database::insert(
                    'INSERT INTO subscribers (email, status, token, source, created_at) VALUES (?, ?, ?, ?, ?)',
                    [$email, 'pending', $token, $source, $now]
                );
            } catch (PDOException) {
                $existing = Database::one('SELECT * FROM subscribers WHERE email = ?', [$email]);
                if ($existing && $existing['status'] === 'confirmed') {
                    self::waitlistDone(true, 'Vous êtes déjà sur la liste. Nous vous écrirons à l\'ouverture du quai.');
                }
                $id = (int) ($existing['id'] ?? 0);
            }
            $existing = Database::one('SELECT * FROM subscribers WHERE id = ?', [$id]);
        }

        if (!$existing) {
            self::waitlistDone(false, 'L\'inscription n\'a pas pu être enregistrée.', 500);
        }

        try {
            Notices::waitlistConfirm($existing);
            Database::exec('UPDATE subscribers SET mail_error = NULL WHERE id = ?', [$existing['id']]);
            $message = $existing['status'] === 'pending' && !empty($existing['created_at']) && $existing['created_at'] !== $now
                ? 'Vous êtes déjà inscrit. Un nouveau message de confirmation vient d\'être envoyé.'
                : 'Merci. Ouvrez le message que nous venons d\'envoyer pour confirmer votre place.';
            if (($existing['created_at'] ?? '') === $now) {
                $message = 'Merci. Ouvrez le message que nous venons d\'envoyer pour confirmer votre place.';
            }
            self::waitlistDone(true, $message);
        } catch (Throwable $e) {
            Database::exec('UPDATE subscribers SET mail_error = ? WHERE id = ?', [single_line($e->getMessage(), 240), $existing['id']]);
            self::waitlistDone(false, 'Votre inscription est enregistrée, mais le message de confirmation n\'a pas pu partir. Réessayez dans un moment.', 502);
        }
    }

    public static function contact(array $params = []): void
    {
        if (honeypot_tripped()) {
            self::contactDone(true, single_line((string) ($_POST['nom'] ?? 'vous'), 120), strtolower(trim((string) ($_POST['email'] ?? ''))));
        }
        Csrf::check();
        $name = single_line((string) ($_POST['nom'] ?? ''), 120);
        $email = strtolower(trim((string) ($_POST['email'] ?? '')));
        $subject = (string) ($_POST['sujet'] ?? '');
        $body = trim((string) ($_POST['message'] ?? ''));
        $body = str_replace("\0", '', $body);
        if (strlen($body) > 5000) {
            $body = substr($body, 0, 5000);
        }

        $error = $name === '' ? 'Indiquez votre nom.'
            : (!valid_email($email) ? 'Adresse e-mail invalide.'
            : (!in_array($subject, self::SUBJECTS, true) ? 'Choisissez un sujet.'
            : (mb_strlen($body) < 10 ? 'Votre message est un peu court.' : '')));
        if ($error !== '') {
            self::contactDone(false, $name, $email, $error, $subject, $body);
        }
        if (rate_limited('contact', 6, 3600)) {
            self::contactDone(false, $name, $email, 'Trop de messages depuis cette connexion. Réessayez dans un moment.', $subject, $body, 429);
        }
        rate_limit_hit('contact');

        $now = date('Y-m-d H:i:s');
        $id = Database::insert(
            'INSERT INTO messages (name, email, subject, body, created_at) VALUES (?, ?, ?, ?, ?)',
            [$name, $email, $subject, $body, $now]
        );
        $message = Database::one('SELECT * FROM messages WHERE id = ?', [$id]);
        $mailError = '';
        try {
            Notices::contactToStudio($message);
        } catch (Throwable $e) {
            $mailError = single_line($e->getMessage(), 240);
        }
        if ($mailError === '') {
            try {
                Notices::contactAck($message);
            } catch (Throwable $e) {
                $mailError = 'Accusé non envoyé : ' . single_line($e->getMessage(), 180);
            }
        }
        if ($mailError !== '') {
            Database::exec('UPDATE messages SET mail_error = ? WHERE id = ?', [$mailError, $id]);
        }
        if (str_starts_with($mailError, 'Accusé') || $mailError === '') {
            self::contactDone(true, $name, $email);
        }
        self::contactDone(false, $name, $email, 'Votre message est enregistré, mais l\'envoi a échoué. Réessayez dans un moment.', $subject, $body, 502);
    }

    public static function confirmForm(array $params = []): void
    {
        if (($_GET['fait'] ?? '') === '1' && !empty($_SESSION['confirm_done'])) {
            self::tokenPage('Liste d\'attente', 'Votre place est confirmée', 'Merci. Nous vous écrirons à l\'ouverture du quai. Chaque message suivant contiendra un lien pour quitter la liste.', false);
            return;
        }
        $subscriber = self::byToken((string) ($_GET['token'] ?? ''));
        if (!$subscriber) {
            http_response_code(404);
            self::tokenPage('Liste d\'attente', 'Lien inutilisable', 'Ce lien de confirmation n\'est plus valable. Vous pouvez vous inscrire à nouveau depuis le site.', false);
            return;
        }
        if ($subscriber['status'] === 'confirmed') {
            self::tokenPage('Liste d\'attente', 'Votre place est confirmée', 'Cette adresse est déjà sur la liste. Nous vous écrirons à l\'ouverture du quai.', false);
            return;
        }
        if ($subscriber['status'] === 'unsubscribed') {
            self::tokenPage('Liste d\'attente', 'Inscription retirée', 'Cette adresse a été retirée de la liste. Vous pouvez vous inscrire à nouveau depuis le site.', false);
            return;
        }
        $err = flash('err');
        self::tokenPage(
            'Liste d\'attente',
            'Confirmer votre place',
            'Confirmez l\'inscription de <strong>' . e($subscriber['email']) . '</strong> pour recevoir l\'ouverture du prototype.',
            true,
            '/liste-attente/confirmer',
            (string) $subscriber['token'],
            'Confirmer mon inscription',
            $err
        );
    }

    public static function confirm(array $params = []): void
    {
        Csrf::check();
        $subscriber = self::byToken((string) ($_POST['token'] ?? ''));
        if (!$subscriber || $subscriber['status'] === 'unsubscribed') {
            flash('err', 'Ce lien n\'est plus valable.');
            redirect('/liste-attente/confirmer');
        }
        if ($subscriber['status'] !== 'confirmed') {
            Database::exec(
                'UPDATE subscribers SET status = ?, confirmed_at = ?, mail_error = NULL WHERE id = ?',
                ['confirmed', date('Y-m-d H:i:s'), $subscriber['id']]
            );
        }
        $_SESSION['confirm_done'] = 1;
        redirect('/liste-attente/confirmer?fait=1');
    }

    public static function unsubscribeForm(array $params = []): void
    {
        if (($_GET['fait'] ?? '') === '1' && !empty($_SESSION['unsub_done'])) {
            self::tokenPage('Liste d\'attente', 'Vous êtes désinscrit', 'Cette adresse ne recevra plus les messages de la liste d\'attente.', false);
            return;
        }
        $subscriber = self::byToken((string) ($_GET['token'] ?? ''));
        if (!$subscriber) {
            http_response_code(404);
            self::tokenPage('Liste d\'attente', 'Lien inutilisable', 'Ce lien de désinscription n\'est plus valable.', false);
            return;
        }
        if ($subscriber['status'] === 'unsubscribed') {
            self::tokenPage('Liste d\'attente', 'Vous êtes désinscrit', 'Cette adresse ne figure plus sur la liste.', false);
            return;
        }
        self::tokenPage(
            'Liste d\'attente',
            'Quitter la liste',
            'Retirer <strong>' . e($subscriber['email']) . '</strong> de la liste d\'attente.',
            true,
            '/liste-attente/desinscription',
            (string) $subscriber['token'],
            'Me désinscrire',
            flash('err')
        );
    }

    public static function unsubscribe(array $params = []): void
    {
        $oneClick = (($_POST['List-Unsubscribe'] ?? '') === 'One-Click');
        if (!$oneClick) {
            Csrf::check();
        }
        $token = (string) ($_POST['token'] ?? $_GET['token'] ?? '');
        $subscriber = self::byToken($token);
        if (!$subscriber) {
            if ($oneClick) {
                http_response_code(404);
                echo 'Lien inutilisable';
                exit;
            }
            flash('err', 'Ce lien n\'est plus valable.');
            redirect('/liste-attente/desinscription');
        }
        if ($subscriber['status'] !== 'unsubscribed') {
            Database::exec(
                'UPDATE subscribers SET status = ?, unsubscribed_at = ? WHERE id = ?',
                ['unsubscribed', date('Y-m-d H:i:s'), $subscriber['id']]
            );
        }
        if ($oneClick) {
            http_response_code(200);
            header('Content-Type: text/plain; charset=utf-8');
            echo 'Désinscription enregistrée';
            exit;
        }
        $_SESSION['unsub_done'] = 1;
        redirect('/liste-attente/desinscription?fait=1');
    }

    private static function byToken(string $token): ?array
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            return null;
        }
        return Database::one('SELECT * FROM subscribers WHERE token = ?', [$token]);
    }

    private static function sourcePath(): string
    {
        $path = parse_url(self::backUrl(false), PHP_URL_PATH) ?: '/';
        return substr((string) $path, 0, 180);
    }

    private static function backUrl(bool $anchor = true): string
    {
        $raw = safe_local_path((string) ($_POST['redirect'] ?? '/'));
        $path = parse_url($raw, PHP_URL_PATH) ?: '/';
        $path = '/' . trim((string) $path, '/');
        if ($path !== '/' && $path !== '') {
            $path = rtrim($path, '/');
        }
        $known = [
            '/', '/le-jeu', '/avancement', '/actualites', '/partenaires', '/contact',
            '/mentions-legales', '/confidentialite',
        ];
        if (!in_array($path, $known, true) && !preg_match('#^/actualites/[a-z0-9\-]+$#', $path)) {
            $path = '/';
        }
        $query = parse_url($raw, PHP_URL_QUERY);
        if ($path === '/contact' && is_string($query) && preg_match('/^sujet=(question|presse|partenariat|autre)$/', $query)) {
            $path .= '?' . $query;
        }
        if ($anchor && !str_contains($path, '#')) {
            $path .= '#waitlist';
        }
        return $path;
    }

    private static function waitlistDone(bool $ok, string $message, int $status = 200): never
    {
        if (wants_json()) {
            json_out(['ok' => $ok, 'message' => $message], $ok ? 200 : $status);
        }
        flash($ok ? 'waitlist_ok' : 'waitlist_err', $message);
        redirect(self::backUrl());
    }

    private static function contactDone(bool $ok, string $name, string $email, string $message = '', string $subject = '', string $body = '', int $status = 200): never
    {
        if (wants_json()) {
            json_out([
                'ok' => $ok,
                'message' => $message,
                'nom' => $name,
                'email' => $email,
            ], $ok ? 200 : $status);
        }
        if ($ok) {
            flash('contact_nom', $name);
            flash('contact_email', $email);
            redirect('/contact');
        }
        flash('contact_err', $message);
        flash('contact_old_nom', $name);
        flash('contact_old_email', $email);
        flash('contact_old_message', $body);
        $query = in_array($subject, self::SUBJECTS, true) ? '?sujet=' . rawurlencode(strtolower($subject)) : '';
        redirect('/contact' . $query);
    }

    private static function tokenPage(
        string $eyebrow,
        string $heading,
        string $textHtml,
        bool $showForm,
        string $action = '',
        string $token = '',
        string $button = '',
        ?string $error = null
    ): void {
        Stats::track(request_path());
        render('pages/token', [
            'title' => $heading . ' — ' . app_name(),
            'description' => 'Liste d\'attente du Dernier Train des Weppes.',
            'current' => '',
            'image' => 'assets/img/plaine.png',
            'eyebrow' => $eyebrow,
            'heading' => $heading,
            'textHtml' => $textHtml,
            'showForm' => $showForm,
            'action' => $action,
            'token' => $token,
            'button' => $button,
            'error' => $error,
        ]);
    }
}
