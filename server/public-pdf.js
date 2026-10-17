import express from "express";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
const blocked4 = new BlockList(),
  blocked6 = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
])
  blocked4.addSubnet(ip, prefix, "ipv4");
for (const [ip, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 23],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
])
  blocked6.addSubnet(ip, prefix, "ipv6");
export function publicAddress(address) {
  const family = isIP(address);
  return (
    Boolean(family) &&
    !(family === 6 ? blocked6 : blocked4).check(
      address,
      family === 6 ? "ipv6" : "ipv4",
    )
  );
}
export function pdfUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Error("Choose a valid HTTPS PDF link.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    url.href.length > 8192
  )
    throw Error("Only public HTTPS PDF links are supported.");
  return url;
}
// Resolve and pin the validated address for each redirect: never access private networks,
// forward cookies/credentials, or act as an unrestricted authenticated proxy.
export async function fetchPublicPdf(
  value,
  {
    lookupImpl = lookup,
    requestImpl = https.request,
    timeoutMs = 30000,
    maxBytes = 20 * 1024 * 1024,
  } = {},
) {
  const deadline = Date.now() + timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let url = pdfUrl(value);
    for (let redirects = 0; redirects <= 4; redirects++) {
      const hostname = url.hostname.replace(/^\[|\]$/g, "");
      const addresses = await Promise.race([
        lookupImpl(hostname, { all: true }),
        new Promise((_, reject) => {
          if (controller.signal.aborted) reject(Error("PDF timed out."));
          else
            controller.signal.addEventListener(
              "abort",
              () => reject(Error("PDF timed out.")),
              { once: true },
            );
        }),
      ]);
      if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
        throw Error("This PDF link does not point to a public server.");
      if (Date.now() >= deadline) throw Error("PDF timed out.");
      const response = await new Promise((resolve, reject) => {
        const req = requestImpl(
          url,
          {
            method: "GET",
            signal: controller.signal,
            headers: {
              Accept: "application/pdf",
              "User-Agent": "scrapeTx/0.3 (research PDF reader)",
            },
            lookup: (_host, opts, cb) => {
              const chosen = addresses[0];
              opts?.all
                ? cb(null, [chosen])
                : cb(null, chosen.address, chosen.family);
            },
          },
          resolve,
        );
        req.on("error", reject);
        req.end();
      });
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.destroy();
        if (!response.headers.location || redirects === 4)
          throw Error("The PDF source redirected too many times.");
        url = pdfUrl(new URL(response.headers.location, url).href);
        continue;
      }
      if (response.statusCode !== 200) {
        response.destroy();
        throw Error(
          "The source did not provide a downloadable PDF. Open the original source to check access.",
        );
      }
      if (Number(response.headers["content-length"]) > maxBytes) {
        response.destroy();
        throw Error("This PDF exceeds the 20 MB reader limit.");
      }
      const chunks = [];
      let length = 0;
      for await (const chunk of response) {
        length += chunk.length;
        if (length > maxBytes) {
          response.destroy();
          throw Error("This PDF exceeds the 20 MB reader limit.");
        }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")))
        throw Error(
          "This link returned a web page instead of a PDF. Open the source to find its download link.",
        );
      return bytes;
    }
  } finally {
    clearTimeout(timer);
  }
}
export function createPublicPdfRouter({ load = fetchPublicPdf } = {}) {
  const router = express.Router();
  let active = 0;
  router.get("/", async (req, res) => {
    if (typeof req.query.url !== "string")
      return res.status(400).json({ error: "A PDF source link is required." });
    if (active >= 4)
      return res
        .status(503)
        .json({ error: "The PDF reader is busy. Retry shortly." });
    active++;
    try {
      const bytes = await load(req.query.url);
      res
        .set({
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="research-paper.pdf"',
          "Cache-Control": "no-store",
        })
        .send(bytes);
    } catch (e) {
      res.status(502).json({
        error:
          e.name === "AbortError"
            ? "The PDF source timed out. Retry or open the source directly."
            : e.message?.startsWith("This ") ||
                e.message?.startsWith("The ") ||
                e.message?.startsWith("Only ") ||
                e.message?.startsWith("Choose ")
              ? e.message
              : "The PDF source could not be reached. Open the source directly or retry.",
      });
    } finally {
      active--;
    }
  });
  return router;
}
