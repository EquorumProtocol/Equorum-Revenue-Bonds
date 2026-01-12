# Estratégia EQM - Documento Interno

**CONFIDENCIAL - NÃO PUBLICAR**

---

## ✅ Decisões Arquiteturais Corretas

### 1. Core Desacoplado do Token
- RevenueSeries funciona sem EQM
- Router funciona sem staking
- Factory cria valor antes do token
- **Resultado**: Produto não morre se token cair

### 2. EQM como Vantagem Econômica (não pedágio)
- Stake opcional + desconto
- Atrai protocolos sérios
- Não afasta pilotos
- Demanda orgânica

### 3. Boost via Vault (não no core)
- Evita dependência circular
- Evita bugs complexos
- Evita acoplamento tóxico
- Cria produto premium em cima do core

---

## 🔧 Ajustes Finais (Naming & Governança)

### Ajuste 1: Naming (Produto > Código)

**Mudanças de nomenclatura para marketing:**

| Código | Nome Público |
|--------|--------------|
| RevenueSeries | Revenue Tokens |
| EquorumVault | Boost Vault / Yield Vault |
| Factory fee | Protocol Access Fee |

**Por quê:**
- "Revenue Tokens" é mais claro que "Series"
- "Boost Vault" comunica benefício
- "Access Fee" soa menos como "taxa"

### Ajuste 2: Buyback/Burn Governável

**❌ Não fazer (hardcoded):**
```solidity
// 50% stakers, 30% treasury, 20% burn (fixo)
```

**✅ Fazer (governável):**
```solidity
// Governança pode ajustar:
// - Bull market: mais burn (pressão deflacionária)
// - Bear market: mais treasury (sustentabilidade)
```

**Referência:** UNI fez isso certo (fee switch governável)

### Ajuste 3: Transparência como Produto

**Frase de ouro:**
> "All revenue flows are verifiable on-chain."

**Implementação:**
- Dashboard simples desde cedo
- Fluxo visual: Fees → Router → Série → Claims
- Isso vira selling point (confiança)

**Exemplo de métricas públicas:**
```
Total Revenue Distributed: $2.5M
Active Series: 47
Total Bondholders: 1,234
Average APY: 18.5%
```

---

## 📋 Roadmap Técnico (Interno)

### Phase 1: MVP (Q1 2026)
```
✅ RevenueSeries + Router + Factory
✅ 1-2 protocolos piloto
✅ Factory cobra fee simples
✅ Dashboard básico (transparência)
```

### Phase 2: EQM Integration (Q2 2026)
```
✅ EquorumStaking.sol
   - Stake EQM = recebe fees
   - Governança on-chain
   
✅ Factory com desconto
   - Sem stake: 0.3 ETH
   - Com 10K EQM staked: 0.1 ETH
   
✅ Fee distribution (governável)
   - Default: 50% stakers, 30% treasury, 20% burn
   - Ajustável via governança
```

### Phase 3: Moat (Q3 2026)
```
✅ EquorumVault (Boost Vault)
   - Wrapper opcional
   - Lock EQM = boost até 2.5x
   
✅ Farming de LPs
   - Incentivos EQM para liquidez dos bonds
   
✅ Dashboard avançado
   - Analytics por protocolo
   - Ranking de séries
   - Projeções de yield
```

### Phase 4: Marketplace (Q4 2026)
```
✅ Web interface
✅ Dutch auction para initial sales
✅ Secondary market integrado
✅ Índices de revenue tokens
```

---

## 💰 Modelo de Receita (Projeções)

### Cenário Conservador (Ano 1)
```
20 séries criadas
Fee média: 0.2 ETH/série
Total: 4 ETH/ano

Distribuição:
- 2 ETH → Stakers (50%)
- 1.2 ETH → Treasury (30%)
- 0.8 ETH → Buyback/Burn (20%)
```

### Cenário Otimista (Ano 2)
```
200 séries criadas
Fee média: 0.3 ETH/série
Total: 60 ETH/ano

Distribuição:
- 30 ETH → Stakers (APY atrativo)
- 18 ETH → Treasury (desenvolvimento)
- 12 ETH → Buyback/Burn (deflação)
```

---

## 🎯 KPIs Críticos

### Adoção
- Número de protocolos usando
- Número de séries ativas
- TVL total em bonds

### Receita
- Fees geradas pela factory
- Volume distribuído aos bondholders
- APY médio dos bonds

### Token
- EQM staked (% do supply)
- Distribuição de fees aos stakers
- Burn acumulado

### Liquidez
- Volume de trading dos bonds
- Número de LPs incentivados
- Profundidade dos pools

---

## ⚠️ Riscos e Mitigações

### Risco 1: Protocolos não adotam
**Mitigação:**
- Começar com 1-2 pilotos de confiança
- Provar ROI claro (capital levantado vs fees pagos)
- Marketing focado em "sem dilução"

### Risco 2: EQM não captura valor
**Mitigação:**
- Fee sharing real (não cosmético)
- Governança com poder real
- Desconto significativo (stake vale a pena)

### Risco 3: Liquidez dos bonds baixa
**Mitigação:**
- Farming de LPs desde cedo
- Integração com Uniswap/Camelot
- Market makers incentivados

### Risco 4: Competição (copycats)
**Mitigação:**
- Moat = liquidez + marca + integração
- Network effects (mais protocolos = mais investidores)
- Produto superior (vault, analytics, UX)

---

## 🔐 Segurança e Auditoria

### Prioridades
1. **RevenueSeries** (mais crítico)
   - Auditoria externa obrigatória
   - Bug bounty alto
   
2. **RevenueRouter**
   - Auditoria externa
   - Testes de stress
   
3. **Factory**
   - Auditoria interna ok
   - Menos crítico (não guarda fundos)

### Timeline
- Q1 2026: Auditoria interna
- Q2 2026: Auditoria externa (Consensys/OpenZeppelin)
- Q3 2026: Bug bounty público

---

## 📊 Comparação Competitiva

| Protocolo | Modelo | Vantagem | Desvantagem |
|-----------|--------|----------|-------------|
| **Equorum** | Revenue bonds (ERC-20) | Fungível, líquido, composable | Novo, sem track record |
| **Maple Finance** | Lending pools | Estabelecido | Requer colateral alto |
| **Ribbon Finance** | Options vaults | DeFi nativo | Complexo, não é dívida |
| **Porter Finance** | Bond issuance | Similar | Bonds não fungíveis |

**Diferencial Equorum:**
- Bonds são ERC-20 (mais líquido)
- Sem colateral excessivo
- Transparência on-chain total
- Composable com DeFi

---

## 🎬 Go-to-Market

### Fase 1: Pilotos (Privado)
- 1-2 protocolos de confiança
- Termos customizados
- Suporte hands-on
- Provar conceito

### Fase 2: Early Adopters (Semi-público)
- 5-10 protocolos selecionados
- Whitelist temporária
- Case studies
- Refinar produto

### Fase 3: Público (Permissionless)
- Qualquer protocolo pode criar
- Marketing agressivo
- Parcerias com DEXs
- Eventos/hackathons

---

## 💡 Insights Estratégicos

### 1. Começar com protocolos lucrativos
- Não adianta tokenizar receita de protocolo sem receita
- Foco em DEXs, lending, perps (fees reais)

### 2. Liquidez é moat
- Bonds precisam ser negociáveis
- Farming de LPs é investimento, não custo

### 3. Transparência vende
- Dashboard público desde dia 1
- Métricas on-chain auditáveis
- "Prove, don't promise"

### 4. EQM vem depois do produto
- Produto funciona sem token
- Token amplifica, não cria valor
- Evita "token first, product later"

---

## 🚀 Visão de Longo Prazo

### Ano 1: Provar conceito
- 10-20 protocolos
- $5-10M em bonds emitidos
- Dashboard + analytics

### Ano 2: Escalar
- 100+ protocolos
- $50-100M em bonds
- Marketplace completo
- Cross-chain (Optimism, Base)

### Ano 3: Infraestrutura
- Padrão de mercado para revenue financing
- Integração com Aave/Compound (bonds como colateral)
- Índices institucionais
- Regulação clara

---

**Última atualização:** 06/01/2026  
**Autor:** Leo + Cascade  
**Status:** Estratégia aprovada - Implementação em andamento
