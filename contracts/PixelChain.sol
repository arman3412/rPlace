// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title PixelChain — bounded-state collaborative RGB canvas.
/// @notice No administrator, external calls, payments or upgrade mechanism.
contract PixelChain {
    uint16 public constant WIDTH = 100;
    uint16 public constant PIXEL_COUNT = 10_000;
    uint64 public constant COOLDOWN = 60;
    uint256[1000] private words;
    mapping(address => uint64) public lastPlacement;

    error InvalidPixel();
    error CooldownActive(uint64 availableAt);
    event PixelPlaced(uint16 indexed pixelId, address author, uint24 color);

    function placePixel(uint16 pixelId, uint24 color) external {
        if (pixelId >= PIXEL_COUNT) revert InvalidPixel();
        uint64 last = lastPlacement[msg.sender];
        if (last != 0 && block.timestamp < uint256(last) + COOLDOWN) {
            revert CooldownActive(last + COOLDOWN);
        }
        lastPlacement[msg.sender] = uint64(block.timestamp);
        uint256 slot = pixelId / 10;
        uint256 shift = (pixelId % 10) * 24;
        uint256 mask = uint256(0xffffff) << shift;
        words[slot] = (words[slot] & ~mask) | (uint256(color ^ 0xffffff) << shift);
        emit PixelPlaced(pixelId, msg.sender, color);
    }

    /// @notice All 10,000 RGB values in 1,000 words. Lane 0 is least significant.
    /// @dev Decode color as ((word >> (lane * 24)) & 0xffffff) ^ 0xffffff.
    function getPackedCanvas() external view returns (uint256[1000] memory) {
        return words;
    }

    function getPixel(uint16 pixelId) external view returns (uint24) {
        if (pixelId >= PIXEL_COUNT) revert InvalidPixel();
        return uint24(words[pixelId / 10] >> ((pixelId % 10) * 24)) ^ 0xffffff;
    }
}
