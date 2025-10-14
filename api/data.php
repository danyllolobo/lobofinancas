<?php
session_start();
header('Content-Type: application/json');
if (!isset($_SESSION['user_id'])) {
  echo json_encode([ 'success' => false, 'message' => 'Não autenticado' ]);
  exit;
}

// Params
$companyId = $_GET['company_id'] ?? null;
$status = $_GET['status'] ?? 'realizado';
$year = intval($_GET['year'] ?? date('Y'));
$month = $_GET['month'] ?? 'todos';

// Demo data generator
function demoTrend($month) {
  if ($month === 'todos') {
    $labels = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    $income = [12000,11000,13000,14000,13500,15000,16000,17000,16500,18000,17500,19000];
    $expense= [9000,8500,9500,9700,9900,10000,11000,11500,12000,12500,13000,13500];
  } else {
    $days = cal_days_in_month(CAL_GREGORIAN, intval($month), intval(date('Y')));
    $labels = range(1, $days);
    $income = array_map(fn($i)=> 400 + (int)(rand(0, 200)), $labels);
    $expense= array_map(fn($i)=> 300 + (int)(rand(0, 180)), $labels);
  }
  return [ 'labels' => $labels, 'income' => $income, 'expense' => $expense ];
}

$trend = demoTrend($month);
$sumIncome = array_sum($trend['income']);
$sumExpense = array_sum($trend['expense']);
// Include card fees impact: add 2% of income as fees to expenses (demo)
$cardFees = $sumIncome * 0.02;
$totalExpenseWithFees = $sumExpense + $cardFees;
$profit = $sumIncome - $totalExpenseWithFees;
$margin = $sumIncome ? $profit / $sumIncome : 0;

$categories = [
  'expense' => [ 'labels' => ['Insumos','Marketing','Operacional','Impostos'], 'values' => [35,25,30,10] ],
  'income'  => [ 'labels' => ['Vendas','Serviços','Assinaturas','Outros'], 'values' => [60,20,15,5] ],
];

$last = [
  [ 'description' => 'Venda #1023', 'type' => 'income', 'amount' => 450.00 ],
  [ 'description' => 'Compra de insumos', 'type' => 'expense', 'amount' => 220.00 ],
  [ 'description' => 'Mensalidade SaaS', 'type' => 'expense', 'amount' => 99.90 ],
  [ 'description' => 'Serviço de consultoria', 'type' => 'income', 'amount' => 1200.00 ],
  [ 'description' => 'Impostos', 'type' => 'expense', 'amount' => 310.00 ],
];

echo json_encode([
  'success' => true,
  'summary' => [
    'income' => $sumIncome,
    'expense' => $totalExpenseWithFees,
    'profit' => $profit,
    'margin' => $margin,
  ],
  'trend' => $trend,
  'categories' => $categories,
  'last_transactions' => $last,
]);