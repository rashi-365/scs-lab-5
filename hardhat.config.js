require("@nomicfoundation/hardhat-toolbox");

/** Course baseline: Solidity 0.8.24, optimizer on, 200 runs. */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {
      // Left at the default block gas limit on purpose: one of the findings
      // in this lab is only observable against a realistic ceiling.
      allowUnlimitedContractSize: false,
    },
  },
};
