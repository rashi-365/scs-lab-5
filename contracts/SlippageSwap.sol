// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./interfaces/IERC20.sol";

/// @title SlippageSwap
/// @notice Minimal constant-product swap desk. Callers pass a minimum
///         acceptable output and a deadline to protect their trade.
contract SlippageSwap {
    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;

    uint256 public reserveA;
    uint256 public reserveB;

    event Swapped(address indexed trader, uint256 amountIn, uint256 amountOut);

    constructor(address tokenA_, address tokenB_) {
        tokenA = IERC20(tokenA_);
        tokenB = IERC20(tokenB_);
    }

    function seed(uint256 amountA, uint256 amountB) external {
        require(tokenA.transferFrom(msg.sender, address(this), amountA), "seed A failed");
        require(tokenB.transferFrom(msg.sender, address(this), amountB), "seed B failed");
        reserveA += amountA;
        reserveB += amountB;
    }

    /// @param amountIn  tokenA offered
    /// @param minOut    minimum tokenB the caller will accept
    /// @param deadline  unix timestamp after which the trade should not execute
    function swap(uint256 amountIn, uint256 minOut, uint256 deadline)
        external
        returns (uint256 out)
    {
        require(amountIn > 0, "zero input");
        require(tokenA.transferFrom(msg.sender, address(this), amountIn), "input failed");

        out = (amountIn * reserveB) / (reserveA + amountIn);

        reserveA += amountIn;
        reserveB -= out;

        require(tokenB.transfer(msg.sender, out), "output failed");
        emit Swapped(msg.sender, amountIn, out);
    }

    function quote(uint256 amountIn) external view returns (uint256) {
        return (amountIn * reserveB) / (reserveA + amountIn);
    }
}
