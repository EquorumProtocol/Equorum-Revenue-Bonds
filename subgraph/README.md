# 📊 Equorum Protocol V2 - TheGraph Subgraph

Este subgraph indexa todos os eventos dos contratos V2 do Equorum Protocol (Revenue Bonds) na Arbitrum One, fornecendo dados estruturados para o Dashboard público e o App.

## 🏗️ Arquitetura

### Contratos Indexados

1. **RevenueSeriesFactory** (`0x8afA0318363FfBc29Cc28B3C98d9139C08Af737b`)
   - Cria novas séries de Revenue Bonds
   - Gerencia fees e treasury

2. **RevenueSeries** (Template dinâmico - Soft Bonds)
   - Distribui receita proporcionalmente aos holders
   - Eventos de claim e maturity

3. **RevenueBondEscrow** (Template dinâmico - Hybrid Bonds)
   - Gerencia principal garantido
   - Eventos de depósito e claim de principal

4. **RevenueRouter** (Template dinâmico)
   - Roteia receita automaticamente
   - Tracking de splits entre série e protocolo

5. **ProtocolReputationRegistry** (Template dinâmico)
   - Score de reputação dos protocolos
   - Histórico de entregas

### Entidades Principais

- **ProtocolStats**: Métricas globais do protocolo
- **RevenueSeries**: Cada série de bonds criada
- **Protocol**: Protocolos emissores
- **SeriesHolder**: Holders de bonds
- **RevenueDistribution**: Eventos de distribuição
- **RevenueClaim**: Claims de receita
- **DailySnapshot**: Snapshots diários para gráficos históricos

## 🚀 Setup e Deploy

### 1. Pré-requisitos

```bash
# Instalar Graph CLI globalmente
npm install -g @graphprotocol/graph-cli

# Instalar dependências do subgraph
cd subgraph
npm install
```

### 2. Preparar ABIs

Você precisa copiar os ABIs dos contratos compilados para a pasta `abis/`:

```bash
# Criar pasta de ABIs
mkdir -p abis

# Copiar ABIs dos contratos compilados
cp ../artifacts/contracts/v2/core/RevenueSeriesFactory.sol/RevenueSeriesFactory.json abis/
cp ../artifacts/contracts/v2/core/RevenueSeries.sol/RevenueSeries.json abis/
cp ../artifacts/contracts/v2/core/RevenueBondEscrow.sol/RevenueBondEscrow.json abis/
cp ../artifacts/contracts/v2/core/RevenueRouter.sol/RevenueRouter.json abis/
cp ../artifacts/contracts/v2/registry/ProtocolReputationRegistry.sol/ProtocolReputationRegistry.json abis/
```

### 3. Gerar Código TypeScript

O Graph CLI gera código TypeScript a partir do schema e ABIs:

```bash
npm run codegen
```

Isso cria a pasta `generated/` com:
- Tipos TypeScript para todas as entidades
- Bindings para os contratos
- Templates para eventos

### 4. Build do Subgraph

```bash
npm run build
```

Isso compila o código AssemblyScript para WebAssembly.

### 5. Deploy

#### Opção A: Deploy no The Graph Studio (Recomendado)

1. Crie uma conta em https://thegraph.com/studio/
2. Crie um novo subgraph chamado "equorum-protocol"
3. Copie o deploy key
4. Autentique:

```bash
graph auth --studio <DEPLOY_KEY>
```

5. Deploy:

```bash
npm run deploy
```

#### Opção B: Deploy Local (Para testes)

```bash
# Iniciar Graph Node local (requer Docker)
docker-compose up -d

# Criar subgraph local
npm run create-local

# Deploy local
npm run deploy-local
```

## 📊 Queries de Exemplo

### KPIs Globais

```graphql
query GlobalStats {
  protocolStats(id: "protocol-stats") {
    totalRevenueBondsCreated
    totalCapitalRaised
    totalRevenueDistributed
    totalActiveSeries
    totalProtocolsFunded
    averageDeliveryRate
  }
}
```

### Séries Ativas

```graphql
query ActiveSeries {
  revenueSeries(
    where: { isActive: true }
    orderBy: totalRevenueReceived
    orderDirection: desc
    first: 10
  ) {
    id
    name
    symbol
    bondType
    protocol {
      address
      reputationScore
      deliveryRate
    }
    revenueSharePercentage
    totalRevenueReceived
    totalRevenueDistributed
    maturityDate
    holderCount
    estimatedAPY
    escrow {
      principalAmount
      state
    }
  }
}
```

### Detalhes de uma Série

```graphql
query SeriesDetails($seriesId: ID!) {
  revenueSeries(id: $seriesId) {
    name
    symbol
    bondType
    protocol {
      address
      reputationScore
      totalRevenueDelivered
      deliveryRate
      blacklisted
    }
    revenueSharePercentage
    totalSupply
    totalRevenueReceived
    totalRevenueDistributed
    distributionCount
    holderCount
    maturityDate
    createdAt
    distributions(orderBy: timestamp, orderDirection: desc, first: 20) {
      amount
      timestamp
      transactionHash
    }
    holders(orderBy: balance, orderDirection: desc, first: 10) {
      holder
      balance
      balancePercentage
      totalRevenueClaimed
    }
    escrow {
      principalAmount
      state
      principalDeposited
      totalPrincipalClaimed
    }
  }
}
```

### Histórico de Distribuições

```graphql
query RevenueDistributions($seriesId: ID!) {
  revenueDistributions(
    where: { series: $seriesId }
    orderBy: timestamp
    orderDirection: desc
    first: 50
  ) {
    amount
    revenuePerToken
    timestamp
    transactionHash
    from
  }
}
```

### Snapshots Diários (para gráficos)

```graphql
query DailySnapshots($startDate: BigInt!) {
  dailySnapshots(
    where: { date_gte: $startDate }
    orderBy: date
    orderDirection: asc
  ) {
    date
    totalRevenueDistributed
    totalCapitalRaised
    activeSeries
    newSeriesCreated
    revenueDistributedToday
  }
}
```

### Protocolos por Reputação

```graphql
query TopProtocols {
  protocols(
    where: { blacklisted: false }
    orderBy: reputationScore
    orderDirection: desc
    first: 20
  ) {
    address
    reputationScore
    deliveryRate
    totalRevenueDelivered
    totalRevenueExpected
    seriesCount
    onTimeDeliveries
    lateDeliveries
    missedDeliveries
  }
}
```

## 🔧 Desenvolvimento

### Estrutura de Arquivos

```
subgraph/
├── schema.graphql           # Definição de entidades
├── subgraph.yaml           # Configuração do subgraph
├── package.json            # Dependências
├── src/
│   ├── factory.ts          # Handlers da Factory
│   ├── revenue-series.ts   # Handlers do RevenueSeries
│   ├── revenue-bond-escrow.ts  # Handlers do Escrow
│   ├── revenue-router.ts   # Handlers do Router
│   └── reputation-registry.ts  # Handlers do Registry
├── abis/                   # ABIs dos contratos
└── generated/              # Código gerado (não commitar)
```

### Adicionar Novos Handlers

1. Adicione o evento no `subgraph.yaml`
2. Implemente o handler no arquivo `.ts` correspondente
3. Rode `npm run codegen` para gerar tipos
4. Rode `npm run build` para compilar

### Testes

```bash
npm run test
```

## 📈 Métricas Calculadas

### APY Estimado

Calculado com base no histórico de distribuições:

```
APY = (totalRevenueReceived / totalSupply) * (365 / daysActive) * 100
```

### Delivery Rate

```
deliveryRate = (totalRevenueDelivered / totalRevenueExpected) * 100
```

### Average Distribution Amount

```
averageDistributionAmount = totalRevenueReceived / distributionCount
```

## 🔗 Links Úteis

- **The Graph Docs**: https://thegraph.com/docs/
- **Subgraph Studio**: https://thegraph.com/studio/
- **Arbitrum One Subgraphs**: https://thegraph.com/explorer?chain=arbitrum-one
- **Equorum Contracts**: https://arbiscan.io/address/0x8afA0318363FfBc29Cc28B3C98d9139C08Af737b

## 📝 Notas Importantes

1. **StartBlock**: O subgraph começa a indexar do bloco 283947000 (deploy da Factory)
2. **Templates Dinâmicos**: Cada série criada gera um novo datasource dinâmico
3. **Performance**: Snapshots diários reduzem carga de queries para gráficos históricos
4. **Reputação**: Score é atualizado automaticamente via eventos do Registry

## 🐛 Troubleshooting

### Erro: "Failed to deploy"
- Verifique se os ABIs estão na pasta `abis/`
- Confirme que o `startBlock` está correto
- Verifique se o address da Factory está correto

### Erro: "Subgraph failed"
- Verifique os logs no Graph Studio
- Confirme que todos os eventos estão sendo emitidos corretamente
- Teste localmente primeiro

### Query muito lenta
- Use paginação (`first`, `skip`)
- Adicione filtros (`where`)
- Use snapshots para dados históricos

## 📧 Suporte

Para dúvidas ou problemas:
- Discord: https://discord.gg/qAzseSwY
- GitHub Issues: https://github.com/EquorumProtocol/Equorum-Revenue-Bonds/issues
