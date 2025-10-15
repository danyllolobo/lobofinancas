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
$entity = $_GET['entity'] ?? null;
$companyId = $_GET['company_id'] ?? null;
$input = json_decode(file_get_contents('php://input'), true) ?? [];

try {
    $pdo = db();
    if (!$pdo) {
        throw new Exception('A conexão com o banco de dados não pôde ser estabelecida.');
    }
    // Semear catálogos por empresa quando company_id for fornecido; caso contrário, semear por usuário
    if ($companyId) {
        seed_catalogs_for_company_if_empty($pdo, $userId, $companyId);
    } else {
        seed_catalogs_if_empty($pdo, $userId);
    }

    if ($method === 'GET') {
        if ($entity) {
            switch ($entity) {
                case 'categories':
                    $stmt = $pdo->prepare('SELECT id,name,type FROM categories WHERE user_id=:uid AND company_id=:cid ORDER BY name');
                    $stmt->execute([':uid'=>$userId, ':cid'=>$companyId]);
                    echo json_encode(['success'=>true,'items'=>$stmt->fetchAll()]);
                    exit;
                case 'subcategories':
                    $stmt = $pdo->prepare('SELECT s.id,s.name,s.category_id,c.name as category_name, c.type as category_type FROM subcategories s JOIN categories c ON s.category_id=c.id WHERE s.user_id=:uid AND s.company_id=:cid ORDER BY c.name,s.name');
                    $stmt->execute([':uid'=>$userId, ':cid'=>$companyId]);
                    echo json_encode(['success'=>true,'items'=>$stmt->fetchAll()]);
                    exit;
                case 'cost_centers':
                    $stmt = $pdo->prepare('SELECT id,name FROM cost_centers WHERE user_id=:uid AND company_id=:cid ORDER BY name');
                    $stmt->execute([':uid'=>$userId, ':cid'=>$companyId]);
                    echo json_encode(['success'=>true,'items'=>$stmt->fetchAll()]);
                    exit;
                case 'accounts':
                    $stmt = $pdo->prepare('SELECT id,name,initial_balance,is_default FROM accounts WHERE user_id=:uid AND company_id=:cid ORDER BY name');
                    $stmt->execute([':uid'=>$userId, ':cid'=>$companyId]);
                    echo json_encode(['success'=>true,'items'=>$stmt->fetchAll()]);
                    exit;
                case 'payment_methods':
                    $stmt = $pdo->prepare('SELECT id,name FROM payment_methods WHERE user_id=:uid AND company_id=:cid ORDER BY name');
                    $stmt->execute([':uid'=>$userId, ':cid'=>$companyId]);
                    echo json_encode(['success'=>true,'items'=>$stmt->fetchAll()]);
                    exit;
                case 'fees':
                    $stmt = $pdo->prepare('SELECT f.id,f.name,f.percent,f.payment_method_id,pm.name as payment_method_name FROM fees f JOIN payment_methods pm ON pm.id=f.payment_method_id WHERE f.user_id=:uid AND f.company_id=:cid ORDER BY pm.name,f.name');
                    $stmt->execute([':uid'=>$userId, ':cid'=>$companyId]);
                    echo json_encode(['success'=>true,'items'=>$stmt->fetchAll()]);
                    exit;
            }
        }
        // Sem entity: retornar todo o conjunto (para o app carregar catálogos de uma vez)
        $cats = $pdo->prepare('SELECT id,name,type FROM categories WHERE user_id=:uid AND company_id=:cid ORDER BY name');
        $cats->execute([':uid' => $userId, ':cid' => $companyId]);
        $categories = $cats->fetchAll();
        $subs = $pdo->prepare('SELECT id,name,category_id FROM subcategories WHERE user_id=:uid AND company_id=:cid ORDER BY name');
        $subs->execute([':uid' => $userId, ':cid' => $companyId]);
        $subMap = [];
        foreach ($subs->fetchAll() as $s) { $subMap[$s['category_id']][] = ['id' => $s['id'], 'name' => $s['name']]; }
        foreach ($categories as &$c) { $c['subcategories'] = $subMap[$c['id']] ?? []; }
        $accs = $pdo->prepare('SELECT id,name,initial_balance,is_default FROM accounts WHERE user_id=:uid AND company_id=:cid ORDER BY name');
        $accs->execute([':uid' => $userId, ':cid' => $companyId]);
        $ccs = $pdo->prepare('SELECT id,name FROM cost_centers WHERE user_id=:uid AND company_id=:cid ORDER BY name');
        $ccs->execute([':uid' => $userId, ':cid' => $companyId]);
        $pms = $pdo->prepare('SELECT id,name FROM payment_methods WHERE user_id=:uid AND company_id=:cid ORDER BY name');
        $pms->execute([':uid' => $userId, ':cid' => $companyId]);
        $fees = $pdo->prepare('SELECT id,name,percent,payment_method_id FROM fees WHERE user_id=:uid AND company_id=:cid ORDER BY name');
        $fees->execute([':uid' => $userId, ':cid' => $companyId]);
        $feeMap = [];
        foreach ($fees->fetchAll() as $f) { $feeMap[$f['payment_method_id']][] = ['id' => $f['id'], 'name' => $f['name'], 'percent' => $f['percent']]; }
        $pmWithFees = array_map(function($pm) use ($feeMap) { $pm['fees'] = $feeMap[$pm['id']] ?? []; return $pm; }, $pms->fetchAll());
        echo json_encode(['success' => true, 'catalogs' => [
            'categories' => $categories,
            'accounts' => $accs->fetchAll(),
            'cost_centers' => $ccs->fetchAll(),
            'payment_methods' => $pmWithFees,
        ]]);
        exit;
    }

    if ($method === 'POST') {
        if (!$entity) throw new Exception('Entidade é obrigatória');
        // Lógica POST para criar novos itens
        switch ($entity) {
            case 'categories':
                $id = uniqid('cat_');
                $cid = $input['company_id'] ?? null; if (!$cid) throw new Exception('company_id é obrigatório');
                $stmt = $pdo->prepare('INSERT INTO categories (id,user_id,company_id,name,type) VALUES (:id,:uid,:cid,:name,:type)');
                $stmt->execute([':id' => $id, ':uid' => $userId, ':cid' => $cid, ':name' => $input['name'], ':type' => $input['type']]);
                echo json_encode(['success' => true, 'item' => ['id' => $id, 'name' => $input['name'], 'type' => $input['type']]]);
                exit;
            case 'subcategories':
                $id = uniqid('sub_');
                $cid = $input['company_id'] ?? null; if (empty($input['category_id']) || empty($input['name']) || !$cid) throw new Exception('Categoria, nome e company_id são obrigatórios');
                $stmt = $pdo->prepare('INSERT INTO subcategories (id,user_id,company_id,category_id,name) VALUES (:id,:uid,:cid,:cat,:name)');
                $stmt->execute([':id'=>$id,':uid'=>$userId,':cid'=>$cid,':cat'=>$input['category_id'],':name'=>$input['name']]);
                // Retornar com category_name para listagem
                $catName = $pdo->prepare('SELECT name FROM categories WHERE id=:id');
                $catName->execute([':id'=>$input['category_id']]);
                echo json_encode(['success'=>true,'item'=>['id'=>$id,'name'=>$input['name'],'category_id'=>$input['category_id'],'category_name'=>$catName->fetchColumn()]]);
                exit;
            case 'cost_centers':
                $id = uniqid('cc_');
                $cid = $input['company_id'] ?? null; if (!$cid) throw new Exception('company_id é obrigatório');
                $stmt = $pdo->prepare('INSERT INTO cost_centers (id,user_id,company_id,name) VALUES (:id,:uid,:cid,:name)');
                $stmt->execute([':id'=>$id,':uid'=>$userId,':cid'=>$cid,':name'=>$input['name']]);
                echo json_encode(['success'=>true,'item'=>['id'=>$id,'name'=>$input['name']]]);
                exit;
            case 'accounts':
                $id = uniqid('acc_');
                $cid = $input['company_id'] ?? null; if (!$cid) throw new Exception('company_id é obrigatório');
                $initial = isset($input['initial_balance']) ? floatval($input['initial_balance']) : 0;
                $isDefault = isset($input['is_default']) ? !!$input['is_default'] : false;
                // Guarantee at least one default account exists: if none, make this one default
                $check = $pdo->prepare('SELECT 1 FROM accounts WHERE user_id=:uid AND company_id=:cid AND is_default=TRUE LIMIT 1');
                $check->execute([':uid' => $userId, ':cid' => $cid]);
                $hasDefault = $check->fetchColumn() ? true : false;
                if (!$hasDefault && !$isDefault) { $isDefault = true; }
                $stmt = $pdo->prepare('INSERT INTO accounts (id,user_id,company_id,name,initial_balance,is_default) VALUES (:id,:uid,:cid,:name,:initial,:def)');
                $stmt->execute([':id'=>$id,':uid'=>$userId,':cid'=>$cid,':name'=>$input['name'],':initial'=>$initial,':def'=>$isDefault]);
                if ($isDefault) {
                    // Garantir apenas uma conta padrão por usuário+empresa (PostgreSQL boolean)
                    $pdo->prepare('UPDATE accounts SET is_default=FALSE WHERE user_id=:uid AND company_id=:cid AND id<>:id')->execute([':uid'=>$userId, ':cid'=>$cid, ':id'=>$id]);
                }
                echo json_encode(['success'=>true,'item'=>['id'=>$id,'name'=>$input['name'],'initial_balance'=>$initial,'is_default'=>$isDefault]]);
                exit;
            case 'payment_methods':
                $id = uniqid('pm_');
                $cid = $input['company_id'] ?? null; if (!$cid) throw new Exception('company_id é obrigatório');
                $stmt = $pdo->prepare('INSERT INTO payment_methods (id,user_id,company_id,name) VALUES (:id,:uid,:cid,:name)');
                $stmt->execute([':id'=>$id,':uid'=>$userId,':cid'=>$cid,':name'=>$input['name']]);
                echo json_encode(['success'=>true,'item'=>['id'=>$id,'name'=>$input['name']]]);
                exit;
            case 'fees':
                $id = uniqid('fee_');
                $cid = $input['company_id'] ?? null; if (empty($input['payment_method_id']) || !isset($input['percent']) || !$cid) throw new Exception('Forma de pagamento, percentual e company_id são obrigatórios');
                $stmt = $pdo->prepare('INSERT INTO fees (id,user_id,company_id,payment_method_id,name,percent) VALUES (:id,:uid,:cid,:pm,:name,:percent)');
                $stmt->execute([':id'=>$id,':uid'=>$userId,':cid'=>$cid,':pm'=>$input['payment_method_id'],':name'=>$input['name'],':percent'=>floatval($input['percent'])]);
                $pmName = $pdo->prepare('SELECT name FROM payment_methods WHERE id=:id');
                $pmName->execute([':id'=>$input['payment_method_id']]);
                echo json_encode(['success'=>true,'item'=>['id'=>$id,'name'=>$input['name'],'percent'=>floatval($input['percent']),'payment_method_id'=>$input['payment_method_id'],'payment_method_name'=>$pmName->fetchColumn()]]);
                exit;
        }
        throw new Exception('Entidade inválida para criação');
    }

    if ($method === 'PUT') {
        if (!$entity) throw new Exception('Entidade é obrigatória');
        $id = $input['id'] ?? null;
        if (!$id) throw new Exception('ID é obrigatório');
        $cid = $input['company_id'] ?? null;
        switch ($entity) {
            case 'categories':
                if (!$cid) throw new Exception('company_id é obrigatório');
                $stmt = $pdo->prepare('UPDATE categories SET name=:name WHERE id=:id AND user_id=:uid AND company_id=:cid');
                $stmt->execute([':name'=>$input['name'] ?? '', ':id'=>$id, ':uid'=>$userId, ':cid'=>$cid]);
                echo json_encode(['success'=>true]);
                exit;
            case 'subcategories':
                if (!$cid) throw new Exception('company_id é obrigatório');
                $stmt = $pdo->prepare('UPDATE subcategories SET name=:name WHERE id=:id AND user_id=:uid AND company_id=:cid');
                $stmt->execute([':name'=>$input['name'] ?? '', ':id'=>$id, ':uid'=>$userId, ':cid'=>$cid]);
                echo json_encode(['success'=>true]);
                exit;
            case 'cost_centers':
                if (!$cid) throw new Exception('company_id é obrigatório');
                $stmt = $pdo->prepare('UPDATE cost_centers SET name=:name WHERE id=:id AND user_id=:uid AND company_id=:cid');
                $stmt->execute([':name'=>$input['name'] ?? '', ':id'=>$id, ':uid'=>$userId, ':cid'=>$cid]);
                echo json_encode(['success'=>true]);
                exit;
            case 'accounts':
                $fields = [];
                if (!$cid) throw new Exception('company_id é obrigatório');
                $params = [':id'=>$id, ':uid'=>$userId, ':cid'=>$cid];
                if (array_key_exists('name',$input)) { $fields[] = 'name=:name'; $params[':name'] = $input['name']; }
                if (array_key_exists('initial_balance',$input)) { $fields[] = 'initial_balance=:initial'; $params[':initial'] = floatval($input['initial_balance']); }
                if (array_key_exists('is_default',$input)) { $fields[] = 'is_default=:def'; $params[':def'] = !!$input['is_default']; }
                if (empty($fields)) { echo json_encode(['success'=>true]); exit; }
                $sql = 'UPDATE accounts SET '.implode(', ',$fields).' WHERE id=:id AND user_id=:uid AND company_id=:cid';
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                if (array_key_exists('is_default',$input) && !!$input['is_default']) {
                    // Se esta conta virou padrão, desmarca as demais na mesma empresa (PostgreSQL boolean)
                    $pdo->prepare('UPDATE accounts SET is_default=FALSE WHERE user_id=:uid AND company_id=:cid AND id<>:id')->execute([':uid'=>$userId, ':cid'=>$cid, ':id'=>$id]);
                }
                echo json_encode(['success'=>true]);
                exit;
            case 'payment_methods':
                if (!$cid) throw new Exception('company_id é obrigatório');
                $stmt = $pdo->prepare('UPDATE payment_methods SET name=:name WHERE id=:id AND user_id=:uid AND company_id=:cid');
                $stmt->execute([':name'=>$input['name'] ?? '', ':id'=>$id, ':uid'=>$userId, ':cid'=>$cid]);
                echo json_encode(['success'=>true]);
                exit;
        }
        throw new Exception('Entidade inválida para atualização');
    }

    if ($method === 'DELETE') {
        if (!$entity) throw new Exception('Entidade é obrigatória');
        $id = $input['id'] ?? null;
        if (!$id) throw new Exception('ID é obrigatório');
        $cid = $input['company_id'] ?? null; if (!$cid) throw new Exception('company_id é obrigatório');
        $table = null;
        switch ($entity) {
            case 'categories': $table = 'categories'; break;
            case 'subcategories': $table = 'subcategories'; break;
            case 'cost_centers': $table = 'cost_centers'; break;
            case 'accounts': $table = 'accounts'; break;
            case 'payment_methods': $table = 'payment_methods'; break;
            case 'fees': $table = 'fees'; break;
        }
        if ($table) {
            $stmt = $pdo->prepare("DELETE FROM {$table} WHERE id=:id AND user_id=:uid AND company_id=:cid");
            $stmt->execute([':id' => $id, ':uid' => $userId, ':cid' => $cid]);
            echo json_encode(['success' => true]);
            exit;
        }
        throw new Exception('Entidade inválida para exclusão');
    }

    echo json_encode(['success' => false, 'message' => 'Método inválido']);

} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}