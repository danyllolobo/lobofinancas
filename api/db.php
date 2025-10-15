<?php
// Timezone padrão da aplicação
date_default_timezone_set('America/Belem');
// Carrega variáveis de ambiente de um arquivo .env (quando presente)
function load_env() {
  $envFile = __DIR__ . '/../.env';
  if (!file_exists($envFile)) return;
  $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
  foreach ($lines as $line) {
    if (strpos(trim($line), '#') === 0) continue;
    [$k, $v] = array_pad(explode('=', $line, 2), 2, null);
    if ($k && $v && getenv($k) === false) { putenv("{$k}={$v}"); }
  }
}

// Conexão segura com PostgreSQL via PDO
function db() {
  static $pdo = null;
  if ($pdo) return $pdo;
  load_env();
  if (!extension_loaded('pdo_pgsql')) {
    error_log('DB connection error: pdo_pgsql extension is not loaded');
    throw new Exception('Extensão pdo_pgsql não está habilitada no PHP. Habilite-a no php.ini.');
  }
  $host = getenv('PGHOST') ?: null;
  $port = getenv('PGPORT') ?: '5432';
  $db   = getenv('PGDATABASE') ?: null;
  $user = getenv('PGUSER') ?: null;
  $pass = getenv('PGPASSWORD') ?: null;
  $sslmode = getenv('PGSSLMODE') ?: null; // prefer|require|verify-ca|verify-full
  if (!$host || !$db || !$user) return null;
  $dsn = "pgsql:host={$host};port={$port};dbname={$db}";
  if ($sslmode) $dsn .= ";sslmode={$sslmode}";
  try {
    $pdo = new PDO($dsn, $user, $pass, [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    ensure_schema($pdo);
    return $pdo;
  } catch (Throwable $e) {
    error_log('DB connection error: '.$e->getMessage());
    throw $e;
  }
}

function ensure_schema(PDO $pdo) {
    $sql = [
        // Usuários e Empresas
        "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)",
        // Catálogos básicos (existentes)
        "CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS subcategories (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE, name TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS cost_centers (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, initial_balance NUMERIC DEFAULT 0, is_default BOOLEAN DEFAULT FALSE)",
        "CREATE TABLE IF NOT EXISTS payment_methods (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS fees (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, payment_method_id TEXT NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE, name TEXT NOT NULL, percent REAL NOT NULL)",
        
        // COMANDO FALTANTE PARA CRIAR A TABELA DE TRANSAÇÕES
        "CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            company_id TEXT NOT NULL,
            description TEXT NOT NULL,
            amount NUMERIC NOT NULL,
            transaction_date DATE NOT NULL,
            paid BOOLEAN DEFAULT FALSE,
            type TEXT NOT NULL,
            fee_amount NUMERIC DEFAULT 0,
            account_id TEXT REFERENCES accounts(id),
            category_id TEXT REFERENCES categories(id),
            subcategory_id TEXT REFERENCES subcategories(id),
            cost_center_id TEXT REFERENCES cost_centers(id),
            payment_method_id TEXT REFERENCES payment_methods(id),
            card_fee_id TEXT REFERENCES fees(id),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )"
    ];
    foreach ($sql as $q) { $pdo->exec($q); }
}

function seed_catalogs_if_empty(PDO $pdo, string $userId) {
  $hasCat = $pdo->query("SELECT 1 FROM categories WHERE user_id = '{$userId}' LIMIT 1")->fetchColumn();
  if ($hasCat) return; // já possui dados
  // Seed padrão
  $cats = [
    ['id'=>'cat_inc_vendas','name'=>'Vendas','type'=>'income'],
    ['id'=>'cat_inc_servicos','name'=>'Serviços','type'=>'income'],
    ['id'=>'cat_exp_insumos','name'=>'Insumos','type'=>'expense'],
    ['id'=>'cat_exp_marketing','name'=>'Marketing','type'=>'expense'],
    ['id'=>'cat_exp_operacional','name'=>'Operacional','type'=>'expense'],
    ['id'=>'cat_exp_impostos','name'=>'Impostos','type'=>'expense'],
  ];
  $stmt = $pdo->prepare("INSERT INTO categories (id,user_id,name,type) VALUES (:id,:uid,:name,:type)");
  foreach ($cats as $c) { $stmt->execute([':id'=>$c['id'],':uid'=>$userId,':name'=>$c['name'],':type'=>$c['type']]); }
  $stmtS = $pdo->prepare("INSERT INTO subcategories (id,user_id,category_id,name) VALUES (:id,:uid,:category_id,:name)");
  $stmtS->execute([':id'=>'sub_exp_insumos_mat',':uid'=>$userId,':category_id'=>'cat_exp_insumos',':name'=>'Matéria-Prima']);
  $stmtS->execute([':id'=>'sub_exp_mark_ads',':uid'=>$userId,':category_id'=>'cat_exp_marketing',':name'=>'Anúncios']);
  // Seed default account as the initial default for the user
  $pdo->prepare("INSERT INTO accounts (id,user_id,name,is_default) VALUES ('acc_main',:uid,'Conta Principal', TRUE)")->execute([':uid'=>$userId]);
  $pdo->prepare("INSERT INTO cost_centers (id,user_id,name) VALUES ('cc_geral',:uid,'Geral'),('cc_loja',:uid,'Loja')")->execute([':uid'=>$userId]);
  $pdo->prepare("INSERT INTO payment_methods (id,user_id,name) VALUES ('pm_pix',:uid,'PIX'),('pm_cash',:uid,'Dinheiro'),('pm_card',:uid,'Cartão (Maquininha)')")->execute([':uid'=>$userId]);
  $stmtF = $pdo->prepare("INSERT INTO fees (id,user_id,payment_method_id,name,percent) VALUES (:id,:uid,:pm,:name,:percent)");
  $stmtF->execute([':id'=>'fee_debito',':uid'=>$userId,':pm'=>'pm_card',':name'=>'Débito — 2%',':percent'=>0.02]);
  $stmtF->execute([':id'=>'fee_credito',':uid'=>$userId,':pm'=>'pm_card',':name'=>'Crédito — 3.5%',':percent'=>0.035]);
  $stmtF->execute([':id'=>'fee_parcelado',':uid'=>$userId,':pm'=>'pm_card',':name'=>'Parcelado — 5%',':percent'=>0.05]);
}