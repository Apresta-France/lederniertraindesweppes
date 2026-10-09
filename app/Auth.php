<?php

declare(strict_types=1);

final class Auth
{
    public static function check(): bool
    {
        return isset($_SESSION['admin_id']) && ctype_digit((string) $_SESSION['admin_id']);
    }

    public static function id(): ?int
    {
        return self::check() ? (int) $_SESSION['admin_id'] : null;
    }

    public static function user(): ?array
    {
        $id = self::id();
        if ($id === null) {
            return null;
        }
        return Database::one('SELECT id, email, created_at FROM admins WHERE id = ?', [$id]);
    }

    public static function require(): void
    {
        if (self::check()) {
            return;
        }
        $path = request_path();
        if (str_starts_with($path, '/admin')) {
            $query = $_SERVER['QUERY_STRING'] ?? '';
            $_SESSION['intended'] = $path . ($query !== '' ? '?' . $query : '');
        }
        redirect('/admin/connexion');
    }

    public static function login(int $id): void
    {
        session_regenerate_id(true);
        $_SESSION['admin_id'] = $id;
    }

    public static function logout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool) $params['secure'], (bool) $params['httponly']);
        }
        session_destroy();
    }

    public static function intended(string $fallback = '/admin'): string
    {
        $target = (string) ($_SESSION['intended'] ?? '');
        unset($_SESSION['intended']);
        if ($target !== '' && str_starts_with($target, '/admin') && !str_starts_with($target, '/admin/connexion')) {
            return safe_local_path($target);
        }
        return $fallback;
    }
}
