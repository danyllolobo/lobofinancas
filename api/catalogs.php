<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
  echo json_encode([ 'success' => false, 'message' => 'Não autenticado' ]);
  exit;
}

require_once __DIR__ . '/db.php';
// Fallback em JSON quando DB não está configurado
$storageDir = __DIR__ . '/../storage';
$file = $storageDir . '/catalogs.json';
if (!is_dir($storageDir)) { mkdir($storageDir, 0777, true); }
if (!file_exists($file)) { file_put_contents($file, json_encode([])); }

function readJson($file) {
  $raw = file_get_contents($file);
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}
function writeJson($file, $data) {
  file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
}

$userId = $_SESSION['user_id'];
$method = $_SERVER['REQUEST_METHOD'];
$entity = $_GET['entity'] ?? null;
$input = json_decode(file_get_contents('php://input'), true) ?? [];

try {
  $pdo = db();
  if ($pdo) {
    seed_catalogs_if_empty($pdo, $userId);
    if ($method === 'GET') {
      if ($entity) {
        switch ($entity) {
          case 'categories':
            $stmt = $pdo->prepare('SELECT id,name,type FROM categories WHERE user_id=:uid ORDER BY name');
            $stmt->execute([':uid'=>$userId]);
            echo json_encode(['success'=>true,'items'=>$stmt->fetchAll()]);
            exit;
          case 'subcategories':
            $stmt = $pdo->prepare('SELECT s.id, s.name, s.category_id, c.name AS category_name FROM subcategories s JOIN categories c ON c.id=s.category_id AND c.user_id=:uid WHERE s.user_id=:uid ORDER BY c.name, s.name');
            $stmt->execute([':uid'=>$userId]);
            echo json_encode(['success'=>true,'items'=>$stmt->fetchAll()]);
            exit;
          case 'cost_centers':
            $stmt = $pdo->prepare('SELECT id,name FROM cost_centers WHERE user_id=:uid ORDER BY name');
            $stmt->execute([':uid'=>$userId]);
            echo json_encode(['success'=>true,'items'=>$stmt->fetchAll()]);
            exit;
          case 'accounts':
            $stmt = $pdo->prepare('SELECT id,name FROM accounts WHERE user_id=:uid ORDER BY name');
            $stmt->execute([':uid'=>$userId]);
            echo json_encode(['success'=>true,'items'=>$stmt->fetchAll()]);
            exit;
          case 'payment_methods':
            $stmt = $pdo->prepare('SELECT id,name FROM payment_methods WHERE user_id=:uid ORDER BY name');
            $stmt->execute([':uid'=>$userId]);
            echo json_encode(['success'=>true,'items'=>$stmt->fetchAll()]);
            exit;
          case 'fees':
            $stmt = $pdo->prepare('SELECT f.id, f.name, f.percent, f.payment_method_id, p.name AS payment_method_name FROM fees f JOIN payment_methods p ON p.id=f.payment_method_id AND p.user_id=:uid WHERE f.user_id=:uid ORDER BY p.name, f.name');
            $stmt->execute([':uid'=>$userId]);
            echo json_encode(['success'=>true,'items'=>$stmt->fetchAll()]);
            exit;
        }
        echo json_encode(['success'=>false,'message'=>'Entidade inválida']);
        exit;
      }
      // Sem entity: retornar agregados completos
      $cats = $pdo->prepare('SELECT id,name,type FROM categories WHERE user_id=:uid ORDER BY name');
      $cats->execute([':uid'=>$userId]);
      $categories = $cats->fetchAll();
      $subs = $pdo->prepare('SELECT id,name,category_id FROM subcategories WHERE user_id=:uid ORDER BY name');
      $subs->execute([':uid'=>$userId]);
      $subMap = [];
      foreach ($subs->fetchAll() as $s) { $subMap[$s['category_id']][] = ['id'=>$s['id'],'name'=>$s['name']]; }
      foreach ($categories as &$c) { $c['subcategories'] = $subMap[$c['id']] ?? []; }
      $accs = $pdo->prepare('SELECT id,name FROM accounts WHERE user_id=:uid ORDER BY name');
      $accs->execute([':uid'=>$userId]);
      $ccs = $pdo->prepare('SELECT id,name FROM cost_centers WHERE user_id=:uid ORDER BY name');
      $ccs->execute([':uid'=>$userId]);
      $pms = $pdo->prepare('SELECT id,name FROM payment_methods WHERE user_id=:uid ORDER BY name');
      $pms->execute([':uid'=>$userId]);
      $fees = $pdo->prepare('SELECT id,name,percent,payment_method_id FROM fees WHERE user_id=:uid ORDER BY name');
      $fees->execute([':uid'=>$userId]);
      $feeMap = [];
      foreach ($fees->fetchAll() as $f) { $feeMap[$f['payment_method_id']][] = ['id'=>$f['id'],'name'=>$f['name'],'percent'=>$f['percent']]; }
      $pmWithFees = array_map(function($pm) use($feeMap){ $pm['fees'] = $feeMap[$pm['id']] ?? []; return $pm; }, $pms->fetchAll());
      echo json_encode(['success'=>true,'catalogs'=>[
        'categories'=>$categories,
        'accounts'=>$accs->fetchAll(),
        'cost_centers'=>$ccs->fetchAll(),
        'payment_methods'=>$pmWithFees,
      ]]);
      exit;
    }
    if ($method === 'POST') {
      if (!$entity) throw new Exception('Entidade é obrigatória');
      switch ($entity) {
        case 'categories':
          $id = $input['id'] ?? uniqid('cat_');
          $stmt = $pdo->prepare('INSERT INTO categories (id,user_id,name,type) VALUES (:id,:uid,:name,:type)');
          $stmt->execute([':id'=>$id,':uid'=>$userId,':name'=>$input['name'],':type'=>$input['type']]);
          echo json_encode(['success'=>true,'item'=>['id'=>$id,'name'=>$input['name'],'type'=>$input['type']]]);
          exit;
        case 'subcategories':
          $id = $input['id'] ?? uniqid('sub_');
          $stmt = $pdo->prepare('INSERT INTO subcategories (id,user_id,category_id,name) VALUES (:id,:uid,:category_id,:name)');
          $stmt->execute([':id'=>$id,':uid'=>$userId,':category_id'=>$input['category_id'],':name'=>$input['name']]);
          echo json_encode(['success'=>true,'item'=>['id'=>$id,'name'=>$input['name'],'category_id'=>$input['category_id']]]);
          exit;
        case 'cost_centers':
          $id = $input['id'] ?? uniqid('cc_');
          $stmt = $pdo->prepare('INSERT INTO cost_centers (id,user_id,name) VALUES (:id,:uid,:name)');
          $stmt->execute([':id'=>$id,':uid'=>$userId,':name'=>$input['name']]);
          echo json_encode(['success'=>true,'item'=>['id'=>$id,'name'=>$input['name']]]);
          exit;
        case 'accounts':
          $id = $input['id'] ?? uniqid('acc_');
          $stmt = $pdo->prepare('INSERT INTO accounts (id,user_id,name) VALUES (:id,:uid,:name)');
          $stmt->execute([':id'=>$id,':uid'=>$userId,':name'=>$input['name']]);
          echo json_encode(['success'=>true,'item'=>['id'=>$id,'name'=>$input['name']]]);
          exit;
        case 'payment_methods':
          $id = $input['id'] ?? uniqid('pm_');
          $stmt = $pdo->prepare('INSERT INTO payment_methods (id,user_id,name) VALUES (:id,:uid,:name)');
          $stmt->execute([':id'=>$id,':uid'=>$userId,':name'=>$input['name']]);
          echo json_encode(['success'=>true,'item'=>['id'=>$id,'name'=>$input['name']]]);
          exit;
        case 'fees':
          $id = $input['id'] ?? uniqid('fee_');
          $stmt = $pdo->prepare('INSERT INTO fees (id,user_id,payment_method_id,name,percent) VALUES (:id,:uid,:pm,:name,:percent)');
          $stmt->execute([':id'=>$id,':uid'=>$userId,':pm'=>$input['payment_method_id'],':name'=>$input['name'],':percent'=>floatval($input['percent'])]);
          echo json_encode(['success'=>true,'item'=>['id'=>$id,'name'=>$input['name'],'payment_method_id'=>$input['payment_method_id'],'percent'=>floatval($input['percent'])]]);
          exit;
      }
      throw new Exception('Entidade inválida');
    }
    if ($method === 'DELETE') {
      if (!$entity) throw new Exception('Entidade é obrigatória');
      $id = $_GET['id'] ?? ($input['id'] ?? null);
      if (!$id) throw new Exception('ID é obrigatório');
      $table = null;
      switch ($entity) {
        case 'categories': $table = 'categories'; break;
        case 'subcategories': $table = 'subcategories'; break;
        case 'cost_centers': $table = 'cost_centers'; break;
        case 'accounts': $table = 'accounts'; break;
        case 'payment_methods': $table = 'payment_methods'; break;
        case 'fees': $table = 'fees'; break;
        default: throw new Exception('Entidade inválida');
      }
      $stmt = $pdo->prepare("DELETE FROM {$table} WHERE id=:id AND user_id=:uid");
      $stmt->execute([':id'=>$id,':uid'=>$userId]);
      echo json_encode(['success'=>true]);
      exit;
    }
    echo json_encode([ 'success' => false, 'message' => 'Método inválido' ]);
    exit;
  }

  // Fallback JSON (sem DB)
  $data = readJson($file);
  $catalogs = $data[$userId] ?? null;
  if (!$catalogs) {
    $catalogs = [
      'categories' => [
        [ 'id' => 'cat_inc_vendas', 'name' => 'Vendas', 'type' => 'income', 'subcategories' => [] ],
        [ 'id' => 'cat_inc_servicos', 'name' => 'Serviços', 'type' => 'income', 'subcategories' => [] ],
        [ 'id' => 'cat_exp_insumos', 'name' => 'Insumos', 'type' => 'expense', 'subcategories' => [ ['id'=>'sub_exp_insumos_mat','name'=>'Matéria-Prima'] ] ],
        [ 'id' => 'cat_exp_marketing', 'name' => 'Marketing', 'type' => 'expense', 'subcategories' => [ ['id'=>'sub_exp_mark_ads','name'=>'Anúncios'] ] ],
        [ 'id' => 'cat_exp_operacional', 'name' => 'Operacional', 'type' => 'expense', 'subcategories' => [] ],
        [ 'id' => 'cat_exp_impostos', 'name' => 'Impostos', 'type' => 'expense', 'subcategories' => [] ],
      ],
      'accounts' => [ [ 'id' => 'acc_main', 'name' => 'Conta Principal' ] ],
      'cost_centers' => [ [ 'id' => 'cc_geral', 'name' => 'Geral' ], [ 'id' => 'cc_loja', 'name' => 'Loja' ] ],
      'payment_methods' => [
        [ 'id' => 'pm_pix', 'name' => 'PIX', 'fees' => [] ],
        [ 'id' => 'pm_cash', 'name' => 'Dinheiro', 'fees' => [] ],
        [ 'id' => 'pm_card', 'name' => 'Cartão (Maquininha)', 'fees' => [
          [ 'id' => 'fee_debito', 'name' => 'Débito — 2%', 'percent' => 0.02 ],
          [ 'id' => 'fee_credito', 'name' => 'Crédito — 3.5%', 'percent' => 0.035 ],
          [ 'id' => 'fee_parcelado', 'name' => 'Parcelado — 5%', 'percent' => 0.05 ],
        ]],
      ],
    ];
    $data[$userId] = $catalogs;
    writeJson($file, $data);
  }
  echo json_encode([ 'success' => true, 'catalogs' => $catalogs ]);
} catch (Exception $e) {
  http_response_code(400);
  echo json_encode([ 'success' => false, 'message' => $e->getMessage() ]);
}