<?php
// Router para PHP built-in server servindo frontend em /public e APIs em /api
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// Debug simple: log URI para diagnóstico de roteamento
file_put_contents('php://stderr', "[router] URI: $uri\n");
$docroot = __DIR__;
$file = realpath($docroot . $uri);

// 1) Prioriza APIs
if (strpos($uri, '/api/') !== false && preg_match('#\.php($|\?)#', $uri)) {
  $apiPath = __DIR__ . str_replace('/', DIRECTORY_SEPARATOR, $uri);
  // Normaliza caminho em Windows e tenta localizar o script PHP
  if (!is_file($apiPath)) {
    // Tenta sem normalização (compatibilidade)
    $apiPathAlt = __DIR__ . $uri;
    if (is_file($apiPathAlt)) { $apiPath = $apiPathAlt; }
  }
  if (is_file($apiPath)) {
    require $apiPath;
    return true;
  }
  http_response_code(404);
  header('Content-Type: application/json');
  echo json_encode(['success'=>false,'message'=>'API não encontrada: ' . $uri]);
  return true;
}

// 2) Arquivo estático real dentro do docroot
if ($file && strpos($file, realpath($docroot)) === 0 && is_file($file)) {
  return false;
}

// Qualquer outra rota: deixar o servidor servir arquivos ou 404
return false;