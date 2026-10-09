<?php

declare(strict_types=1);

final class Admin
{
    public static function loginForm(array $params = []): void
    {
        if (Auth::check()) {
            redirect('/admin');
        }
        render('admin/login', [
            'error' => flash('err'),
            'email' => '',
        ], null);
    }

    public static function login(array $params = []): void
    {
        Csrf::check();
        $email = strtolower(trim((string) ($_POST['email'] ?? '')));
        $password = (string) ($_POST['password'] ?? '');
        if (rate_limited('login', 8, 900)) {
            render('admin/login', [
                'error' => 'Trop de tentatives. Réessayez dans quelques minutes.',
                'email' => $email,
            ], null);
            return;
        }
        $admin = Database::one('SELECT * FROM admins WHERE email = ?', [$email]);
        $hash = $admin['password_hash'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';
        $valid = password_verify($password, $hash) && $admin !== null;
        if (!$valid) {
            rate_limit_hit('login');
            render('admin/login', [
                'error' => 'Identifiants incorrects.',
                'email' => $email,
            ], null);
            return;
        }
        clear_rate_limit('login');
        Auth::login((int) $admin['id']);
        redirect(Auth::intended());
    }

    public static function logout(array $params = []): void
    {
        Csrf::check();
        Auth::logout();
        redirect('/admin/connexion');
    }

    public static function dashboard(array $params = []): void
    {
        Auth::require();
        $count = static function (string $sql, array $args = []): int {
            return (int) (Database::one($sql, $args)['n'] ?? 0);
        };
        $from = (new DateTimeImmutable('-29 days'))->format('Y-m-d');
        self::view('admin/dashboard', 'Tableau de bord', 'dashboard', [
            'confirmed' => $count("SELECT COUNT(*) AS n FROM subscribers WHERE status = 'confirmed'"),
            'pending' => $count("SELECT COUNT(*) AS n FROM subscribers WHERE status = 'pending'"),
            'messages' => $count('SELECT COUNT(*) AS n FROM messages'),
            'visits' => $count('SELECT COUNT(*) AS n FROM visits WHERE day >= ?', [$from]),
            'subscribers' => Database::all('SELECT * FROM subscribers ORDER BY id DESC LIMIT 6'),
            'latestMessages' => Database::all('SELECT * FROM messages ORDER BY id DESC LIMIT 6'),
        ]);
    }

    public static function subscribers(array $params = []): void
    {
        Auth::require();
        $q = single_line((string) ($_GET['q'] ?? ''), 180);
        $status = (string) ($_GET['statut'] ?? '');
        if (!in_array($status, ['', 'pending', 'confirmed', 'unsubscribed'], true)) {
            $status = '';
        }
        $where = [];
        $args = [];
        if ($q !== '') {
            $where[] = "email LIKE ? ESCAPE '\\'";
            $args[] = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
        }
        if ($status !== '') {
            $where[] = 'status = ?';
            $args[] = $status;
        }
        $sqlWhere = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        $total = (int) (Database::one("SELECT COUNT(*) AS n FROM subscribers $sqlWhere", $args)['n'] ?? 0);
        [$page, $pages, $offset] = self::pageWindow($total, 30);
        $rows = Database::all(
            "SELECT * FROM subscribers $sqlWhere ORDER BY id DESC LIMIT 30 OFFSET " . $offset,
            $args
        );
        self::view('admin/subscribers', 'Inscrits', 'inscrits', [
            'rows' => $rows,
            'q' => $q,
            'status' => $status,
            'total' => $total,
            'page' => $page,
            'pages' => $pages,
        ]);
    }

    public static function resend(array $params = []): void
    {
        Auth::require();
        Csrf::check();
        $row = Database::one('SELECT * FROM subscribers WHERE id = ?', [(int) ($_POST['id'] ?? 0)]);
        if (!$row || $row['status'] !== 'pending') {
            flash('err', 'Aucun message à renvoyer pour cette adresse.');
            redirect('/admin/inscrits');
        }
        try {
            Notices::waitlistConfirm($row);
            Database::exec('UPDATE subscribers SET mail_error = NULL WHERE id = ?', [$row['id']]);
            flash('ok', 'Message de confirmation renvoyé à ' . $row['email'] . '.');
        } catch (Throwable $e) {
            Database::exec('UPDATE subscribers SET mail_error = ? WHERE id = ?', [single_line($e->getMessage(), 240), $row['id']]);
            flash('err', 'L\'envoi a échoué : ' . single_line($e->getMessage(), 180));
        }
        redirect('/admin/inscrits');
    }

    public static function deleteSubscriber(array $params = []): void
    {
        Auth::require();
        Csrf::check();
        Database::exec('DELETE FROM subscribers WHERE id = ?', [(int) ($_POST['id'] ?? 0)]);
        flash('ok', 'Adresse supprimée.');
        redirect('/admin/inscrits');
    }

    public static function export(array $params = []): void
    {
        Auth::require();
        $rows = Database::all('SELECT email, status, source, created_at, confirmed_at, unsubscribed_at FROM subscribers ORDER BY id DESC');
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="inscrits-' . date('Y-m-d') . '.csv"');
        header('Cache-Control: no-store');
        echo "\xEF\xBB\xBF";
        $out = fopen('php://output', 'wb');
        if ($out === false) {
            exit;
        }
        fputcsv($out, ['email', 'statut', 'source', 'inscrit_le', 'confirme_le', 'desinscrit_le'], ';');
        foreach ($rows as $row) {
            fputcsv($out, [
                csv_safe((string) $row['email']),
                csv_safe(subscriber_label((string) $row['status'])),
                csv_safe((string) ($row['source'] ?? '')),
                (string) $row['created_at'],
                (string) ($row['confirmed_at'] ?? ''),
                (string) ($row['unsubscribed_at'] ?? ''),
            ], ';');
        }
        fclose($out);
        exit;
    }

    public static function messages(array $params = []): void
    {
        Auth::require();
        $total = (int) (Database::one('SELECT COUNT(*) AS n FROM messages')['n'] ?? 0);
        [$page, $pages, $offset] = self::pageWindow($total, 20);
        $id = (int) ($_GET['id'] ?? 0);
        self::view('admin/messages', 'Messages', 'messages', [
            'rows' => Database::all('SELECT * FROM messages ORDER BY id DESC LIMIT 20 OFFSET ' . $offset),
            'opened' => $id > 0 ? Database::one('SELECT * FROM messages WHERE id = ?', [$id]) : null,
            'page' => $page,
            'pages' => $pages,
            'total' => $total,
        ]);
    }

    public static function deleteMessage(array $params = []): void
    {
        Auth::require();
        Csrf::check();
        Database::exec('DELETE FROM messages WHERE id = ?', [(int) ($_POST['id'] ?? 0)]);
        flash('ok', 'Message supprimé.');
        redirect('/admin/messages');
    }

    public static function stats(array $params = []): void
    {
        Auth::require();
        $days = (int) ($_GET['periode'] ?? 30);
        self::view('admin/stats', 'Statistiques', 'statistiques', [
            'report' => Stats::report($days),
        ]);
    }

    public static function environment(array $params = []): void
    {
        Auth::require();
        self::view('admin/environment', 'Environnement', 'environnement', [
            'config' => Env::all(),
            'admin' => Auth::user(),
            'errors' => [],
            'input' => null,
        ]);
    }

    public static function saveEnvironment(array $params = []): void
    {
        Auth::require();
        Csrf::check();
        $result = Installer::settings($_POST, Env::all());
        if ($result['errors']) {
            self::view('admin/environment', 'Environnement', 'environnement', [
                'config' => Env::all(),
                'admin' => Auth::user(),
                'errors' => $result['errors'],
                'input' => $_POST,
            ]);
            return;
        }
        Env::write($result['values']);
        flash('ok', 'Réglages enregistrés.');
        redirect('/admin/environnement');
    }

    public static function testMail(array $params = []): void
    {
        Auth::require();
        Csrf::check();
        $admin = Auth::user();
        try {
            Notices::test((string) $admin['email']);
            $host = strtolower((string) Env::get('SMTP_HOST', ''));
            flash('ok', $host === 'log' || $host === ''
                ? 'Message d\'essai écrit dans storage/logs.'
                : 'Message d\'essai envoyé à ' . $admin['email'] . '.');
        } catch (Throwable $e) {
            flash('err', 'L\'essai a échoué : ' . single_line($e->getMessage(), 200));
        }
        redirect('/admin/environnement');
    }

    public static function saveAccount(array $params = []): void
    {
        Auth::require();
        Csrf::check();
        $admin = Database::one('SELECT * FROM admins WHERE id = ?', [Auth::id()]);
        $email = strtolower(trim((string) ($_POST['admin_email'] ?? '')));
        $current = (string) ($_POST['current_password'] ?? '');
        $next = (string) ($_POST['new_password'] ?? '');
        $confirm = (string) ($_POST['new_password_confirm'] ?? '');
        $errors = [];
        if (!$admin || !password_verify($current, (string) $admin['password_hash'])) {
            $errors[] = 'Le mot de passe actuel est incorrect.';
        }
        if (!valid_email($email)) {
            $errors[] = 'La nouvelle adresse est invalide.';
        }
        if ($next !== '') {
            if (strlen($next) < 10) {
                $errors[] = 'Le nouveau mot de passe doit contenir au moins 10 caractères.';
            }
            if ($next !== $confirm) {
                $errors[] = 'La confirmation du nouveau mot de passe ne correspond pas.';
            }
        }
        if ($errors) {
            flash('err', implode(' ', $errors));
            redirect('/admin/environnement');
        }
        $hash = $next !== '' ? password_hash($next, PASSWORD_DEFAULT) : $admin['password_hash'];
        Database::exec(
            'UPDATE admins SET email = ?, password_hash = ?, updated_at = ? WHERE id = ?',
            [$email, $hash, date('Y-m-d H:i:s'), $admin['id']]
        );
        flash('ok', 'Compte administrateur mis à jour.');
        redirect('/admin/environnement');
    }

    private static function view(string $view, string $title, string $section, array $data): void
    {
        $data['title'] = $title;
        $data['section'] = $section;
        render($view, $data, 'admin/layout');
    }

    private static function pageWindow(int $total, int $per): array
    {
        $pages = max(1, (int) ceil($total / $per));
        $page = (int) ($_GET['page'] ?? 1);
        if ($page < 1) {
            $page = 1;
        }
        if ($page > $pages) {
            $page = $pages;
        }
        return [$page, $pages, ($page - 1) * $per];
    }
}
