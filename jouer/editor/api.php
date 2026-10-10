<?php

declare(strict_types=1);

require __DIR__ . '/lib/guard.php';
require __DIR__ . '/lib/EditorException.php';
require __DIR__ . '/lib/JsonFormatter.php';
require __DIR__ . '/lib/SceneRepository.php';
require __DIR__ . '/lib/CharacterRepository.php';

header('Cache-Control: no-store');

set_exception_handler(static function (Throwable $e): void {
    $dir = ROOT . '/storage/logs';
    if (is_dir($dir) || @mkdir($dir, 0775, true)) {
        @file_put_contents($dir . '/app.log', date('c') . ' [editeur] ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine() . "\n", FILE_APPEND);
    }
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode(['error' => 'Erreur interne du serveur.'], JSON_UNESCAPED_UNICODE);
});

$session = editor_guard(true);
$method = request_method();
$action = (string) ($_GET['action'] ?? '');

if ($method === 'POST') {
    $sent = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['_csrf'] ?? '');
    if ($sent === '' || !hash_equals($session['csrf'], $sent)) {
        json_out(['error' => 'Jeton de sécurité invalide : rechargez la page.'], 419);
    }
}
session_write_close();

function editor_body(): stdClass
{
    $type = (string) ($_SERVER['CONTENT_TYPE'] ?? '');
    if (!str_contains($type, 'application/json')) {
        return (object) $_POST;
    }
    $raw = (string) file_get_contents('php://input');
    if (strlen($raw) > 5 * 1024 * 1024) {
        throw new EditorException('Requête trop volumineuse.', 413);
    }
    try {
        $body = json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new EditorException('Corps de requête JSON invalide.', 400);
    }
    if (!$body instanceof stdClass) {
        throw new EditorException('Corps de requête JSON invalide.', 400);
    }
    return $body;
}

function editor_string(mixed $value): string
{
    return is_string($value) ? $value : '';
}

function editor_flag(mixed $value): bool
{
    return $value === true || $value === 1 || $value === '1' || $value === 'true';
}

try {
    $repo = new SceneRepository(dirname(__DIR__));
    $characters = new CharacterRepository(dirname(__DIR__));
    $user = $session['email'];
    $result = match ($method . ' ' . $action) {
        'GET list' => $repo->listAll($user),
        'GET scene' => $repo->readScene(editor_string($_GET['id'] ?? null), $user),
        'GET assets' => $repo->assets(editor_string($_GET['id'] ?? null)),
        'POST save' => (static function () use ($repo, $user): array {
            $body = editor_body();
            $rev = $body->rev ?? null;
            return $repo->saveScene(editor_string($body->id ?? null), $body->scene ?? null, is_string($rev) ? $rev : null, editor_flag($body->force ?? false), $user);
        })(),
        'POST create' => (static function () use ($repo, $user): array {
            $body = editor_body();
            return $repo->createScene(editor_string($body->id ?? null), editor_string($body->type ?? null), editor_string($body->title ?? null), $user);
        })(),
        'POST game' => (static function () use ($repo): array {
            $body = editor_body();
            $rev = $body->rev ?? null;
            return $repo->saveGame($body->game ?? null, is_string($rev) ? $rev : null, editor_flag($body->force ?? false));
        })(),
        'POST lock' => (static function () use ($repo, $user): array {
            $body = editor_body();
            return $repo->lock(editor_string($body->id ?? null), $user, editor_flag($body->force ?? false));
        })(),
        'POST unlock' => $repo->unlock(editor_string(editor_body()->id ?? null), $user),
        'POST upload' => $repo->upload(editor_string($_POST['id'] ?? null), $_FILES['file'] ?? null, editor_flag($_POST['replace'] ?? false)),
        'GET characters' => $characters->listAll(),
        'GET character' => $characters->read(editor_string($_GET['id'] ?? null)),
        'POST character-save' => (static function () use ($characters, $user): array {
            $body = editor_body();
            $rev = $body->rev ?? null;
            return $characters->save(editor_string($body->id ?? null), $body->character ?? null, is_string($rev) ? $rev : null, editor_flag($body->force ?? false), $user);
        })(),
        'POST character-create' => (static function () use ($characters): array {
            $body = editor_body();
            return $characters->create(editor_string($body->id ?? null), editor_string($body->name ?? null));
        })(),
        'POST character-register' => $characters->register(editor_string(editor_body()->id ?? null)),
        'POST character-upload' => $characters->upload(
            editor_string($_POST['id'] ?? null),
            editor_string($_POST['folder'] ?? null),
            $_FILES['file'] ?? null,
            editor_flag($_POST['replace'] ?? false)
        ),
        default => throw new EditorException('Action inconnue.', 404),
    };
    json_out($result);
} catch (EditorException $e) {
    json_out(['error' => $e->getMessage()] + $e->data, $e->status);
}
