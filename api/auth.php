<?php
session_start();
header('Content-Type: application/json');

$storageDir = __DIR__ . '/../storage';
$usersFile = $storageDir . '/users.json';
if (!is_dir($storageDir)) { mkdir($storageDir, 0777, true); }
if (!file_exists($usersFile)) { file_put_contents($usersFile, json_encode([])); }

function readUsers($file) {
  $raw = file_get_contents($file);
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function writeUsers($file, $users) {
  file_put_contents($file, json_encode($users, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $input['action'] ?? ($_POST['action'] ?? '');

try {
  if ($action === 'register') {
    $name = trim($input['name'] ?? '');
    $email = strtolower(trim($input['email'] ?? ''));
    $password = $input['password'] ?? '';
    if (!$email || !$password) throw new Exception('Email e senha são obrigatórios');
    $users = readUsers($usersFile);
    foreach ($users as $u) { if ($u['email'] === $email) throw new Exception('Email já cadastrado'); }
    $id = uniqid('usr_');
    $user = [ 'id' => $id, 'name' => $name, 'email' => $email, 'password' => password_hash($password, PASSWORD_DEFAULT) ];
    $users[] = $user;
    writeUsers($usersFile, $users);
    $_SESSION['user_id'] = $id;
    echo json_encode([ 'success' => true, 'user' => [ 'id' => $id, 'name' => $name, 'email' => $email ] ]);
    exit;
  }
  if ($action === 'login') {
    $email = strtolower(trim($input['email'] ?? ''));
    $password = $input['password'] ?? '';
    $users = readUsers($usersFile);
    foreach ($users as $u) {
      if ($u['email'] === $email && password_verify($password, $u['password'])) {
        $_SESSION['user_id'] = $u['id'];
        echo json_encode([ 'success' => true, 'user' => [ 'id' => $u['id'], 'name' => $u['name'], 'email' => $u['email'] ] ]);
        exit;
      }
    }
    throw new Exception('Credenciais inválidas');
  }
  if ($action === 'logout') {
    session_destroy();
    echo json_encode([ 'success' => true ]);
    exit;
  }
  if ($action === 'oauth') {
    echo json_encode([ 'success' => false, 'message' => 'OAuth Google não configurado' ]);
    exit;
  }
  echo json_encode([ 'success' => false, 'message' => 'Ação inválida' ]);
} catch (Exception $e) {
  http_response_code(400);
  echo json_encode([ 'success' => false, 'message' => $e->getMessage() ]);
}