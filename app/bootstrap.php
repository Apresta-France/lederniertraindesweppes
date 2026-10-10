<?php

declare(strict_types=1);

define('ROOT', dirname(__DIR__));

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);
date_default_timezone_set('Europe/Paris');

require ROOT . '/app/functions.php';

spl_autoload_register(static function (string $class): void {
    $file = ROOT . '/app/' . $class . '.php';
    if (is_file($file)) {
        require $file;
    }
});

if (is_file(ROOT . '/.env')) {
    Env::load();
    enforce_canonical_url();
}

session_name('LDTWSESSID');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => request_is_https(),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

send_security_headers();
set_exception_handler('handle_exception');
set_error_handler('handle_error');
