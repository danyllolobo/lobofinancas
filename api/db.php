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
    // Campos opcionais/novos: avatar_url
    // Compatível com versões que não aceitam ALTER TABLE IF NOT EXISTS
    try {
        $chk = $pdo->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'avatar_url' LIMIT 1");
        $chk->execute();
        $exists = $chk->fetchColumn();
        if (!$exists) {
            $pdo->exec("ALTER TABLE users ADD COLUMN avatar_url TEXT");
        }
    } catch (Throwable $e) {
        // Se falhar por qualquer motivo, apenas loga sem quebrar o fluxo
        error_log('ensure_schema avatar_url add column failed: ' . $e->getMessage());
    }

    // Compatibiliza esquemas antigos da tabela accounts que não tinham initial_balance/is_default
    try {
        $chk = $pdo->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'initial_balance' LIMIT 1");
        $chk->execute();
        $exists = $chk->fetchColumn();
        if (!$exists) {
            $pdo->exec("ALTER TABLE accounts ADD COLUMN initial_balance NUMERIC DEFAULT 0");
            // Normaliza linhas existentes
            $pdo->exec("UPDATE accounts SET initial_balance = 0 WHERE initial_balance IS NULL");
        }
    } catch (Throwable $e) {
        error_log('ensure_schema accounts add initial_balance failed: ' . $e->getMessage());
    }
    try {
        $chk2 = $pdo->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'is_default' LIMIT 1");
        $chk2->execute();
        $exists2 = $chk2->fetchColumn();
        if (!$exists2) {
            $pdo->exec("ALTER TABLE accounts ADD COLUMN is_default BOOLEAN DEFAULT FALSE");
            $pdo->exec("UPDATE accounts SET is_default = FALSE WHERE is_default IS NULL");
        }
    } catch (Throwable $e) {
        error_log('ensure_schema accounts add is_default failed: ' . $e->getMessage());
    }
}

function seed_catalogs_if_empty(PDO $pdo, string $userId) {
  // Usa statement preparado para evitar SQL inline e injecção
  $hasCatStmt = $pdo->prepare("SELECT 1 FROM categories WHERE user_id = :uid LIMIT 1");
  $hasCatStmt->execute([':uid' => $userId]);
  $hasCat = $hasCatStmt->fetchColumn();
  if ($hasCat) return; // já possui dados para este usuário

  // Categorias padrão, com IDs únicos por usuário
  $categoriesDef = [
    ['name' => 'Vendas',      'type' => 'income'],
    ['name' => 'Serviços',    'type' => 'income'],
    ['name' => 'Insumos',     'type' => 'expense'],
    ['name' => 'Marketing',   'type' => 'expense'],
    ['name' => 'Operacional', 'type' => 'expense'],
    ['name' => 'Impostos',    'type' => 'expense'],
  ];
  $catStmt = $pdo->prepare("INSERT INTO categories (id,user_id,name,type) VALUES (:id,:uid,:name,:type)");
  $catIds = [];
  foreach ($categoriesDef as $c) {
    $id = uniqid('cat_');
    $catStmt->execute([':id' => $id, ':uid' => $userId, ':name' => $c['name'], ':type' => $c['type']]);
    $catIds[$c['name']] = $id;
  }

  // Subcategorias padrão (referenciam IDs das categorias acima)
  $subStmt = $pdo->prepare("INSERT INTO subcategories (id,user_id,category_id,name) VALUES (:id,:uid,:category_id,:name)");
  if (!empty($catIds['Insumos'])) {
    $subStmt->execute([':id' => uniqid('sub_'), ':uid' => $userId, ':category_id' => $catIds['Insumos'], ':name' => 'Matéria-Prima']);
  }
  if (!empty($catIds['Marketing'])) {
    $subStmt->execute([':id' => uniqid('sub_'), ':uid' => $userId, ':category_id' => $catIds['Marketing'], ':name' => 'Anúncios']);
  }

  // Conta padrão do usuário
  $accStmt = $pdo->prepare("INSERT INTO accounts (id,user_id,name,initial_balance,is_default) VALUES (:id,:uid,:name,:initial_balance,TRUE)");
  $accStmt->execute([':id' => uniqid('acc_'), ':uid' => $userId, ':name' => 'Conta Principal', ':initial_balance' => 0]);

  // Centros de custo
  $ccStmt = $pdo->prepare("INSERT INTO cost_centers (id,user_id,name) VALUES (:id,:uid,:name)");
  $ccStmt->execute([':id' => uniqid('cc_'), ':uid' => $userId, ':name' => 'Geral']);
  $ccStmt->execute([':id' => uniqid('cc_'), ':uid' => $userId, ':name' => 'Loja']);

  // Formas de pagamento: PIX, Dinheiro, Cartão (Maquininha)
  $pmStmt = $pdo->prepare("INSERT INTO payment_methods (id,user_id,name) VALUES (:id,:uid,:name)");
  $pmPixId  = uniqid('pm_'); $pmStmt->execute([':id' => $pmPixId,  ':uid' => $userId, ':name' => 'PIX']);
  $pmCashId = uniqid('pm_'); $pmStmt->execute([':id' => $pmCashId, ':uid' => $userId, ':name' => 'Dinheiro']);
  $pmCardId = uniqid('pm_'); $pmStmt->execute([':id' => $pmCardId, ':uid' => $userId, ':name' => 'Cartão (Maquininha)']);

  // Taxas padrão associadas ao método Cartão
  $feeStmt = $pdo->prepare("INSERT INTO fees (id,user_id,payment_method_id,name,percent) VALUES (:id,:uid,:pm,:name,:percent)");
  $feeStmt->execute([':id' => uniqid('fee_'), ':uid' => $userId, ':pm' => $pmCardId, ':name' => 'Débito — 2%',    ':percent' => 0.02]);
  $feeStmt->execute([':id' => uniqid('fee_'), ':uid' => $userId, ':pm' => $pmCardId, ':name' => 'Crédito — 3.5%', ':percent' => 0.035]);
  $feeStmt->execute([':id' => uniqid('fee_'), ':uid' => $userId, ':pm' => $pmCardId, ':name' => 'Parcelado — 5%', ':percent' => 0.05]);
}