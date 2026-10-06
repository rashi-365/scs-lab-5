// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title LuckyDraw
/// @notice Buy a ticket, wait for the draw time, one entrant takes the pot.
contract LuckyDraw {
    address[] public entrants;
    uint256 public immutable drawTime;
    uint256 public immutable ticketPrice;

    address public winner;
    bool public drawn;

    event Entered(address indexed entrant);
    event Drawn(address indexed winner, uint256 amount);

    constructor(uint256 delaySeconds, uint256 ticketPrice_) {
        drawTime = block.timestamp + delaySeconds;
        ticketPrice = ticketPrice_;
    }

    function enter() external payable {
        require(msg.value == ticketPrice, "wrong ticket price");
        require(!drawn, "already drawn");
        entrants.push(msg.sender);
        emit Entered(msg.sender);
    }

    function draw() external {
        require(block.timestamp >= drawTime, "too early");
        require(!drawn, "already drawn");
        require(entrants.length > 0, "no entrants");

        drawn = true;
        uint256 seed = uint256(
            keccak256(abi.encodePacked(block.timestamp, block.prevrandao, entrants.length))
        );
        winner = entrants[seed % entrants.length];

        uint256 pot = address(this).balance;
        payable(winner).transfer(pot);
        emit Drawn(winner, pot);
    }

    function entrantCount() external view returns (uint256) {
        return entrants.length;
    }
}
