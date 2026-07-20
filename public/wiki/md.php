<?php
$page = preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['page'] ?? '');
if (!$page) { http_response_code(400); exit; }
$lang = preg_replace('/[^a-z]/', '', $_GET['lang'] ?? '');
$base = dirname(__DIR__, 2) . '/docs/wiki/';
$file = $base . $page . '.md';
if ($lang && file_exists($base . $lang . '/' . $page . '.md')) {
    $file = $base . $lang . '/' . $page . '.md';
}
if (!file_exists($file)) { http_response_code(404); exit; }
header('Content-Type: text/markdown; charset=utf-8');
readfile($file);
