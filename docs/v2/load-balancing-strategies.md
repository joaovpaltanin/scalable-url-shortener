# Estratégias de Load Balancing com Nginx

[← Back to V2 docs](./v2.md)

Este documento cobre todas as estratégias de balanceamento de carga disponíveis no Nginx (Open Source e Plus), quando usar cada uma, e como elas se aplicam a um sistema como o URL Shortener.

---

## Visão Geral

O bloco `upstream` do Nginx define um grupo de servidores backend. A estratégia de balanceamento determina **como o Nginx escolhe qual servidor recebe cada request**.

```nginx
upstream app_cluster {
    # estratégia vai aqui (ou nada, para round-robin)
    server app1:8080;
    server app2:8080;
    server app3:8080;
}
```

---

## 1. Round Robin (padrão)

### Como funciona

Distribui requests sequencialmente entre os servidores, um de cada vez, em ordem circular. É o comportamento padrão — não precisa de nenhuma diretiva.

### Configuração

```nginx
upstream app_cluster {
    server app1:8080;
    server app2:8080;
    server app3:8080;
}
```

### Quando usar

- Servidores com **capacidade similar** (mesma CPU, memória, etc.)
- Aplicação **stateless** (sem sessões locais)
- Requests com **tempo de processamento uniforme**

### Quando NÃO usar

- Servidores com capacidades muito diferentes (use weighted round-robin)
- Requests com tempo de processamento muito variável (use least connections)
- Aplicação que depende de sessão sticky (use ip_hash)

### Por que usamos no V2

O URL Shortener é stateless, os 3 containers são idênticos, e os requests (`POST /api/shorten` e `GET /r/{code}`) têm tempo de resposta uniforme. Round-robin é a escolha mais simples e correta.

---

## 2. Weighted Round Robin

### Como funciona

Igual ao round-robin, mas servidores com `weight` maior recebem proporcionalmente mais requests. O weight padrão é `1`.

### Configuração

```nginx
upstream app_cluster {
    server app1:8080 weight=5;
    server app2:8080 weight=2;
    server app3:8080 weight=1;
}
```

Neste exemplo, a cada 8 requests: 5 vão para `app1`, 2 para `app2`, 1 para `app3`.

### Quando usar

- Servidores com **capacidade heterogênea** (ex.: um bare-metal potente + duas VMs menores)
- Deploy gradual (**canary deployment**): dê weight=1 à nova versão e weight=9 à versão estável para rotear 10% do tráfego para a nova
- Migração entre ambientes

### Quando NÃO usar

- Todos os servidores são idênticos (weight não agrega valor)
- A carga por request varia muito (o weight não considera carga real, só contagem)

### Exemplo prático — canary deploy

```nginx
upstream app_cluster {
    server app-stable:8080 weight=9;
    server app-canary:8080  weight=1;
}
```

10% do tráfego vai para o canary. Se estiver saudável, aumente o weight gradualmente.

---

## 3. Least Connections

### Como funciona

O Nginx envia o próximo request para o servidor com **menos conexões ativas** naquele momento. Respeita weights se configurados.

### Configuração

```nginx
upstream app_cluster {
    least_conn;
    server app1:8080;
    server app2:8080;
    server app3:8080;
}
```

### Quando usar

- Requests com **tempo de processamento muito variável** (ex.: um endpoint retorna em 5ms, outro faz processamento pesado e leva 2s)
- WebSockets ou conexões **long-lived**
- Backends heterogêneos onde o round-robin causa acúmulo em um servidor

### Quando NÃO usar

- Requests rápidos e uniformes (round-robin é mais simples e equivalente)
- Poucos servidores com carga baixa (a diferença é irrelevante)

### Exemplo: quando faz diferença

Imagine dois endpoints:
- `POST /api/shorten` → 3ms (rápido)
- `POST /api/batch-import` → 500ms (lento)

Se um servidor está processando 10 batch-imports, ele tem 10 conexões ativas. O `least_conn` desvia tráfego novo para os outros. O round-robin não faria isso — continuaria mandando na mesma proporção.

---

## 4. IP Hash

### Como funciona

Usa um hash do IP do cliente para determinar o servidor. O mesmo IP **sempre** vai para o mesmo servidor (a menos que ele esteja indisponível). Usa os 3 primeiros octetos do IPv4 ou o endereço IPv6 completo.

### Configuração

```nginx
upstream app_cluster {
    ip_hash;
    server app1:8080;
    server app2:8080;
    server app3:8080;
}
```

Para remover temporariamente um servidor sem quebrar o mapeamento de hash:

```nginx
upstream app_cluster {
    ip_hash;
    server app1:8080;
    server app2:8080 down;  # preserva o hash ring
    server app3:8080;
}
```

### Quando usar

- Aplicação com **sessão server-side** (ex.: dados de sessão em memória, não no banco)
- Cache local por servidor que se beneficia do mesmo cliente ir sempre ao mesmo backend
- Cenários onde **sticky sessions** são necessárias sem cookies

### Quando NÃO usar

- Aplicação stateless (como o URL Shortener — não precisa de afinidade)
- Clientes atrás de um **proxy/NAT corporativo**: milhares de usuários compartilham o mesmo IP, causando distribuição desigual
- Ambientes com CDN na frente (o IP visto pelo Nginx é o do CDN, não do cliente)

### Limitação importante

Se grande parte do tráfego vem de poucos IPs (ex.: rede corporativa com NAT), um servidor pode ficar sobrecarregado enquanto os outros ficam ociosos.

---

## 5. Generic Hash

### Como funciona

Permite usar **qualquer variável ou combinação** como chave de hash. Suporta o parâmetro `consistent` para minimizar redistribuição quando servidores são adicionados/removidos.

### Configuração

Hash por URI (requests para a mesma URL sempre vão ao mesmo servidor):

```nginx
upstream app_cluster {
    hash $request_uri consistent;
    server app1:8080;
    server app2:8080;
    server app3:8080;
}
```

Hash por combinação de IP + porta:

```nginx
upstream app_cluster {
    hash $remote_addr$remote_port;
    server app1:8080;
    server app2:8080;
    server app3:8080;
}
```

### Quando usar

- **Cache local por servidor**: hash por URI garante que o mesmo request sempre chega ao mesmo servidor, maximizando cache hits locais
- Sharding de dados: direcionar operações sobre o mesmo recurso ao mesmo backend
- Qualquer cenário onde a **afinidade por chave customizada** é necessária

### O parâmetro `consistent`

Sem `consistent`: adicionar/remover um servidor remapeia **todos** os requests (cache invalidation total).

Com `consistent` (consistent hashing / ketama): apenas ~1/N dos requests são remapeados, onde N é o número de servidores. Essencial para cache servers.

### Quando NÃO usar

- Distribuição uniforme de carga é mais importante que afinidade
- Os requests não têm uma chave natural de particionamento

### Exemplo: URL Shortener com cache local

Se no futuro cada instância do app tivesse um cache local (em vez de Redis compartilhado), o hash por URI faria sentido:

```nginx
upstream app_cluster {
    hash $request_uri consistent;
    server app1:8080;
    server app2:8080;
    server app3:8080;
}
```

`GET /r/aBcD3fG` iria sempre ao mesmo servidor → cache hit local.

---

## 6. Random (Nginx Plus)

### Como funciona

Seleciona um servidor aleatoriamente, respeitando weights. Com o parâmetro `two`, escolhe dois servidores aleatórios e depois aplica um critério de desempate (Power of Two Choices).

### Configuração

```nginx
upstream app_cluster {
    random two least_conn;
    server app1:8080;
    server app2:8080;
    server app3:8080;
}
```

### Quando usar

- **Múltiplos load balancers independentes** apontando para o mesmo pool de servidores (cenário distribuído sem estado compartilhado entre os LBs)
- O `two least_conn` combina aleatoriedade com inteligência: evita o pior caso do random puro

### Quando NÃO usar

- Um único Nginx como load balancer (round-robin ou least_conn são mais previsíveis)
- Disponível apenas no Nginx Plus

---

## 7. Least Time (Nginx Plus)

### Como funciona

Combina **latência** e **conexões ativas** para escolher o servidor. Seleciona o servidor com menor tempo médio de resposta E menos conexões.

### Configuração

```nginx
upstream app_cluster {
    least_time header;  # ou last_byte
    server app1:8080;
    server app2:8080;
    server app3:8080;
}
```

| Parâmetro            | Mede o quê                                            |
|----------------------|-------------------------------------------------------|
| `header`             | Tempo até o primeiro byte da resposta                 |
| `last_byte`          | Tempo até receber a resposta completa                 |
| `last_byte inflight` | Idem, considerando requests em andamento              |

### Quando usar

- Servidores com **latências diferentes** (ex.: um na mesma região, outro em outra)
- Workloads onde o tamanho da resposta varia muito
- Quando você quer que o Nginx se **adapte automaticamente** à performance real

### Quando NÃO usar

- Disponível apenas no Nginx Plus
- Servidores idênticos no mesmo datacenter (a diferença de latência é desprezível)

---

## Funcionalidades Complementares

Estas não são estratégias de balanceamento, mas afetam diretamente como o Nginx distribui e gerencia tráfego.

### Backup Servers

Um servidor marcado como `backup` só recebe tráfego quando **todos** os outros estão indisponíveis.

```nginx
upstream app_cluster {
    server app1:8080;
    server app2:8080;
    server app3:8080 backup;
}
```

Útil para manter uma instância de "último recurso" com capacidade reduzida.

### Health Checks (passivos)

O Nginx Open Source faz health checks **passivos**: se um servidor retorna erro, ele é marcado como falho.

```nginx
upstream app_cluster {
    server app1:8080 max_fails=3 fail_timeout=30s;
    server app2:8080 max_fails=3 fail_timeout=30s;
}
```

| Parâmetro      | Significado                                                    | Default |
|----------------|----------------------------------------------------------------|---------|
| `max_fails`    | Tentativas falhas consecutivas para marcar como indisponível   | 1       |
| `fail_timeout` | Janela de tempo para contar falhas + tempo que fica marcado    | 10s     |

### proxy_next_upstream

Controla em quais situações o Nginx tenta o **próximo servidor** em vez de retornar erro ao cliente.

```nginx
location / {
    proxy_pass http://app_cluster;
    proxy_next_upstream error timeout http_502 http_503;
}
```

É o que usamos no V2 — se um servidor morre, o Nginx automaticamente tenta outro. É isso que garante 0% de erro no chaos test.

### Keepalive Connections

Mantém conexões TCP abertas com os backends, evitando o overhead de abrir/fechar conexão a cada request.

```nginx
upstream app_cluster {
    server app1:8080;
    server app2:8080;
    keepalive 32;
}
```

---

## Comparativo Rápido

| Estratégia       | Diretiva        | Precisa de state? | Afinidade? | Melhor para                          | Nginx Open Source? |
|------------------|-----------------|--------------------|------------|--------------------------------------|--------------------|
| Round Robin      | _(padrão)_      | Não                | Não        | Servidores homogêneos, app stateless | Sim                |
| Weighted RR      | `weight=N`      | Não                | Não        | Servidores heterogêneos, canary      | Sim                |
| Least Conn       | `least_conn`    | Sim (contagem)     | Não        | Requests com tempo variável          | Sim                |
| IP Hash          | `ip_hash`       | Não                | Por IP     | Sessão sticky sem cookie             | Sim                |
| Generic Hash     | `hash $key`     | Não                | Por chave  | Cache local, sharding                | Sim                |
| Random           | `random`        | Não                | Não        | Múltiplos LBs distribuídos           | Não (Plus)         |
| Least Time       | `least_time`    | Sim (latência)     | Não        | Servidores com latências diferentes  | Não (Plus)         |

---

## O Que Usamos no V2 e Por Quê

```nginx
upstream app_cluster {
    server app:8080;
}
```

**Round-robin** (padrão), porque:

1. Os 3 containers são **idênticos** (mesmo Dockerfile, mesmos recursos)
2. A aplicação é **stateless** — sem sessão, sem cache local, sem afinidade
3. Os requests têm **tempo de resposta uniforme** (~2-4ms)
4. Com `proxy_next_upstream`, o failover é automático

Não há motivo para complicar. O round-robin é a estratégia certa para este cenário. Quando precisarmos de cache local por instância (ex.: hash por URI) ou sessão sticky, a estratégia muda — mas isso viria com uma mudança de arquitetura, não com uma troca de diretiva.
