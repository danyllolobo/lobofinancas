<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
  echo json_encode([ 'success' => false, 'message' => 'Não autenticado' ]);
  exit;
}

$storageDir = __DIR__ . '/../storage';
$companiesFile = $storageDir . '/companies.json';
if (!is_dir($storageDir)) { mkdir($storageDir, 0777, true); }
if (!file_exists($companiesFile)) { file_put_contents($companiesFile, json_encode([])); }

function readCompanies($file) {
  $raw = file_get_contents($file);
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function writeCompanies($file, $companies) {
  file_put_contents($file, json_encode($companies, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
}

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$userId = $_SESSION['user_id'];

try {
  $companies = readCompanies($companiesFile);
  if ($method === 'GET') {
    $items = array_values(array_filter($companies, fn($c) => $c['user_id'] === $userId));
    echo json_encode([ 'success' => true, 'items' => $items ]);
    exit;
  }
  if ($method === 'POST') {
    $name = trim($input['name'] ?? '');
    if (!$name) throw new Exception('Nome é obrigatório');
    $id = uniqid('cmp_');
    $companies[] = [ 'id' => $id, 'name' => $name, 'user_id' => $userId ];
    writeCompanies($companiesFile, $companies);
    $items = array_values(array_filter($companies, fn($c) => $c['user_id'] === $userId));
    echo json_encode([ 'success' => true, 'items' => $items ]);
    exit;
  }
  echo json_encode([ 'success' => false, 'message' => 'Método inválido' ]);
} catch (Exception $e) {
  http_response_code(400);
  echo json_encode([ 'success' => false, 'message' => $e->getMessage() ]);
}