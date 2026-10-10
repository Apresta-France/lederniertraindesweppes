<?php

declare(strict_types=1);

final class SceneRepository
{
    public const ID_PATTERN = '/^[a-z0-9]+(-[a-z0-9]+)*$/';
    public const TYPES = ['cinematic', 'explore'];
    public const LOCK_TTL = 90;
    public const HISTORY_KEEP = 30;
    public const MAX_UPLOAD = 20 * 1024 * 1024;
    public const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
    public const AUDIO_EXT = ['mp3', 'ogg', 'wav', 'm4a'];

    private const TRANSLIT = [
        'à' => 'a', 'á' => 'a', 'â' => 'a', 'ã' => 'a', 'ä' => 'a', 'å' => 'a', 'æ' => 'ae',
        'ç' => 'c', 'è' => 'e', 'é' => 'e', 'ê' => 'e', 'ë' => 'e', 'ì' => 'i', 'í' => 'i',
        'î' => 'i', 'ï' => 'i', 'ñ' => 'n', 'ò' => 'o', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o',
        'ö' => 'o', 'ø' => 'o', 'œ' => 'oe', 'ù' => 'u', 'ú' => 'u', 'û' => 'u', 'ü' => 'u',
        'ý' => 'y', 'ÿ' => 'y', 'ß' => 'ss', '’' => '-', "'" => '-',
    ];

    private string $scenesDir;
    private string $sharedDir;
    private string $gameFile;

    public function __construct(string $gameRoot)
    {
        $this->scenesDir = self::realDir($gameRoot . '/scenes');
        $this->sharedDir = self::realDir($gameRoot . '/shared');
        $this->gameFile = $gameRoot . '/game.json';
        if (!is_file($this->gameFile)) {
            throw new EditorException('game.json est introuvable.', 500);
        }
    }

    public function listAll(string $user): array
    {
        [$game, $gameRev] = $this->readGame();
        $labels = [];
        foreach ((array) ($game->scenes ?? []) as $entry) {
            if (is_object($entry) && is_string($entry->id ?? null)) {
                $labels[$entry->id] = (string) ($entry->label ?? '');
            }
        }

        $found = [];
        foreach (scandir($this->scenesDir) ?: [] as $name) {
            if (preg_match(self::ID_PATTERN, $name) && is_file($this->scenesDir . '/' . $name . '/scene.json')) {
                $found[$name] = true;
            }
        }

        $scenes = [];
        foreach ($labels as $id => $label) {
            $scenes[] = isset($found[$id])
                ? $this->summary($id, $label, false, $user)
                : ['id' => $id, 'label' => $label, 'missing' => true];
            unset($found[$id]);
        }
        $unlisted = array_keys($found);
        sort($unlisted, SORT_NATURAL);
        foreach ($unlisted as $id) {
            $scenes[] = $this->summary($id, '', true, $user);
        }

        return ['game' => $game, 'gameRev' => $gameRev, 'scenes' => $scenes];
    }

    public function readScene(string $id, string $user): array
    {
        $file = $this->sceneFile($id);
        $raw = (string) file_get_contents($file);
        return ['scene' => self::decode($raw, 'scene.json'), 'rev' => sha1($raw), 'lock' => $this->lockInfo($id, $user)];
    }

    public function saveScene(string $id, mixed $scene, ?string $rev, bool $force, string $user): array
    {
        $this->validateScene($id, $scene);
        $file = $this->sceneFile($id);
        $content = JsonFormatter::encode($scene);
        try {
            $newRev = self::guardedWrite(
                $file,
                $force ? null : (string) $rev,
                static fn (): string => $content,
                fn (string $previous) => $this->archive($id, $previous, $user)
            );
        } catch (WriteConflict $conflict) {
            throw new EditorException(
                'Cette scène a été modifiée par quelqu’un d’autre depuis son ouverture.',
                409,
                [
                    'rev' => $conflict->rev,
                    'scene' => self::decode($conflict->content, 'scene.json'),
                    'savedBy' => $this->lastSavedBy($id),
                ]
            );
        }
        return ['rev' => $newRev];
    }

    public function createScene(string $id, string $type, string $title, string $user): array
    {
        $this->assertId($id);
        if (!in_array($type, self::TYPES, true)) {
            throw new EditorException('Type de scène inconnu.', 422);
        }
        $title = trim(str_replace(["\r", "\n"], ' ', $title));
        if ($title === '' || mb_strlen($title) > 200) {
            throw new EditorException('Le titre est obligatoire (200 caractères au plus).', 422);
        }
        $dir = $this->scenesDir . DIRECTORY_SEPARATOR . $id;
        if (file_exists($dir)) {
            throw new EditorException('Une scène avec cet identifiant existe déjà.', 409);
        }
        if (!mkdir($dir . '/assets', 0775, true)) {
            throw new EditorException('Impossible de créer le dossier de la scène.', 500);
        }

        $scene = self::template($id, $type, $title);
        $content = JsonFormatter::encode($scene);
        file_put_contents($dir . '/scene.json', $content, LOCK_EX);

        $gameRev = self::guardedWrite($this->gameFile, null, static function (string $current) use ($id, $title): string {
            $game = self::decode($current, 'game.json');
            if (!is_object($game)) {
                throw new EditorException('game.json est invalide.', 500);
            }
            $scenes = is_array($game->scenes ?? null) ? $game->scenes : [];
            $scenes[] = (object) ['id' => $id, 'label' => $title];
            $game->scenes = $scenes;
            return JsonFormatter::encode($game);
        });

        return ['scene' => $scene, 'rev' => sha1($content), 'gameRev' => $gameRev];
    }

    public function saveGame(mixed $game, ?string $rev, bool $force): array
    {
        if (!is_object($game) || !is_array($game->scenes ?? null)) {
            throw new EditorException('Manifeste invalide : la liste « scenes » est obligatoire.', 422);
        }
        $seen = [];
        foreach ($game->scenes as $entry) {
            $id = is_object($entry) ? ($entry->id ?? null) : null;
            if (!is_string($id) || !preg_match(self::ID_PATTERN, $id)) {
                throw new EditorException('Manifeste invalide : identifiant de scène incorrect.', 422);
            }
            if (isset($seen[$id])) {
                throw new EditorException('Manifeste invalide : la scène « ' . $id . ' » apparaît deux fois.', 422);
            }
            if (isset($entry->label) && !is_string($entry->label)) {
                throw new EditorException('Manifeste invalide : libellé de scène incorrect.', 422);
            }
            $seen[$id] = true;
        }
        foreach (['start', 'continue'] as $key) {
            if (isset($game->{$key}) && (!is_string($game->{$key}) || !isset($seen[$game->{$key}]))) {
                throw new EditorException('Manifeste invalide : « ' . $key . ' » doit désigner une scène de la liste.', 422);
            }
        }

        $content = JsonFormatter::encode($game);
        try {
            $newRev = self::guardedWrite($this->gameFile, $force ? null : (string) $rev, static fn (): string => $content);
        } catch (WriteConflict $conflict) {
            throw new EditorException(
                'Le manifeste du jeu a été modifié entre-temps.',
                409,
                ['rev' => $conflict->rev, 'game' => self::decode($conflict->content, 'game.json')]
            );
        }
        return ['rev' => $newRev];
    }

    public function lock(string $id, string $user, bool $force): array
    {
        $file = $this->sceneDir($id) . '/.lock';
        $current = $this->lockInfo($id, $user);
        if ($current !== null && !$current['mine'] && !$force) {
            return ['mine' => false, 'lock' => $current];
        }
        file_put_contents($file, json_encode(['user' => $user, 'at' => time()], JSON_UNESCAPED_UNICODE), LOCK_EX);
        return ['mine' => true, 'lock' => null];
    }

    public function unlock(string $id, string $user): array
    {
        $file = $this->sceneDir($id) . '/.lock';
        $lock = self::readLockFile($file);
        if ($lock !== null && $lock['user'] === $user) {
            @unlink($file);
        }
        return ['ok' => true];
    }

    public function assets(string $id): array
    {
        $dir = $this->sceneDir($id);
        return [
            'scene' => self::listMedia($dir, ''),
            'shared' => self::listMedia($this->sharedDir, '@shared/'),
        ];
    }

    public function upload(string $id, mixed $file, bool $replace): array
    {
        return self::storeUpload($file, $this->sceneDir($id) . '/assets', $this->scenesDir, $replace, 'assets/');
    }

    /**
     * Moves an uploaded image or audio file into $dir (created if needed, must stay inside $base).
     *
     * @param 'image'|'audio'|null $only restricts the accepted kind
     */
    public static function storeUpload(mixed $file, string $dir, string $base, bool $replace, string $prefix, ?string $only = null): array
    {
        if (!is_array($file) || !isset($file['error'], $file['tmp_name'], $file['name'])) {
            throw new EditorException('Aucun fichier reçu (la taille maximale acceptée par le serveur est peut-être dépassée).', 422);
        }
        $error = (int) $file['error'];
        if ($error !== UPLOAD_ERR_OK) {
            throw new EditorException(match ($error) {
                UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Fichier trop lourd pour le serveur.',
                UPLOAD_ERR_PARTIAL => 'Le fichier n’a été reçu que partiellement.',
                UPLOAD_ERR_NO_FILE => 'Aucun fichier reçu.',
                default => 'Le téléversement a échoué (code ' . $error . ').',
            }, 422);
        }
        $tmp = (string) $file['tmp_name'];
        if (!is_uploaded_file($tmp)) {
            throw new EditorException('Fichier téléversé invalide.', 422);
        }
        if ((int) filesize($tmp) > self::MAX_UPLOAD) {
            throw new EditorException('Fichier trop lourd (20 Mo au maximum).', 413);
        }

        $name = self::sanitizeFilename((string) $file['name']);
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $isImage = in_array($ext, self::IMAGE_EXT, true);
        if (!$isImage && !in_array($ext, self::AUDIO_EXT, true)) {
            throw new EditorException('Format refusé. Formats acceptés : ' . implode(', ', [...self::IMAGE_EXT, ...self::AUDIO_EXT]) . '.', 415);
        }
        if ($only !== null && $only !== ($isImage ? 'image' : 'audio')) {
            throw new EditorException($only === 'image' ? 'Seules les images sont acceptées ici.' : 'Seuls les fichiers audio sont acceptés ici.', 415);
        }
        if ($isImage && @getimagesize($tmp) === false) {
            throw new EditorException('Ce fichier n’est pas une image lisible.', 415);
        }

        if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
            throw new EditorException('Impossible de créer le dossier ' . basename($dir) . '.', 500);
        }
        $dir = self::realDir($dir);
        self::assertInside($dir, $base);

        $target = $dir . DIRECTORY_SEPARATOR . $name;
        if (file_exists($target) && !$replace) {
            throw new EditorException('Un fichier « ' . $name . ' » existe déjà.', 409, ['path' => $prefix . $name, 'exists' => true]);
        }
        if (!move_uploaded_file($tmp, $target)) {
            throw new EditorException('Impossible d’enregistrer le fichier.', 500);
        }
        @chmod($target, 0664);
        return ['path' => $prefix . $name, 'type' => $isImage ? 'image' : 'audio', 'size' => (int) filesize($target)];
    }

    public static function sanitizeFilename(string $name): string
    {
        $name = basename(str_replace('\\', '/', $name));
        $ext = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
        $base = mb_strtolower((string) pathinfo($name, PATHINFO_FILENAME), 'UTF-8');
        if (class_exists('Normalizer')) {
            $decomposed = Normalizer::normalize($base, Normalizer::FORM_D);
            if (is_string($decomposed)) {
                $base = (string) preg_replace('/\p{Mn}+/u', '', $decomposed);
            }
        }
        $base = strtr($base, self::TRANSLIT);
        $base = (string) preg_replace('/\s+/u', '-', $base);
        $base = (string) preg_replace('/[^a-z0-9._-]+/', '', $base);
        $base = (string) preg_replace('/([._-])[._-]+/', '$1', $base);
        $base = trim($base, '._-');
        if ($base === '') {
            $base = 'fichier';
        }
        $ext = (string) preg_replace('/[^a-z0-9]/', '', $ext);
        return substr($base, 0, 80) . ($ext !== '' ? '.' . $ext : '');
    }

    private function summary(string $id, string $label, bool $unlisted, string $user): array
    {
        $raw = (string) file_get_contents($this->scenesDir . '/' . $id . '/scene.json');
        $data = json_decode($raw);
        $item = [
            'id' => $id,
            'label' => $label,
            'type' => is_object($data) ? ($data->type ?? null) : null,
            'title' => is_object($data) ? ($data->title ?? '') : '',
            'meta' => is_object($data) && isset($data->meta) ? $data->meta : new stdClass(),
            'rev' => sha1($raw),
            'lock' => $this->lockInfo($id, $user),
        ];
        if (!is_object($data)) {
            $item['invalid'] = true;
        }
        if ($unlisted) {
            $item['unlisted'] = true;
        }
        return $item;
    }

    private function readGame(): array
    {
        $raw = (string) file_get_contents($this->gameFile);
        $game = self::decode($raw, 'game.json');
        if (!is_object($game)) {
            throw new EditorException('game.json est invalide.', 500);
        }
        return [$game, sha1($raw)];
    }

    private function validateScene(string $id, mixed $scene): void
    {
        $this->assertId($id);
        if (!is_object($scene)) {
            throw new EditorException('La scène doit être un objet JSON.', 422);
        }
        if (($scene->id ?? null) !== $id) {
            throw new EditorException('L’identifiant de la scène (« id ») doit être « ' . $id . ' ».', 422);
        }
        if (!in_array($scene->type ?? null, self::TYPES, true)) {
            throw new EditorException('Le type de scène doit être « cinematic » ou « explore ».', 422);
        }
        if (!is_string($scene->title ?? null)) {
            throw new EditorException('Le titre de la scène (« title ») est obligatoire.', 422);
        }
    }

    private static function template(string $id, string $type, string $title): stdClass
    {
        if ($type === 'explore') {
            return (object) [
                'id' => $id,
                'type' => 'explore',
                'title' => $title,
                'meta' => new stdClass(),
                'size' => [1672, 941],
                'background' => (object) ['src' => '', 'alt' => ''],
                'decor' => [],
                'objects' => [],
            ];
        }
        return (object) [
            'id' => $id,
            'type' => 'cinematic',
            'title' => $title,
            'meta' => new stdClass(),
            'skip' => (object) ['mode' => 'end', 'label' => 'Cliquer pour passer'],
            'timeline' => [(object) ['at' => 0, 'do' => 'end']],
        ];
    }

    private function assertId(string $id): void
    {
        if (!preg_match(self::ID_PATTERN, $id) || strlen($id) > 80) {
            throw new EditorException('Identifiant invalide : lettres minuscules, chiffres et tirets uniquement (ex. « couloir-nuit »).', 422);
        }
    }

    private function sceneDir(string $id): string
    {
        $this->assertId($id);
        $dir = realpath($this->scenesDir . DIRECTORY_SEPARATOR . $id);
        if ($dir === false || !is_dir($dir)) {
            throw new EditorException('Scène introuvable.', 404);
        }
        self::assertInside($dir, $this->scenesDir);
        return $dir;
    }

    private function sceneFile(string $id): string
    {
        $file = $this->sceneDir($id) . DIRECTORY_SEPARATOR . 'scene.json';
        if (!is_file($file)) {
            throw new EditorException('scene.json est introuvable pour cette scène.', 404);
        }
        return $file;
    }

    private function lockInfo(string $id, string $user): ?array
    {
        $lock = self::readLockFile($this->scenesDir . '/' . $id . '/.lock');
        if ($lock === null) {
            return null;
        }
        $age = time() - $lock['at'];
        if ($age >= self::LOCK_TTL) {
            return null;
        }
        return ['user' => $lock['user'], 'at' => $lock['at'], 'age' => max(0, $age), 'mine' => $lock['user'] === $user];
    }

    private static function readLockFile(string $file): ?array
    {
        if (!is_file($file)) {
            return null;
        }
        $data = json_decode((string) @file_get_contents($file), true);
        if (!is_array($data) || !is_string($data['user'] ?? null) || !is_int($data['at'] ?? null)) {
            return null;
        }
        return ['user' => $data['user'], 'at' => $data['at']];
    }

    private function archive(string $id, string $previous, string $user): void
    {
        $dir = $this->sceneDir($id) . '/.history';
        if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
            return;
        }
        $slug = self::userSlug($user);
        $stamp = date('Ymd-His');
        $path = $dir . '/' . $stamp . '-' . $slug . '.json';
        for ($n = 2; file_exists($path); $n++) {
            $path = $dir . '/' . $stamp . '-' . $slug . '-' . $n . '.json';
        }
        file_put_contents($path, $previous, LOCK_EX);

        $files = glob($dir . '/*.json') ?: [];
        sort($files, SORT_STRING);
        foreach (array_slice($files, 0, max(0, count($files) - self::HISTORY_KEEP)) as $old) {
            @unlink($old);
        }
    }

    private function lastSavedBy(string $id): ?array
    {
        $files = glob($this->sceneDir($id) . '/.history/*.json') ?: [];
        if ($files === []) {
            return null;
        }
        sort($files, SORT_STRING);
        if (!preg_match('/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-([a-z0-9]+)(?:-\d+)?\.json$/', basename(end($files)), $m)) {
            return null;
        }
        return ['user' => $m[7], 'at' => sprintf('%s-%s-%s %s:%s:%s', $m[1], $m[2], $m[3], $m[4], $m[5], $m[6])];
    }

    public static function userSlug(string $user): string
    {
        $local = strtolower(explode('@', $user)[0]);
        $slug = (string) preg_replace('/[^a-z0-9]+/', '', $local);
        return $slug !== '' ? substr($slug, 0, 40) : 'inconnu';
    }

    /**
     * @param callable(string): string $produce receives the current file contents
     * @param (callable(string): void)|null $beforeWrite called with the previous contents when they change
     */
    public static function guardedWrite(string $file, ?string $expectedRev, callable $produce, ?callable $beforeWrite = null): string
    {
        $handle = fopen($file, 'c+');
        if ($handle === false) {
            throw new EditorException('Impossible d’ouvrir ' . basename($file) . ' en écriture.', 500);
        }
        try {
            if (!flock($handle, LOCK_EX)) {
                throw new EditorException('Impossible de verrouiller ' . basename($file) . '.', 500);
            }
            $current = (string) stream_get_contents($handle);
            $currentRev = sha1($current);
            if ($expectedRev !== null && !hash_equals($currentRev, $expectedRev)) {
                throw new WriteConflict($currentRev, $current);
            }
            $content = $produce($current);
            if ($content !== $current) {
                if ($beforeWrite !== null && $current !== '') {
                    $beforeWrite($current);
                }
                ftruncate($handle, 0);
                rewind($handle);
                fwrite($handle, $content);
                fflush($handle);
            }
            flock($handle, LOCK_UN);
            return sha1($content);
        } finally {
            fclose($handle);
        }
    }

    public static function listMedia(string $root, string $prefix): array
    {
        $out = [];
        $iterator = new RecursiveIteratorIterator(
            new RecursiveCallbackFilterIterator(
                new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS | FilesystemIterator::UNIX_PATHS),
                static fn (SplFileInfo $file): bool => !str_starts_with($file->getFilename(), '.')
            )
        );
        $rootLength = strlen(str_replace('\\', '/', $root)) + 1;
        foreach ($iterator as $file) {
            /** @var SplFileInfo $file */
            if (!$file->isFile()) {
                continue;
            }
            $ext = strtolower($file->getExtension());
            $type = match (true) {
                in_array($ext, self::IMAGE_EXT, true) => 'image',
                in_array($ext, self::AUDIO_EXT, true) => 'audio',
                default => null,
            };
            if ($type === null) {
                continue;
            }
            $relative = substr(str_replace('\\', '/', $file->getPathname()), $rootLength);
            $out[] = ['path' => $prefix . $relative, 'type' => $type, 'size' => $file->getSize()];
        }
        usort($out, static fn (array $a, array $b): int => strnatcasecmp($a['path'], $b['path']));
        return $out;
    }

    public static function decode(string $raw, string $label): mixed
    {
        try {
            return json_decode($raw, false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            throw new EditorException($label . ' est illisible : ' . $e->getMessage(), 422, ['raw' => $raw]);
        }
    }

    public static function realDir(string $path): string
    {
        $real = realpath($path);
        if ($real === false || !is_dir($real)) {
            throw new EditorException('Dossier introuvable : ' . basename($path), 500);
        }
        return $real;
    }

    public static function assertInside(string $path, string $base): void
    {
        $path = rtrim(str_replace('\\', '/', $path), '/') . '/';
        $base = rtrim(str_replace('\\', '/', $base), '/') . '/';
        if (!str_starts_with($path, $base)) {
            throw new EditorException('Chemin refusé.', 403);
        }
    }
}

final class WriteConflict extends RuntimeException
{
    public function __construct(public readonly string $rev, public readonly string $content)
    {
        parent::__construct('Conflit d’écriture.');
    }
}
