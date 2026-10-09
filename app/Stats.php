<?php

declare(strict_types=1);

final class Stats
{
    public static function track(string $path): void
    {
        $purpose = strtolower((string) ($_SERVER['HTTP_PURPOSE'] ?? ($_SERVER['HTTP_SEC_PURPOSE'] ?? '')));
        if (in_array($purpose, ['prefetch', 'preview'], true)) {
            return;
        }
        $agent = strtolower((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
        foreach (['bot', 'spider', 'crawl', 'slurp', 'preview', 'wget', 'curl', 'headless'] as $needle) {
            if ($agent !== '' && str_contains($agent, $needle)) {
                return;
            }
        }
        if (strlen($path) > 180 || !str_starts_with($path, '/')) {
            return;
        }
        $seen = 'seen:' . $path;
        if (!empty($_SESSION[$seen])) {
            return;
        }
        $_SESSION[$seen] = 1;

        $referrer = '';
        $raw = (string) ($_SERVER['HTTP_REFERER'] ?? '');
        $host = strtolower((string) parse_url($raw, PHP_URL_HOST));
        $self = strtolower((string) preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? '')));
        if ($host !== '' && $host !== $self) {
            $referrer = substr($host, 0, 120);
        }
        $sessionHash = substr(hash('sha256', session_id() . '|' . (string) Env::get('APP_KEY', 'ldtw')), 0, 24);
        $now = date('Y-m-d H:i:s');
        Database::insert(
            'INSERT INTO visits (path, referrer, session_hash, day, created_at) VALUES (?, ?, ?, ?, ?)',
            [$path, $referrer, $sessionHash, substr($now, 0, 10), $now]
        );
        if (random_int(1, 40) === 1) {
            $cut = (new DateTimeImmutable('-14 months'))->format('Y-m-d');
            Database::exec('DELETE FROM visits WHERE day < ?', [$cut]);
        }
    }

    public static function report(int $days): array
    {
        $days = in_array($days, [7, 30, 90], true) ? $days : 30;
        $start = (new DateTimeImmutable('today'))->modify('-' . ($days - 1) . ' days');
        $from = $start->format('Y-m-d');

        $visitMap = [];
        foreach (Database::all('SELECT day, COUNT(*) AS n FROM visits WHERE day >= ? GROUP BY day', [$from]) as $row) {
            $visitMap[$row['day']] = (int) $row['n'];
        }
        $signupMap = [];
        foreach (Database::all(
            'SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM subscribers WHERE substr(created_at, 1, 10) >= ? GROUP BY day',
            [$from]
        ) as $row) {
            $signupMap[$row['day']] = (int) $row['n'];
        }

        $series = [];
        $period = new DatePeriod($start, new DateInterval('P1D'), (new DateTimeImmutable('today'))->modify('+1 day'));
        foreach ($period as $day) {
            $key = $day->format('Y-m-d');
            $series[] = [
                'day' => $key,
                'label' => $day->format('d/m'),
                'visits' => $visitMap[$key] ?? 0,
                'signups' => $signupMap[$key] ?? 0,
            ];
        }

        $confirmed = (int) (Database::one("SELECT COUNT(*) AS n FROM subscribers WHERE status = 'confirmed'")['n'] ?? 0);
        $pending = (int) (Database::one("SELECT COUNT(*) AS n FROM subscribers WHERE status = 'pending'")['n'] ?? 0);
        $base = $confirmed + $pending;

        return [
            'days' => $days,
            'from' => $from,
            'series' => $series,
            'visits' => (int) (Database::one('SELECT COUNT(*) AS n FROM visits WHERE day >= ?', [$from])['n'] ?? 0),
            'sessions' => (int) (Database::one('SELECT COUNT(DISTINCT session_hash) AS n FROM visits WHERE day >= ?', [$from])['n'] ?? 0),
            'signups' => (int) (Database::one('SELECT COUNT(*) AS n FROM subscribers WHERE substr(created_at, 1, 10) >= ?', [$from])['n'] ?? 0),
            'messages' => (int) (Database::one('SELECT COUNT(*) AS n FROM messages WHERE substr(created_at, 1, 10) >= ?', [$from])['n'] ?? 0),
            'confirmed' => $confirmed,
            'pending' => $pending,
            'rate' => $base > 0 ? (int) round($confirmed / $base * 100) : null,
            'pages' => Database::all('SELECT path, COUNT(*) AS n FROM visits WHERE day >= ? GROUP BY path ORDER BY n DESC LIMIT 8', [$from]),
            'referrers' => Database::all('SELECT referrer, COUNT(*) AS n FROM visits WHERE day >= ? GROUP BY referrer ORDER BY n DESC LIMIT 8', [$from]),
        ];
    }
}
