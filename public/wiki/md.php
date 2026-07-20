<?php
$page = preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['page'] ?? '');
if (!$page) { http_response_code(400); exit; }
$file = dirname(__DIR__, 2) . '/docs/wiki/' . $page . '.md';
if (!file_exists($file)) { http_response_code(404); exit; }
header('Content-Type: text/markdown; charset=utf-8');
readfile($file);
