const { calculateHash } = require("./utils");
const db = require("./db/index.js");

class Block {
  constructor(index, timestamp, previousHash, hash, data, nonce, difficulty) {
    this.index = index; // block height
    this.timestamp = timestamp;
    this.previousHash = previousHash;
    this.hash = hash;
    this.data = data;
    this.nonce = nonce;
    this.difficulty = difficulty;
  }
}

class Blockchain {
  constructor() {
    this.init();
  }

  createGenesisBlock() {
    return new Block(
      0,
      0,
      "0",
      calculateHash(0, "0", 0, 0),
      "Genesis Block",
      0,
      this.difficulty
    );
  }

  async isValidBlock(proposedBlock) {
    const latestBlock = await this.getLatestBlock();

    // Check if the block hash meets the difficulty requirement
    if (
      proposedBlock.hash.substring(0, proposedBlock.difficulty) !==
      Array(proposedBlock.difficulty + 1).join("0")
    ) {
      console.log("Block hash does not meet difficulty requirements.");
      return false;
    }

    // Check if the block's hash matches its contents
    const proposedBlockHash = calculateHash(
      proposedBlock.index,
      proposedBlock.previousHash,
      proposedBlock.data,
      proposedBlock.timestamp,
      proposedBlock.nonce
    );
    if (proposedBlockHash !== proposedBlock.hash) {
      console.log("Block hash does not match block contents.");
      return false;
    }

    // Check if the previous hash matches the hash of the latest block on the chain
    if (proposedBlock.previousHash !== latestBlock.hash) {
      console.log("Previous hash does not match hash of the latest block.");
      return false;
    }

    const blockchain = await db.find("blockchain", {});

    const keys = Object.keys(proposedBlock?.data?.[0])
    if(keys.length !== 2 || !keys.includes('coinbase', 'amount')) {
      return false;
    }

    const coinbase = proposedBlock?.data?.[0]?.coinbase;
    const amount = proposedBlock?.data?.[0]?.amount;
    // Check if the block height is correct
    if (!coinbase) {
      console.log("Block height is incorrect.");
      return false;
    }
    // Check if the block height is correct
    if (amount != blockchain[0]["miningReward"]) {
      console.log("Block height is incorrect.");
      return false;
    }
    // All checks passed
    return true;
  }

  async getLatestBlock() {
    const blocks = await db.find("blocks", {});

    return blocks[blocks.length - 1];
  }

  async adjustDifficulty(numBlocks) {
    const blockchain = await db.find("blockchain", {});
    const difficulty = blockchain[0].difficulty;
    const targetMineTime = blockchain[0].targetMineTime;

    const recentBlocks = await this.getRecentBlocks(numBlocks);

    if (recentBlocks.length < numBlocks) return; // If we don't have enough blocks yet, don't adjust

    const avgMineTime = await this.getAverageMineTime(recentBlocks);

    if (avgMineTime < targetMineTime) {
      await db.update("blockchain", {}, { $inc: { difficulty: 1 } });
    } else if (difficulty > 1) {
      // Ensure difficulty never drops below 1
      await db.update("blockchain", {}, { $inc: { difficulty: -1 } });
    }
  }

  async getRecentBlocks(n) {
    const blocks = await db.find("blocks", {});
    if (blocks.length <= n) {
      return blocks.slice(1); // Exclude genesis block
    } else {
      return blocks.slice(-n); // Get last n blocks
    }
  }

  async getAverageMineTime(blocks) {
    let total = 0;

    for (let i = 1; i < blocks.length; i++) {
      total += blocks[i].timestamp - blocks[i - 1].timestamp;
    }

    return total / (blocks.length - 1);
  }

  async init() {
    const blockchain = await db.find("blockchain", {});
    if (blockchain.length == 0) {
      await db.insert("blockchain", [
        {
          name: "particles",
          difficulty: 1,
          miningReward: 50,
          pendingTransactions: [],
          adjustDifficultyBlocks: 3,
          targetMineTime: 5000,
        },
      ]);
    }
    const blocks = await db.find("blocks", {});
    if (blocks.length == 0) {
      await db.insert("blocks", [this.createGenesisBlock()]);
    }
    const wallets = await db.find("wallets", {});
    if (wallets.length == 0) {
      await db.insert("wallets", []);
    }
  }

  async mineBlock(proposedBlock) {
    const blockchain = await db.find("blockchain", {});
    const adjustDifficultyBlocks = blockchain[0].adjustDifficultyBlocks;

    const isValidBlock = await this.isValidBlock(proposedBlock);

    if (isValidBlock) {
      await db.insert("blocks", [proposedBlock]);

      const blocks = await db.find("blocks", {});

      // In the minePendingTransactions method:

      if ((blocks.length - 1) % adjustDifficultyBlocks === 0) {
        // Exclude genesis block in the count
        await this.adjustDifficulty(adjustDifficultyBlocks); // Adjust difficulty based on the last 10 blocks
      }
      if (!proposedBlock?.data) {
        return false;
      }
      const coinbase = proposedBlock?.data?.[0]?.coinbase;
      const amount = proposedBlock?.data?.[0]?.amount;
      const wallet = await this.getBalanceOfAddress(coinbase);
      if (wallet.address) {
        await db.update(
          "wallets",
          { address: coinbase },
          { $inc: { balance: amount } }
        );
      } else {
        await db.insert("wallets", [
          {
            address: coinbase,
            balance: amount,
          },
        ]);
      }

      console.log(
        "Block accepted. New block hash: " +
          proposedBlock.hash +
          " height: " +
          proposedBlock.index +
          " coinbase: " +
          proposedBlock.data[0]?.coinbase
      );

      return true;
    } else {
      return false;
    }
  }

  async getBalanceOfAddress(address) {
    const wallets = await db.find("wallets", { address: address });

    return wallets?.[0] || {};
  }

  async miningInfo() {
    const blockchain = await db.find("blockchain", {});
    const blocks = await db.find("blocks", {});
    const wallets = await db.find("wallets", {});
    return {
      minersSize: wallets.length,
      difficulty: blockchain[0].difficulty,
      latestBlock: blocks[blocks.length - 1],
      adjustDifficultyBlocks: blockchain[0].adjustDifficultyBlocks,
      miningReward: blockchain[0].miningReward,
      pendingTransactions: blockchain[0].pendingTransactions,
    };
  }

  async sync() {
    
  }

  async wallets() {
    return await db.find("wallets", {});
  }

  async blockchain() {
    return db.find("blockchain", {})?.[0] || {};
  }

  async blocks(index) {
    const blocks = await db.find("blocks", { index });
    return blocks?.[0] || {};
  }
}

module.exports = { Blockchain, Block, db };
