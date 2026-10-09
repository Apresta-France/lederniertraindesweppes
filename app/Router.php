<?php

declare(strict_types=1);

final class Router
{
    private array $routes = [];

    public function get(string $path, callable $handler): void
    {
        $this->routes[] = ['GET', $path, $handler];
    }

    public function post(string $path, callable $handler): void
    {
        $this->routes[] = ['POST', $path, $handler];
    }

    public function dispatch(string $method, string $path): void
    {
        foreach ($this->routes as [$routeMethod, $pattern, $handler]) {
            if ($routeMethod !== $method) {
                continue;
            }
            $regex = preg_replace('#\{([A-Za-z_]+)\}#', '(?P<$1>[a-z0-9\-]+)', $pattern);
            if (!is_string($regex) || !preg_match('#^' . $regex . '$#', $path, $matches)) {
                continue;
            }
            $params = [];
            foreach ($matches as $key => $value) {
                if (is_string($key)) {
                    $params[$key] = $value;
                }
            }
            $handler($params);
            return;
        }
        http_response_code(404);
        SitePages::notFound();
    }
}
