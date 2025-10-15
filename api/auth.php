<?php
session_start();
header('Content-Type: application/json');

require_once __DIR__ . '/db.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $input['action'] ?? ($_GET['action'] ?? ($_POST['action'] ?? '')); // Aceita GET para check-session

try {
    $pdo = db();
    if (!$pdo) { throw new Exception('A conexão com o banco de dados não pôde ser estabelecida.'); }
    // NOVA AÇÃO PARA VERIFICAR SESSÃO AO CARREGAR A PÁGINA
    if ($action === 'check-session') {
        if (!empty($_SESSION['user_id'])) {
            $stmt = $pdo->prepare('SELECT id, name, email FROM users WHERE id = :id');
            $stmt->execute([':id' => $_SESSION['user_id']]);
            $u = $stmt->fetch();
            if ($u) { echo json_encode(['success' => true, 'user' => $u]); exit; }
        }
        echo json_encode(['success' => false, 'message' => 'Nenhuma sessão ativa.']);
        exit;
    }

    if ($action === 'register') {
        $name = trim($input['name'] ?? '');
        $email = strtolower(trim($input['email'] ?? ''));
        $password = $input['password'] ?? '';
        if (!$email || !$password) throw new Exception('Email e senha são obrigatórios');
        // Verifica se já existe
        $stmt = $pdo->prepare('SELECT 1 FROM users WHERE email = :email');
        $stmt->execute([':email' => $email]);
        if ($stmt->fetchColumn()) throw new Exception('Email já cadastrado');
        // Cria usuário
        $id = uniqid('usr_');
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $pdo->prepare('INSERT INTO users (id, name, email, password) VALUES (:id,:name,:email,:password)')
            ->execute([':id'=>$id,':name'=>$name,':email'=>$email,':password'=>$hash]);
        // Seed de catálogos
        seed_catalogs_if_empty($pdo, $id);
        // Sessão
        $_SESSION['user_id'] = $id;
        echo json_encode([ 'success' => true, 'user' => [ 'id' => $id, 'name' => $name, 'email' => $email ] ]);
        exit;
    }
    if ($action === 'login') {
        $email = strtolower(trim($input['email'] ?? ''));
        $password = $input['password'] ?? '';
        $stmt = $pdo->prepare('SELECT id, name, email, password FROM users WHERE email = :email');
        $stmt->execute([':email' => $email]);
        $u = $stmt->fetch();
        if ($u && password_verify($password, $u['password'])) {
            $_SESSION['user_id'] = $u['id'];
            seed_catalogs_if_empty($pdo, $u['id']);
            echo json_encode([ 'success' => true, 'user' => [ 'id' => $u['id'], 'name' => $u['name'], 'email' => $u['email'] ] ]);
            exit;
        }
        throw new Exception('Credenciais inválidas');
    }
    if ($action === 'logout') {
        session_destroy();
        echo json_encode([ 'success' => true ]);
        exit;
    }
    
    echo json_encode([ 'success' => false, 'message' => 'Ação inválida' ]);
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([ 'success' => false, 'message' => $e->getMessage() ]);
}