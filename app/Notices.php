<?php

declare(strict_types=1);

final class Notices
{
    public static function waitlistConfirm(array $subscriber): void
    {
        $confirm = abs_url('/liste-attente/confirmer?token=' . rawurlencode((string) $subscriber['token']));
        $unsubscribe = abs_url('/liste-attente/desinscription?token=' . rawurlencode((string) $subscriber['token']));
        $built = EmailTemplate::compose([
            'preheader' => 'Confirmez votre adresse pour garder votre place sur la liste d\'attente.',
            'heading' => 'Confirmez votre place',
            'html' => EmailTemplate::paragraph('Bonjour,')
                . EmailTemplate::paragraph('Vous avez demandé à rejoindre la liste d\'attente du Dernier Train des Weppes, le jeu d\'aventure de Groupe Tercium.')
                . EmailTemplate::paragraph('Confirmez votre adresse pour recevoir l\'ouverture du prototype. Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message.'),
            'text' => "Bonjour,\n\nVous avez demandé à rejoindre la liste d'attente du Dernier Train des Weppes, le jeu d'aventure de Groupe Tercium.\n\nConfirmez votre adresse pour recevoir l'ouverture du prototype :\n" . $confirm . "\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
            'button_label' => 'Confirmer mon inscription',
            'button_url' => $confirm,
            'reason' => 'Vous recevez ce message parce qu\'une inscription à la liste d\'attente a été demandée avec cette adresse.',
            'unsubscribe_url' => $unsubscribe,
        ]);
        Mailer::send(
            (string) $subscriber['email'],
            'Confirmez votre inscription au Dernier Train des Weppes',
            $built['html'],
            $built['text'],
            ['unsubscribe' => $unsubscribe]
        );
    }

    public static function contactToStudio(array $message): void
    {
        $when = fr_date((string) $message['created_at']);
        $body = nl2br(e((string) $message['body']));
        $quote = '<p style="margin:0 0 16px;padding:14px 16px;border-left:2px solid #d9b77a;font-family:Georgia,Times New Roman,serif;font-size:15px;line-height:24px;color:#efe0bf;">' . $body . '</p>';
        $built = EmailTemplate::compose([
            'preheader' => 'Message de ' . $message['name'] . ' — ' . $message['subject'],
            'heading' => 'Nouveau message',
            'html' => EmailTemplate::paragraph('Un message est arrivé depuis le formulaire du site.')
                . EmailTemplate::paragraph('<strong style="color:#efe0bf;">' . e((string) $message['name']) . '</strong><br>' . e((string) $message['email']) . '<br>' . e((string) $message['subject']) . '<br>' . e($when))
                . $quote,
            'text' => "Un message est arrivé depuis le formulaire du site.\n\n"
                . $message['name'] . "\n" . $message['email'] . "\n" . $message['subject'] . "\n" . $when . "\n\n"
                . $message['body'],
            'reason' => 'Message adressé à l\'équipe du Dernier Train des Weppes.',
        ]);
        Mailer::send(
            (string) Env::get('MAIL_TO', ''),
            'Message reçu : ' . $message['subject'],
            $built['html'],
            $built['text'],
            [
                'reply_to' => (string) $message['email'],
                'reply_to_name' => (string) $message['name'],
            ]
        );
    }

    public static function contactAck(array $message): void
    {
        $built = EmailTemplate::compose([
            'preheader' => 'Nous avons bien reçu votre message et nous vous répondrons.',
            'heading' => 'Message bien reçu',
            'html' => EmailTemplate::paragraph('Bonjour ' . e((string) $message['name']) . ',')
                . EmailTemplate::paragraph('Nous avons bien reçu votre message au sujet « ' . e((string) $message['subject']) . ' ». Nous vous répondrons à cette adresse.'),
            'text' => 'Bonjour ' . $message['name'] . ",\n\nNous avons bien reçu votre message au sujet « " . $message['subject'] . " ». Nous vous répondrons à cette adresse.",
            'reason' => 'Accusé de réception envoyé parce que vous avez écrit via le formulaire du site.',
        ]);
        Mailer::send(
            (string) $message['email'],
            'Nous avons bien reçu votre message',
            $built['html'],
            $built['text'],
            ['to_name' => (string) $message['name']]
        );
    }

    public static function test(string $to): void
    {
        $built = EmailTemplate::compose([
            'preheader' => 'Ce message confirme que l\'envoi depuis le site fonctionne.',
            'heading' => 'La voie est libre',
            'html' => EmailTemplate::paragraph('Bonjour,')
                . EmailTemplate::paragraph('Ce message d\'essai confirme que le site peut écrire avec l\'adresse et le serveur configurés. Vous pouvez le conserver ou le supprimer.'),
            'text' => "Bonjour,\n\nCe message d'essai confirme que le site peut écrire avec l'adresse et le serveur configurés. Vous pouvez le conserver ou le supprimer.",
            'button_label' => 'Ouvrir le site',
            'button_url' => abs_url('/'),
            'reason' => 'Message d\'essai demandé depuis l\'installation ou l\'administration du site.',
        ]);
        Mailer::send($to, 'Essai de configuration — Le Dernier Train des Weppes', $built['html'], $built['text']);
    }
}
