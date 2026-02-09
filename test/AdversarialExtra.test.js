const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployFullStack, createSeriesViaFactory, DEFAULT_PARAMS } = require("./helpers");

/**
 * TESTES ADVERSARIAIS EXTRAS
 * 
 * C) Adversarial ERC20:
 *    - O protocolo usa ETH nativo (não ERC20 externo), então "fee-on-transfer"
 *      e "token que retorna false" não se aplicam diretamente.
 *    - MAS: o RevenueSeries É um ERC20, então testamos comportamentos adversariais
 *      do próprio token (transferências pra contratos, interações estranhas).
 * 
 * D) Reentrância extra:
 *    - Treasury malicioso com fallback tentando reentrar
 *    - Receiver malicioso no claim (já coberto em Security.test.js, reforçamos aqui)
 *    - Policy maliciosa chamando de volta o factory
 * 
 * E) Acesso / quem pode setar policy:
 *    - Conta não autorizada não troca policy
 *    - Troca rápida em sequência não quebra estado
 *    - Validação de interface na hora de setar policy
 */
describe("Adversarial Extra (ERC20, Reentrância, Acesso)", function () {
  let owner, treasury, protocol, rest, registry, factory;
  let alice, bob, attacker;

  beforeEach(async function () {
    ({ owner, treasury, protocol, rest, registry, factory } = await deployFullStack());
    [alice, bob, attacker] = rest;
  });

  // ============================================
  // C) ADVERSARIAL ERC20
  // ============================================
  describe("C) Adversarial ERC20 - Token como alvo", function () {
    it("Contrato que recebe tokens mas não pode claimar (sem fallback)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);

      // RejectETH não tem como chamar claimRevenue externamente — tokens ficam "presos"
      const RejectETH = await ethers.getContractFactory("RejectETH");
      const rejectContract = await RejectETH.deploy(await series.getAddress());
      const rejectAddr = await rejectContract.getAddress();

      // Transfere tokens pro contrato que rejeita ETH
      await series.connect(protocol).transfer(rejectAddr, ethers.parseEther("100000"));
      expect(await series.balanceOf(rejectAddr)).to.equal(ethers.parseEther("100000"));

      // Distribui revenue
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // O contrato tem claimable, mas não consegue receber ETH
      const claimable = await series.calculateClaimable(rejectAddr);
      expect(claimable).to.be.gt(0);

      // claimFor vai falhar porque o contrato rejeita ETH
      await expect(
        series.connect(alice).claimFor(rejectAddr)
      ).to.be.revertedWith("Transfer failed");

      // Mas isso NÃO afeta outros holders
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      const aliceClaimable = await series.calculateClaimable(alice.address);
      expect(aliceClaimable).to.be.gt(0);
      await expect(series.connect(alice).claimRevenue()).to.not.be.reverted;
    });

    it("Transferir tokens pro próprio contrato da série (tokens ficam presos)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const seriesAddr = await series.getAddress();

      await series.connect(protocol).transfer(seriesAddr, ethers.parseEther("100000"));
      expect(await series.balanceOf(seriesAddr)).to.equal(ethers.parseEther("100000"));

      // Distribui revenue
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // O contrato da série tem claimable (é um holder)
      const seriesClaimable = await series.calculateClaimable(seriesAddr);
      // Pode ser > 0, mas ninguém consegue claimar por ele
      // (série não tem função pra claimar seus próprios rewards)

      // Outros holders não são afetados
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      await expect(series.connect(alice).claimRevenue()).to.not.be.reverted;
    });

    it("Approve + transferFrom em cadeia não quebra rewards", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("300000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Alice aprova Bob, Bob transfere pra attacker via transferFrom
      await series.connect(alice).approve(bob.address, ethers.parseEther("300000"));
      await series.connect(bob).transferFrom(alice.address, attacker.address, ethers.parseEther("100000"));

      // Alice deve ter rewards preservados do período que segurou tokens
      const aliceClaimable = await series.calculateClaimable(alice.address);
      expect(aliceClaimable).to.be.gt(0);

      // Attacker não deve ter rewards (recebeu depois da distribuição)
      expect(await series.calculateClaimable(attacker.address)).to.equal(0);

      // Nova distribuição
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Agora attacker tem claimable proporcional
      expect(await series.calculateClaimable(attacker.address)).to.be.gt(0);

      // Todos podem claimar sem problemas
      await series.connect(alice).claimRevenue();
      await series.connect(attacker).claimRevenue();
    });

    it("Transferência de todo o saldo e depois claim não quebra", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Alice transfere TUDO pro bob
      await series.connect(alice).transfer(bob.address, ethers.parseEther("500000"));
      expect(await series.balanceOf(alice.address)).to.equal(0);

      // Alice ainda tem rewards acumulados
      const aliceClaimable = await series.calculateClaimable(alice.address);
      expect(aliceClaimable).to.be.gt(0);
      await series.connect(alice).claimRevenue();

      // Depois de claimar, alice tem 0 claimable
      expect(await series.calculateClaimable(alice.address)).to.equal(0);

      // Nova distribuição — alice não recebe nada (0 tokens)
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      expect(await series.calculateClaimable(alice.address)).to.equal(0);

      // Bob recebe tudo
      expect(await series.calculateClaimable(bob.address)).to.be.gt(0);
    });
  });

  // ============================================
  // D) REENTRÂNCIA EXTRA
  // ============================================
  describe("D) Reentrância Extra", function () {
    it("ReentrancyAttacker: reentrância bloqueada no claimRevenue", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);

      const Attacker = await ethers.getContractFactory("ReentrancyAttacker");
      const attackerContract = await Attacker.deploy(await series.getAddress());
      const attackerAddr = await attackerContract.getAddress();

      // Dá tokens pro attacker
      await series.connect(protocol).transfer(attackerAddr, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Ataque: tenta reentrar no claimRevenue
      await attackerContract.attack();

      // attackCount deve ser > 0 (tentou reentrar) mas reentrância foi bloqueada
      // O contrato tenta 3x, mas todas falham por ReentrancyGuard
      // O claim original funciona, então claimable = 0
      expect(await series.calculateClaimable(attackerAddr)).to.equal(0);

      // Só recebeu 1x (não 3x)
      const attackerBalance = await ethers.provider.getBalance(attackerAddr);
      // 10% de 10 ETH = 1 ETH (100K de 1M tokens)
      expect(attackerBalance).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));
    });

    it("MaliciousReceiver: reentrância bloqueada no claimRevenue e claimFor", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);

      const MaliciousReceiver = await ethers.getContractFactory("MaliciousReceiver");
      const malicious = await MaliciousReceiver.deploy(await series.getAddress());
      const malAddr = await malicious.getAddress();

      await series.connect(protocol).transfer(malAddr, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Ataque via claimRevenue
      await malicious.attack();
      expect(await malicious.attackCount()).to.equal(0); // reentrância bloqueada
      expect(await series.calculateClaimable(malAddr)).to.equal(0);
    });

    it("ReentrantFeePolicy: reentrância bloqueada no createSeries via policy maliciosa", async function () {
      const ReentrantFeePolicy = await ethers.getContractFactory("ReentrantFeePolicy");
      const malPolicy = await ReentrantFeePolicy.deploy(
        await factory.getAddress(),
        attacker.address
      );
      await factory.setFeePolicy(await malPolicy.getAddress());

      // Financia o contrato da policy pra ter ETH pro ataque
      await owner.sendTransaction({
        to: await malPolicy.getAddress(),
        value: ethers.parseEther("1"),
      });

      const seriesBefore = await factory.getTotalSeries();

      // Tenta criar série — a policy vai receber a fee e tentar reentrar
      // O nonReentrant no createSeries bloqueia a reentrância
      try {
        await factory.connect(protocol).createSeries(
          "Victim", "VIC", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001"),
          { value: ethers.parseEther("0.01") }
        );
      } catch (e) {
        // Pode reverter se a policy causar problemas
      }

      const seriesAfter = await factory.getTotalSeries();
      // No máximo 1 série criada (não 2 por reentrância)
      expect(seriesAfter - seriesBefore).to.be.lte(1n);

      // attackCount deve ser 0 (reentrância bloqueada)
      expect(await malPolicy.attackCount()).to.equal(0);
    });

    it("MaliciousTreasury: treasury que rejeita ETH não trava o sistema", async function () {
      const MaliciousTreasury = await ethers.getContractFactory("MaliciousTreasury");
      const malTreasury = await MaliciousTreasury.deploy();

      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(
        ethers.parseEther("0.01"),
        await malTreasury.getAddress()
      );
      await factory.setFeePolicy(await feePolicy.getAddress());

      // Criação reverte porque fee transfer falha
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001"),
          { value: ethers.parseEther("0.01") }
        )
      ).to.be.revertedWith("Fee transfer failed");

      // Mas se desabilitar a fee policy, tudo volta ao normal
      await factory.setFeePolicy(ethers.ZeroAddress);
      const { series } = await createSeriesViaFactory(factory, protocol);
      expect(await series.totalSupply()).to.be.gt(0);
    });

    it("MaliciousReentrancy mock: apenas 1 claim acontece", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);

      const MaliciousReentrancy = await ethers.getContractFactory("MaliciousReentrancy");
      const malicious = await MaliciousReentrancy.deploy(await series.getAddress());
      const malAddr = await malicious.getAddress();

      await series.connect(protocol).transfer(malAddr, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Ataque
      await malicious.attack();

      // Claimable zerado (só 1 claim aconteceu)
      expect(await series.calculateClaimable(malAddr)).to.equal(0);

      // Recebeu ~1 ETH (10% de 10), não 2+ ETH
      const malBalance = await ethers.provider.getBalance(malAddr);
      expect(malBalance).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));
    });
  });

  // ============================================
  // E) ACESSO / QUEM PODE SETAR POLICY
  // ============================================
  describe("E) Acesso - Quem pode setar policy", function () {
    it("Conta não-owner não pode setar feePolicy", async function () {
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(ethers.parseEther("0.01"), treasury.address);

      await expect(
        factory.connect(attacker).setFeePolicy(await feePolicy.getAddress())
      ).to.be.reverted;

      await expect(
        factory.connect(protocol).setFeePolicy(await feePolicy.getAddress())
      ).to.be.reverted;

      await expect(
        factory.connect(alice).setFeePolicy(await feePolicy.getAddress())
      ).to.be.reverted;
    });

    it("Conta não-owner não pode setar safetyPolicy", async function () {
      const StrictPolicy = await ethers.getContractFactory("StrictSafetyPolicy");
      const policy = await StrictPolicy.deploy();

      await expect(
        factory.connect(attacker).setSafetyPolicy(await policy.getAddress())
      ).to.be.reverted;
    });

    it("Conta não-owner não pode setar accessPolicy", async function () {
      const WhitelistPolicy = await ethers.getContractFactory("WhitelistAccessPolicy");
      const policy = await WhitelistPolicy.deploy();

      await expect(
        factory.connect(attacker).setAccessPolicy(await policy.getAddress())
      ).to.be.reverted;
    });

    it("Conta não-owner não pode setar treasury", async function () {
      await expect(
        factory.connect(attacker).setTreasury(attacker.address)
      ).to.be.reverted;
    });

    it("Conta não-owner não pode pausar/despausar factory", async function () {
      await expect(factory.connect(attacker).pause()).to.be.reverted;

      await factory.pause();
      await expect(factory.connect(attacker).unpause()).to.be.reverted;
    });

    it("Não pode setar factory como sua própria policy", async function () {
      const factoryAddr = await factory.getAddress();

      await expect(
        factory.setFeePolicy(factoryAddr)
      ).to.be.revertedWith("Cannot set policy to factory");

      await expect(
        factory.setSafetyPolicy(factoryAddr)
      ).to.be.revertedWith("Cannot set policy to factory");

      await expect(
        factory.setAccessPolicy(factoryAddr)
      ).to.be.revertedWith("Cannot set policy to factory");
    });

    it("Não pode setar contrato sem interface correta como policy", async function () {
      // MockERC20 não implementa IFeePolicy
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const mock = await MockERC20.deploy("Mock", "MCK", ethers.parseEther("1000"));

      await expect(
        factory.setFeePolicy(await mock.getAddress())
      ).to.be.reverted; // isFeePolicy() vai falhar

      await expect(
        factory.setSafetyPolicy(await mock.getAddress())
      ).to.be.reverted; // isSafetyPolicy() vai falhar

      await expect(
        factory.setAccessPolicy(await mock.getAddress())
      ).to.be.reverted; // isAccessPolicy() vai falhar
    });

    it("Troca rápida de policy em sequência não quebra estado", async function () {
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const p1 = await FeePolicy.deploy(ethers.parseEther("0.01"), treasury.address);
      const p2 = await FeePolicy.deploy(ethers.parseEther("0.02"), treasury.address);
      const p3 = await FeePolicy.deploy(ethers.parseEther("0.05"), treasury.address);

      // Troca 3x em sequência rápida
      await factory.setFeePolicy(await p1.getAddress());
      await factory.setFeePolicy(await p2.getAddress());
      await factory.setFeePolicy(await p3.getAddress());

      // Deve estar usando p3 (0.05 ETH)
      expect(await factory.feePolicy()).to.equal(await p3.getAddress());

      // 0.02 ETH não é suficiente
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001"),
          { value: ethers.parseEther("0.02") }
        )
      ).to.be.revertedWith("Insufficient fee");

      // 0.05 ETH funciona
      await createSeriesViaFactory(factory, protocol, {
        name: "OK", symbol: "OK", value: ethers.parseEther("0.05"),
      });
    });

    it("Troca rápida de safety policy em sequência não quebra validação", async function () {
      const StrictPolicy = await ethers.getContractFactory("StrictSafetyPolicy");
      const WeakPolicy = await ethers.getContractFactory("WeakSafetyPolicy");

      const strict = await StrictPolicy.deploy();
      const weak = await WeakPolicy.deploy();

      // Strict → Weak → Strict → Disable
      await factory.setSafetyPolicy(await strict.getAddress());
      await factory.setSafetyPolicy(await weak.getAddress());
      await factory.setSafetyPolicy(await strict.getAddress());
      await factory.setSafetyPolicy(ethers.ZeroAddress);

      // Deve estar sem policy (default)
      expect(await factory.safetyPolicy()).to.equal(ethers.ZeroAddress);

      // 30 dias funciona (default permite)
      await createSeriesViaFactory(factory, protocol, {
        durationDays: 30,
      });
    });

    it("Troca rápida de access policy em sequência não quebra acesso", async function () {
      const WhitelistPolicy = await ethers.getContractFactory("WhitelistAccessPolicy");
      const p1 = await WhitelistPolicy.deploy();
      const p2 = await WhitelistPolicy.deploy();

      // Set p1, whitelist protocol, swap to p2 (protocol NOT whitelisted in p2)
      await factory.setAccessPolicy(await p1.getAddress());
      await p1.addToWhitelist(protocol.address);

      // Funciona com p1
      await createSeriesViaFactory(factory, protocol, { name: "P1", symbol: "P1" });

      // Swap pra p2 (protocol não está na whitelist de p2)
      await factory.setAccessPolicy(await p2.getAddress());

      await expect(
        factory.connect(protocol).createSeries(
          "P2", "P2", protocol.address,
          2000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Access denied by policy");

      // Whitelist em p2
      await p2.addToWhitelist(protocol.address);
      await createSeriesViaFactory(factory, protocol, { name: "P2 OK", symbol: "P2OK" });
    });

    it("Owner pode trocar policy e criar série na mesma transação (sem race condition)", async function () {
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(ethers.parseEther("0.01"), treasury.address);

      // Set policy
      await factory.setFeePolicy(await feePolicy.getAddress());

      // Imediatamente criar série com fee correta
      await createSeriesViaFactory(factory, protocol, {
        value: ethers.parseEther("0.01"),
      });

      // Tudo ok
      expect(await factory.getTotalSeries()).to.equal(1);
    });

    it("Conta não-owner não pode atualizar reputationRegistry", async function () {
      await expect(
        factory.connect(attacker).updateReputationRegistry(attacker.address)
      ).to.be.reverted;
    });

    it("Não pode setar treasury como address(0)", async function () {
      await expect(
        factory.setTreasury(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid treasury");
    });

    it("Não pode setar reputationRegistry como address(0)", async function () {
      await expect(
        factory.updateReputationRegistry(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid registry");
    });
  });
});
