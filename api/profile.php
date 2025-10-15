<?php
session_start();
header('Content-Type: application/json');

require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? ($_POST['action'] ?? null);
$input = null;
if (in_array($method, ['POST','PUT','DELETE'])) {
  $raw = file_get_contents('php://input');
  if ($raw && stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== false) {
    $input = json_decode($raw, true) ?? [];
  } else {
    // Para multipart/form-data ou x-www-form-urlencoded
    $input = $_POST;
  }
}

try {
  $pdo = db();
  if (!$pdo) { throw new Exception('A conexão com o banco de dados não pôde ser estabelecida.'); }
  if (!isset($_SESSION['user_id'])) { http_response_code(401); echo json_encode(['success'=>false,'message'=>'Não autenticado']); exit; }
  $userId = $_SESSION['user_id'];

  if ($method === 'GET') {
    // Retorna dados do perfil
    $stmt = $pdo->prepare('SELECT id, name, email, COALESCE(avatar_url, \'\') AS avatar_url FROM users WHERE id = :id');
    $stmt->execute([':id' => $userId]);
    $u = $stmt->fetch();
    if (!$u) { throw new Exception('Usuário não encontrado'); }
    echo json_encode(['success'=>true,'user'=>$u]);
    exit;
  }

  if ($method === 'PUT') {
    $action = $action ?? ($input['action'] ?? null);
    if ($action === 'update-basic') {
      $name = trim($input['name'] ?? '') ?: null;
      $email = strtolower(trim($input['email'] ?? '')) ?: null;
      if ($email) {
        // Evita colisão de email
        $chk = $pdo->prepare('SELECT 1 FROM users WHERE email = :email AND id <> :id');
        $chk->execute([':email'=>$email, ':id'=>$userId]);
        if ($chk->fetchColumn()) { throw new Exception('Email já está em uso por outro usuário'); }
      }
      $fields = [];$params = [':id'=>$userId];
      if ($name !== null) { $fields[] = 'name = :name'; $params[':name'] = $name; }
      if ($email !== null) { $fields[] = 'email = :email'; $params[':email'] = $email; }
      if (!$fields) { echo json_encode(['success'=>true]); exit; }
      $sql = 'UPDATE users SET '.implode(', ', $fields).' WHERE id = :id';
      $pdo->prepare($sql)->execute($params);
      echo json_encode(['success'=>true]);
      exit;
    }
    if ($action === 'change-password') {
      $current = $input['current_password'] ?? '';
      $new = $input['new_password'] ?? '';
      if (!$current || !$new) { throw new Exception('Informe a senha atual e a nova senha'); }
      $stmt = $pdo->prepare('SELECT password FROM users WHERE id = :id');
      $stmt->execute([':id'=>$userId]);
      $row = $stmt->fetch();
      if (!$row || !password_verify($current, $row['password'])) { throw new Exception('Senha atual incorreta'); }
      $hash = password_hash($new, PASSWORD_DEFAULT);
      $pdo->prepare('UPDATE users SET password = :pwd WHERE id = :id')->execute([':pwd'=>$hash, ':id'=>$userId]);
      echo json_encode(['success'=>true]);
      exit;
    }
    echo json_encode(['success'=>false,'message'=>'Ação inválida']);
    exit;
  }

  if ($method === 'POST') {
    $action = $action ?? ($input['action'] ?? null);
    if ($action === 'upload-avatar') {
      if (!isset($_FILES['avatar'])) { throw new Exception('Arquivo de avatar é obrigatório'); }
      $file = $_FILES['avatar'];
      if ($file['error'] !== UPLOAD_ERR_OK) { throw new Exception('Falha no upload do arquivo'); }
      $allowed = ['image/jpeg' => 'jpg', 'image/png' => 'png'];
      $type = mime_content_type($file['tmp_name']);
      if (!isset($allowed[$type])) { throw new Exception('Formato de imagem inválido. Use JPG ou PNG'); }
      $ext = $allowed[$type];
      $dir = __DIR__ . '/../uploads/avatars';
      if (!is_dir($dir)) { mkdir($dir, 0777, true); }
      $filename = $userId . '.' . $ext;
      $path = $dir . DIRECTORY_SEPARATOR . $filename;
      // Move arquivo
      if (!move_uploaded_file($file['tmp_name'], $path)) { throw new Exception('Não foi possível salvar o arquivo'); }
      // URL pública relativa
      $url = '/uploads/avatars/' . $filename;
      $pdo->prepare('UPDATE users SET avatar_url = :url WHERE id = :id')->execute([':url'=>$url, ':id'=>$userId]);
      echo json_encode(['success'=>true,'avatar_url'=>$url]);
      exit;
    }
    echo json_encode(['success'=>false,'message'=>'Ação inválida']);
    exit;
  }

  if ($method === 'DELETE') {
    $action = $action ?? ($input['action'] ?? null);
    if ($action === 'delete-account') {
      $confirm = strtoupper(trim($input['confirm'] ?? ''));
      if ($confirm !== 'DELETAR') { throw new Exception('Para excluir, digite DELETAR para confirmar'); }
      // Remove dados do usuário em ordem para evitar FK
      $pdo->beginTransaction();
      try {
        $params = [':uid' => $userId];
        $pdo->prepare('DELETE FROM transactions     WHERE user_id = :uid')->execute($params);
        $pdo->prepare('DELETE FROM fees             WHERE user_id = :uid')->execute($params);
        $pdo->prepare('DELETE FROM payment_methods  WHERE user_id = :uid')->execute($params);
        $pdo->prepare('DELETE FROM accounts         WHERE user_id = :uid')->execute($params);
        $pdo->prepare('DELETE FROM cost_centers     WHERE user_id = :uid')->execute($params);
        $pdo->prepare('DELETE FROM subcategories    WHERE user_id = :uid')->execute($params);
        $pdo->prepare('DELETE FROM categories       WHERE user_id = :uid')->execute($params);
        $pdo->prepare('DELETE FROM companies        WHERE user_id = :uid')->execute($params); // tem FK CASCADE, mas garantimos
        $pdo->prepare('DELETE FROM users            WHERE id = :uid')->execute($params);
        $pdo->commit();
      } catch (Throwable $e) {
        $pdo->rollBack(); throw $e;
      }
      session_destroy();
      echo json_encode(['success'=>true]);
      exit;
    }
    echo json_encode(['success'=>false,'message'=>'Ação inválida']);
    exit;
  }

  echo json_encode(['success'=>false,'message'=>'Método inválido']);
} catch (Throwable $e) {
  http_response_code(400);
  echo json_encode(['success'=>false,'message'=>$e->getMessage()]);
}