<?php

declare(strict_types=1);

final class Env
{
    private static array $vars = [];
    private static bool $loaded = false;

    public static function exists(): bool
    {
        return is_file(ROOT . '/.env');
    }

    public static function load(): void
    {
        $raw = file_get_contents(ROOT . '/.env');
        if ($raw === false) {
            throw new RuntimeException('Le fichier d\'environnement est illisible.');
        }
        self::$vars = self::parse($raw);
        self::$loaded = true;
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        if (!self::$loaded && self::exists()) {
            self::load();
        }
        return self::$vars[$key] ?? $default;
    }

    public static function all(): array
    {
        if (!self::$loaded && self::exists()) {
            self::load();
        }
        return self::$vars;
    }

    public static function write(array $values): void
    {
        $path = ROOT . '/.env';
        if (is_file($path)) {
            copy($path, ROOT . '/.env.bak');
        }
        $lines = [
            '# Le Dernier Train des Weppes — fichier d\'environnement',
            '# Généré le ' . date('c'),
            '',
        ];
        foreach ($values as $key => $value) {
            $key = (string) $key;
            if (!preg_match('/^[A-Z0-9_]+$/', $key)) {
                continue;
            }
            $value = str_replace(["\r", "\n", "\0"], '', (string) $value);
            $escaped = str_replace(['\\', '"'], ['\\\\', '\\"'], $value);
            $lines[] = $key . '="' . $escaped . '"';
        }
        $payload = implode("\n", $lines) . "\n";
        if (file_put_contents($path, $payload, LOCK_EX) === false) {
            throw new RuntimeException('Impossible d\'écrire le fichier d\'environnement.');
        }
        self::$vars = self::parse($payload);
        self::$loaded = true;
    }

    public static function parse(string $raw): array
    {
        $vars = [];
        foreach (preg_split('/\R/', $raw) ?: [] as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = explode('=', $line, 2);
            $key = trim($key);
            $value = trim($value);
            if ($value !== '' && ($value[0] === '"' || $value[0] === "'") && str_ends_with($value, $value[0])) {
                $quote = $value[0];
                $value = substr($value, 1, -1);
                if ($quote === '"') {
                    $value = stripcslashes($value);
                }
            }
            if (preg_match('/^[A-Z0-9_]+$/', $key)) {
                $vars[$key] = $value;
            }
        }
        return $vars;
    }
}
