import React, { useEffect, useRef, useState } from "react";
import { LoaderCircle, Download, ImagePlus } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "./lib.js";
import "./generated-image.css";
export function GeneratedImage({ asset, className = "" }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const control = new AbortController();
    let objectUrl;
    setUrl("");
    setError("");
    if (!asset?.id) return;
    fetch("/api/images/" + encodeURIComponent(asset.id), {
      headers: {
        "X-Workspace-Token": localStorage.getItem("zntx-workspace-token") || "",
      },
      signal: control.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error("Image unavailable in this workspace.");
        const blob = await response.blob();
        if (control.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => {
        if (!control.signal.aborted) setError(e.message);
      });
    return () => {
      control.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset?.id]);
  if (!asset?.id) return null;
  return (
    <figure className={"generated-image " + className}>
      {url ? (
        <>
          <img
            src={url}
            alt={asset.alt || "AI-generated research illustration"}
          />
          <figcaption>
            AI-generated illustration{" "}
            <a
              href={url}
              download={
                "scrapetx-illustration." +
                (asset.mime === "image/png"
                  ? "png"
                  : asset.mime === "image/webp"
                    ? "webp"
                    : "jpg")
              }
            >
              <Download size={14} /> Download image
            </a>
          </figcaption>
        </>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : (
        <p role="status">
          <LoaderCircle size={17} className="spin" /> Opening image…
        </p>
      )}
    </figure>
  );
}
export function ImageGenerator({
  context,
  prompt = "",
  onGenerated,
  asset: providedAsset,
  label = "Generate AI image",
  disabled = false,
  autoGenerate = false,
  onSave,
}) {
  const request = useRef();
  useEffect(() => () => request.current?.abort(), []);
  const [description, setDescription] = useState(prompt),
    [asset, setAsset] = useState(providedAsset),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => setDescription(prompt), [prompt]);
  useEffect(() => {
    if (!autoGenerate) return;
    const timer = setTimeout(() => create(), 0);
    return () => clearTimeout(timer);
  }, [autoGenerate]);
  async function create() {
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/images/generate", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          context,
          prompt: description.trim(),
          alt: description.trim().slice(0, 500),
        }),
      });
      if (!controller.signal.aborted) {
        setAsset(result.asset);
        onGenerated?.(result.asset);
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="image-generator">
      <div className="image-generator-heading">
        <ImagePlus size={20} />
        <div>
          <h3>AI illustration</h3>
          <p>
            Generate an image for this{" "}
            {context === "diagram" ? "diagram" : "slide"} only when you request
            it.
          </p>
        </div>
      </div>
      <label>
        Describe the image
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1800}
          rows={3}
          disabled={busy || disabled}
        />
      </label>
      <div className="inline-actions">
        <button
          className="btn primary"
          type="button"
          disabled={busy || disabled || !description.trim()}
          onClick={create}
        >
          {busy ? (
            <>
              <LoaderCircle size={16} className="spin" />
              Generating image…
            </>
          ) : (
            <>
              <ImagePlus size={16} />
              {label}
            </>
          )}
        </button>
        <Link to="/integrations">Cloudflare connection</Link>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {asset && <GeneratedImage asset={asset} />}
      {asset && onSave && (
        <button
          className="btn"
          type="button"
          onClick={async () => {
            try {
              await onSave(asset);
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Save image to My Library
        </button>
      )}
      <p className="small muted">
        Review generated text, labels and scientific details. Illustrations do
        not count as source evidence.
      </p>
    </section>
  );
}
