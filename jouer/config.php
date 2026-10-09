<?php

declare(strict_types=1);

function jeu_env_file(string $file): array
{
    $vars = [];
    if (!is_file($file)) {
        return $vars;
    }
    $lines = file($file, FILE_IGNORE_NEW_LINES);
    foreach ($lines ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$name, $value] = explode('=', $line, 2);
        $value = trim($value);
        if (strlen($value) >= 2 && ($value[0] === '"' || $value[0] === "'") && str_ends_with($value, $value[0])) {
            $value = substr($value, 1, -1);
        }
        $vars[trim($name)] = $value;
    }
    return $vars;
}

// jouer/.env prend le pas sur le .env du site, modifiable depuis l'administration.
function jeu_env(string $key, ?string $default = null): ?string
{
    static $vars = null;
    $vars ??= jeu_env_file(__DIR__ . '/.env') + jeu_env_file(dirname(__DIR__) . '/.env');
    return $vars[$key] ?? $default;
}

function jeu_debug_enabled(): bool
{
    $mode = strtolower(trim((string) jeu_env('GAME_DEBUG', 'auto')));
    if ($mode === 'on' || $mode === 'off') {
        return $mode === 'on';
    }
    return jeu_env('GAME_ENV', jeu_env('APP_ENV', 'production')) === 'local';
}
