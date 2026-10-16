function workspaceToken() {
  let token = localStorage.getItem("zntx-workspace-token");
  if (!/^[a-f0-9]{64}$/.test(token || "")) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
    localStorage.setItem("zntx-workspace-token", token);
  }
  return token;
}

export async function exportFile(kind, payload, { signal } = {}) {
  if (!["document", "slides"].includes(kind))
    throw new Error("Choose a document or slides export.");
  const response = await fetch(`/api/export/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Workspace-Token": workspaceToken(),
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) {
    let message = "The export could not be completed. Please try again.";
    try {
      const error = await response.json();
      if (typeof error.error === "string") message = error.error;
    } catch {
      /* Do not display a proxy's HTML error page. */
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const extension =
    kind === "slides"
      ? "pptx"
      : ["docx", "tex", "html"].includes(payload.format)
        ? payload.format
        : "txt";
  const fromServer = /filename="([^"]+)"/i.exec(
    response.headers.get("Content-Disposition") || "",
  )?.[1];
  const name =
    fromServer?.replace(/[^a-zA-Z0-9._ -]/g, "").slice(0, 150) ||
    `zntx-research.${extension}`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename: name, size: blob.size, type: blob.type };
}

export const exportDocument = (payload, options) =>
  exportFile("document", payload, options);
export const exportSlides = (payload, options) =>
  exportFile("slides", payload, options);
