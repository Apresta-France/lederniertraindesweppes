<?php

declare(strict_types=1);

/**
 * Characters live in shared/characters/<id>/ : character.json, sprites/ (images) and voice/ (audio).
 * The engine only loads the ones listed in game.json « characters ».
 */
final class CharacterRepository
{
    public const FOLDERS = ['sprites' => 'image', 'voice' => 'audio'];
    public const NAME_PATTERN = '/^[\p{L}\p{N}_-]{1,40}$/u';

    private string $dir;
    private string $gameFile;

    public function __construct(string $gameRoot)
    {
        $shared = SceneRepository::realDir($gameRoot . '/shared');
        $dir = $shared . DIRECTORY_SEPARATOR . 'characters';
        if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
            throw new EditorException('Impossible de créer le dossier des personnages.', 500);
        }
        $this->dir = SceneRepository::realDir($dir);
        $this->gameFile = $gameRoot . '/game.json';
    }

    public function listAll(): array
    {
        $declared = $this->declared();
        $out = [];
        foreach (scandir($this->dir) ?: [] as $id) {
            if (!preg_match(SceneRepository::ID_PATTERN, $id) || !is_file($this->dir . '/' . $id . '/character.json')) {
                continue;
            }
            $data = json_decode((string) file_get_contents($this->dir . '/' . $id . '/character.json'));
            $idle = is_object($data) ? ($data->sprites->idle ?? null) : null;
            $item = [
                'id' => $id,
                'name' => is_object($data) && is_string($data->name ?? null) && $data->name !== '' ? $data->name : $id,
                'idle' => is_string($idle) ? $idle : null,
                'declared' => in_array($id, $declared, true),
            ];
            if (!is_object($data)) {
                $item['invalid'] = true;
            }
            $out[$id] = $item;
        }
        foreach ($declared as $id) {
            $out[$id] ??= ['id' => $id, 'name' => $id, 'idle' => null, 'declared' => true, 'missing' => true];
        }
        uasort($out, static fn (array $a, array $b): int => strnatcasecmp($a['name'], $b['name']));
        return ['characters' => array_values($out)];
    }

    public function read(string $id): array
    {
        $file = $this->file($id);
        $raw = (string) file_get_contents($file);
        return [
            'character' => SceneRepository::decode($raw, 'character.json'),
            'rev' => sha1($raw),
            'files' => SceneRepository::listMedia(dirname($file), ''),
            'declared' => in_array($id, $this->declared(), true),
        ];
    }

    public function save(string $id, mixed $character, ?string $rev, bool $force, string $user): array
    {
        $this->validate($id, $character);
        $file = $this->file($id);
        $content = JsonFormatter::encode($character);
        try {
            $newRev = SceneRepository::guardedWrite(
                $file,
                $force ? null : (string) $rev,
                static fn (): string => $content,
                fn (string $previous) => $this->archive($id, $previous, $user)
            );
        } catch (WriteConflict $conflict) {
            throw new EditorException(
                'Ce personnage a été modifié par quelqu’un d’autre depuis son ouverture.',
                409,
                ['rev' => $conflict->rev, 'character' => SceneRepository::decode($conflict->content, 'character.json')]
            );
        }
        return ['rev' => $newRev];
    }

    public function create(string $id, string $name): array
    {
        $this->assertId($id);
        $name = trim(str_replace(["\r", "\n"], ' ', $name));
        if ($name === '' || mb_strlen($name) > 80) {
            throw new EditorException('Le nom est obligatoire (80 caractères au plus).', 422);
        }
        $dir = $this->dir . DIRECTORY_SEPARATOR . $id;
        if (file_exists($dir)) {
            throw new EditorException('Un personnage avec cet identifiant existe déjà.', 409);
        }
        foreach (array_keys(self::FOLDERS) as $folder) {
            if (!mkdir($dir . '/' . $folder, 0775, true) && !is_dir($dir . '/' . $folder)) {
                throw new EditorException('Impossible de créer le dossier du personnage.', 500);
            }
        }
        $character = (object) [
            'id' => $id,
            'name' => $name,
            'sprites' => new stdClass(),
            'animations' => new stdClass(),
            'voice' => new stdClass(),
        ];
        $content = JsonFormatter::encode($character);
        file_put_contents($dir . '/character.json', $content, LOCK_EX);
        $this->register($id);
        return ['character' => $character, 'rev' => sha1($content), 'files' => [], 'declared' => true];
    }

    public function register(string $id): array
    {
        $this->file($id);
        $gameRev = SceneRepository::guardedWrite($this->gameFile, null, static function (string $current) use ($id): string {
            $game = SceneRepository::decode($current, 'game.json');
            if (!is_object($game)) {
                throw new EditorException('game.json est invalide.', 500);
            }
            $list = is_array($game->characters ?? null) ? $game->characters : [];
            if (!in_array($id, $list, true)) {
                $list[] = $id;
            }
            $game->characters = $list;
            return JsonFormatter::encode($game);
        });
        return ['gameRev' => $gameRev];
    }

    public function upload(string $id, string $folder, mixed $file, bool $replace): array
    {
        if (!isset(self::FOLDERS[$folder])) {
            throw new EditorException('Dossier de destination inconnu.', 422);
        }
        $dir = dirname($this->file($id));
        return SceneRepository::storeUpload($file, $dir . '/' . $folder, $dir, $replace, $folder . '/', self::FOLDERS[$folder]);
    }

    /** @return list<string> */
    private function declared(): array
    {
        $game = json_decode((string) @file_get_contents($this->gameFile));
        $list = is_object($game) && is_array($game->characters ?? null) ? $game->characters : [];
        return array_values(array_filter($list, 'is_string'));
    }

    private function validate(string $id, mixed $character): void
    {
        $this->assertId($id);
        if (!is_object($character)) {
            throw new EditorException('Le personnage doit être un objet JSON.', 422);
        }
        if (($character->id ?? null) !== $id) {
            throw new EditorException('L’identifiant du personnage (« id ») doit être « ' . $id . ' ».', 422);
        }
        if (!is_string($character->name ?? null) || trim($character->name) === '') {
            throw new EditorException('Le nom du personnage est obligatoire.', 422);
        }
        foreach (['sprites', 'animations', 'voice'] as $key) {
            if (isset($character->{$key}) && !is_object($character->{$key})) {
                throw new EditorException('« ' . $key . ' » doit être un objet { … }.', 422);
            }
        }
        foreach (['animations', 'voice'] as $key) {
            foreach (array_keys(get_object_vars($character->{$key} ?? new stdClass())) as $name) {
                if (!preg_match(self::NAME_PATTERN, (string) $name)) {
                    throw new EditorException('Nom invalide dans « ' . $key . ' » : « ' . $name . ' » (lettres, chiffres, tirets).', 422);
                }
            }
        }
        foreach (get_object_vars($character->animations ?? new stdClass()) as $name => $animation) {
            if (!is_object($animation) || !is_array($animation->frames ?? null)) {
                throw new EditorException('L’animation « ' . $name . ' » doit contenir une liste « frames ».', 422);
            }
        }
        foreach (get_object_vars($character->voice ?? new stdClass()) as $name => $pool) {
            if (!is_array($pool)) {
                throw new EditorException('La série de répliques « ' . $name . ' » doit être une liste.', 422);
            }
        }
        $this->assertPaths($character);
    }

    private function assertPaths(mixed $value): void
    {
        if (is_string($value)) {
            if (str_contains($value, '..') || str_starts_with($value, '/') || str_contains($value, '\\')) {
                throw new EditorException('Chemin refusé : « ' . $value . ' ».', 422);
            }
            return;
        }
        if (is_array($value) || is_object($value)) {
            foreach ((array) $value as $item) {
                $this->assertPaths($item);
            }
        }
    }

    private function archive(string $id, string $previous, string $user): void
    {
        $dir = dirname($this->file($id)) . '/.history';
        if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
            return;
        }
        $base = $dir . '/' . date('Ymd-His') . '-' . SceneRepository::userSlug($user);
        $path = $base . '.json';
        for ($n = 2; file_exists($path); $n++) {
            $path = $base . '-' . $n . '.json';
        }
        file_put_contents($path, $previous, LOCK_EX);
        $files = glob($dir . '/*.json') ?: [];
        sort($files, SORT_STRING);
        foreach (array_slice($files, 0, max(0, count($files) - SceneRepository::HISTORY_KEEP)) as $old) {
            @unlink($old);
        }
    }

    private function assertId(string $id): void
    {
        if (!preg_match(SceneRepository::ID_PATTERN, $id) || strlen($id) > 40) {
            throw new EditorException('Identifiant invalide : lettres minuscules, chiffres et tirets uniquement (ex. « aurelie »).', 422);
        }
    }

    private function file(string $id): string
    {
        $this->assertId($id);
        $dir = realpath($this->dir . DIRECTORY_SEPARATOR . $id);
        if ($dir === false || !is_dir($dir)) {
            throw new EditorException('Personnage introuvable.', 404);
        }
        SceneRepository::assertInside($dir, $this->dir);
        $file = $dir . DIRECTORY_SEPARATOR . 'character.json';
        if (!is_file($file)) {
            throw new EditorException('character.json est introuvable pour ce personnage.', 404);
        }
        return $file;
    }
}
