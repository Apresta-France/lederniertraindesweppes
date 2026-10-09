<?php

declare(strict_types=1);

require dirname(__DIR__, 3) . '/app/bootstrap.php';
function editor_enabled(): bool
{
    return game_editor_enabled();
}

/**
 * Stops the request unless the editor is enabled and an administrator is logged in.
 *
 * @return array{email: string, csrf: string}
 */
function editor_guard(bool $api): array
{
    if (!editor_enabled()) {
        if ($api) {
            json_out(['error' => 'Introuvable.'], 404);
        }
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Page introuvable.';
        exit;
    }

    $user = Auth::check() ? Auth::user() : null;
    if ($user === null) {
        if ($api) {
            json_out(['error' => 'Session expirée : reconnectez-vous à l’administration.'], 401);
        }
        Auth::require('/jouer/editor/');
    }

    return ['email' => (string) $user['email'], 'csrf' => Csrf::token()];
}
