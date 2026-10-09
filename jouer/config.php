<?php

declare(strict_types=1);

function jeu_env(string $key, ?string $default = null): ?string
{
    static $vars = null;
    if ($vars === null) {
        $vars = [];
        $file = __DIR__ . '/.env';
        if (is_file($file)) {
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
        }
    }
    return $vars[$key] ?? $default;
}
