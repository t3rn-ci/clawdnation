const { Connection, PublicKey } = require("@solana/web3.js");

async function main() {
  const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  const statePDA = new PublicKey("7bRFM9gbqxvXmkvQ1BCtEMGmafSXEnjquJSVLnLdEaNi");
  const info = await conn.getAccountInfo(statePDA);
  const data = info.data;
  
  console.log("Account length:", data.length, "bytes");
  console.log("Byte at offset 40 (hasPending):", data[40]);
  
  const readU64 = (buf, o) => buf.readBigUInt64LE(o);
  
  // Try with fixed 33-byte Option (1 tag + 32 data always)
  let off = 8 + 32 + 33;
  console.log("\n=== Fixed 33-byte Option ===");
  console.log("LP:", new PublicKey(data.slice(off, off+32)).toBase58()); off+=32;
  console.log("Master:", new PublicKey(data.slice(off, off+32)).toBase58()); off+=32;
  console.log("Staking:", new PublicKey(data.slice(off, off+32)).toBase58()); off+=32;
  console.log("startRate:", readU64(data, off).toString()); off+=8;
  console.log("endRate:", readU64(data, off).toString()); off+=8;
  console.log("allocationCap:", Number(readU64(data, off))/1e9); off+=8;
  console.log("minContribution:", Number(readU64(data, off))/1e9, "SOL"); off+=8;
  console.log("maxPerWallet:", Number(readU64(data, off))/1e9, "SOL"); off+=8;
  console.log("paused:", data[off]); off+=1;
  console.log("complete:", data[off]); off+=1;
  console.log("totalContributed:", Number(readU64(data, off))/1e9, "SOL"); off+=8;
  console.log("totalAllocated:", Number(readU64(data, off))/1e9, "CLWDN"); off+=8;
  console.log("contributorCount:", readU64(data, off).toString()); off+=8;
  console.log("lpReceived:", Number(readU64(data, off))/1e9, "SOL"); off+=8;
  console.log("masterReceived:", Number(readU64(data, off))/1e9, "SOL"); off+=8;
  console.log("stakingReceived:", Number(readU64(data, off))/1e9, "SOL"); off+=8;
  
  // Try with dynamic 1-byte Option (None)
  off = 8 + 32 + 1;
  console.log("\n=== Dynamic 1-byte Option (None) ===");
  console.log("LP:", new PublicKey(data.slice(off, off+32)).toBase58()); off+=32;
  console.log("Master:", new PublicKey(data.slice(off, off+32)).toBase58()); off+=32;
  console.log("Staking:", new PublicKey(data.slice(off, off+32)).toBase58()); off+=32;
  console.log("startRate:", readU64(data, off).toString()); off+=8;
  console.log("endRate:", readU64(data, off).toString()); off+=8;
  console.log("allocationCap:", Number(readU64(data, off))/1e9); off+=8;
  console.log("minContribution:", Number(readU64(data, off))/1e9, "SOL"); off+=8;
  console.log("maxPerWallet:", Number(readU64(data, off))/1e9, "SOL"); off+=8;
  console.log("paused:", data[off]); off+=1;
  console.log("complete:", data[off]); off+=1;
  console.log("totalContributed:", Number(readU64(data, off))/1e9, "SOL"); off+=8;
  console.log("totalAllocated:", Number(readU64(data, off))/1e9, "CLWDN"); off+=8;
  console.log("contributorCount:", readU64(data, off).toString()); off+=8;
  console.log("lpReceived:", Number(readU64(data, off))/1e9, "SOL"); off+=8;
  console.log("masterReceived:", Number(readU64(data, off))/1e9, "SOL"); off+=8;
  console.log("stakingReceived:", Number(readU64(data, off))/1e9, "SOL"); off+=8;
}
main().catch(console.error);
