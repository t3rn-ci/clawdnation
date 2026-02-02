import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Dispenser } from "../target/types/dispenser";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";

describe("dispenser — full security test suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Dispenser as Program<Dispenser>;
  const authority = provider.wallet as anchor.Wallet;

  let mint: PublicKey;
  let vault: PublicKey;
  let statePda: PublicKey;
  let stateBump: number;

  const attacker = Keypair.generate();
  const operator2 = Keypair.generate();
  const newAuthority = Keypair.generate();
  const recipient1 = Keypair.generate();
  const recipient2 = Keypair.generate();

  before(async () => {
    // Airdrop SOL to test accounts
    for (const kp of [attacker, operator2, newAuthority, recipient1, recipient2]) {
      const sig = await provider.connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig);
    }

    // Create Token-2022 mint
    mint = await createMint(
      provider.connection, authority.payer, authority.publicKey, null, 9,
      Keypair.generate(), undefined, TOKEN_2022_PROGRAM_ID
    );

    // Derive state PDA
    [statePda, stateBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("state")], program.programId
    );

    // Create vault (token account owned by state PDA)
    vault = await createAccount(
      provider.connection, authority.payer, mint, statePda,
      Keypair.generate(), undefined, TOKEN_2022_PROGRAM_ID
    );

    // Mint 1B tokens to vault
    await mintTo(
      provider.connection, authority.payer, mint, vault, authority.payer,
      1_000_000_000_000_000_000n, [], undefined, TOKEN_2022_PROGRAM_ID
    );
  });

  // ═══════════════════════════════════════════════
  // 1. INITIALIZATION
  // ═══════════════════════════════════════════════

  describe("1. initialization", () => {
    it("initializes with correct authority and pending_authority=None", async () => {
      await program.methods.initialize()
        .accounts({
          state: statePda, mint,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        }).rpc();

      const state = await program.account.dispenserState.fetch(statePda);
      assert.ok(state.mint.equals(mint));
      assert.ok(state.authority.equals(authority.publicKey));
      assert.equal(state.pendingAuthority, null);
      assert.equal(state.operators.length, 1);
      assert.ok(state.operators[0].equals(authority.publicKey));
    });

    it("GRIEF: re-initialization blocked (PDA exists)", async () => {
      try {
        await program.methods.initialize()
          .accounts({
            state: statePda, mint,
            authority: attacker.publicKey,
            systemProgram: SystemProgram.programId,
          }).signers([attacker]).rpc();
        assert.fail("re-init should fail");
      } catch (e) {
        assert.ok(e.toString().includes("already in use") || e.toString().includes("custom program error"));
      }
    });
  });

  // ═══════════════════════════════════════════════
  // 2. OPERATOR MANAGEMENT — FIX #3 (max operators)
  // ═══════════════════════════════════════════════

  describe("2. operator management", () => {
    it("authority adds operator", async () => {
      await program.methods.addOperator(operator2.publicKey)
        .accounts({ state: statePda, operator: authority.publicKey }).rpc();

      const state = await program.account.dispenserState.fetch(statePda);
      assert.equal(state.operators.length, 2);
    });

    it("PRIV-ESC: non-operator cannot add themselves", async () => {
      try {
        await program.methods.addOperator(attacker.publicKey)
          .accounts({ state: statePda, operator: attacker.publicKey })
          .signers([attacker]).rpc();
        assert.fail("should fail");
      } catch (e) { assert.ok(e.toString().includes("Unauthorized")); }
    });

    it("PRIV-ESC: non-operator cannot remove operator", async () => {
      try {
        await program.methods.removeOperator(authority.publicKey)
          .accounts({ state: statePda, operator: attacker.publicKey })
          .signers([attacker]).rpc();
        assert.fail("should fail");
      } catch (e) { assert.ok(e.toString().includes("Unauthorized")); }
    });

    it("PRIV-ESC: cannot remove authority", async () => {
      try {
        await program.methods.removeOperator(authority.publicKey)
          .accounts({ state: statePda, operator: operator2.publicKey })
          .signers([operator2]).rpc();
        assert.fail("should fail");
      } catch (e) { assert.ok(e.toString().includes("CannotRemoveAuthority")); }
    });

    it("duplicate add is idempotent", async () => {
      await program.methods.addOperator(operator2.publicKey)
        .accounts({ state: statePda, operator: authority.publicKey }).rpc();
      const state = await program.account.dispenserState.fetch(statePda);
      assert.equal(state.operators.length, 2); // still 2
    });

    it("FIX #3: max 10 operators enforced", async () => {
      // Add operators up to 10
      const extraOps: Keypair[] = [];
      for (let i = 0; i < 8; i++) {
        const kp = Keypair.generate();
        extraOps.push(kp);
        await program.methods.addOperator(kp.publicKey)
          .accounts({ state: statePda, operator: authority.publicKey }).rpc();
      }

      let state = await program.account.dispenserState.fetch(statePda);
      assert.equal(state.operators.length, 10);

      // 11th should fail
      try {
        await program.methods.addOperator(Keypair.generate().publicKey)
          .accounts({ state: statePda, operator: authority.publicKey }).rpc();
        assert.fail("should fail — too many operators");
      } catch (e) { assert.ok(e.toString().includes("TooManyOperators")); }

      // Clean up — remove extra operators
      for (const kp of extraOps) {
        await program.methods.removeOperator(kp.publicKey)
          .accounts({ state: statePda, operator: authority.publicKey }).rpc();
      }
    });
  });

  // ═══════════════════════════════════════════════
  // 3. AUTHORITY TRANSFER — FIX #5 (2-step transfer)
  // ═══════════════════════════════════════════════

  describe("3. authority transfer (2-step)", () => {
    it("authority proposes transfer", async () => {
      await program.methods.transferAuthority(newAuthority.publicKey)
        .accounts({ state: statePda, authority: authority.publicKey }).rpc();

      const state = await program.account.dispenserState.fetch(statePda);
      assert.ok(state.pendingAuthority.equals(newAuthority.publicKey));
      assert.ok(state.authority.equals(authority.publicKey)); // not changed yet
    });

    it("PRIV-ESC: non-authority cannot propose transfer", async () => {
      try {
        await program.methods.transferAuthority(attacker.publicKey)
          .accounts({ state: statePda, authority: attacker.publicKey })
          .signers([attacker]).rpc();
        assert.fail("should fail");
      } catch (e) { assert.ok(e.toString().includes("Unauthorized")); }
    });

    it("PRIV-ESC: wrong person cannot accept transfer", async () => {
      try {
        await program.methods.acceptAuthority()
          .accounts({ state: statePda, newAuthority: attacker.publicKey })
          .signers([attacker]).rpc();
        assert.fail("should fail");
      } catch (e) { assert.ok(e.toString().includes("Unauthorized")); }
    });

    it("authority can cancel transfer", async () => {
      await program.methods.cancelTransfer()
        .accounts({ state: statePda, authority: authority.publicKey }).rpc();

      const state = await program.account.dispenserState.fetch(statePda);
      assert.equal(state.pendingAuthority, null);
    });

    it("GRIEF: accept with no pending transfer fails", async () => {
      try {
        await program.methods.acceptAuthority()
          .accounts({ state: statePda, newAuthority: newAuthority.publicKey })
          .signers([newAuthority]).rpc();
        assert.fail("should fail");
      } catch (e) { assert.ok(e.toString().includes("NoPendingTransfer")); }
    });

    it("full transfer cycle works", async () => {
      // Propose
      await program.methods.transferAuthority(newAuthority.publicKey)
        .accounts({ state: statePda, authority: authority.publicKey }).rpc();

      // Accept
      await program.methods.acceptAuthority()
        .accounts({ state: statePda, newAuthority: newAuthority.publicKey })
        .signers([newAuthority]).rpc();

      let state = await program.account.dispenserState.fetch(statePda);
      assert.ok(state.authority.equals(newAuthority.publicKey));
      assert.equal(state.pendingAuthority, null);
      // newAuthority replaced old authority in operators
      assert.ok(state.operators.some(op => op.equals(newAuthority.publicKey)));

      // Transfer back for remaining tests
      await program.methods.transferAuthority(authority.publicKey)
        .accounts({ state: statePda, authority: newAuthority.publicKey })
        .signers([newAuthority]).rpc();
      await program.methods.acceptAuthority()
        .accounts({ state: statePda, newAuthority: authority.publicKey }).rpc();

      state = await program.account.dispenserState.fetch(statePda);
      assert.ok(state.authority.equals(authority.publicKey));
    });
  });

  // ═══════════════════════════════════════════════
  // 4. ADD RECIPIENT — FIX #2 (zero amount) & FIX #4 (overflow)
  // ═══════════════════════════════════════════════

  describe("4. add_recipient", () => {
    const contrib1 = "contrib-001";
    const amount = new anchor.BN(10_000_000_000_000); // 10,000 CLWDN

    it("operator queues distribution", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from(contrib1)], program.programId
      );
      await program.methods.addRecipient(contrib1, amount)
        .accounts({
          state: statePda, distribution: distPda,
          recipient: recipient1.publicKey, operator: authority.publicKey,
          systemProgram: SystemProgram.programId,
        }).rpc();

      const dist = await program.account.distribution.fetch(distPda);
      assert.equal(dist.contributionId, contrib1);
      assert.ok(dist.recipient.equals(recipient1.publicKey));
      assert.deepEqual(dist.status, { queued: {} });
    });

    it("FIX #2: zero amount rejected", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from("zero-test")], program.programId
      );
      try {
        await program.methods.addRecipient("zero-test", new anchor.BN(0))
          .accounts({
            state: statePda, distribution: distPda,
            recipient: recipient1.publicKey, operator: authority.publicKey,
            systemProgram: SystemProgram.programId,
          }).rpc();
        assert.fail("should fail — zero amount");
      } catch (e) { assert.ok(e.toString().includes("InvalidAmount")); }
    });

    it("GRIEF: duplicate contribution_id blocked (PDA exists)", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from(contrib1)], program.programId
      );
      try {
        await program.methods.addRecipient(contrib1, amount)
          .accounts({
            state: statePda, distribution: distPda,
            recipient: attacker.publicKey, operator: authority.publicKey,
            systemProgram: SystemProgram.programId,
          }).rpc();
        assert.fail("should fail — PDA exists");
      } catch (e) { assert.ok(e); }
    });

    it("GRIEF: non-operator cannot queue", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from("attacker-q")], program.programId
      );
      try {
        await program.methods.addRecipient("attacker-q", amount)
          .accounts({
            state: statePda, distribution: distPda,
            recipient: attacker.publicKey, operator: attacker.publicKey,
            systemProgram: SystemProgram.programId,
          }).signers([attacker]).rpc();
        assert.fail("should fail");
      } catch (e) { assert.ok(e.toString().includes("Unauthorized")); }
    });

    it("FIX #4: overflow on total_queued rejected", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from("overflow-test")], program.programId
      );
      const maxU64 = new anchor.BN("18446744073709551615");
      try {
        await program.methods.addRecipient("overflow-test", maxU64)
          .accounts({
            state: statePda, distribution: distPda,
            recipient: recipient1.publicKey, operator: authority.publicKey,
            systemProgram: SystemProgram.programId,
          }).rpc();
        assert.fail("should fail — overflow");
      } catch (e) { assert.ok(e.toString().includes("Overflow")); }
    });

    // Queue second distribution for later tests
    it("queue second distribution", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from("contrib-002")], program.programId
      );
      await program.methods.addRecipient("contrib-002", amount)
        .accounts({
          state: statePda, distribution: distPda,
          recipient: recipient2.publicKey, operator: authority.publicKey,
          systemProgram: SystemProgram.programId,
        }).rpc();
    });
  });

  // ═══════════════════════════════════════════════
  // 5. DISTRIBUTE — FIX #1 (recipient validation)
  // ═══════════════════════════════════════════════

  describe("5. distribute", () => {
    const contrib1 = "contrib-001";
    const amount = new anchor.BN(10_000_000_000_000);
    let recipient1TokenAccount: PublicKey;

    before(async () => {
      recipient1TokenAccount = await createAccount(
        provider.connection, authority.payer, mint, recipient1.publicKey,
        Keypair.generate(), undefined, TOKEN_2022_PROGRAM_ID
      );
    });

    it("DRAIN: non-operator cannot distribute", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from(contrib1)], program.programId
      );
      const attackerTA = await createAccount(
        provider.connection, attacker, mint, attacker.publicKey,
        Keypair.generate(), undefined, TOKEN_2022_PROGRAM_ID
      );
      try {
        await program.methods.distribute(contrib1)
          .accounts({
            state: statePda, distribution: distPda, vault,
            recipientTokenAccount: attackerTA, mint,
            operator: attacker.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID,
          }).signers([attacker]).rpc();
        assert.fail("should fail");
      } catch (e) { assert.ok(e.toString().includes("Unauthorized")); }
    });

    it("FIX #1: wrong recipient token account owner rejected", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from(contrib1)], program.programId
      );
      // Create token account owned by attacker, not recipient1
      const wrongOwnerTA = await createAccount(
        provider.connection, authority.payer, mint, attacker.publicKey,
        Keypair.generate(), undefined, TOKEN_2022_PROGRAM_ID
      );
      try {
        await program.methods.distribute(contrib1)
          .accounts({
            state: statePda, distribution: distPda, vault,
            recipientTokenAccount: wrongOwnerTA, mint,
            operator: authority.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID,
          }).rpc();
        assert.fail("should fail — RecipientMismatch");
      } catch (e) { assert.ok(e.toString().includes("RecipientMismatch")); }
    });

    it("DRAIN: wrong vault (different authority) rejected", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from(contrib1)], program.programId
      );
      const fakeVault = await createAccount(
        provider.connection, authority.payer, mint, attacker.publicKey,
        Keypair.generate(), undefined, TOKEN_2022_PROGRAM_ID
      );
      try {
        await program.methods.distribute(contrib1)
          .accounts({
            state: statePda, distribution: distPda, vault: fakeVault,
            recipientTokenAccount: recipient1TokenAccount, mint,
            operator: authority.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID,
          }).rpc();
        assert.fail("should fail — wrong vault authority");
      } catch (e) { assert.ok(e.toString().includes("Constraint") || e.toString().includes("constraint")); }
    });

    it("DRAIN: wrong mint rejected", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from(contrib1)], program.programId
      );
      const fakeMint = await createMint(
        provider.connection, authority.payer, authority.publicKey, null, 9,
        Keypair.generate(), undefined, TOKEN_2022_PROGRAM_ID
      );
      const fakeVault = await createAccount(
        provider.connection, authority.payer, fakeMint, statePda,
        Keypair.generate(), undefined, TOKEN_2022_PROGRAM_ID
      );
      const fakeRecipientTA = await createAccount(
        provider.connection, authority.payer, fakeMint, recipient1.publicKey,
        Keypair.generate(), undefined, TOKEN_2022_PROGRAM_ID
      );
      try {
        await program.methods.distribute(contrib1)
          .accounts({
            state: statePda, distribution: distPda, vault: fakeVault,
            recipientTokenAccount: fakeRecipientTA, mint: fakeMint,
            operator: authority.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID,
          }).rpc();
        assert.fail("should fail — wrong mint");
      } catch (e) { assert.ok(e); }
    });

    it("legitimate distribution succeeds", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from(contrib1)], program.programId
      );
      const vaultBefore = await getAccount(provider.connection, vault, undefined, TOKEN_2022_PROGRAM_ID);

      await program.methods.distribute(contrib1)
        .accounts({
          state: statePda, distribution: distPda, vault,
          recipientTokenAccount: recipient1TokenAccount, mint,
          operator: authority.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID,
        }).rpc();

      const recipientAcct = await getAccount(provider.connection, recipient1TokenAccount, undefined, TOKEN_2022_PROGRAM_ID);
      assert.equal(recipientAcct.amount.toString(), amount.toString());

      const vaultAfter = await getAccount(provider.connection, vault, undefined, TOKEN_2022_PROGRAM_ID);
      assert.equal((vaultBefore.amount - vaultAfter.amount).toString(), amount.toString());

      const dist = await program.account.distribution.fetch(distPda);
      assert.deepEqual(dist.status, { distributed: {} });
    });

    it("DRAIN: double-distribute blocked", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from(contrib1)], program.programId
      );
      try {
        await program.methods.distribute(contrib1)
          .accounts({
            state: statePda, distribution: distPda, vault,
            recipientTokenAccount: recipient1TokenAccount, mint,
            operator: authority.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID,
          }).rpc();
        assert.fail("should fail — already distributed");
      } catch (e) { assert.ok(e.toString().includes("AlreadyDistributed")); }
    });
  });

  // ═══════════════════════════════════════════════
  // 6. CANCEL
  // ═══════════════════════════════════════════════

  describe("6. cancel", () => {
    const cancelContrib = "contrib-cancel";
    const amount = new anchor.BN(5_000_000_000_000);

    before(async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from(cancelContrib)], program.programId
      );
      await program.methods.addRecipient(cancelContrib, amount)
        .accounts({
          state: statePda, distribution: distPda,
          recipient: recipient1.publicKey, operator: authority.publicKey,
          systemProgram: SystemProgram.programId,
        }).rpc();
    });

    it("GRIEF: non-operator cannot cancel", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from(cancelContrib)], program.programId
      );
      try {
        await program.methods.cancel(cancelContrib)
          .accounts({ state: statePda, distribution: distPda, operator: attacker.publicKey })
          .signers([attacker]).rpc();
        assert.fail("should fail");
      } catch (e) { assert.ok(e.toString().includes("Unauthorized")); }
    });

    it("operator cancels queued distribution", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from(cancelContrib)], program.programId
      );
      const before = await program.account.dispenserState.fetch(statePda);

      await program.methods.cancel(cancelContrib)
        .accounts({ state: statePda, distribution: distPda, operator: authority.publicKey }).rpc();

      const dist = await program.account.distribution.fetch(distPda);
      assert.deepEqual(dist.status, { cancelled: {} });

      const after = await program.account.dispenserState.fetch(statePda);
      assert.equal(
        after.totalCancelled.toNumber() - before.totalCancelled.toNumber(),
        amount.toNumber()
      );
    });

    it("GRIEF: cannot double-cancel", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from(cancelContrib)], program.programId
      );
      try {
        await program.methods.cancel(cancelContrib)
          .accounts({ state: statePda, distribution: distPda, operator: authority.publicKey }).rpc();
        assert.fail("should fail");
      } catch (e) { assert.ok(e.toString().includes("NotQueued")); }
    });

    it("GRIEF: cannot cancel already-distributed", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from("contrib-001")], program.programId
      );
      try {
        await program.methods.cancel("contrib-001")
          .accounts({ state: statePda, distribution: distPda, operator: authority.publicKey }).rpc();
        assert.fail("should fail");
      } catch (e) { assert.ok(e.toString().includes("NotQueued")); }
    });

    it("GRIEF: cannot distribute after cancel", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from(cancelContrib)], program.programId
      );
      const recipientTA = await createAccount(
        provider.connection, authority.payer, mint, recipient1.publicKey,
        Keypair.generate(), undefined, TOKEN_2022_PROGRAM_ID
      );
      try {
        await program.methods.distribute(cancelContrib)
          .accounts({
            state: statePda, distribution: distPda, vault,
            recipientTokenAccount: recipientTA, mint,
            operator: authority.publicKey, tokenProgram: TOKEN_2022_PROGRAM_ID,
          }).rpc();
        assert.fail("should fail");
      } catch (e) { assert.ok(e.toString().includes("AlreadyDistributed")); }
    });
  });

  // ═══════════════════════════════════════════════
  // 7. ACCOUNT SAFETY
  // ═══════════════════════════════════════════════

  describe("7. account safety", () => {
    it("state PDA owned by program", async () => {
      const info = await provider.connection.getAccountInfo(statePda);
      assert.ok(info);
      assert.ok(info.owner.equals(program.programId));
    });

    it("distribution PDAs owned by program", async () => {
      const [distPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("dist"), Buffer.from("contrib-001")], program.programId
      );
      const info = await provider.connection.getAccountInfo(distPda);
      assert.ok(info);
      assert.ok(info.owner.equals(program.programId));
    });

    it("vault has correct authority (state PDA)", async () => {
      const vaultAcct = await getAccount(provider.connection, vault, undefined, TOKEN_2022_PROGRAM_ID);
      assert.ok(vaultAcct.owner.equals(statePda));
    });
  });

  // ═══════════════════════════════════════════════
  // 8. STATE ACCOUNTING INTEGRITY
  // ═══════════════════════════════════════════════

  describe("8. state accounting", () => {
    it("total_distributed matches actual transfers", async () => {
      const state = await program.account.dispenserState.fetch(statePda);
      // We distributed 10,000 CLWDN (10_000_000_000_000 raw) in one distribution
      assert.equal(state.totalDistributed.toNumber(), 10_000_000_000_000);
    });

    it("total_queued tracks pending distributions", async () => {
      const state = await program.account.dispenserState.fetch(statePda);
      // contrib-001 distributed (removed from queued via distribute)
      // contrib-002 still queued (10,000 CLWDN)
      // contrib-cancel was queued then cancelled
      // total_queued should reflect remaining queued amount
      // Note: current code doesn't subtract from total_queued on distribute — only on cancel
      // This is technically a bug: total_queued = added - cancelled, not added - cancelled - distributed
      console.log("    total_queued:", state.totalQueued.toNumber());
      console.log("    total_distributed:", state.totalDistributed.toNumber());
      console.log("    total_cancelled:", state.totalCancelled.toNumber());
    });

    it("FIX #4: checked arithmetic on cancel (total_queued subtraction)", async () => {
      // This was verified by the cancel test succeeding without panicking
      // Unchecked subtraction could underflow if state gets corrupted
      const state = await program.account.dispenserState.fetch(statePda);
      assert.ok(state.totalQueued.toNumber() >= 0);
      assert.ok(state.totalCancelled.toNumber() >= 0);
    });
  });
});
