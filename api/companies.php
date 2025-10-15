<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
  echo json_encode([ 'success' => false, 'message' => 'Não autenticado' ]);
  exit;
}
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$userId = $_SESSION['user_id'];

try {
  $pdo = db();
  if (!$pdo) throw new Exception('A conexão com o banco de dados não pôde ser estabelecida.');
  if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT id, name FROM companies WHERE user_id = :uid ORDER BY name');
    $stmt->execute([':uid' => $userId]);
    $items = $stmt->fetchAll();
    echo json_encode([ 'success' => true, 'items' => $items ]);
    exit;
  }
  if ($method === 'POST') {
    $name = trim($input['name'] ?? '');
    if (!$name) throw new Exception('Nome é obrigatório');
    $id = uniqid('cmp_');
    $pdo->prepare('INSERT INTO companies (id, user_id, name) VALUES (:id,:uid,:name)')
        ->execute([':id'=>$id, ':uid'=>$userId, ':name'=>$name]);
    // Semear catálogos padrão para a nova empresa
    try {
      seed_catalogs_for_company_if_empty($pdo, $userId, $id);
    } catch (Throwable $e) {
      error_log('Falha ao semear catálogos por empresa: '.$e->getMessage());
    }
    $stmt = $pdo->prepare('SELECT id, name FROM companies WHERE user_id = :uid ORDER BY name');
    $stmt->execute([':uid' => $userId]);
    $items = $stmt->fetchAll();
    echo json_encode([ 'success' => true, 'items' => $items ]);
    exit;
  }
  echo json_encode([ 'success' => false, 'message' => 'Método inválido' ]);
} catch (Exception $e) {
  http_response_code(400);
  echo json_encode([ 'success' => false, 'message' => $e->getMessage() ]);
}