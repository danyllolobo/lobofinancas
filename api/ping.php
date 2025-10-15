<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

$dbStatus = ['connected' => false];
$pdo = null;
try {
  $pdo = db();
  if ($pdo) { $dbStatus['connected'] = true; }
  else { $dbStatus['error'] = 'Falha na conexão com o banco.'; }
} catch (Throwable $e) {
  $dbStatus['error'] = $e->getMessage();
}

echo json_encode(['success' => true, 'message' => 'pong', 'db' => $dbStatus]);