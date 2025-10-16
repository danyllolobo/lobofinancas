<?php
header('Content-Type: text/plain; charset=utf-8');

if (function_exists('posix_getuid')) {
    $uid = posix_getuid();
    $gid = posix_getgid();
    $userInfo = posix_getpwuid($uid);
    $userName = $userInfo['name'] ?? 'NÃO ENCONTRADO';

    echo "========================================\n";
    echo "  DIAGNÓSTICO DE PERMISSÃO DEFINITIVO\n";
    echo "========================================\n\n";
    echo "O processo PHP está rodando com as seguintes credenciais:\n\n";
    echo "NOME DE USUÁRIO: " . $userName . "\n";
    echo "User ID (UID)  : " . $uid . "\n";
    echo "Group ID (GID) : " . $gid . "\n\n";
    echo "----------------------------------------\n";
    echo "PRÓXIMOS PASSOS (use os valores acima):\n\n";
    echo "1. PARA CORRIGIR O DEPLOY (dubious ownership):\n";
    echo "   sudo -u " . $userName . " git config --global --add safe.directory /etc/easypanel/projects/app/v2lobo/code\n\n";
    echo "2. PARA CORRIGIR O UPLOAD DE ARQUIVOS (Permission denied):\n";
    echo "   sudo chown -R " . $uid . ":" . $gid . " /caminho/completo/do/seu/volume\n";
    echo "----------------------------------------\n";

} else {
    echo "ERRO CRÍTICO: As funções POSIX não estão habilitadas. Não é possível determinar o nome de usuário.";
}