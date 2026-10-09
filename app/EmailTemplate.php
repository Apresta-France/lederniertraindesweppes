<?php

declare(strict_types=1);

final class EmailTemplate
{
    public static function paragraph(string $html): string
    {
        return '<p style="margin:0 0 16px;font-family:Georgia,\'Times New Roman\',serif;font-size:16px;line-height:26px;color:#cdbf9f;">' . $html . '</p>';
    }

    public static function compose(array $mail): array
    {
        $legalName = legal_value('LEGAL_NAME', 'Groupe Tercium');
        $address = trim((string) Env::get('LEGAL_ADDRESS', ''));
        $html = render_to_string('emails/default', [
            'preheader' => (string) $mail['preheader'],
            'heading' => (string) $mail['heading'],
            'bodyHtml' => (string) $mail['html'],
            'buttonLabel' => $mail['button_label'] ?? null,
            'buttonUrl' => $mail['button_url'] ?? null,
            'reason' => (string) $mail['reason'],
            'unsubscribeUrl' => $mail['unsubscribe_url'] ?? null,
            'appName' => app_name(),
            'home' => abs_url('/'),
            'logo' => abs_url('/assets/img/logo-tercium.png'),
            'year' => date('Y'),
            'address' => $address,
            'legalName' => $legalName,
        ]);

        $text = rtrim((string) $mail['text']) . "\n\n--\n"
            . $mail['reason'] . "\n"
            . $legalName . "\n"
            . abs_url('/') . "\n";
        if ($address !== '') {
            $text .= $address . "\n";
        }
        if (!empty($mail['unsubscribe_url'])) {
            $text .= 'Se désinscrire : ' . $mail['unsubscribe_url'] . "\n";
        }

        return ['html' => $html, 'text' => $text];
    }
}
