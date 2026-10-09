<?php

declare(strict_types=1);

final class Installer
{
    public static function form(?array $input = null, array $errors = []): void
    {
        $current = Env::exists() ? Env::all() : [];
        if ($input === null) {
            $input = self::defaults();
            foreach (self::envToInput($current) as $key => $value) {
                if ($value !== '') {
                    $input[$key] = $value;
                }
            }
        } elseif (request_method() === 'POST') {
            $input['send_test'] = isset($input['send_test']) && $input['send_test'] !== '0' ? '1' : '0';
        }
        $existing = null;
        if (self::storageWritable() && is_file(Database::path())) {
            try {
                Database::migrate();
                $existing = Database::one('SELECT email FROM admins ORDER BY id LIMIT 1');
                if ($existing && ($input['admin_email'] ?? '') === '') {
                    $input['admin_email'] = $existing['email'];
                }
            } catch (Throwable $e) {
                $errors[] = 'La base de données ne peut pas être ouverte.';
            }
        }
        render('install', [
            'input' => $input,
            'errors' => $errors,
            'existingEmail' => $existing['email'] ?? null,
            'storageOk' => self::storageWritable(),
        ], null);
    }

    public static function submit(): void
    {
        if (!self::storageWritable()) {
            self::form($_POST, ['Le dossier storage n\'est pas accessible en écriture.']);
            return;
        }
        Database::migrate();
        if (rate_limited('install', 8, 3600)) {
            self::form($_POST, ['Trop de tentatives. Réessayez dans une heure.']);
            return;
        }
        rate_limit_hit('install');

        $current = Env::exists() ? Env::all() : [];
        $result = self::settings($_POST, $current);
        $errors = $result['errors'];
        $existing = Database::one('SELECT * FROM admins ORDER BY id LIMIT 1');

        $email = strtolower(trim((string) ($_POST['admin_email'] ?? '')));
        $password = (string) ($_POST['admin_password'] ?? '');
        $confirm = (string) ($_POST['admin_password_confirm'] ?? '');
        if (!valid_email($email)) {
            $errors[] = 'L\'adresse du compte administrateur est invalide.';
        }
        if ($existing) {
            if (!password_verify($password, (string) $existing['password_hash'])) {
                $errors[] = 'Le mot de passe administrateur ne correspond pas au compte déjà créé.';
            }
        } else {
            if ($password === '') {
                $errors[] = 'Indiquez un mot de passe administrateur.';
            }
            if ($password !== $confirm) {
                $errors[] = 'La confirmation du mot de passe ne correspond pas.';
            }
        }
        if ($errors) {
            $input = self::inputFromPost($_POST);
            $input['admin_email'] = $email;
            self::form($input, $errors);
            return;
        }

        if (($result['values']['MAIL_TO'] ?? '') === '') {
            $result['values']['MAIL_TO'] = $email;
        }
        Env::write($result['values']);
        Database::migrate();
        $now = date('Y-m-d H:i:s');
        if ($existing) {
            Database::exec('UPDATE admins SET email = ?, updated_at = ? WHERE id = ?', [$email, $now, $existing['id']]);
            $adminId = (int) $existing['id'];
        } else {
            $adminId = Database::insert(
                'INSERT INTO admins (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)',
                [$email, password_hash($password, PASSWORD_DEFAULT), $now, $now]
            );
        }

        $warning = '';
        if (isset($_POST['send_test'])) {
            try {
                Notices::test($email);
            } catch (Throwable $e) {
                $warning = 'La configuration est enregistrée, mais l\'e-mail d\'essai n\'est pas parti : ' . single_line($e->getMessage(), 180);
            }
        }
        Auth::login($adminId);
        flash('ok', 'Installation terminée. Le site est en ligne.');
        if ($warning !== '') {
            flash('err', $warning);
        }
        redirect('/admin');
    }

    public static function settings(array $post, array $current): array
    {
        $errors = [];
        $name = single_line((string) ($post['app_name'] ?? ''), 80);
        if ($name === '') {
            $errors[] = 'Indiquez le nom du site.';
        }
        $url = rtrim(trim((string) ($post['app_url'] ?? '')), '/');
        $parts = parse_url($url);
        if (!is_array($parts) || !preg_match('#^https?://#i', $url) || empty($parts['host']) || !empty($parts['user'])) {
            $errors[] = 'Indiquez une adresse du site valide, par exemple https://lederniertraindesweppes.fr.';
            $url = '';
        }
        $env = (string) ($post['app_env'] ?? '');
        if (!in_array($env, ['local', 'production'], true)) {
            $errors[] = 'Choisissez l\'environnement local ou production.';
        }
        $gameDebug = (string) ($post['game_debug'] ?? ($current['GAME_DEBUG'] ?? 'auto'));
        if (!in_array($gameDebug, ['auto', 'on', 'off'], true)) {
            $errors[] = 'Choisissez le mode debug du jeu.';
        }
        $smtpHost = single_line((string) ($post['smtp_host'] ?? ''), 180);
        if ($smtpHost === '' || str_contains($smtpHost, ' ')) {
            $errors[] = 'Indiquez le serveur SMTP, ou log pour un journal local.';
        }
        $port = (int) ($post['smtp_port'] ?? 0);
        if ($port < 1 || $port > 65535) {
            $errors[] = 'Le port SMTP est invalide.';
        }
        $encryption = (string) ($post['smtp_encryption'] ?? '');
        if (!in_array($encryption, ['tls', 'ssl', 'none'], true)) {
            $errors[] = 'Choisissez le chiffrement SMTP.';
        }
        $smtpUser = single_line((string) ($post['smtp_user'] ?? ''), 180);
        $smtpPass = str_replace(["\r", "\n", "\0"], '', (string) ($post['smtp_pass'] ?? ''));
        if (strlen($smtpPass) > 200) {
            $errors[] = 'Le mot de passe SMTP est trop long.';
        }
        if (strtolower($smtpHost) !== 'log') {
            if ($smtpUser === '') {
                $errors[] = 'Indiquez l\'identifiant SMTP.';
            }
            if ($smtpPass === '' && ($current['SMTP_PASS'] ?? '') === '') {
                $errors[] = 'Indiquez le mot de passe SMTP.';
            }
        }
        $from = strtolower(trim((string) ($post['mail_from_address'] ?? '')));
        if (!valid_email($from)) {
            $errors[] = 'L\'adresse d\'expédition est invalide.';
        }
        $fromName = single_line((string) ($post['mail_from_name'] ?? ''), 80);
        if ($fromName === '') {
            $errors[] = 'Indiquez le nom d\'expédition.';
        }
        $to = strtolower(trim((string) ($post['mail_to'] ?? '')));
        if ($to === '') {
            $to = strtolower(trim((string) ($post['admin_email'] ?? '')));
        }
        if (!valid_email($to)) {
            $errors[] = 'L\'adresse de réception des messages est invalide.';
        }
        $legalName = single_line((string) ($post['legal_name'] ?? ''), 120);
        $legalEmail = strtolower(trim((string) ($post['legal_email'] ?? '')));
        if ($legalEmail !== '' && !valid_email($legalEmail)) {
            $errors[] = 'L\'e-mail des mentions légales est invalide.';
        }
        $legalAddress = single_line((string) ($post['legal_address'] ?? ''), 240);
        $legalHost = single_line((string) ($post['legal_host'] ?? ''), 180);

        $values = [
            'APP_ENV' => $env,
            'APP_URL' => $url,
            'APP_NAME' => $name,
            'APP_KEY' => ($current['APP_KEY'] ?? '') !== '' ? (string) $current['APP_KEY'] : bin2hex(random_bytes(32)),
            'DB_PATH' => 'storage/database.sqlite',
            'GAME_DEBUG' => $gameDebug,
            'SMTP_HOST' => $smtpHost,
            'SMTP_PORT' => (string) $port,
            'SMTP_ENCRYPTION' => $encryption,
            'SMTP_USER' => $smtpUser,
            'SMTP_PASS' => $smtpPass !== '' ? $smtpPass : (string) ($current['SMTP_PASS'] ?? ''),
            'MAIL_FROM_ADDRESS' => $from,
            'MAIL_FROM_NAME' => $fromName,
            'MAIL_TO' => $to,
            'LEGAL_NAME' => $legalName !== '' ? $legalName : 'Groupe Tercium',
            'LEGAL_EMAIL' => $legalEmail,
            'LEGAL_ADDRESS' => $legalAddress,
            'LEGAL_HOST' => $legalHost,
        ];
        return ['errors' => $errors, 'values' => $values];
    }

    public static function defaults(): array
    {
        $host = (string) preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'lederniertraindesweppes.test'));
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
        $local = str_ends_with($host, '.test') || $host === 'localhost' || str_starts_with($host, '127.');
        return [
            'app_name' => 'Le Dernier Train des Weppes',
            'app_url' => ($https ? 'https' : 'http') . '://' . $host,
            'app_env' => $local ? 'local' : 'production',
            'admin_email' => '',
            'smtp_host' => $local ? 'log' : '',
            'smtp_port' => '587',
            'smtp_encryption' => 'tls',
            'smtp_user' => '',
            'mail_from_address' => $local ? 'bonjour@lederniertraindesweppes.test' : 'bonjour@lederniertraindesweppes.fr',
            'mail_from_name' => 'Le Dernier Train des Weppes',
            'mail_to' => '',
            'legal_name' => 'Groupe Tercium',
            'legal_email' => '',
            'legal_address' => '',
            'legal_host' => '',
            'send_test' => '1',
        ];
    }

    private static function envToInput(array $env): array
    {
        return [
            'app_name' => $env['APP_NAME'] ?? '',
            'app_url' => $env['APP_URL'] ?? '',
            'app_env' => $env['APP_ENV'] ?? '',
            'smtp_host' => $env['SMTP_HOST'] ?? '',
            'smtp_port' => $env['SMTP_PORT'] ?? '',
            'smtp_encryption' => $env['SMTP_ENCRYPTION'] ?? '',
            'smtp_user' => $env['SMTP_USER'] ?? '',
            'mail_from_address' => $env['MAIL_FROM_ADDRESS'] ?? '',
            'mail_from_name' => $env['MAIL_FROM_NAME'] ?? '',
            'mail_to' => $env['MAIL_TO'] ?? '',
            'legal_name' => $env['LEGAL_NAME'] ?? '',
            'legal_email' => $env['LEGAL_EMAIL'] ?? '',
            'legal_address' => $env['LEGAL_ADDRESS'] ?? '',
            'legal_host' => $env['LEGAL_HOST'] ?? '',
        ];
    }

    private static function inputFromPost(array $post): array
    {
        $input = self::defaults();
        foreach (array_keys($input) as $key) {
            if ($key === 'send_test') {
                $input[$key] = isset($post['send_test']) ? '1' : '0';
                continue;
            }
            if (isset($post[$key]) && is_string($post[$key])) {
                $input[$key] = $post[$key];
            }
        }
        return $input;
    }

    private static function storageWritable(): bool
    {
        $dir = ROOT . '/storage';
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        return is_dir($dir) && is_writable($dir);
    }
}
