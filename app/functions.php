<?php

declare(strict_types=1);

function e(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function request_method(): string
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    return $method === 'HEAD' ? 'GET' : $method;
}

function request_path(): string
{
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $path = rawurldecode($path);
    if ($path === '/' || $path === '') {
        return '/';
    }
    return '/' . trim($path, '/');
}

function wants_json(): bool
{
    $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
    $xhr = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
    return str_contains($accept, 'application/json') || $xhr === 'fetch';
}

function redirect(string $to): never
{
    header('Location: ' . $to, true, 303);
    exit;
}

function redirect_preserve(string $to): never
{
    $qs = $_SERVER['QUERY_STRING'] ?? '';
    if ($qs !== '') {
        $to .= (str_contains($to, '?') ? '&' : '?') . $qs;
    }
    redirect($to);
}

function json_out(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function flash(string $key, ?string $value = null): ?string
{
    if ($value !== null) {
        $_SESSION['_flash'][$key] = $value;
        return null;
    }
    if (!isset($_SESSION['_flash'][$key])) {
        return null;
    }
    $stored = (string) $_SESSION['_flash'][$key];
    unset($_SESSION['_flash'][$key]);
    return $stored;
}

function asset(string $path): string
{
    return '/' . ltrim($path, '/');
}

function request_is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function app_base_url(): string
{
    $base = rtrim((string) Env::get('APP_URL', ''), '/');
    if ($base !== '') {
        return $base;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $host = $_SERVER['HTTP_HOST'] ?? 'lederniertraindesweppes.test';
    return ($https ? 'https' : 'http') . '://' . $host;
}

function abs_url(string $path = '/'): string
{
    return app_base_url() . '/' . ltrim($path, '/');
}

function render(string $view, array $data = [], ?string $layout = 'layout'): void
{
    if ($layout === 'layout' && !array_key_exists('withWaitlist', $data)) {
        $data['withWaitlist'] = true;
    }
    extract($data, EXTR_SKIP);
    ob_start();
    require ROOT . '/app/views/' . $view . '.php';
    $content = ob_get_clean();
    if ($layout === null) {
        echo $content;
        return;
    }
    require ROOT . '/app/views/' . $layout . '.php';
}

function render_to_string(string $view, array $data = []): string
{
    extract($data, EXTR_SKIP);
    ob_start();
    require ROOT . '/app/views/' . $view . '.php';
    return (string) ob_get_clean();
}

function partial(string $name, array $data = []): void
{
    extract($data, EXTR_SKIP);
    require ROOT . '/app/views/partials/' . $name . '.php';
}

function site_content(): array
{
    static $data = null;
    if ($data === null) {
        $loaded = require ROOT . '/app/data/content.php';
        $data = is_array($loaded) ? $loaded : [];
    }
    return $data;
}

function find_article(string $slug): ?array
{
    foreach (site_content()['articles'] as $article) {
        if ($article['slug'] === $slug) {
            return $article;
        }
    }
    return null;
}

function partner_logos(): array
{
    $dir = ROOT . '/assets/partenaires';
    if (!is_dir($dir)) {
        return [];
    }
    $out = [];
    foreach (scandir($dir) ?: [] as $file) {
        if (preg_match('/\.(png|jpe?g|webp|svg|gif)$/i', $file)) {
            $out[] = 'assets/partenaires/' . $file;
        }
    }
    sort($out, SORT_NATURAL | SORT_FLAG_CASE);
    return $out;
}

function logo_alt(string $path): string
{
    $name = str_replace(['-', '_'], ' ', pathinfo($path, PATHINFO_FILENAME));
    return ucfirst($name);
}

function fr_date(?string $sql): string
{
    if ($sql === null || $sql === '') {
        return '';
    }
    $ts = strtotime($sql);
    if ($ts === false) {
        return $sql;
    }
    $months = [
        1 => 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
    ];
    return (int) date('j', $ts) . ' ' . $months[(int) date('n', $ts)] . ' ' . date('Y', $ts) . ' à ' . date('H\hi', $ts);
}

function client_ip_hash(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $salt = (string) Env::get('APP_KEY', 'lederniertraindesweppes');
    return hash('sha256', $ip . '|' . $salt);
}

function rate_limited(string $action, int $max, int $windowSeconds): bool
{
    $since = date('Y-m-d H:i:s', time() - $windowSeconds);
    $row = Database::one(
        'SELECT COUNT(*) AS n FROM attempts WHERE action = ? AND ip_hash = ? AND created_at >= ?',
        [$action, client_ip_hash(), $since]
    );
    return (int) ($row['n'] ?? 0) >= $max;
}

function rate_limit_hit(string $action): void
{
    Database::insert(
        'INSERT INTO attempts (action, ip_hash, created_at) VALUES (?, ?, ?)',
        [$action, client_ip_hash(), date('Y-m-d H:i:s')]
    );
    if (random_int(1, 25) === 1) {
        Database::exec('DELETE FROM attempts WHERE created_at < ?', [date('Y-m-d H:i:s', time() - 86400 * 2)]);
    }
}

function clear_rate_limit(string $action): void
{
    Database::exec('DELETE FROM attempts WHERE action = ? AND ip_hash = ?', [$action, client_ip_hash()]);
}

function app_needs_install(): bool
{
    if (!Env::exists()) {
        return true;
    }
    try {
        return !Database::hasAdmin();
    } catch (Throwable) {
        return true;
    }
}

function send_security_headers(): void
{
    if (headers_sent()) {
        return;
    }
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'");
}

function handle_error(int $severity, string $message, string $file, int $line): bool
{
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
}

function handle_exception(Throwable $e): void
{
    $dir = ROOT . '/storage/logs';
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    $line = date('c') . ' ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine() . "\n";
    file_put_contents($dir . '/app.log', $line, FILE_APPEND);
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: text/html; charset=utf-8');
    }
    $local = Env::get('APP_ENV', 'local') !== 'production';
    echo '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Incident</title></head>';
    echo '<body style="margin:0;font-family:Georgia,serif;background:#070b12;color:#efe0bf;padding:48px 24px">';
    echo '<p>Le site rencontre un incident.</p>';
    if ($local) {
        echo '<p style="color:#e3a48a">' . e($e->getMessage()) . '</p>';
    }
    echo '</body></html>';
}

function safe_local_path(string $path): string
{
    $path = trim($path);
    if (
        $path === ''
        || strlen($path) > 240
        || !str_starts_with($path, '/')
        || str_starts_with($path, '//')
        || str_contains($path, '://')
        || str_contains($path, "\n")
        || str_contains($path, "\r")
        || str_contains($path, '\\')
    ) {
        return '/';
    }
    $parts = parse_url($path);
    if ($parts === false || isset($parts['host'])) {
        return '/';
    }
    $only = $parts['path'] ?? '/';
    if (!str_starts_with($only, '/')) {
        return '/';
    }
    if (isset($parts['query']) && !str_contains($parts['query'], "\n")) {
        $only .= '?' . $parts['query'];
    }
    return $only;
}

function return_path(): string
{
    $path = request_path();
    $known = [
        '/', '/le-jeu', '/avancement', '/actualites', '/partenaires', '/contact',
        '/mentions-legales', '/confidentialite', '/liste-attente/confirmer',
        '/liste-attente/desinscription',
    ];
    if (!in_array($path, $known, true) && !str_starts_with($path, '/actualites/')) {
        $path = '/';
    }
    if ($path === '/contact') {
        $subject = strtolower((string) ($_GET['sujet'] ?? ''));
        $allowed = ['question', 'presse', 'partenariat', 'autre'];
        if (in_array($subject, $allowed, true)) {
            return $path . '?sujet=' . $subject;
        }
    }
    return $path;
}

function valid_email(string $email): bool
{
    if ($email === '' || strlen($email) > 180 || preg_match('/[\r\n]/', $email)) {
        return false;
    }
    return (bool) filter_var($email, FILTER_VALIDATE_EMAIL);
}

function honeypot_tripped(): bool
{
    return trim((string) ($_POST['ldtw_hp'] ?? '')) !== '';
}

function csrf_field(): string
{
    return '<input type="hidden" name="_csrf" value="' . e(Csrf::token()) . '">';
}

function honeypot_field(): string
{
    return '<div class="hp" aria-hidden="true"><label>Ne pas remplir<input type="text" name="ldtw_hp" tabindex="-1" autocomplete="off" value=""></label></div>';
}

function app_name(): string
{
    $name = trim((string) Env::get('APP_NAME', ''));
    return $name !== '' ? $name : 'Le Dernier Train des Weppes';
}

function game_editor_enabled(): bool
{
    require_once ROOT . '/jouer/config.php';
    return is_file(ROOT . '/jouer/editor/index.php')
        && strtolower(trim((string) jeu_env('GAME_EDITOR', 'on'))) !== 'off';
}

function legal_value(string $key, string $fallback): string
{
    $value = trim((string) Env::get($key, ''));
    return $value !== '' ? $value : $fallback;
}

function contact_email(): string
{
    $email = trim((string) Env::get('LEGAL_EMAIL', ''));
    if ($email === '') {
        $email = trim((string) Env::get('MAIL_TO', ''));
    }
    return valid_email($email) ? $email : '';
}

function single_line(string $value, int $max): string
{
    $value = trim(str_replace(["\r", "\n", "\0"], '', $value));
    if (strlen($value) > $max) {
        $value = substr($value, 0, $max);
    }
    return $value;
}

function subscriber_label(string $status): string
{
    return match ($status) {
        'confirmed' => 'Confirmé',
        'unsubscribed' => 'Désinscrit',
        default => 'En attente',
    };
}

function path_label(string $path): string
{
    $map = [
        '/' => 'Accueil',
        '/le-jeu' => 'Le jeu',
        '/avancement' => 'Avancement',
        '/actualites' => 'Actualités',
        '/partenaires' => 'Partenaires',
        '/contact' => 'Contact',
        '/mentions-legales' => 'Mentions légales',
        '/confidentialite' => 'Confidentialité',
        '/liste-attente/confirmer' => 'Confirmation',
        '/liste-attente/desinscription' => 'Désinscription',
    ];
    if (isset($map[$path])) {
        return $map[$path];
    }
    if (str_starts_with($path, '/actualites/')) {
        $article = find_article(substr($path, strlen('/actualites/')));
        return $article['title'] ?? 'Article';
    }
    return $path;
}

function csv_safe(string $value): string
{
    if (preg_match('/^[=+\-@]/', $value)) {
        return "'" . $value;
    }
    return $value;
}
