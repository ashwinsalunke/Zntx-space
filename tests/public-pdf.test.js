import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { fetchPublicPdf, publicAddress, pdfUrl } from "../server/public-pdf.js";
const lookupImpl = async () => [{ address: "93.184.216.34", family: 4 }];
function responder(handler) {
  return (url, options, callback) => {
    const req = new EventEmitter();
    req.end = () => {
      queueMicrotask(() => {
        const spec = handler(url, options);
        const response = Readable.from([Buffer.from(spec.body || "")]);
        response.statusCode = spec.status || 200;
        response.headers = spec.headers || {};
        callback(response);
      });
    };
    return req;
  };
}
test("PDF requests reject private networks and non-HTTPS URLs", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.1.1",
    "169.254.169.254",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  for (const url of [
    "http://example.com/a.pdf",
    "file:///etc/passwd",
    "https://user:password@example.com/a.pdf",
    "https://example.com:444/a.pdf",
  ])
    assert.throws(() => pdfUrl(url));
  await assert.rejects(
    fetchPublicPdf("https://example.com/a.pdf", {
      lookupImpl: async () => [{ address: "127.0.0.1", family: 4 }],
      requestImpl: () => {
        throw Error("must not request");
      },
    }),
    /public server/,
  );
});
test("PDF reader pins DNS, validates content, and never forwards credentials", async () => {
  const bytes = await fetchPublicPdf("https://example.com/a.pdf", {
    lookupImpl,
    requestImpl: responder((url, options) => {
      assert.equal(options.headers.Authorization, undefined);
      options.lookup(url.hostname, { all: true }, (_, addresses) =>
        assert.equal(addresses[0].address, "93.184.216.34"),
      );
      return { body: "%PDF-1.7\nhello" };
    }),
  });
  assert.ok(bytes.toString().startsWith("%PDF-"));
  await assert.rejects(
    fetchPublicPdf("https://example.com/a.pdf", {
      lookupImpl,
      requestImpl: responder(() => ({ body: "<html>Sign in</html>" })),
    }),
    /web page/,
  );
  await assert.rejects(
    fetchPublicPdf("https://example.com/a.pdf", {
      lookupImpl,
      maxBytes: 8,
      requestImpl: responder(() => ({ body: "%PDF-1.7 lots of content" })),
    }),
    /20 MB/,
  );
});
test("PDF redirects are revalidated before the next connection", async () => {
  let requests = 0;
  await assert.rejects(
    fetchPublicPdf("https://example.com/a.pdf", {
      lookupImpl: async (host) => [
        {
          address: host === "example.com" ? "93.184.216.34" : "127.0.0.1",
          family: 4,
        },
      ],
      requestImpl: responder(() => {
        requests++;
        return {
          status: 303,
          headers: { location: "https://localhost/private" },
        };
      }),
    }),
    /public server/,
  );
  assert.equal(requests, 1);
});
