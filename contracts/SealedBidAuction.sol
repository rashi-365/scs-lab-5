// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./interfaces/IERC20.sol";

/// @title SealedBidAuction
/// @notice Single-item auction. Bidders commit ERC-20 tokens; the highest bid
///         at close wins and the seller collects. Losing bidders withdraw.
contract SealedBidAuction {
    IERC20 public immutable token;
    address public immutable seller;

    uint256 public closesAt;
    address public highestBidder;
    uint256 public highestBid;
    address public winner;
    bool public finalized;

    mapping(address => uint256) public deposits;

    event BidPlaced(address indexed bidder, uint256 amount);
    event Finalized(address indexed winner, uint256 amount);
    event CloseTimeChanged(uint256 newCloseTime);

    constructor(address token_, uint256 durationSeconds) {
        token = IERC20(token_);
        seller = msg.sender;
        closesAt = block.timestamp + durationSeconds;
    }

    /// @notice Place a bid. Must exceed the current highest bid.
    function bid(uint256 amount) external {
        require(block.timestamp <= closesAt, "closed");
        require(amount > highestBid, "too low");
        require(token.transferFrom(msg.sender, address(this), amount), "transfer failed");

        deposits[msg.sender] += amount;
        highestBid = amount;
        highestBidder = msg.sender;
        emit BidPlaced(msg.sender, amount);
    }

    /// @notice Adjust the closing time.
    function setClosesAt(uint256 newCloseTime) external {
        require(msg.sender == seller, "not seller");
        closesAt = newCloseTime;
        emit CloseTimeChanged(newCloseTime);
    }

    /// @notice Settle the auction once the closing time has passed.
    function finalize() external {
        require(block.timestamp > closesAt, "not closed");
        require(!finalized, "already finalized");

        finalized = true;
        winner = highestBidder;
        emit Finalized(winner, highestBid);
    }

    /// @notice Losing bidders reclaim their deposits.
    function withdraw() external {
        require(finalized, "not finalized");
        require(msg.sender != winner, "winner cannot withdraw");

        uint256 amount = deposits[msg.sender];
        deposits[msg.sender] = 0;
        require(token.transfer(msg.sender, amount), "transfer failed");
    }
}
