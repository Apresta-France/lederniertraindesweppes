<?php
$font = "Georgia,'Times New Roman',serif";
?>
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($heading) ?></title>
</head>
<body style="margin:0;padding:0;background:#070b12;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#070b12;"><?= e($preheader) ?></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070b12;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:28px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#0b111c;border:1px solid #3d3428;border-radius:4px;">
        <tr>
          <td style="padding:28px 32px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:14px;vertical-align:middle;">
                  <img src="<?= e($logo) ?>" width="86" height="34" alt="<?= e($legalName) ?>" style="display:block;border:0;height:34px;width:auto;max-width:86px;">
                </td>
                <td style="vertical-align:middle;font-family:<?= $font ?>;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#d9b77a;">
                  <?= e($legalName) ?>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 0;">
            <div style="height:1px;background:#d9b77a;opacity:.45;line-height:1px;font-size:0;">&nbsp;</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px;font-family:<?= $font ?>;font-size:28px;line-height:34px;color:#efe0bf;">
            <?= e($heading) ?>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 8px;">
            <?= $bodyHtml ?>
          </td>
        </tr>
        <?php if (!empty($buttonLabel) && !empty($buttonUrl)): ?>
        <tr>
          <td style="padding:8px 32px 12px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td bgcolor="#d9b77a" style="border-radius:3px;">
                  <a href="<?= e($buttonUrl) ?>" style="display:inline-block;padding:14px 26px;font-family:<?= $font ?>;font-size:14px;line-height:18px;letter-spacing:.12em;text-transform:uppercase;color:#141b26;text-decoration:none;font-weight:bold;"><?= e($buttonLabel) ?></a>
                </td>
              </tr>
            </table>
            <p style="margin:14px 0 0;font-family:<?= $font ?>;font-size:13px;line-height:20px;color:#8a8170;">Si le bouton ne s'ouvre pas : <a href="<?= e($buttonUrl) ?>" style="color:#d9b77a;"><?= e($buttonUrl) ?></a></p>
          </td>
        </tr>
        <?php endif; ?>
        <tr>
          <td style="padding:20px 32px 28px;border-top:1px solid #3d3428;">
            <p style="margin:0 0 8px;font-family:<?= $font ?>;font-size:13px;line-height:20px;color:#8a8170;"><?= e($reason) ?></p>
            <p style="margin:0;font-family:<?= $font ?>;font-size:13px;line-height:20px;color:#8a8170;">
              <?= e($legalName) ?><?php if ($address !== ''): ?> — <?= e($address) ?><?php endif; ?><br>
              <a href="<?= e($home) ?>" style="color:#d9b77a;text-decoration:none;"><?= e($home) ?></a>
              <?php if (!empty($unsubscribeUrl)): ?>
                <br><a href="<?= e($unsubscribeUrl) ?>" style="color:#a99d84;">Se désinscrire</a>
              <?php endif; ?>
            </p>
            <p style="margin:12px 0 0;font-family:<?= $font ?>;font-size:12px;line-height:18px;color:#8a8170;">© <?= e($year) ?> <?= e($legalName) ?></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
