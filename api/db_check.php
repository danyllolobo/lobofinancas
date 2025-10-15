<?php
// Utilitário de diagnóstico: verificar conexão PostgreSQL e schema
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

function redact($value) { return $value ? '***' : null; }

$info = [
  'env' => [
    'PGHOST' => getenv('PGHOST') ?: null,
    'PGPORT' => getenv('PGPORT') ?: null,
    'PGDATABASE' => getenv('PGDATABASE') ?: null,
    'PGUSER' => getenv('PGUSER') ?: null,
    'PGPASSWORD' => getenv('PGPASSWORD') ? '***' : null,
    'PGSSLMODE' => getenv('PGSSLMODE') ?: null,
  ],
];

try {
  $pdo = db();
  if (!$pdo) {
    http_response_code(500);
    echo json_encode(['connected'=>false,'message'=>'Falha ao conectar (db() retornou null)','info'=>$info]);
    exit;
  }
  $ver = $pdo->query('SELECT version()')->fetchColumn();
  // Confirma que ensure_schema rodou e lista tabelas
  $tables = $pdo->query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('categories','subcategories','cost_centers','accounts','payment_methods','fees','transactions') ORDER BY tablename")->fetchAll(PDO::FETCH_COLUMN);
  echo json_encode(['connected'=>true,'version'=>$ver,'tables'=>$tables,'info'=>$info]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['connected'=>false,'error'=>$e->getMessage(),'info'=>$info]);
}