<?php

declare(strict_types=1);

final class GameAccess
{
    private const COOKIE = 'ldtw_jeu';
    private const COOKIE_DAYS = 180;
    private const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public static function ready(): bool
    {
        try {
            return !app_needs_install();
        } catch (Throwable) {
            return false;
        }
    }

    /**
     * Handles the key form and invitation links on /jouer/. Redirects on success,
     * returns an error message otherwise.
     */
    public static function handleRequest(): ?string
    {
        if (isset($_GET['admin'])) {
            Auth::require('/jouer/');
        }
        if (request_method() === 'POST') {
            Csrf::check();
            return self::attempt((string) ($_POST['cle'] ?? ''));
        }
        if (isset($_GET['cle'])) {
            return self::attempt((string) $_GET['cle']);
        }
        return null;
    }

    public static function allowed(): bool
    {
        if (Auth::check()) {
            return true;
        }
        $id = $_SESSION['game_key_id'] ?? null;
        if (is_int($id)) {
            if (Database::one('SELECT id FROM game_keys WHERE id = ? AND active = 1', [$id]) !== null) {
                return true;
            }
            self::forget();
            return false;
        }
        $cookie = (string) ($_COOKIE[self::COOKIE] ?? '');
        if ($cookie !== '') {
            $key = self::find($cookie);
            if ($key !== null && (int) $key['active'] === 1) {
                self::grant($key);
                return true;
            }
            self::forget();
        }
        return false;
    }

    public static function generate(): string
    {
        do {
            $raw = '';
            for ($i = 0; $i < 12; $i++) {
                $raw .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
            }
            $code = self::format($raw);
        } while (Database::one('SELECT id FROM game_keys WHERE code = ?', [$code]) !== null);
        return $code;
    }

    public static function find(string $input): ?array
    {
        $raw = preg_replace('/[^A-Z0-9]/', '', strtoupper($input)) ?? '';
        if (strlen($raw) === 16 && str_starts_with($raw, 'LDTW')) {
            $raw = substr($raw, 4);
        }
        if (strlen($raw) !== 12 || strspn($raw, self::ALPHABET) !== 12) {
            return null;
        }
        return Database::one('SELECT * FROM game_keys WHERE code = ?', [self::format($raw)]);
    }

    public static function link(array $key): string
    {
        return abs_url('/jouer/?cle=' . rawurlencode((string) $key['code']));
    }

    private static function attempt(string $input): string
    {
        if (rate_limited('game_key', 10, 900)) {
            return 'Trop de tentatives. Réessayez dans quelques minutes.';
        }
        $key = self::find($input);
        if ($key === null || (int) $key['active'] !== 1) {
            rate_limit_hit('game_key');
            return $key === null ? 'Cette clé n\'est pas reconnue.' : 'Cette clé a été désactivée.';
        }
        clear_rate_limit('game_key');
        self::grant($key);
        redirect('/jouer/');
    }

    private static function grant(array $key): void
    {
        $_SESSION['game_key_id'] = (int) $key['id'];
        self::cookie((string) $key['code'], time() + 86400 * self::COOKIE_DAYS);
        Database::exec(
            'UPDATE game_keys SET uses = uses + 1, last_used_at = ? WHERE id = ?',
            [date('Y-m-d H:i:s'), $key['id']]
        );
    }

    private static function forget(): void
    {
        unset($_SESSION['game_key_id']);
        if (isset($_COOKIE[self::COOKIE])) {
            self::cookie('', time() - 3600);
        }
    }

    private static function cookie(string $value, int $expires): void
    {
        setcookie(self::COOKIE, $value, [
            'expires' => $expires,
            'path' => '/jouer',
            'secure' => request_is_https(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    private static function format(string $raw): string
    {
        return 'LDTW-' . implode('-', str_split($raw, 4));
    }
}
