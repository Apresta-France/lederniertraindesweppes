<?php

declare(strict_types=1);

final class Csrf
{
    public static function token(): string
    {
        if (empty($_SESSION['_csrf']) || !is_string($_SESSION['_csrf'])) {
            $_SESSION['_csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['_csrf'];
    }

    public static function check(): void
    {
        $sent = (string) ($_POST['_csrf'] ?? '');
        if ($sent === '' || !hash_equals(self::token(), $sent)) {
            $back = safe_local_path((string) ($_POST['redirect'] ?? '/'));
            if (wants_json()) {
                json_out(['ok' => false, 'message' => 'La session a expiré. Rechargez la page.'], 419);
            }
            flash('err', 'La session a expiré. Rechargez la page.');
            redirect($back);
        }
    }
}
