const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const E = ethers.parseEther;
const DURATION = 1000;

describe("SealedBidAuction", function () {
  let auc, tok, seller, alice, mallory;

  beforeEach(async () => {
    [seller, alice, mallory] = await ethers.getSigners();

    const T = await ethers.getContractFactory("MockERC20");
    tok = await T.deploy("Test", "TST");
    await tok.waitForDeployment();

    const F = await ethers.getContractFactory("SealedBidAuction");
    auc = await F.deploy(await tok.getAddress(), DURATION);
    await auc.waitForDeployment();

    for (const s of [alice, mallory]) {
      await tok.mint(s.address, E("100"));
      await tok.connect(s).approve(await auc.getAddress(), ethers.MaxUint256);
    }
  });

  afterEach(async () => {
    await network.provider.send("evm_setAutomine", [true]);
  });

  const warp = async (s) => {
    await network.provider.send("evm_increaseTime", [s]);
    await network.provider.send("evm_mine");
  };
  const now = async () => (await ethers.provider.getBlock("latest")).timestamp;

  // ---------------------------------------------------------------
  // #3 Seller can move the deadline at will
  // ---------------------------------------------------------------
  it("#3a seller reopens an auction that already closed", async () => {
    await auc.connect(alice).bid(E("10"));
    await warp(DURATION + 1000); // closed

    await expect(auc.connect(mallory).bid(E("20"))).to.be.revertedWith("closed");

    await auc.setClosesAt((await now()) + 1000); // seller, no restrictions
    await expect(auc.connect(mallory).bid(E("20"))).to.not.be.reverted; // live again
  });

  it("#3b seller slams the auction shut to block higher bids", async () => {
    await auc.connect(alice).bid(E("10"));
    await auc.setClosesAt(1); // a timestamp in the past
    await expect(auc.connect(mallory).bid(E("50"))).to.be.revertedWith("closed");
    await auc.finalize();
    expect(await auc.winner()).to.equal(alice.address); // low bid wins
  });

  // ---------------------------------------------------------------
  // #4 Winning tokens are never paid out to the seller
  // ---------------------------------------------------------------
  it("#4 seller never receives the winning bid; tokens are stuck", async () => {
    await auc.connect(alice).bid(E("10"));
    await warp(DURATION + 1);
    await auc.finalize();

    expect(await tok.balanceOf(seller.address)).to.equal(0n);
    expect(await tok.balanceOf(await auc.getAddress())).to.equal(E("10"));
    // Winner is blocked from withdraw(), and no function sends tokens to seller.
    await expect(auc.connect(alice).withdraw()).to.be.revertedWith(
      "winner cannot withdraw"
    );
  });

  // ---------------------------------------------------------------
  // #5 Raising your own bid: deposits and highestBid disagree
  // ---------------------------------------------------------------
  it("#5 winner who raises own bid has an earlier deposit trapped", async () => {
    await auc.connect(alice).bid(E("10"));
    await auc.connect(alice).bid(E("15")); // pays 15 more, highestBid = 15

    expect(await auc.deposits(alice.address)).to.equal(E("25"));
    expect(await auc.highestBid()).to.equal(E("15"));

    await warp(DURATION + 1);
    await auc.finalize();

    // Alice is the winner so she can't withdraw; 25 tokens are in the
    // contract but only 15 are "accounted" as the winning bid.
    await expect(auc.connect(alice).withdraw()).to.be.revertedWith(
      "winner cannot withdraw"
    );
    expect(await tok.balanceOf(await auc.getAddress())).to.equal(E("25"));
  });

  // ---------------------------------------------------------------
  // Extra: previous leader's money is not auto-refunded and
  // losing bidders can still withdraw only after finalize
  // ---------------------------------------------------------------
  it("extra: bid() and setClosesAt() still work after finalize", async () => {
    await auc.connect(alice).bid(E("10"));
    await warp(DURATION + 1);
    await auc.finalize();

    // Seller reopens after finalize, so bid() is live again post-settlement.
    await auc.setClosesAt((await now()) + 1000);
    await expect(auc.connect(mallory).bid(E("20"))).to.not.be.reverted;
    expect(await auc.highestBidder()).to.equal(mallory.address);
    expect(await auc.winner()).to.equal(alice.address); // winner out of sync
  });
});