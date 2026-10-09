<?php

declare(strict_types=1);

final class Database
{
    private static ?PDO $pdo = null;

    public static function path(): string
    {
        $rel = trim((string) Env::get('DB_PATH', 'storage/database.sqlite'));
        $rel = str_replace('\\', '/', $rel);
        if (
            $rel === ''
            || str_contains($rel, '..')
            || str_starts_with($rel, '/')
            || preg_match('/^[A-Za-z]:/', $rel)
        ) {
            $rel = 'storage/database.sqlite';
        }
        return ROOT . '/' . $rel;
    }

    public static function pdo(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }
        $path = self::path();
        $dir = dirname($path);
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException('Le dossier de données est inaccessible.');
        }
        $pdo = new PDO('sqlite:' . $path, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA busy_timeout = 3000');
        $pdo->exec('PRAGMA journal_mode = WAL');
        self::$pdo = $pdo;
        return $pdo;
    }

    public static function migrate(): void
    {
        $pdo = self::pdo();
        $pdo->exec(<<<'SQL'
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS subscribers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL,
                token TEXT NOT NULL UNIQUE,
                source TEXT,
                mail_error TEXT,
                created_at TEXT NOT NULL,
                confirmed_at TEXT,
                unsubscribed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                mail_error TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS visits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL,
                referrer TEXT,
                session_hash TEXT NOT NULL,
                day TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                ip_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS game_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                label TEXT,
                email TEXT,
                active INTEGER NOT NULL DEFAULT 1,
                uses INTEGER NOT NULL DEFAULT 0,
                last_used_at TEXT,
                sent_at TEXT,
                mail_error TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_visits_day ON visits(day);
            CREATE INDEX IF NOT EXISTS idx_visits_path ON visits(path);
            CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);
            CREATE INDEX IF NOT EXISTS idx_attempts_lookup ON attempts(action, ip_hash, created_at);
        SQL);
    }

    public static function hasAdmin(): bool
    {
        if (!is_file(self::path())) {
            return false;
        }
        self::migrate();
        return self::one('SELECT id FROM admins LIMIT 1') !== null;
    }

    public static function one(string $sql, array $params = []): ?array
    {
        $statement = self::pdo()->prepare($sql);
        $statement->execute($params);
        $row = $statement->fetch();
        return $row === false ? null : $row;
    }

    public static function all(string $sql, array $params = []): array
    {
        $statement = self::pdo()->prepare($sql);
        $statement->execute($params);
        return $statement->fetchAll();
    }

    public static function exec(string $sql, array $params = []): int
    {
        $statement = self::pdo()->prepare($sql);
        $statement->execute($params);
        return $statement->rowCount();
    }

    public static function insert(string $sql, array $params = []): int
    {
        self::exec($sql, $params);
        return (int) self::pdo()->lastInsertId();
    }
}
