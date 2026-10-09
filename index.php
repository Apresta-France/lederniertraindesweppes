<?php

declare(strict_types=1);

require __DIR__ . '/app/bootstrap.php';

$method = request_method();
$path = request_path();

if (app_needs_install()) {
    if ($path !== '/installation') {
        redirect('/installation');
    }
    if ($method === 'POST') {
        Installer::submit();
    } else {
        Installer::form();
    }
    exit;
}

if ($path === '/installation') {
    redirect('/');
}

Database::migrate();

$router = new Router();
require ROOT . '/app/routes.php';
$router->dispatch($method, $path);
