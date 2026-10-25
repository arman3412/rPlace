// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Comparison contracts only. Never deployed by the deployment script.
contract EventsOnly {
    mapping(address => uint64) public lastPlacement;
    event PixelPlaced(uint16 indexed pixelId, address author, uint24 color);
    function placePixel(uint16 id, uint24 color) external {
        require(id < 10000);
        uint64 last = lastPlacement[msg.sender];
        require(last == 0 || block.timestamp >= uint256(last) + 60);
        lastPlacement[msg.sender] = uint64(block.timestamp);
        emit PixelPlaced(id, msg.sender, color);
    }
}
contract PerPixelWithOwner {
    struct Pixel { address author; uint24 color; }
    mapping(uint16 => Pixel) public pixels;
    mapping(address => uint64) public lastPlacement;
    event PixelPlaced(uint16 indexed pixelId, address author, uint24 color);
    function placePixel(uint16 id, uint24 color) external {
        require(id < 10000);
        uint64 last = lastPlacement[msg.sender];
        require(last == 0 || block.timestamp >= uint256(last) + 60);
        lastPlacement[msg.sender] = uint64(block.timestamp);
        pixels[id] = Pixel(msg.sender, color);
        emit PixelPlaced(id, msg.sender, color);
    }
}

contract PackedNoCooldown {
    uint256[1000] private words;
    event PixelPlaced(uint16 indexed pixelId, address author, uint24 color);
    function placePixel(uint16 id, uint24 color) external {
        require(id < 10000);
        uint256 slot = id / 10;
        uint256 shift = (id % 10) * 24;
        uint256 mask = uint256(0xffffff) << shift;
        words[slot] = (words[slot] & ~mask) | (uint256(color ^ 0xffffff) << shift);
        emit PixelPlaced(id, msg.sender, color);
    }
}
contract PerPixelColorOnly {
    mapping(uint16 => uint24) public pixels;
    mapping(address => uint64) public lastPlacement;
    event PixelPlaced(uint16 indexed pixelId, address author, uint24 color);
    function placePixel(uint16 id, uint24 color) external {
        require(id < 10000);
        uint64 last = lastPlacement[msg.sender];
        require(last == 0 || block.timestamp >= uint256(last) + 60);
        lastPlacement[msg.sender] = uint64(block.timestamp);
        pixels[id] = color;
        emit PixelPlaced(id, msg.sender, color);
    }
}
