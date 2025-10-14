<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
  echo json_encode([ 'success' => false, 'message' => 'Não autenticado' ]);
  exit;
}

$storageDir = __DIR__ . '/../storage';
$file = $storageDir . '/transactions.json';
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
$idParam = $_GET['id'] ?? null;
$input = json_decode(file_get_contents('php://input'), true) ?? [];

function computeSummaryAndCharts($items, $year, $month) {
  // Filter by date
  $labels = [];
  $incomeSeries = [];
  $expenseSeries = [];
  if ($month === 'todos') {
    $labels = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    for ($m=1; $m<=12; $m++) {
      $monthStr = str_pad($m, 2, '0', STR_PAD_LEFT);
      $incomeSeries[] = array_sum(array_map(fn($t)=> ($t['type']==='income' && substr($t['date'],0,7)==="$year-$monthStr") ? $t['amount'] : 0, $items));
      $expenseSeries[] = array_sum(array_map(fn($t)=> ($t['type']==='expense' && substr($t['date'],0,7)==="$year-$monthStr") ? $t['amount'] : 0, $items));
    }
  } else {
    $days = cal_days_in_month(CAL_GREGORIAN, intval($month), intval($year));
    for ($d=1; $d<=$days; $d++) {
      $labels[] = $d;
      $dayStr = str_pad($d, 2, '0', STR_PAD_LEFT);
      $incomeSeries[] = array_sum(array_map(fn($t)=> ($t['type']==='income' && substr($t['date'],0,10)==="$year-$month-$dayStr") ? $t['amount'] : 0, $items));
      $expenseSeries[] = array_sum(array_map(fn($t)=> ($t['type']==='expense' && substr($t['date'],0,10)==="$year-$month-$dayStr") ? $t['amount'] : 0, $items));
    }
  }

  $sumIncome = array_sum(array_map(fn($t)=> $t['type']==='income' ? $t['amount'] : 0, $items));
  $sumExpense = array_sum(array_map(fn($t)=> $t['type']==='expense' ? $t['amount'] : 0, $items));
  $fees = array_sum(array_map(fn($t)=> ($t['type']==='income' && isset($t['fee_percent']) && $t['fee_percent']>0) ? ($t['amount'] * $t['fee_percent']) : 0, $items));
  $expenseWithFees = $sumExpense + $fees;
  $profit = $sumIncome - $expenseWithFees;
  $margin = $sumIncome ? $profit / $sumIncome : 0;

  // Categories distribution
  $expCats = [];
  $incCats = [];
  foreach ($items as $t) {
    $key = $t['category_id'] ?? 'sem_categoria';
    if ($t['type']==='expense') {
      $expCats[$key] = ($expCats[$key] ?? 0) + $t['amount'];
    } else {
      $incCats[$key] = ($incCats[$key] ?? 0) + $t['amount'];
    }
  }
  return [
    'summary' => [ 'income' => $sumIncome, 'expense' => $expenseWithFees, 'profit' => $profit, 'margin' => $margin ],
    'trend' => [ 'labels' => $labels, 'income' => $incomeSeries, 'expense' => $expenseSeries ],
    'categories' => [
      'expense' => [ 'labels' => array_keys($expCats), 'values' => array_values($expCats) ],
      'income'  => [ 'labels' => array_keys($incCats), 'values' => array_values($incCats) ],
    ],
  ];
}

try {
  $all = readJson($file);
  // Initialize user store
  if (!isset($all[$userId])) { $all[$userId] = []; }
  if ($method === 'GET') {
    $companyId = $_GET['company_id'] ?? null;
    $status = $_GET['status'] ?? 'realizado'; // 'todas' | 'realizado' | 'projetado'
    $type = $_GET['type'] ?? null; // 'income' | 'expense'
    $year = intval($_GET['year'] ?? date('Y'));
    $month = $_GET['month'] ?? 'todos';
    $costCenter = $_GET['cost_center'] ?? 'todos';
    $categoryId = $_GET['category_id'] ?? 'todos';
    $items = array_values(array_filter($all[$userId], function($t) use($companyId, $status, $type, $costCenter, $categoryId) {
      if ($companyId && $t['company_id'] !== $companyId) return false;
      if ($status === 'realizado' && empty($t['status'])) return false;
      if ($status === 'projetado' && !empty($t['status'])) return false;
      if ($type && $t['type'] !== $type) return false;
      if ($costCenter !== 'todos' && ($t['cost_center_id'] ?? null) !== $costCenter) return false;
      if ($categoryId !== 'todos' && ($t['category_id'] ?? null) !== $categoryId) return false;
      return true;
    }));
    $charts = computeSummaryAndCharts($items, $year, $month);
    // Last transactions (by date desc)
    usort($items, fn($a,$b)=> strcmp($b['date'], $a['date']));
    $last = array_slice(array_map(function($t){
      return [ 'description' => $t['description'], 'type' => $t['type'], 'amount' => $t['amount'] ];
    }, $items), 0, 5);
    echo json_encode(array_merge([ 'success' => true, 'items' => $items, 'last_transactions' => $last ], $charts));
    exit;
  }
  if ($method === 'POST') {
    $required = ['company_id','type','description','amount','date','account_id','category_id'];
    foreach ($required as $k) { if (!isset($input[$k]) || $input[$k]==='') throw new Exception("Campo obrigatório ausente: $k"); }
    $tx = [
      'id' => uniqid('tx_'),
      'user_id' => $userId,
      'company_id' => $input['company_id'],
      'type' => $input['type'], // 'income' | 'expense'
      'description' => trim($input['description']),
      'amount' => floatval($input['amount']),
      'date' => $input['date'], // YYYY-MM-DD
      'account_id' => $input['account_id'],
      'category_id' => $input['category_id'],
      'subcategory_id' => $input['subcategory_id'] ?? null,
      'cost_center_id' => $input['cost_center_id'] ?? null,
      'payment_method_id' => $input['payment_method_id'] ?? null,
      'fee_percent' => isset($input['fee_percent']) ? floatval($input['fee_percent']) : 0,
      'status' => !!($input['status'] ?? false),
    ];
    $all[$userId][] = $tx;
    writeJson($file, $all);
    echo json_encode([ 'success' => true, 'item' => $tx ]);
    exit;
  }
  // Update transaction
  if ($method === 'PUT') {
    $id = $input['id'] ?? null;
    if (!$id) throw new Exception('ID da transação é obrigatório para atualização');
    $found = false;
    foreach ($all[$userId] as &$t) {
      if ($t['id'] === $id) {
        // Atualiza campos permitidos
        $t['description'] = isset($input['description']) ? trim($input['description']) : $t['description'];
        $t['amount'] = isset($input['amount']) ? floatval($input['amount']) : $t['amount'];
        $t['date'] = isset($input['date']) ? $input['date'] : $t['date'];
        $t['account_id'] = $input['account_id'] ?? $t['account_id'];
        $t['category_id'] = $input['category_id'] ?? $t['category_id'];
        $t['subcategory_id'] = $input['subcategory_id'] ?? $t['subcategory_id'];
        $t['cost_center_id'] = $input['cost_center_id'] ?? $t['cost_center_id'];
        $t['payment_method_id'] = $input['payment_method_id'] ?? $t['payment_method_id'];
        $t['fee_percent'] = isset($input['fee_percent']) ? floatval($input['fee_percent']) : ($t['fee_percent'] ?? 0);
        $t['status'] = isset($input['status']) ? !!$input['status'] : $t['status'];
        $found = true;
        break;
      }
    }
    if (!$found) throw new Exception('Transação não encontrada');
    writeJson($file, $all);
    echo json_encode([ 'success' => true ]);
    exit;
  }
  // Delete transaction
  if ($method === 'DELETE') {
    $id = $idParam ?: ($input['id'] ?? null);
    if (!$id) throw new Exception('ID da transação é obrigatório para exclusão');
    $before = count($all[$userId]);
    $all[$userId] = array_values(array_filter($all[$userId], fn($t)=> $t['id'] !== $id));
    if ($before === count($all[$userId])) throw new Exception('Transação não encontrada');
    writeJson($file, $all);
    echo json_encode([ 'success' => true ]);
    exit;
  }
  echo json_encode([ 'success' => false, 'message' => 'Método inválido' ]);
} catch (Exception $e) {
  http_response_code(400);
  echo json_encode([ 'success' => false, 'message' => $e->getMessage() ]);
}