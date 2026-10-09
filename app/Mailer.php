<?php

declare(strict_types=1);

final class Mailer
{
    public static function send(string $to, string $subject, string $html, string $text, array $options = []): void
    {
        if (!valid_email($to)) {
            throw new RuntimeException('Destinataire invalide.');
        }
        $fromEmail = trim((string) Env::get('MAIL_FROM_ADDRESS', ''));
        $fromName = trim((string) Env::get('MAIL_FROM_NAME', app_name()));
        if (!valid_email($fromEmail)) {
            throw new RuntimeException('Adresse d\'expédition invalide.');
        }

        $domain = substr(strrchr($fromEmail, '@') ?: '@localhost', 1);
        $boundary = 'ldtw_' . bin2hex(random_bytes(12));
        $host = parse_url(app_base_url(), PHP_URL_HOST) ?: $domain;

        $headers = [
            'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
            'From: ' . self::address($fromName, $fromEmail),
            'To: ' . self::address((string) ($options['to_name'] ?? ''), $to),
            'Reply-To: ' . self::address((string) ($options['reply_to_name'] ?? ''), (string) ($options['reply_to'] ?? $fromEmail)),
            'Subject: ' . self::encodeHeader($subject),
            'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . $domain . '>',
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
            'Content-Language: fr',
            'Auto-Submitted: auto-generated',
            'X-Auto-Response-Suppress: All',
        ];
        if (!empty($options['unsubscribe']) && is_string($options['unsubscribe'])) {
            $headers[] = 'List-Unsubscribe: <' . $options['unsubscribe'] . '>';
            $headers[] = 'List-Unsubscribe-Post: List-Unsubscribe=One-Click';
        }

        $body = '--' . $boundary . "\r\n"
            . "Content-Type: text/plain; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: quoted-printable\r\n\r\n"
            . quoted_printable_encode(self::normalize($text)) . "\r\n"
            . '--' . $boundary . "\r\n"
            . "Content-Type: text/html; charset=UTF-8\r\n"
            . "Content-Transfer-Encoding: quoted-printable\r\n\r\n"
            . quoted_printable_encode(self::normalize($html)) . "\r\n"
            . '--' . $boundary . "--\r\n";

        $raw = self::crlf(implode("\r\n", $headers) . "\r\n\r\n" . $body);
        $smtpHost = strtolower(trim((string) Env::get('SMTP_HOST', '')));
        if ($smtpHost === '' || $smtpHost === 'log') {
            self::writeLog($raw, $to);
            return;
        }

        $client = new SmtpClient(
            (string) Env::get('SMTP_HOST', ''),
            (int) Env::get('SMTP_PORT', '587'),
            (string) Env::get('SMTP_ENCRYPTION', 'tls'),
            (string) Env::get('SMTP_USER', ''),
            (string) Env::get('SMTP_PASS', ''),
            $host
        );
        $client->send($fromEmail, $to, $raw);
    }

    private static function writeLog(string $raw, string $to): void
    {
        $dir = ROOT . '/storage/logs';
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        $name = date('Ymd-His') . '-' . preg_replace('/[^a-z0-9]+/i', '-', $to) . '.eml';
        if (file_put_contents($dir . '/' . $name, $raw) === false) {
            throw new RuntimeException('Impossible d\'écrire le journal des messages.');
        }
    }

    private static function address(string $name, string $email): string
    {
        if (!valid_email($email)) {
            throw new RuntimeException('Adresse de courriel invalide.');
        }
        $name = trim(str_replace(["\r", "\n", '"'], '', $name));
        if ($name === '') {
            return '<' . $email . '>';
        }
        if (preg_match('/^[\x20-\x7E]*$/', $name)) {
            return '"' . $name . '" <' . $email . '>';
        }
        return self::encodeHeader($name) . ' <' . $email . '>';
    }

    private static function encodeHeader(string $value): string
    {
        $value = trim(str_replace(["\r", "\n"], '', $value));
        if (preg_match('/^[\x20-\x7E]*$/', $value)) {
            return $value;
        }
        return '=?UTF-8?B?' . base64_encode($value) . '?=';
    }

    private static function normalize(string $value): string
    {
        $value = str_replace(["\r\n", "\r"], "\n", $value);
        return str_replace("\n", "\r\n", $value);
    }

    private static function crlf(string $value): string
    {
        return self::normalize($value);
    }
}

final class SmtpClient
{
    public function __construct(
        private string $host,
        private int $port,
        private string $encryption,
        private string $user,
        private string $pass,
        private string $ehloHost,
        private int $timeout = 20
    ) {
    }

    public function send(string $from, string $to, string $data): void
    {
        $context = stream_context_create([
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
                'SNI_enabled' => true,
                'peer_name' => $this->host,
            ],
        ]);
        $remote = ($this->encryption === 'ssl' ? 'ssl://' : 'tcp://') . $this->host . ':' . $this->port;
        $socket = stream_socket_client($remote, $errno, $errstr, $this->timeout, STREAM_CLIENT_CONNECT, $context);
        if (!$socket) {
            throw new RuntimeException('Connexion SMTP impossible : ' . $errstr . ' (' . $errno . ').');
        }
        stream_set_timeout($socket, $this->timeout);
        try {
            $this->expect($socket, [220]);
            $this->command($socket, 'EHLO ' . $this->ehloName(), [250]);
            if ($this->encryption === 'tls') {
                $this->command($socket, 'STARTTLS', [220]);
                $crypto = STREAM_CRYPTO_METHOD_TLS_CLIENT;
                if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
                    $crypto |= STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
                }
                if (!stream_socket_enable_crypto($socket, true, $crypto)) {
                    throw new RuntimeException('Le chiffrement STARTTLS a échoué.');
                }
                $this->command($socket, 'EHLO ' . $this->ehloName(), [250]);
            }
            if ($this->user !== '') {
                $this->command($socket, 'AUTH LOGIN', [334]);
                $this->command($socket, base64_encode($this->user), [334]);
                $this->command($socket, base64_encode($this->pass), [235]);
            }
            $this->command($socket, 'MAIL FROM:<' . $from . '>', [250]);
            $this->command($socket, 'RCPT TO:<' . $to . '>', [250, 251]);
            $this->command($socket, 'DATA', [354]);
            $payload = preg_replace('/^\./m', '..', $data) ?? $data;
            $written = fwrite($socket, $payload . ".\r\n");
            if ($written === false) {
                throw new RuntimeException('Envoi SMTP interrompu.');
            }
            $this->expect($socket, [250]);
            $this->command($socket, 'QUIT', [221]);
        } finally {
            fclose($socket);
        }
    }

    private function ehloName(): string
    {
        $name = preg_replace('/[^A-Za-z0-9.\-]/', '', $this->ehloHost) ?: 'localhost';
        return $name;
    }

    private function command($socket, string $command, array $ok): string
    {
        $written = fwrite($socket, $command . "\r\n");
        if ($written === false) {
            throw new RuntimeException('Envoi SMTP interrompu.');
        }
        return $this->expect($socket, $ok);
    }

    private function expect($socket, array $ok): string
    {
        $response = '';
        while (!feof($socket)) {
            $line = fgets($socket, 515);
            if ($line === false) {
                break;
            }
            $response .= $line;
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }
        $code = (int) substr($response, 0, 3);
        if (!in_array($code, $ok, true)) {
            $clean = trim(preg_replace('/[\r\n]+/', ' ', $response) ?? $response);
            throw new RuntimeException('Le serveur SMTP a répondu : ' . $clean);
        }
        return $response;
    }
}
