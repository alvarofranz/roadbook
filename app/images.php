<?php
/* Image pipeline (GD + AVIF): decode any uploaded image, fix EXIF orientation,
 * optionally square-crop, resize to fit a max dimension, and write a compressed
 * AVIF. The caller deletes the original upload (the PHP tmp file is auto-removed). */

function process_to_avif(string $srcPath, string $destAvif, int $maxDim, bool $square = false, int $quality = 55): bool {
    $data = @file_get_contents($srcPath);
    if ($data === false) return false;
    $img = @imagecreatefromstring($data);
    if (!$img) return false;
    if (imagesx($img) * imagesy($img) > 50000000) { imagedestroy($img); return false; } // decompression-bomb guard (50 MP)

    if (function_exists('exif_read_data')) {
        $exif = @exif_read_data($srcPath);
        $o = $exif['Orientation'] ?? 0;
        if ($o === 3) $img = imagerotate($img, 180, 0);
        elseif ($o === 6) $img = imagerotate($img, -90, 0);
        elseif ($o === 8) $img = imagerotate($img, 90, 0);
    }

    $w = imagesx($img); $h = imagesy($img);
    if ($square) {
        $s = min($w, $h);
        $crop = imagecreatetruecolor($s, $s);
        imagecopy($crop, $img, 0, 0, (int)(($w - $s) / 2), (int)(($h - $s) / 2), $s, $s);
        imagedestroy($img); $img = $crop; $w = $h = $s;
    }
    $scale = min(1.0, $maxDim / max($w, $h));
    if ($scale < 1.0) {
        $nw = max(1, (int)round($w * $scale)); $nh = max(1, (int)round($h * $scale));
        $dst = imagecreatetruecolor($nw, $nh);
        imagecopyresampled($dst, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
        imagedestroy($img); $img = $dst;
    }
    if (!is_dir(dirname($destAvif))) mkdir(dirname($destAvif), 0755, true);
    $ok = imageavif($img, $destAvif, $quality);
    imagedestroy($img);
    return $ok;
}
