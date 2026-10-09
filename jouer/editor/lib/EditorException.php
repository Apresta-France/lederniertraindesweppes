<?php

declare(strict_types=1);

final class EditorException extends RuntimeException
{
    public function __construct(string $message, public readonly int $status = 400, public readonly array $data = [])
    {
        parent::__construct($message);
    }
}
