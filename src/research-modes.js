export const researchModes = [
  { id: "deep", title: "Deep Research", description: "Search scholarly sources and synthesize cited evidence.", icon: "telescope" },
  { id: "systematic", title: "Systematic Research · PRISMA 2020", description: "Set up a review project, screen papers, and record decisions.", icon: "atom" },
  { id: "verified", title: "Verified Report", description: "Draft an evidence report with source checks and explicit gaps.", icon: "check" },
  { id: "biomedical", title: "Biomedical Agent", description: "Explore biomedical papers, compounds, and clinical trials.", icon: "flask" },
];

export function researchModePath(mode, query = "") {
  const q = query.trim();
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  let path = "/chat";
  if (mode === "systematic") { path = "/projects"; params.set("new", "1"); }
  else if (mode === "biomedical") { path = "/pharma"; params.set("tool", "pubmed"); }
  else { if (q) params.set("auto", "1"); if (mode === "verified") params.set("mode", "verified"); }
  return path + (params.size ? "?" + params : "");
}
