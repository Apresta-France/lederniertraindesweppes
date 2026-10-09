<?php

declare(strict_types=1);

/**
 * Encodes JSON with 2-space indentation, keeping short objects and arrays on one line
 * so that saved scenes stay close to the hand-written files.
 */
final class JsonFormatter
{
    private const WIDTH = 100;
    private const FLAGS = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR;

    public static function encode(mixed $value): string
    {
        return self::format($value, 0, 0) . "\n";
    }

    private static function format(mixed $value, int $depth, int $prefix): string
    {
        if (!self::isContainer($value)) {
            return self::scalar($value);
        }
        $entries = self::entries($value);
        $isObject = self::isObject($value);
        if ($entries === []) {
            return $isObject ? '{}' : '[]';
        }
        if ($depth > 0) {
            $inline = self::inline($value);
            if ($depth * 2 + $prefix + mb_strlen($inline) <= self::WIDTH) {
                return $inline;
            }
        }
        $pad = str_repeat('  ', $depth + 1);
        $lines = [];
        foreach ($entries as $key => $item) {
            $head = $isObject ? self::scalar((string) $key) . ': ' : '';
            $lines[] = $pad . $head . self::format($item, $depth + 1, mb_strlen($head));
        }
        [$open, $close] = $isObject ? ['{', '}'] : ['[', ']'];
        return $open . "\n" . implode(",\n", $lines) . "\n" . str_repeat('  ', $depth) . $close;
    }

    private static function inline(mixed $value): string
    {
        if (!self::isContainer($value)) {
            return self::scalar($value);
        }
        $entries = self::entries($value);
        if (self::isObject($value)) {
            if ($entries === []) {
                return '{}';
            }
            $parts = [];
            foreach ($entries as $key => $item) {
                $parts[] = self::scalar((string) $key) . ': ' . self::inline($item);
            }
            return '{ ' . implode(', ', $parts) . ' }';
        }
        return '[' . implode(', ', array_map(self::inline(...), $entries)) . ']';
    }

    private static function isContainer(mixed $value): bool
    {
        return is_array($value) || $value instanceof stdClass;
    }

    private static function isObject(mixed $value): bool
    {
        return $value instanceof stdClass || (is_array($value) && $value !== [] && !array_is_list($value));
    }

    private static function entries(mixed $value): array
    {
        return $value instanceof stdClass ? get_object_vars($value) : $value;
    }

    private static function scalar(mixed $value): string
    {
        return json_encode($value, self::FLAGS);
    }
}
