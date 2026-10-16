import express from "express";
import { workspaceToken } from "./storage.js";

export function createConnectionsRouter({ vault, fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  const router = express.Router();
  router.use((req, res, next) => { try { req.connectorWorkspace = workspaceToken(req); next(); } catch (e) { next(e); } });
  router.get("/status", (req, res, next) => {
    try {
      const connected = vault.get(req.connectorWorkspace, "serpapi");
      res.json({ serpapi: { configured: Boolean(connected?.apiKey), provider: "SerpAPI", testedAt: connected?.testedAt || null, sources: ["google", "scholar", "patents"] }, credentialStorage: "Encrypted on this server; excluded from workspace exports" });
    } catch (e) { next(e); }
  });
  router.post("/serpapi", async (req, res) => {
    const apiKey = req.body?.apiKey;
    if (typeof apiKey !== "string" || !/^[A-Za-z0-9_-]{20,200}$/.test(apiKey.trim())) return res.status(400).json({ error: "Enter a valid SerpAPI key from your SerpAPI account." });
    try {
      const url = new URL("https://serpapi.com/account.json");
      url.searchParams.set("api_key", apiKey.trim());
      const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json" } });
      if (!response.ok) { await response.body?.cancel(); return res.status(response.status === 401 || response.status === 403 ? 401 : 502).json({ error: "SerpAPI could not validate this key. Check the key and account availability." }); }
      // Account responses can include private billing details: retain none of them.
      const reader = response.body?.getReader();
      let length = 0, text = "";
      if (!reader) throw new Error("Empty response");
      const decoder = new TextDecoder();
      while (true) { const {done,value} = await reader.read(); if(done) break; length += value.byteLength; if(length > 64000) {await reader.cancel();throw new Error("Oversized response");} text += decoder.decode(value,{stream:true}); }
      text += decoder.decode();
      const data = JSON.parse(text);
      if (data.error || typeof data.account_id !== "string" || !data.account_id) throw new Error("Invalid account response");
      const testedAt = new Date().toISOString();
      vault.set(req.connectorWorkspace, "serpapi", { apiKey: apiKey.trim(), testedAt });
      res.json({ connected: true, provider: "SerpAPI", testedAt, sources: ["google", "scholar", "patents"] });
    } catch { res.status(502).json({ error: "The SerpAPI account check failed. Your existing connection was kept. Check the key or try again." }); }
  });
  router.delete("/serpapi", (req, res, next) => { try { vault.remove(req.connectorWorkspace, "serpapi"); res.json({ disconnected: true }); } catch(e) {next(e);} });
  return router;
}
