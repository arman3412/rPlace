# Storage and gas report

Measured with **solc 0.8.30**, optimizer **200**, Shanghai EVM, Ganache 7.9.2. These are actual local transaction receipt `gasUsed` values, including intrinsic transaction gas and applicable refunds. They estimate EVM execution on Base; **they are not a quote for total Base transaction fees**. Base also charges data-related fees, and network pricing changes. Reproduce with `npm run compile && npm run bench`. Raw results are in [gas-benchmark.json](gas-benchmark.json).

## Placement measurements

| Operation                                                     | Packed PixelChain | Events only | One slot/pixel with author |
| ------------------------------------------------------------- | ----------------: | ----------: | -------------------------: |
| First wallet, first nonwhite pixel in an empty word           |            68,448 |      45,845 |                     68,237 |
| New wallet, another pixel in an already used packed word      |            51,360 |      45,857 |                     68,249 |
| New wallet overwriting an existing pixel                      |            51,348 |      45,845 |                     51,137 |
| Returning wallet overwriting an existing pixel                |            34,336 |      28,836 |                     34,128 |
| Returning wallet, pixel in a new empty word                   |            51,448 |      28,848 |                     51,240 |
| Same color (still records author/event and consumes cooldown) |            31,548 |      28,848 |                     31,340 |
| Restore white with another colored lane in the same word      |            34,348 |      28,848 |                     34,140 |
| Clear the last nonwhite lane in a word                        |            29,548 |      28,848 |                     34,140 |

Calldata zero/nonzero bytes, old/new word state, wallet novelty, and refunds explain variation. These scenarios deliberately separate first wallet writes from first canvas-word writes. First-ever white placement has no canvas allocation but still updates cooldown/emits history. Plain one-slot baselines do not use white inversion; the final two rows write literal white in those baselines and therefore do not clear storage. The packed contract restores an empty white word to zero and receives a clearing refund. Returning-wallet measurements advance chain time by at least 60 seconds.

**Deployment:** 352,918 gas for PixelChain; no constructor writes to 1,000 canvas slots. The contract has no constructor arguments or payable setup.

## Isolating costs

The benchmark also includes `PackedNoCooldown` and `PerPixelColorOnly` comparison contracts. These are never used by the deployment script.

| Scenario                     | Packed without cooldown | Packed production | Approx. cooldown overhead |
| ---------------------------- | ----------------------: | ----------------: | ------------------------: |
| First wallet / empty word    |                  45,928 |            68,448 |                    22,520 |
| Returning wallet / overwrite |                  28,828 |            34,336 |                     5,508 |

The small differences beyond raw SSTORE costs include mapping hashing, timestamp checks, masking, and compiler/control-flow effects. Benchmark validation error paths are simpler than production's custom errors.

A **single-slot struct** containing author + RGB costs only about **152 additional gas** versus the comparable single-slot color mapping in these nonzero scenarios (68,237 versus 68,085 first write; 34,128 versus 33,976 returning overwrite). Storing an author does **not** inherently require a second slot if fields are packed. The real storage penalty is that an address prevents packing ten pixels together: it expands maximum current-state capacity from **1,000 to 10,000 slots**. Event-based authors avoid that penalty and preserve queryable provenance without updating author storage on every placement.

PixelChain's event has two topics (signature and indexed pixel id) and 64 bytes of ABI data (author + color), nominal LOG cost **1,637 gas**, excluding memory overhead. Author is not indexed: adding another topic while removing its 32 data bytes would add 119 gas. The event keeps readable, standard ABI fields rather than custom assembly encoding. Historical timestamps derive from block headers, transaction hashes/log indices from receipts; no duplicate on-chain fields are written.

## Storage bounds

- A word has ten 24-bit inverted RGB lanes: 240 used bits plus 16 unused bits.
- 10,000 pixels reserve **1,000 slots / 32,000 bytes** of logical canvas capacity. Untouched words are implicit zero; deployment does not allocate nonzero state. Current canvas storage never grows with repeated placements.
- Each distinct wallet that places pixels adds **one 32-byte cooldown slot**. Total populated state is at most **32,000 + 32 × participating wallets bytes**, excluding trie/implementation overhead. Mapping base slot is reserved but contains no stored history. A `uint64` mapping value still consumes one full slot per address.
- Events grow **linearly with successful placements**. Each has 128 raw bytes of topics + data, plus receipt/block encoding overhead. History is not free blockchain data, but it does not expand the contract's current-state trie. Failed placements emit nothing.
- Black/white, neighboring lanes, lane/slot boundaries, last coordinate, exact 24-bit colors, raw malformed calldata, and same-block overwrites are tested.

## Reading and growth

`getPackedCanvas()` returns **32,000 bytes** in one `eth_call`, versus 320,000 bytes for an ABI array of 10,000 individual uint values. Its measured execution estimate is **2,283,108 gas** before and after the stress workload. An `eth_call` does not charge the viewer ETH, but the node still performs the computation; the RPC must permit this call budget and response size. JSON hexadecimal transport roughly doubles binary size. Normal loading also fetches a block and recent logs; “one call” describes the canvas payload, not the entire app initialization.

The automated workload sent **1,000 additional successful placements** across the canvas. Afterward:

- The same full read still estimated **2,283,108 gas**.
- A returning-wallet overwrite still cost **34,336 gas**.
- Replay/history query returned **1,008 events**, in **40 ms** on this machine's in-memory provider.
- The stress placement loop took **2.63 seconds**, excluding deployment and setup. It uses unlocked local accounts and immediate mining. This measures a local harness, **not Base throughput or WAN RPC latency**. Timing varies by host.

A thousand placements is a bounded regression workload, not evidence of production-scale throughput. The contract's operation counts establish history-independent current-state/placement complexity. Real historical RPC latency depends on provider indexing, block range, retention, response limits, and matching activity.

Normal clients load the bounded current snapshot, not a complete replay. Polling adds incremental confirmed logs every four seconds. Recent feed is bounded; per-pixel history is indexed and paginated backward. A pixel last touched long ago can require many empty range queries. No trustless “latest author” shortcut is claimed: the UI reports an incomplete search until it finds a matching event or reaches deployment.

## Why not cheaper events only?

It saves roughly 5,500 gas per ordinary returning overwrite and all canvas storage. However, initial loading requires all historical events or an externally supplied snapshot. Replaying a million events on each new device creates an unbounded load and a strong incentive to trust a centralized indexer. A compact current-state checkpoint built into the contract keeps onboarding bounded and independently readable. This is a deliberate transaction-gas/read-scalability tradeoff, not a claim of absolute minimum gas.

## Further optimizations

- A contiguous bitstream needs 938 slots (30,016 bytes), saving 6.2%, but 6.25% of colors straddle words and need two read/modify/write operations. Ten-lane packing favors simple, consistently single-word placements.
- Compressed snapshots and optional open-source indexers could speed old history queries. Verify checkpoints against pinned chain state rather than treating a server as authoritative.
- A proved event-only snapshot design could reduce write gas further, at the expense of significantly greater proof/indexing complexity.
- Restricting colors to a palette, dropping cooldown enforcement, or accepting unverifiable off-chain updates would save gas but violate requirements.
- Batch writes can amortize transaction overhead but conflict with the one-pixel-per-wallet cooldown unless introducing more complex relaying/signature rules. This contract intentionally avoids that complexity.
