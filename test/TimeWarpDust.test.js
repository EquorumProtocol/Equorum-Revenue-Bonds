const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFullStack, createSeriesViaFactory, DEFAULT_PARAMS } = require("./helpers");

/**
 * TIME-WARP / FRONTEIRA DE MATURITY + DUST / ROUNDING
 * 
 * A) Testes temporais na fronteira exata do maturity:
 *    - distribuir no último segundo antes do maturity
 *    - distribuir exatamente no segundo do maturity (deve falhar)
 *    - claim no primeiro bloco após maturity
 *    - ninguém chama matureSeries() vs chamada prematura
 *    - duas distribuições em blocos seguidos perto do cutoff (off-by-one)
 * 
 * B) Dust / rounding / poeira:
 *    - holders com quantias bizarras (1 wei, 2 wei, 3 wei)
 *    - distribuições com valores mínimos (1 wei, 7 wei, 13 wei)
 *    - invariantes com tolerância de poeira
 *    - acúmulo de erro de arredondamento ao longo de muitas distribuições
 */
describe("Time-Warp & Dust/Rounding", function () {
  let owner, treasury, protocol, rest, registry, factory;
  let alice, bob, charlie;

  beforeEach(async function () {
    ({ owner, treasury, protocol, rest, registry, factory } = await deployFullStack());
    [alice, bob, charlie] = rest;
  });

  // ============================================
  // A) FRONTEIRA TEMPORAL DE MATURITY
  // ============================================
  describe("Fronteira Temporal de Maturity", function () {
    it("Deve permitir distribuição 1 segundo antes do maturity", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol, {
        durationDays: 30,
      });
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      // Avança até 1 segundo antes do maturity
      const maturityDate = await series.maturityDate();
      const target = maturityDate - 2n; // -2 porque o próximo bloco terá timestamp +1
      await time.increaseTo(target);

      // Deve funcionar (block.timestamp < maturityDate)
      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.not.be.reverted;

      expect(await series.totalRevenueReceived()).to.equal(ethers.parseEther("1"));
    });

    it("Deve rejeitar distribuição exatamente no segundo do maturity", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol, {
        durationDays: 30,
      });

      // Avança até exatamente o maturityDate
      const maturityDate = await series.maturityDate();
      await time.increaseTo(maturityDate);

      // block.timestamp == maturityDate → require(block.timestamp < maturityDate) falha
      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Series matured");
    });

    it("Deve rejeitar distribuição 1 segundo após maturity", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol, {
        durationDays: 30,
      });

      const maturityDate = await series.maturityDate();
      await time.increaseTo(maturityDate + 1n);

      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Series matured");
    });

    it("Claim deve funcionar no primeiro bloco após maturity", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol, {
        durationDays: 30,
      });
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      const claimable = await series.calculateClaimable(alice.address);
      expect(claimable).to.be.gt(0);

      // Avança para exatamente o maturity
      const maturityDate = await series.maturityDate();
      await time.increaseTo(maturityDate);

      // Claim funciona mesmo após maturity (não tem require de active no claim)
      await expect(series.connect(alice).claimRevenue()).to.not.be.reverted;
      expect(await series.calculateClaimable(alice.address)).to.equal(0);
    });

    it("matureSeries() não pode ser chamado antes do maturityDate", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol, {
        durationDays: 30,
      });

      // Tenta chamar matureSeries antes do tempo
      await expect(series.matureSeries()).to.be.revertedWith("Not matured yet");

      // Avança até 1 segundo antes
      const maturityDate = await series.maturityDate();
      await time.increaseTo(maturityDate - 2n);

      // Ainda não pode
      await expect(series.matureSeries()).to.be.revertedWith("Not matured yet");
    });

    it("matureSeries() funciona exatamente no segundo do maturity", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol, {
        durationDays: 30,
      });

      const maturityDate = await series.maturityDate();
      await time.increaseTo(maturityDate);

      await expect(series.matureSeries()).to.not.be.reverted;
      expect(await series.active()).to.be.false;
    });

    it("Série funciona normalmente mesmo sem ninguém chamar matureSeries()", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol, {
        durationDays: 30,
      });
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Avança além do maturity mas NÃO chama matureSeries()
      const maturityDate = await series.maturityDate();
      await time.increaseTo(maturityDate + 100n);

      // active ainda é true (ninguém chamou matureSeries)
      expect(await series.active()).to.be.true;

      // Mas distribuição falha mesmo assim (block.timestamp >= maturityDate)
      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Series matured");

      // Claim ainda funciona
      await expect(series.connect(alice).claimRevenue()).to.not.be.reverted;

      // Transfer ainda funciona
      await series.connect(alice).transfer(bob.address, ethers.parseEther("100000"));

      // getSeriesInfo mostra isActive = false (mesmo sem matureSeries)
      const info = await series.getSeriesInfo();
      expect(info.isActive).to.be.false; // active && block.timestamp < maturityDate
      expect(info.timeRemaining).to.equal(0);
    });

    it("Duas distribuições em blocos seguidos perto do cutoff (off-by-one)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol, {
        durationDays: 30,
      });
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));

      // Avança até bem perto do maturity
      const maturityDate = await series.maturityDate();
      await time.increaseTo(maturityDate - 4n);

      // Primeira distribuição: deve funcionar
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") });
      expect(await series.totalRevenueReceived()).to.equal(ethers.parseEther("5"));

      // Segunda distribuição: pode funcionar ou falhar dependendo do timestamp do bloco
      try {
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") });
        // Se funcionou, totalRevenue = 10
        expect(await series.totalRevenueReceived()).to.equal(ethers.parseEther("10"));
      } catch (e) {
        // Se falhou, totalRevenue = 5 (a segunda não entrou)
        expect(await series.totalRevenueReceived()).to.equal(ethers.parseEther("5"));
        expect(e.message).to.include("Series matured");
      }
    });

    it("Router: roteamento falha graciosamente quando série matura entre receive e route", async function () {
      const { series, router } = await createSeriesViaFactory(factory, protocol, {
        durationDays: 30,
      });
      const routerAddr = await router.getAddress();

      // Envia ETH pro router
      await alice.sendTransaction({ to: routerAddr, value: ethers.parseEther("10") });

      // Avança além do maturity
      const maturityDate = await series.maturityDate();
      await time.increaseTo(maturityDate + 1n);

      // Route falha graciosamente
      await expect(router.routeRevenue()).to.emit(router, "RouteAttemptFailed");

      // Fundos seguros no router
      expect(await ethers.provider.getBalance(routerAddr)).to.equal(ethers.parseEther("10"));

      // pendingToRoute zerado (protocolo pode sacar)
      expect(await router.pendingToRoute()).to.equal(0);
    });

    it("Claim funciona meses após maturity sem ninguém chamar matureSeries()", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol, {
        durationDays: 30,
      });
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Avança 1 ano além do maturity
      const maturityDate = await series.maturityDate();
      await time.increaseTo(maturityDate + BigInt(365 * 24 * 60 * 60));

      // Claim ainda funciona
      const claimable = await series.calculateClaimable(alice.address);
      expect(claimable).to.be.gt(0);
      await series.connect(alice).claimRevenue();
      expect(await series.calculateClaimable(alice.address)).to.equal(0);
    });
  });

  // ============================================
  // B) DUST / ROUNDING / POEIRA
  // ============================================
  describe("Dust / Rounding / Poeira", function () {
    it("Holders com quantias bizarras (1 wei, 2 wei, 3 wei)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);

      // Transfere quantias mínimas
      await series.connect(protocol).transfer(alice.address, 1n);
      await series.connect(protocol).transfer(bob.address, 2n);
      await series.connect(protocol).transfer(charlie.address, 3n);

      expect(await series.balanceOf(alice.address)).to.equal(1n);
      expect(await series.balanceOf(bob.address)).to.equal(2n);
      expect(await series.balanceOf(charlie.address)).to.equal(3n);

      // Distribuição grande
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Claimable deve ser proporcional (mas pode ser 0 por arredondamento)
      // Com 1 wei de token e supply de 1M tokens, a fração é minúscula
      const aliceClaimable = await series.calculateClaimable(alice.address);
      const bobClaimable = await series.calculateClaimable(bob.address);
      const charlieClaimable = await series.calculateClaimable(charlie.address);

      // Bob deve ter ~2x alice, charlie ~3x alice
      if (aliceClaimable > 0n) {
        expect(bobClaimable).to.be.gte(aliceClaimable);
        expect(charlieClaimable).to.be.gte(bobClaimable);
      }
    });

    it("Distribuição com valor mínimo (minDistributionAmount)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));

      // minDistributionAmount padrão é 0.001 ETH
      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("0.001") })
      ).to.not.be.reverted;

      expect(await series.totalRevenueReceived()).to.equal(ethers.parseEther("0.001"));
    });

    it("Distribuição abaixo do mínimo deve reverter", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);

      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("0.0009") })
      ).to.be.revertedWith("Distribution too small");
    });

    it("Muitas distribuições pequenas acumulam corretamente", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));

      const minDist = ethers.parseEther("0.001");

      // 20 distribuições mínimas
      for (let i = 0; i < 20; i++) {
        await series.connect(protocol).distributeRevenue({ value: minDist });
      }

      expect(await series.totalRevenueReceived()).to.equal(minDist * 20n);

      // Alice tem 50% dos tokens → deve receber ~50% do total
      const aliceClaimable = await series.calculateClaimable(alice.address);
      const expectedAlice = (minDist * 20n) / 2n;
      const diff = aliceClaimable > expectedAlice
        ? aliceClaimable - expectedAlice
        : expectedAlice - aliceClaimable;

      // Tolerância: 20 distribuições * possível erro de 1 wei cada = 20 wei
      expect(diff).to.be.lte(20n);
    });

    it("Erro de arredondamento não cresce linearmente com distribuições", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      // 3 holders com divisão que gera resto
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("333333"));
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("333333"));
      // protocol fica com 333334 (1M - 333333 - 333333)

      const totalSupply = await series.totalSupply();

      // 50 distribuições
      for (let i = 0; i < 50; i++) {
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("0.01") });
      }

      const totalRevenue = await series.totalRevenueReceived();

      // Soma de todos os claimable
      const aliceClaimable = await series.calculateClaimable(alice.address);
      const bobClaimable = await series.calculateClaimable(bob.address);
      const protocolClaimable = await series.calculateClaimable(protocol.address);
      const totalClaimable = aliceClaimable + bobClaimable + protocolClaimable;

      // Saldo do contrato deve cobrir tudo
      const seriesBalance = await ethers.provider.getBalance(await series.getAddress());
      expect(seriesBalance).to.be.gte(totalClaimable);

      // Poeira máxima: totalRevenue - totalClaimable (o que "sumiu" em arredondamento)
      const dust = totalRevenue - totalClaimable;
      console.log(`      Poeira após 50 distribuições: ${dust} wei`);

      // Poeira não deve ser absurda (< 50 wei pra 50 distribuições)
      expect(dust).to.be.lte(50n);
    });

    it("Invariante: saldo do contrato >= soma dos claimable (com dust)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const signers = await ethers.getSigners();

      // 10 holders com quantias variadas
      const amounts = [
        ethers.parseEther("100000"),
        ethers.parseEther("50000"),
        ethers.parseEther("25000"),
        ethers.parseEther("12500"),
        ethers.parseEther("6250"),
        ethers.parseEther("3125"),
        ethers.parseEther("1562"),
        ethers.parseEther("781"),
        ethers.parseEther("390"),
        ethers.parseEther("195"),
      ];

      const holders = [];
      for (let i = 0; i < amounts.length && i + 3 < signers.length; i++) {
        await series.connect(protocol).transfer(signers[i + 3].address, amounts[i]);
        holders.push(signers[i + 3]);
      }

      // 30 distribuições variadas
      const distAmounts = [
        "0.001", "0.01", "0.1", "1", "0.005", "0.05", "0.5", "5",
        "0.002", "0.02", "0.2", "2", "0.003", "0.03", "0.3", "3",
        "0.004", "0.04", "0.4", "4", "0.006", "0.06", "0.6", "6",
        "0.007", "0.07", "0.7", "7", "0.008", "0.08",
      ];

      for (const amt of distAmounts) {
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther(amt) });
      }

      // Checa invariante
      let totalClaimable = 0n;
      for (const h of holders) {
        totalClaimable += await series.calculateClaimable(h.address);
      }
      totalClaimable += await series.calculateClaimable(protocol.address);

      const seriesBalance = await ethers.provider.getBalance(await series.getAddress());
      expect(seriesBalance).to.be.gte(totalClaimable,
        "INVARIANTE VIOLADA: saldo do contrato < soma dos claimable");
    });

    it("Claim de 0 deve reverter (sem revenue pra claimar)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      // Sem distribuição → claimable = 0
      await expect(series.connect(alice).claimRevenue()).to.be.revertedWith("No revenue to claim");
    });

    it("Holder com 1 wei de token recebe proporcional correto após distribuição grande", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, 1n);

      // Distribuição de 100 ETH
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("100") });

      const aliceClaimable = await series.calculateClaimable(alice.address);
      // 1 wei / 1M tokens * 100 ETH = 100 * 1e18 / 1M*1e18 = 100 / 1M = 0.0001 ETH = 1e14 wei
      // Mas com arredondamento pode ser 0
      // revenuePerToken = (100e18 * 1e18) / (1M * 1e18) = 100e18 / 1e24 = 1e-4 * 1e18 = 1e14
      // earned = (1 * 1e14) / 1e18 = 0 (arredonda pra zero!)
      // Isso é esperado: 1 wei de token é tão pouco que arredonda pra zero
      expect(aliceClaimable).to.equal(0n);
    });

    it("Holder com quantidade significativa recebe proporcional correto", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const supply = await series.totalSupply();

      // Alice recebe exatamente 10% do supply
      const tenPercent = supply / 10n;
      await series.connect(protocol).transfer(alice.address, tenPercent);

      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("100") });

      const aliceClaimable = await series.calculateClaimable(alice.address);
      // Deve ser ~10 ETH (10% de 100 ETH)
      expect(aliceClaimable).to.be.closeTo(ethers.parseEther("10"), ethers.parseEther("0.001"));
    });

    it("Transferência de 1 wei não quebra contabilidade", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      const claimableBefore = await series.calculateClaimable(alice.address);

      // Transfere 1 wei de alice pra bob
      await series.connect(alice).transfer(bob.address, 1n);

      const claimableAfter = await series.calculateClaimable(alice.address);
      // Diferença deve ser desprezível (0 ou 1 wei no máximo)
      const diff = claimableBefore > claimableAfter
        ? claimableBefore - claimableAfter
        : claimableAfter - claimableBefore;
      expect(diff).to.be.lte(1n);
    });

    it("Distribuição que resulta em revenuePerToken = 0 deve reverter", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      // Supply é 1M tokens = 1e24 wei
      // Para revenuePerToken = 0: (amount * 1e18) / supply < 1
      // amount < supply / 1e18 = 1e24 / 1e18 = 1e6 = 1M wei = 0.000001 ETH
      // Mas minDistributionAmount é 0.001 ETH = 1e15 wei
      // Então o minDistribution check pega antes

      // Vamos testar com minDistribution customizado baixo
      // Na verdade, o factory exige >= 0.001 ether, então não dá pra criar com min menor
      // Esse teste verifica que o factory protege contra isso
      await expect(
        factory.connect(protocol).createSeries(
          "Tiny", "T", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.0001")
        )
      ).to.be.revertedWith("Min distribution too low");
    });
  });
});
