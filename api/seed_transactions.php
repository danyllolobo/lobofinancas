<?php
// Endpoint para semear transações de exemplo para o usuário logado.
// Útil para validar a UI em produção (paginação, filtros, dashboard).
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
  http_response_code(401);
  echo json_encode(['success' => false, 'message' => 'Não autenticado']);
  exit;
}

require_once __DIR__ . '/db.php';

try {
  $pdo = db();
  if (!$pdo) { throw new Exception('A conexão com o banco de dados não pôde ser estabelecida.'); }

  $userId = $_SESSION['user_id'];
  // Garante catálogos mínimos (categorias, contas, CC, formas de pagamento)
  seed_catalogs_if_empty($pdo, $userId);

  // Descobre company alvo: querystring ?company_id=... ou a primeira do usuário
  $companyId = isset($_GET['company_id']) ? trim($_GET['company_id']) : null;
  if (!$companyId) {
    $stmt = $pdo->prepare('SELECT id FROM companies WHERE user_id = :uid ORDER BY created_at ASC LIMIT 1');
    $stmt->execute([':uid' => $userId]);
    $companyId = $stmt->fetchColumn();
    if (!$companyId) {
      $companyId = uniqid('cmp_');
      $pdo->prepare('INSERT INTO companies (id,user_id,name) VALUES (:id,:uid,:name)')
          ->execute([':id'=>$companyId, ':uid'=>$userId, ':name'=>'Empresa Demo']);
    }
  }

  // Evita duplicar: só semeia se não houver transações ainda
  $check = $pdo->prepare('SELECT COUNT(*) FROM transactions WHERE user_id=:uid AND company_id=:cid');
  $check->execute([':uid'=>$userId, ':cid'=>$companyId]);
  $existing = intval($check->fetchColumn() ?: 0);
  if ($existing > 0) {
    echo json_encode(['success'=>true,'message'=>'Já existem transações para esta empresa. Nada a semear.','company_id'=>$companyId,'existing'=>$existing]);
    exit;
  }

  // Catálogos úteis
  $acc = $pdo->prepare('SELECT id FROM accounts WHERE user_id=:uid AND is_default=TRUE LIMIT 1');
  $acc->execute([':uid'=>$userId]);
  $defaultAcc = $acc->fetchColumn();
  if (!$defaultAcc) {
    $accAny = $pdo->prepare('SELECT id FROM accounts WHERE user_id=:uid ORDER BY name ASC LIMIT 1');
    $accAny->execute([':uid'=>$userId]);
    $defaultAcc = $accAny->fetchColumn();
  }
  $pmPix = $pdo->prepare("SELECT id FROM payment_methods WHERE user_id=:uid AND name='PIX' LIMIT 1");
  $pmPix->execute([':uid'=>$userId]);
  $pmPixId = $pmPix->fetchColumn();
  $pmCard = $pdo->prepare("SELECT id FROM payment_methods WHERE user_id=:uid AND name LIKE 'Cartão%' LIMIT 1");
  $pmCard->execute([':uid'=>$userId]);
  $pmCardId = $pmCard->fetchColumn();
  $ccGeral = $pdo->prepare("SELECT id FROM cost_centers WHERE user_id=:uid AND name='Geral' LIMIT 1");
  $ccGeral->execute([':uid'=>$userId]);
  $ccGeralId = $ccGeral->fetchColumn();
  $ccLoja = $pdo->prepare("SELECT id FROM cost_centers WHERE user_id=:uid AND name='Loja' LIMIT 1");
  $ccLoja->execute([':uid'=>$userId]);
  $ccLojaId = $ccLoja->fetchColumn();
  $catServ = $pdo->prepare("SELECT id FROM categories WHERE user_id=:uid AND name='Serviços' LIMIT 1");
  $catServ->execute([':uid'=>$userId]);
  $catServId = $catServ->fetchColumn();
  $catVend = $pdo->prepare("SELECT id FROM categories WHERE user_id=:uid AND name='Vendas' LIMIT 1");
  $catVend->execute([':uid'=>$userId]);
  $catVendId = $catVend->fetchColumn();
  $catMark = $pdo->prepare("SELECT id FROM categories WHERE user_id=:uid AND name='Marketing' LIMIT 1");
  $catMark->execute([':uid'=>$userId]);
  $catMarkId = $catMark->fetchColumn();
  $catOper = $pdo->prepare("SELECT id FROM categories WHERE user_id=:uid AND name='Operacional' LIMIT 1");
  $catOper->execute([':uid'=>$userId]);
  $catOperId = $catOper->fetchColumn();
  $catImp = $pdo->prepare("SELECT id FROM categories WHERE user_id=:uid AND name='Impostos' LIMIT 1");
  $catImp->execute([':uid'=>$userId]);
  $catImpId = $catImp->fetchColumn();

  // Helper para inserir
  $ins = $pdo->prepare("INSERT INTO transactions (id,user_id,company_id,description,amount,transaction_date,paid,type,account_id,category_id,subcategory_id,cost_center_id,payment_method_id,card_fee_id,fee_amount)
                         VALUES (:id,:uid,:cid,:desc,:amount,:date,:paid,:type,:acc,:cat,NULL,:cc,:pm,NULL,:fee_amount)");

  // Gerar 60 transações em dois meses para testar paginação e filtros
  $dates = [];
  // Mês atual e anterior
  $today = new DateTime();
  $monthCurr = new DateTime($today->format('Y-m-01'));
  $monthPrev = (clone $monthCurr)->modify('-1 month');
  // 30 dias de cada mês
  for ($d=1; $d<=30; $d++) {
    $dates[] = $monthPrev->format('Y-m-') . str_pad((string)$d, 2, '0', STR_PAD_LEFT);
    $dates[] = $monthCurr->format('Y-m-') . str_pad((string)$d, 2, '0', STR_PAD_LEFT);
  }

  $count = 0;
  foreach ($dates as $i => $date) {
    $isIncome = ($i % 3) !== 0; // 2/3 receitas, 1/3 despesas
    $amount = $isIncome ? (100 + ($i % 10) * 25) : (50 + ($i % 8) * 30);
    $desc = $isIncome ? 'Serviço ' . ($i+1) : 'Despesa ' . ($i+1);
    $paid = ($i % 4) !== 0; // alterna pago/pendente
    $type = $isIncome ? 'income' : 'expense';
    $pm = $isIncome ? ($pmCardId ?: $pmPixId) : ($pmPixId ?: $pmCardId);
    $cc = ($i % 5 === 0) ? $ccLojaId : $ccGeralId;
    $cat = $isIncome ? ($catServId ?: $catVendId) : ([$catMarkId, $catOperId, $catImpId][$i % 3] ?? $catOperId);
    $feePercent = ($isIncome && $pm === $pmCardId) ? (($i % 2 === 0) ? 0.02 : 0.035) : 0;
    $feeAmount = $isIncome ? ($amount * $feePercent) : 0;
    $ins->execute([
      ':id' => uniqid('tx_'),
      ':uid' => $userId,
      ':cid' => $companyId,
      ':desc' => $desc,
      ':amount' => $amount,
      ':date' => $date,
      ':paid' => $paid,
      ':type' => $type,
      ':acc' => $defaultAcc,
      ':cat' => $cat,
      ':cc' => $cc,
      ':pm' => $pm,
      ':fee_amount' => $feeAmount,
    ]);
    $count++;
  }

  echo json_encode(['success'=>true,'inserted'=>$count,'company_id'=>$companyId]);
  exit;
} catch (Exception $e) {
  http_response_code(400);
  echo json_encode(['success'=>false,'message'=>$e->getMessage()]);
}