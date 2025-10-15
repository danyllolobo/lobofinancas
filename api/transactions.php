<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Não autenticado']);
    exit;
}

require_once __DIR__ . '/db.php';

$userId = $_SESSION['user_id'];
$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true) ?? [];

try {
    $pdo = db();
    if (!$pdo) {
        throw new Exception('A conexão com o banco de dados não pôde ser estabelecida.');
    }

    // =========================
    //       GET (LISTAR)
    // =========================
    if ($method === 'GET') {
        $params = [':uid' => $userId];
        // Inclui fee_percent derivado de fee_amount/amount para simplificar consumo no frontend
        $sql = "SELECT t.*, c.name as category_name,
                       CASE WHEN t.amount > 0 THEN (t.fee_amount / t.amount) ELSE 0 END AS fee_percent
                FROM transactions t
                LEFT JOIN categories c ON t.category_id = c.id
                WHERE t.user_id = :uid";

        if (!empty($_GET['company_id'])) {
            $sql .= " AND t.company_id = :cid";
            $params[':cid'] = $_GET['company_id'];
        }
        if (!empty($_GET['status'])) {
            if ($_GET['status'] === 'realizado') $sql .= " AND t.paid = TRUE";
            if ($_GET['status'] === 'projetado') $sql .= " AND t.paid = FALSE";
        }
        // Tipo: ignorar valores nulos/todos enviados pelo frontend (ex.: "null")
        $typeParam = $_GET['type'] ?? null;
        if ($typeParam !== null && $typeParam !== '' && strtolower($typeParam) !== 'null' && strtolower($typeParam) !== 'todos') {
            $sql .= " AND t.type = :type";
            $params[':type'] = $typeParam;
        }
        if (!empty($_GET['cost_center']) && $_GET['cost_center'] !== 'todos') {
            $sql .= " AND t.cost_center_id = :ccid";
            $params[':ccid'] = $_GET['cost_center'];
        }
        if (!empty($_GET['category_id']) && $_GET['category_id'] !== 'todos') {
            $sql .= " AND t.category_id = :catid";
            $params[':catid'] = $_GET['category_id'];
        }
        if (!empty($_GET['year'])) {
            $year = intval($_GET['year']);
            if (!empty($_GET['month']) && $_GET['month'] !== 'todos') {
                $month = str_pad(intval($_GET['month']), 2, '0', STR_PAD_LEFT);
                $sql .= " AND EXTRACT(YEAR FROM t.transaction_date) = :year AND EXTRACT(MONTH FROM t.transaction_date) = :month";
                $params[':year'] = $year;
                $params[':month'] = intval($month);
            } else {
                $sql .= " AND EXTRACT(YEAR FROM t.transaction_date) = :year";
                $params[':year'] = $year;
            }
        }
        
        $sql .= " ORDER BY t.transaction_date DESC";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $raw = $stmt->fetchAll();

        // Normaliza campos para o frontend: date, status, fee_percent
        $items = array_map(function($t) {
            return [
                'id' => $t['id'],
                'company_id' => $t['company_id'],
                'description' => $t['description'],
                'amount' => floatval($t['amount']),
                'date' => $t['transaction_date'],
                'status' => !!$t['paid'],
                'type' => $t['type'],
                'account_id' => $t['account_id'],
                'category_id' => $t['category_id'],
                'subcategory_id' => $t['subcategory_id'],
                'cost_center_id' => $t['cost_center_id'],
                'payment_method_id' => $t['payment_method_id'],
                'fee_percent' => isset($t['fee_percent']) ? floatval($t['fee_percent']) : 0,
            ];
        }, $raw);

        // Últimas transações (5 mais recentes)
        usort($items, function($a,$b){ return strcmp($b['date'], $a['date']); });
        $last_transactions = array_map(function($t){
            return [ 'description' => $t['description'], 'type' => $t['type'], 'amount' => $t['amount'] ];
        }, array_slice($items, 0, 5));

        // Cálculo do Dashboard (summary, trend, categories)
        $status = $_GET['status'] ?? null; // 'realizado'|'projetado'
        $costCenter = $_GET['cost_center'] ?? null; // id|'todos'
        $year = isset($_GET['year']) ? intval($_GET['year']) : null;
        $month = $_GET['month'] ?? 'todos';

        // Filtra itens conforme status/cost_center para o cálculo
        $calcItems = array_filter($items, function($t) use ($status, $costCenter) {
            $okStatus = ($status === 'realizado') ? ($t['status'] === true) : (($status === 'projetado') ? ($t['status'] === false) : true);
            $okCC = (!$costCenter || $costCenter === 'todos') ? true : ($t['cost_center_id'] === $costCenter);
            return $okStatus && $okCC;
        });

        // Trend
        $trend = [ 'labels' => [], 'income' => [], 'expense' => [] ];
        if ($year && $month === 'todos') {
            $trend['labels'] = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
            for ($m=1; $m<=12; $m++) {
                $mStr = str_pad((string)$m, 2, '0', STR_PAD_LEFT);
                $inc = 0; $exp = 0;
                foreach ($calcItems as $t) {
                    if (strpos($t['date'], $year.'-'.$mStr) === 0) {
                        if ($t['type'] === 'income') $inc += $t['amount'];
                        if ($t['type'] === 'expense') $exp += $t['amount'];
                    }
                }
                $trend['income'][] = $inc;
                $trend['expense'][] = $exp;
            }
        } else if ($year && $month && $month !== 'todos') {
            $days = (int)date('t', strtotime($year.'-'.$month.'-01'));
            $trend['labels'] = range(1, $days);
            for ($d=1; $d<=$days; $d++) {
                $dStr = str_pad((string)$d, 2, '0', STR_PAD_LEFT);
                $inc = 0; $exp = 0;
                foreach ($calcItems as $t) {
                    if ($t['date'] === ($year.'-'.$month.'-'.$dStr)) {
                        if ($t['type'] === 'income') $inc += $t['amount'];
                        if ($t['type'] === 'expense') $exp += $t['amount'];
                    }
                }
                $trend['income'][] = $inc;
                $trend['expense'][] = $exp;
            }
        }

        // Summary e taxas
        $sumIncome = 0; $sumExpense = 0; $feesIncome = 0;
        foreach ($calcItems as $t) {
            if ($t['type'] === 'income') { $sumIncome += $t['amount']; $feesIncome += ($t['fee_percent'] ?? 0) * $t['amount']; }
            else if ($t['type'] === 'expense') { $sumExpense += $t['amount']; }
        }
        $profit = $sumIncome - ($sumExpense + $feesIncome);
        $summary = [
            'income' => $sumIncome,
            'expense' => $sumExpense + $feesIncome,
            'profit' => $profit,
            'margin' => $sumIncome ? ($profit / $sumIncome) : 0,
        ];

        // Categorias (sum por category_id) — labels devem ser NOME e não ID
        $expMap = []; $incMap = [];
        foreach ($calcItems as $t) {
            $key = $t['category_id'] ?: '—';
            if ($t['type'] === 'expense') { $expMap[$key] = ($expMap[$key] ?? 0) + $t['amount']; }
            else if ($t['type'] === 'income') { $incMap[$key] = ($incMap[$key] ?? 0) + $t['amount']; }
        }
        // Mapa de ID -> nome da categoria, obtido do SELECT (LEFT JOIN categories)
        $catNameMap = [];
        foreach ($raw as $row) {
            if (!empty($row['category_id'])) {
                $catNameMap[$row['category_id']] = $row['category_name'] ?? $row['category_id'];
            }
        }
        $labelsExpIds = array_keys($expMap);
        $labelsIncIds = array_keys($incMap);
        $labelsExp = array_map(function($id) use ($catNameMap) { return $id === '—' ? 'Sem Categoria' : ($catNameMap[$id] ?? $id); }, $labelsExpIds);
        $labelsInc = array_map(function($id) use ($catNameMap) { return $id === '—' ? 'Sem Categoria' : ($catNameMap[$id] ?? $id); }, $labelsIncIds);
        $categories = [
            'expense' => [ 'labels' => $labelsExp, 'values' => array_values($expMap) ],
            'income' => [ 'labels' => $labelsInc, 'values' => array_values($incMap) ],
        ];

        echo json_encode([
            'success' => true,
            'items' => $items,
            'summary' => $summary,
            'trend' => $trend,
            'categories' => $categories,
            'last_transactions' => $last_transactions,
        ]);
        exit;
    }

    // =========================
    //       POST (CRIAR)
    // =========================
    if ($method === 'POST') {
        $id = uniqid('tx_');
        // Calcula fee_amount a partir de fee_percent (quando houver e tipo income)
        $amount = floatval($input['amount'] ?? 0);
        $feePercent = floatval($input['fee_percent'] ?? 0);
        $type = $input['type'] ?? 'income';
        $feeAmount = ($type === 'income' && $amount > 0) ? ($amount * $feePercent) : 0;

        $sql = "INSERT INTO transactions (id, user_id, company_id, description, amount, transaction_date, paid, type, account_id, category_id, subcategory_id, cost_center_id, payment_method_id, card_fee_id, fee_amount)
                VALUES (:id, :uid, :cid, :desc, :amount, :date, :paid, :type, :acc, :cat, :sub, :cc, :pm, :fee_id, :fee_amount)";

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':id' => $id,
            ':uid' => $userId,
            ':cid' => $input['company_id'],
            ':desc' => $input['description'],
            ':amount' => $amount,
            ':date' => $input['date'],
            ':paid' => $input['status'] ?? false,
            ':type' => $type,
            ':acc' => $input['account_id'] ?? null,
            ':cat' => $input['category_id'] ?? null,
            ':sub' => $input['subcategory_id'] ?? null,
            ':cc' => $input['cost_center_id'] ?? null,
            ':pm' => $input['payment_method_id'] ?? null,
            ':fee_id' => null,
            ':fee_amount' => $feeAmount
        ]);

        // Retorna item normalizado
        $returnItem = ['id' => $id] + $input;
        echo json_encode(['success' => true, 'item' => $returnItem]);
        exit;
    }

    // =========================
    //       PUT (ATUALIZAR)
    // =========================
    if ($method === 'PUT') {
        $id = $input['id'] ?? null;
        if (!$id) throw new Exception('ID da transação é obrigatório para atualização');

        // Atualização dinâmica: apenas os campos presentes serão atualizados
        $fields = [];
        $params = [ ':id' => $id, ':uid' => $userId ];
        if (array_key_exists('description', $input)) { $fields[] = 'description = :desc'; $params[':desc'] = $input['description']; }
        if (array_key_exists('amount', $input)) { $fields[] = 'amount = :amount'; $params[':amount'] = $input['amount']; }
        if (array_key_exists('date', $input)) { $fields[] = 'transaction_date = :date'; $params[':date'] = $input['date']; }
        if (array_key_exists('status', $input)) { $fields[] = 'paid = :paid'; $params[':paid'] = !!$input['status']; }
        if (array_key_exists('account_id', $input)) { $fields[] = 'account_id = :acc'; $params[':acc'] = $input['account_id'] ?? null; }
        if (array_key_exists('category_id', $input)) { $fields[] = 'category_id = :cat'; $params[':cat'] = $input['category_id'] ?? null; }
        if (array_key_exists('subcategory_id', $input)) { $fields[] = 'subcategory_id = :sub'; $params[':sub'] = $input['subcategory_id'] ?? null; }
        if (array_key_exists('cost_center_id', $input)) { $fields[] = 'cost_center_id = :cc'; $params[':cc'] = $input['cost_center_id'] ?? null; }
        if (array_key_exists('payment_method_id', $input)) { $fields[] = 'payment_method_id = :pm'; $params[':pm'] = $input['payment_method_id'] ?? null; }

        // fee_amount derivado de fee_percent quando informado
        if (array_key_exists('fee_percent', $input)) {
            $feePercent = floatval($input['fee_percent']);
            $amount = null; $type = null;
            if (array_key_exists('amount', $input)) { $amount = floatval($input['amount']); }
            if (array_key_exists('type', $input)) { $type = $input['type']; }
            if ($amount === null || $type === null) {
                $s = $pdo->prepare("SELECT amount, type FROM transactions WHERE id = :id AND user_id = :uid");
                $s->execute([':id' => $id, ':uid' => $userId]);
                $row = $s->fetch();
                $amount = $amount ?? floatval($row['amount'] ?? 0);
                $type = $type ?? ($row['type'] ?? 'income');
            }
            $feeAmount = ($type === 'income' && $amount > 0) ? ($amount * $feePercent) : 0;
            $fields[] = 'fee_amount = :fee_amount';
            $params[':fee_amount'] = $feeAmount;
        }

        if (empty($fields)) { echo json_encode(['success' => true]); exit; }
        $sql = 'UPDATE transactions SET ' . implode(', ', $fields) . ' WHERE id = :id AND user_id = :uid';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        echo json_encode(['success' => true]);
        exit;
    }

    if ($method === 'DELETE') {
        $id = $_GET['id'] ?? null;
        if (!$id) throw new Exception('ID da transação é obrigatório para exclusão');

        $stmt = $pdo->prepare("DELETE FROM transactions WHERE id = :id AND user_id = :uid");
        $stmt->execute([':id' => $id, ':uid' => $userId]);
        
        echo json_encode(['success' => true]);
        exit;
    }

    // =========================
    //      DELETE (EXCLUIR)
    // =========================
    if ($method === 'DELETE') {
        // O ID pode vir via JSON ou querystring
        $id = $input['id'] ?? ($_GET['id'] ?? null);

        if (empty($id)) {
            throw new Exception('ID da transação é obrigatório para exclusão.');
        }

        $stmt = $pdo->prepare("DELETE FROM transactions WHERE id = :id AND user_id = :uid");
        $stmt->execute([':id' => $id, ':uid' => $userId]);

        if ($stmt->rowCount() === 0) {
            throw new Exception('Transação não encontrada ou não pertence ao usuário.');
        }

        echo json_encode(['success' => true, 'message' => 'Transação excluída com sucesso.']);
        exit;
    }

    // =========================
    //      MÉTODO INVÁLIDO
    // =========================
    echo json_encode(['success' => false, 'message' => 'Método inválido.']);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
