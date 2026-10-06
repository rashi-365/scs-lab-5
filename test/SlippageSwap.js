const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const E = ethers.parseEther;
const FAR_FUTURE = 2n ** 255n;

describe("SlippageSwap", function () {
  let swap, A, B, deployer, alice, mallory;

  beforeEach(async () => {
    [deployer, alice, mallory] = await ethers.getSigners();

    const T = await ethers.getContractFactory("MockERC20");
    A = await T.deploy("A", "A");
    B = await T.deploy("B", "B");
    await A.waitForDeployment();
    await B.waitForDeployment();

    const S = await ethers.getContractFactory("SlippageSwap");
    swap = await S.deploy(await A.getAddress(), await B.getAddress());
    await swap.waitForDeployment();
    const sw = await swap.getAddress();

    for (const who of [deployer, alice, mallory]) {
      await A.mint(who.address, E("1000"));
      await A.connect(who).approve(sw, ethers.MaxUint256);
    }
    await B.mint(deployer.address, E("1000"));
    await B.approve(sw, ethers.MaxUint256);

    await swap.seed(E("1000"), E("1000")); // 1000 A : 1000 B
  });

  afterEach(async () => {
    await network.provider.send("evm_setAutomine", [true]);
  });

  // ---------------------------------------------------------------
  // #6 minOut is never enforced
  // ---------------------------------------------------------------
  it("#6a trade succeeds even when output is far below minOut", async () => {
    // Alice quotes ~90.9 B for 100 A and asks for at least 90 B.
    const quoted = await swap.quote(E("100"));
    expect(quoted).to.be.gt(E("90"));

    // Mallory front-runs: both txs are mined in the same block, her tx first.
    await network.provider.send("evm_setAutomine", [false]);
    await swap.connect(mallory).swap(E("500"), 0, FAR_FUTURE); // pushes price
    await swap.connect(alice).swap(E("100"), E("90"), FAR_FUTURE); // minOut = 90
    await network.provider.send("evm_mine");
    await network.provider.send("evm_setAutomine", [true]);

    // Alice received ~41.7 B. The tx did NOT revert despite minOut = 90.
    expect(await B.balanceOf(alice.address)).to.be.lt(E("90"));
    expect(await B.balanceOf(alice.address)).to.be.gt(0n);
  });

  it("#6b even an absurd minOut cannot make the swap revert", async () => {
    const before = await B.balanceOf(alice.address);
    // minOut = 1,000,000 B is impossible, yet no revert.
    await expect(
      swap.connect(alice).swap(E("10"), E("1000000"), FAR_FUTURE)
    ).to.not.be.reverted;
    expect(await B.balanceOf(alice.address)).to.be.gt(before);
  });

  // ---------------------------------------------------------------
  // #7 deadline is never enforced
  // ---------------------------------------------------------------
  it("#7 an expired trade still executes", async () => {
    await expect(swap.connect(alice).swap(E("10"), 0, 1)).to.not.be.reverted; // deadline = 1970
    expect(await B.balanceOf(alice.address)).to.be.gt(0n);
  });

  it("#7b a trade held back by a validator executes later at a worse price", async () => {
    const quoteNow = await swap.quote(E("100"));

    // Alice signs a trade with a short deadline; it sits unmined.
    const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp + 60);
    await network.provider.send("evm_setAutomine", [false]);
    const pending = swap.connect(alice).swap(E("100"), 0, deadline);

    // Meanwhile someone else moves the price, and time passes beyond the deadline.
    await swap.connect(mallory).swap(E("300"), 0, FAR_FUTURE);
    await network.provider.send("evm_increaseTime", [3600]);
    await network.provider.send("evm_mine");
    await pending;
    await network.provider.send("evm_setAutomine", [true]);

    // It was mined an hour after its deadline and still got filled, worse than quoted.
    expect(await B.balanceOf(alice.address)).to.be.lt(quoteNow);
  });

  // ---------------------------------------------------------------
  // Extra: dust swap rounds output to zero and the input is lost
  // ---------------------------------------------------------------
  it("extra: tiny swap pays out 0 and keeps the input", async () => {
    const aBefore = await A.balanceOf(alice.address);
    await swap.connect(alice).swap(1n, 0, FAR_FUTURE); // 1 wei
    expect(await A.balanceOf(alice.address)).to.equal(aBefore - 1n);
    expect(await B.balanceOf(alice.address)).to.equal(0n);
  });
});