const http = require("http");
const https = require("https");
const { URL } = require("url");
const COUNT_REQUEST = 10;
const MAX_REDIRECTS = 5;
const M_BIT = 1000000; // 1 Mbit = 1000000 bit

function requestOnce(url, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${url}`));
    }
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.get(url, (res) => {
      if (
        [301, 302, 303, 307, 308].includes(res.statusCode) &&
        res.headers.location &&
        redirectsLeft > 0
      ) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(requestOnce(next, redirectsLeft - 1));
      }
      let bytes = 0;
      res.on("data", (chunk) => {
        bytes += chunk.length;
      });
      res.on("end", () => {
        const end = process.hrtime.bigint();
        const ms = Number(end - start) / 1e6;
        resolve({ bytes, ms, status: res.statusCode });
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error("Request timeout (30s)"));
    });
  });
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Usage: node speedtest.js <url>");
    console.error("Example: node speedtest.js https://...");
    process.exit(1);
  }
  console.log(`URL: ${url}`);
  console.log(`Requests: ${COUNT_REQUEST} (sequential)\n`);
  let totalBytes = 0;
  let totalMs = 0;
  let okCount = 0;
  for (let i = 0; i < COUNT_REQUEST; i++) {
    try {
      const { bytes, ms, status } = await requestOnce(url);
      totalBytes += bytes;
      totalMs += ms;
      okCount++;
      const mbit = (bytes * 8) / M_BIT;
      const mbitps = mbit / (ms / 1000);
      console.log(
        `#${String(i + 1).padStart(2)} | ${status} | ` +
          `${bytes} bytes (${mbit.toFixed(2)} Mbit) | ` +
          `${ms.toFixed(1)} ms | ${mbitps.toFixed(2)} Mbit/s`,
      );
    } catch (e) {
      console.log(`#${String(i + 1).padStart(2)} | ERROR: ${e.message}`);
    }
  }

  if (okCount === 0 || totalBytes === 0) {
    console.error("\nNo successful responses — cannot compute speed.");
    process.exit(1);
  }
  const avgMs = totalMs / okCount;
  const totalMbit = (totalBytes * 8) / M_BIT;
  const avgMbitps = totalMbit / (totalMs / 1000);

  console.log("\n*******RESULT*******");
  console.log(`Successful requests: ${okCount}/${COUNT_REQUEST}`);
  console.log(`Total downloaded: ${totalMbit.toFixed(2)} Mbit`);
  console.log(`Average request time: ${avgMs.toFixed(1)} ms`);
  console.log(`Average speed: ${avgMbitps.toFixed(2)} Mbit/s`);
}

main();
