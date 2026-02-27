const { ethers } = require("ethers");
const p = new ethers.JsonRpcProvider("https://arb1.arbitrum.io/rpc");

async function main() {
  const abi = ["function getAllSeries() view returns (address[])", "function getTotalSeries() view returns (uint256)"];

  // V1 Factory
  try {
    const f1 = new ethers.Contract("0x8afA0318363FfBc29Cc28B3C98d9139C08Af737b", abi, p);
    const t = await f1.getTotalSeries();
    console.log("V1 Total:", t.toString());
    const a = await f1.getAllSeries();
    console.log("V1 Series:", JSON.stringify(a));
  } catch(e) { console.error("V1 Error:", e.message); }

  // V2 Soft Factory
  try {
    const f2 = new ethers.Contract("0x280E83c47E243267753B7E2f322f55c52d4D2C3a", abi, p);
    const a = await f2.getAllSeries();
    console.log("V2 Soft:", JSON.stringify(a));
  } catch(e) { console.error("V2 Soft Error:", e.message); }

  // V2 Escrow Factory
  try {
    const f3 = new ethers.Contract("0x2CfE9a33050EB77fC124ec3eAac4fA4D687bE650", abi, p);
    const a = await f3.getAllSeries();
    console.log("V2 Escrow:", JSON.stringify(a));
  } catch(e) { console.error("V2 Escrow Error:", e.message); }
}
main();
