<?php
header('Content-Type: text/plain; charset=utf-8');

if (function_exists('posix_getuid') && function_exists('posix_getgid')) {
    $uid = posix_getuid();
    $gid = posix_getgid();

    echo "========================================\n";
    echo "  DIAGNÓSTICO DE PERMISSÃO DO SERVIDOR\n";
    echo "========================================\n\n";
    echo "O processo PHP está rodando com as seguintes credenciais:\n\n";
    echo "User ID (UID): " . $uid . "\n";
    echo "Group ID (GID): " . $gid . "\n\n";
    echo "----------------------------------------\n";
    echo "PRÓXIMO PASSO:\n";
    echo "Use EXATAMENTE estes números no comando 'chown' no terminal do seu servidor.\n";
    echo "Exemplo: sudo chown -R {$uid}:{$gid} /caminho/para/a/pasta\n";
    echo "----------------------------------------\n";

} else {
    echo "ERRO CRÍTICO:\n";
    echo "As funções 'posix_getuid' e 'posix_getgid' não estão habilitadas neste servidor.\n";
    echo "Isso impede a verificação automática de permissões. Verifique a configuração 'disable_functions' no seu php.ini ou entre em contato com o suporte da hospedagem.\n";
}