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
```

**Ação 1.2:** Faça o deploy do seu projeto com este novo arquivo.

**Ação 1.3:** Acesse a URL no seu navegador: `https://seusite.com/api/whoami.php`

Você verá uma resposta em texto puro, algo como:

```
========================================
  DIAGNÓSTICO DE PERMISSÃO DO SERVIDOR
========================================

O processo PHP está rodando com as seguintes credenciais:

User ID (UID): 1000
Group ID (GID): 1000

----------------------------------------
PRÓXIMO PASSO:
Use EXATAMENTE estes números no comando 'chown'...
----------------------------------------
```
*(Os números `1000` são apenas um exemplo, os seus serão diferentes).*

---

### Passo 2: A Solução Permanente (Agora com os IDs Corretos)

Agora que temos os IDs corretos, podemos aplicar a permissão definitiva e segura.

**Ação 2.1:** Acesse o terminal do seu servidor (SSH).

**Ação 2.2:** Pegue o caminho completo do "Host Path" do seu volume, como fizemos antes.

**Ação 2.3:** Execute o comando `chown` usando os **números exatos** que você obteve do `whoami.php`. Se o UID e o GID foram `1000`, o comando será:

```bash
sudo chown -R 1000:1000 /caminho/completo/do/host/path
```

**Ação 2.4:** Para garantir, reforce as permissões seguras:
```bash
sudo chmod -R 775 /caminho/completo/do/host/path
