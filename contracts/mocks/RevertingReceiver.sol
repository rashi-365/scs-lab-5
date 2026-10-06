// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice A receiver that refuses every incoming payment.
contract RevertingReceiver {
    function enterDraw(address draw, uint256 price) external payable {
        (bool ok, ) = draw.call{value: price}(abi.encodeWithSignature("enter()"));
        require(ok, "enter failed");
    }

    receive() external payable {
        revert("I do not accept payments");
    }
}
