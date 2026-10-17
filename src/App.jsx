import PromptSuggestions from "./PromptSuggestions.jsx";
import { toolExamples } from "./tool-examples.js";
import { wantsResearchGuide } from "../shared/research-guide.js";
import { ImageGenerator } from "./GeneratedImage.jsx";
import SourcePdfReader, { pdfReaderLink } from "./SourcePdfReader.jsx";
import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  lazy,
  Suspense,
} from "react";
import {
  Routes,
  Route,
  NavLink,
  Link,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import {
  Home,
  Layers,
  Library,
  Files,
  FileText,
  FileSearch,
  PenLine,
  Shapes,
  Quote,
  ScanText,
  Zap,
  Search,
  Plus,
  PanelLeft,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowRight,
  Mic,
  BookOpen,
  Bookmark,
  Check,
  X,
  Download,
  Copy,
  ExternalLink,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Table2,
  Clock,
  Globe,
  MoreHorizontal,
  LoaderCircle,
  Upload,
  MessageSquare,
  ArrowLeft,
  Sparkles,
  FlaskConical,
  Atom,
  Brain,
  GraduationCap,
  Leaf,
  Network,
  Presentation,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Bold,
  Italic,
  Heading2,
  Save,
  FileDown,
  Menu,
  Info,
  Settings2,
  FolderOpen,
  RotateCcw,
  CheckCheck,
  ShieldCheck,
  Bot,
  Database,
} from "lucide-react";
import BrandLogo from "./Brand.jsx";
import { api, download, citation, csv, excerpt, wordCount, sourceUrl, bibliographyHtml } from "./lib.js";
import { relevantPassages } from "../server/research.js";
import AiPanel from "./AiPanel.jsx";
import { exportDocument, exportSlides } from "./export-client.js";
import { templateById, templateContent } from "./templates.js";
import { researchModes } from "./research-modes.js";
import SearchRefinements, { SearchProcess } from "./SearchRefinements.jsx";
import ResearchTable from "./ResearchTable.jsx";
import SourceVerification, { PaperVerification } from "./SourceVerification.jsx";
import { defaultResearchFilters, filterResearchPapers, normalizeResearchFilters } from "./research-filters.js";
const PdfWorkspace = lazy(() => import("./PdfWorkspace.jsx"));
const PharmaHub = lazy(() => import("./PharmaHub.jsx"));
const DockingWorkspace = lazy(() => import("./DockingWorkspace.jsx"));
const ResearchProjects = lazy(() => import("./ResearchProjects.jsx"));
const Integrations = lazy(() => import("./Integrations.jsx"));
const ResearchChat = lazy(() => import("./ResearchChat.jsx"));
const HomeWorkspace = lazy(() => import("./HomeWorkspace.jsx"));
const LibraryWorkspace = lazy(() => import("./LibraryWorkspace.jsx"));
const SourceWorkspace = lazy(() => import("./SourceWorkspace.jsx"));
const TemplatesWorkspace = lazy(() => import("./TemplatesWorkspace.jsx"));
const AgentGallery = lazy(() => import("./AgentGallery.jsx"));
const AutomationWorkspace = lazy(() => import("./AutomationWorkspace.jsx"));
const ResearchWorkflow = lazy(() => import("./ResearchWorkflow.jsx"));
const Ctx = createContext();
export const useApp = () => useContext(Ctx);
const navigation = [
  ["/", Home, "Home"],
  ["/research-workflow", FileText, "Start Research"],
  ["/agents", Network, "Agent Gallery"],
  ["/automations", Clock, "Research Watches"],
  ["/templates", Files, "Templates"],
  ["/chat-pdf", MessageSquare, "Chat with PDF"],
  ["/search", FileSearch, "Literature Review"],
  ["/pharma", FlaskConical, "Pharma Research"],
  ["/verification", ShieldCheck, "Source Checks"],
  ["/projects", FolderOpen, "Research Projects"],
  ["/chat", Bot, "Research Agent"],
  ["/ai-writer", PenLine, "AI Writer"],
  ["/concepts", Search, "Find Topics"],
  ["/paraphraser", ScanText, "Paraphraser"],
  ["/citation-generator", Quote, "Citation Generator"],
  ["/extract-data", Database, "Extract Data"],
  ["/docking", Atom, "Molecular Docking"],
  ["/ai-detector", ScanText, "AI Detector"],
  ["/ai-humanizer", Sparkles, "AI Humanizer"],
];
function Logo({ full = true }) {
  return <BrandLogo compact={!full} />;
}
export function Button({
  children,
  icon: Icon,
  primary = false,
  className = "",
  ...props
}) {
  return (
    <button
      className={`btn ${primary ? "primary" : ""} ${className}`}
      {...props}
    >
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </button>
  );
}
export function Empty({ icon: Icon = FolderOpen, title, children }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={28} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function App() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("zntx-collapsed") === "true",
  );
  const [mobile, setMobile] = useState(false);
  const [isNarrow, setIsNarrow] = useState(
    () => window.matchMedia("(max-width: 759px)").matches,
  );
  const [library, setLibrary] = useState([]);
  const [workspaceConfig, setWorkspaceConfig] = useState(null);
  const [history, setHistory] = useState([]);
  const [toast, setToast] = useState(null);
  const [help, setHelp] = useState(false);
  const [status, setStatus] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const timer = useRef();
  useEffect(() => {
    const media = window.matchMedia("(max-width: 759px)");
    const update = () => setIsNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobile) return;
    document.querySelector(".sidebar a")?.focus();
    const close = (event) => {
      if (event.key === "Escape") {
        setMobile(false);
        document.querySelector(".mobile-menu")?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [mobile]);
  const notify = (message, error = false) => {
    clearTimeout(timer.current);
    setToast({ message, error });
    timer.current = setTimeout(() => setToast(null), 4500);
  };
  const refreshHistory = () =>
    api("/api/history")
      .then(setHistory)
      .catch(() => {});
  useEffect(() => {
    api("/api/config")
      .then(setWorkspaceConfig)
      .catch(() => {});
    api("/api/library")
      .then(setLibrary)
      .catch((e) => notify(e.message, true));
    refreshHistory();
  }, []);
  useEffect(() => {
    setMobile(false);
    document.querySelector("main")?.scrollTo(0, 0);
    window.scrollTo(0, 0);
    document.title = `${navigation.find((n) => n[0] === location.pathname)?.[2] || { "/library": "My Library", "/diagrams": "Diagrams", "/presentation": "Presentation", "/read-pdf": "PDF Reader" }[location.pathname] || "Research workspace"} · scrapeTx`;
  }, [location.pathname]);
  const savePaper = async (p) => {
    try {
      if (library.some((x) => x.id === p.id)) {
        await api("/api/library/" + encodeURIComponent(p.id), {
          method: "DELETE",
        });
        setLibrary((v) => v.filter((x) => x.id !== p.id));
        notify("Source removed from your library.");
      } else {
        await api("/api/library", { method: "POST", body: JSON.stringify(p) });
        setLibrary((v) => [p, ...v]);
        notify("Source saved to your library.");
      }
    } catch (e) {
      notify(e.message, true);
    }
  };
  const refreshLibrary = () => api("/api/library").then(setLibrary);
  const saveNote = async (data) => {
    const record = { ...data, id: data.id || crypto.randomUUID(), type: "research-note", createdAt: data.createdAt || new Date().toISOString() };
    await api("/api/records/notes/" + record.id, { method: "PUT", body: JSON.stringify(record) });
    notify("Saved to My Library.");
    return record;
  };
  const toggleSidebar = () => {
    if (innerWidth < 760) {
      setMobile((v) => !v);
    } else {
      setCollapsed((v) => {
        localStorage.setItem("zntx-collapsed", !v);
        return !v;
      });
    }
  };
  const activeName =
    navigation.find((n) => n[0] === location.pathname)?.[2] ||
    {
      "/library": "My Library",
      "/diagrams": "Diagrams",
      "/presentation": "Presentation", "/read-pdf": "PDF Reader",
    }[location.pathname] ||
    "Research workspace";
  return (
    <Ctx.Provider
      value={{ library, savePaper, refreshLibrary, saveNote, history, refreshHistory, notify, navigate }}
    >
      <div
        className={`app ${collapsed ? "collapsed" : ""} ${mobile ? "mobile-open" : ""}`}
      >
        {mobile && (
          <button
            className="sidebar-scrim"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          />
        )}
        <aside
          className="sidebar"
          aria-label="Main navigation"
          inert={isNarrow && !mobile ? true : undefined}
        >
          <div className="sidebar-brand">
            <Link to="/" aria-label="scrapeTx home">
              <Logo full={!collapsed || isNarrow} />
            </Link>
            <button
              className="icon-btn collapse-btn"
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
            >
              <PanelLeft size={17} />
            </button>
          </div>
          <div className="sidebar-scroll"><nav aria-label="Research tools">
            {navigation.slice(0, 15).map(([path, Icon, label]) => (
              <NavLink
                end={path === "/"}
                key={path}
                to={path}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <Icon size={17} strokeWidth={1.65} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <details className="sidebar-utilities" open={["/extract-data", "/docking", "/ai-detector", "/ai-humanizer", "/integrations", "/library"].includes(location.pathname) || undefined}><summary><MoreHorizontal size={18} /><span>More tools</span><ChevronDown size={14}/></summary>
            {navigation.slice(15).map(([path, Icon, label]) => <NavLink key={path} to={path} title={collapsed ? label : undefined} className={({isActive}) => `nav-item ${isActive ? "active" : ""}`}><Icon size={17} strokeWidth={1.65}/><span>{label}</span></NavLink>)}
          <div className="sidebar-secondary">
            <NavLink to="/library" className="nav-item" title="My Library">
              <Library size={17} />
              <span>
                My Library <small>{library.length || ""}</small>
              </span>
            </NavLink>
            {!collapsed && history.length > 0 && (
              <div className="recent">
                <span className="section-label">Recent searches</span>
                {history
                  .filter(
                    (h, i, a) => a.findIndex((x) => x.query === h.query) === i,
                  )
                  .slice(0, 3)
                  .map((h) => (
                    <Link
                      key={h.id}
                      to={
                        "/search?q=" +
                        encodeURIComponent(h.query) +
                        "&source=" +
                        h.source
                      }
                    >
                      <MessageSquare size={13} />
                      <span>{h.query}</span>
                    </Link>
                  ))}
              </div>
            )}
          </div>
          </details></div>
        </aside>
        <main
          className={location.pathname === "/" ? "home-main" : ""}
          inert={isNarrow && mobile ? true : undefined}
        >
          <header
            className={`topbar ${location.pathname === "/" ? "home-topbar" : ""}`}
          >
            <div className="header-left">
              <button
                className="icon-btn mobile-menu"
                aria-label="Open navigation"
                onClick={toggleSidebar}
              >
                <Menu size={20} />
              </button>
              {location.pathname === "/" && (
                <Link
                  className="mobile-brand"
                  to="/"
                  aria-label="scrapeTx home"
                >
                  <Logo full={false} />
                </Link>
              )}
              {location.pathname !== "/" && (
                <div className="breadcrumbs">
                  <Link to="/">Home</Link>
                  <ChevronRight size={14} />
                  <span>{activeName}</span>
                </div>
              )}
            </div>
            <div className="header-actions">
              <button
                className="text-btn public-data"
                onClick={() => setStatus(true)}
              >
                <Globe size={14} /> Public data
              </button>
              <Link className="btn library-link" to="/library">
                <Library size={14} /> My Library
              </Link>
              <button
                className="btn primary workspace-badge"
                onClick={() => setStatus(true)}
              >
                Research workspace
              </button>
              <button className="workspace-avatar" aria-label="Workspace information" onClick={() => setStatus(true)}>S</button>
            </div>
          </header>
          <Suspense
            fallback={
              <div className="empty" role="status">
                <LoaderCircle className="spin" size={24} />
                <p>Opening your workspace…</p>
              </div>
            }
          >
            <Routes>
              <Route
                path="/"
                element={<HomeWorkspace key={location.state?.reset || "home"} />}
              />
              <Route path="/search" element={<ResearchPage />} />
              <Route path="/pharma" element={<PharmaHub />} />
              <Route path="/docking" element={<DockingWorkspace />} />
              <Route path="/verification" element={<SourceVerification />} />
              <Route path="/projects" element={<ResearchProjects />} />
              <Route path="/research-workflow" element={<ResearchWorkflow />} />
              <Route path="/integrations" element={<Integrations />} />
              <Route path="/chat" element={<ResearchChat key={location.pathname + location.search} />} />
              <Route path="/chat/:id" element={<ResearchChat key={location.pathname} />} />
              <Route path="/library" element={<LibraryWorkspace />} />
              <Route path="/sources/:sourceId" element={<SourceWorkspace />} />
              <Route path="/agents" element={<AgentGallery />} />
              <Route path="/automations" element={<AutomationWorkspace />} />
              <Route path="/templates" element={<TemplatesWorkspace />} />
              <Route path="/read-pdf" element={<SourcePdfReader />} />
              <Route path="/chat-pdf" element={<PdfWorkspace />} />
              <Route path="/extract-data" element={<PdfWorkspace extract />} />
              <Route path="/ai-writer" element={<Writer />} />
              <Route path="/concepts" element={<Topics />} />
              <Route path="/citation-generator" element={<Citations />} />
              <Route
                path="/paraphraser"
                element={<TextTool kind="paraphraser" />}
              />
              <Route
                path="/ai-humanizer"
                element={<TextTool kind="humanizer" />}
              />
              <Route
                path="/ai-detector"
                element={<TextTool kind="detector" />}
              />
              <Route path="/diagrams" element={<DiagramTool />} />
              <Route path="/presentation" element={<ResearchWorkflow presentation />} />
              <Route
                path="*"
                element={
                  <Empty title="This page isn’t here">
                    <Link to="/">Return to your workspace</Link>
                  </Empty>
                }
              />
            </Routes>
          </Suspense>
        </main>
        {!["/chat-pdf", "/extract-data"].includes(location.pathname) && (
          <button
            className="help-button"
            aria-label="Help"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={21} />
          </button>
        )}
        {toast && (
          <div className={`toast ${toast.error ? "error" : ""}`} role="status">
            {toast.error ? (
              <AlertCircle size={17} />
            ) : (
              <CheckCircle2 size={17} />
            )}{" "}
            {toast.message}
          </div>
        )}
        {help && (
          <Modal title="Welcome to scrapeTx" onClose={() => setHelp(false)}>
            <div className="modal-body">
              <p>A little more space for your next big idea.</p>
              <div className="help-list">
                <p>
                  <Search />{" "}
                  <span>
                    <b>Discover real research</b>
                    <br />
                    Search Crossref across disciplines, or Europe PMC for life
                    sciences.
                  </span>
                </p>
                <p>
                  <BookOpen />{" "}
                  <span>
                    <b>Keep your evidence together</b>
                    <br />
                    Save papers, compare abstracts, and export citations.
                  </span>
                </p>
                <p>
                  <Files />{" "}
                  <span>
                    <b>Read your own documents</b>
                    <br />
                    PDF text stays in your browser. Answers show matching page
                    excerpts.
                  </span>
                </p>
              </div>
              <div className="notice">
                <Info size={16} />
                <span>
                  Public research APIs, source excerpts, and optional AI
                  synthesis. Configure your own AI provider in Integrations.
                  Verify generated claims against the original papers.
                </span>
              </div>
              <Button primary onClick={() => setHelp(false)}>
                Start exploring <ArrowRight size={15} />
              </Button>
            </div>
          </Modal>
        )}
        {status && (
          <Modal
            title="Your research workspace"
            onClose={() => setStatus(false)}
          >
            <div className="modal-body">
              <div className="status-row">
                <span>Workspace</span>
                <b>scrapeTx</b>
              </div>
              <div className="status-row">
                <span>Access</span>
                <b>
                  <Check size={14} /> Direct · No account required
                </b>
              </div>
              <div className="status-row">
                <span>Saved papers & drafts</span>
                <b>
                  {workspaceConfig?.storage || "Workspace storage"} · Browser
                  workspace
                </b>
              </div>
              <div className="status-row">
                <span>Research sources</span>
                <b>Crossref · Europe PMC</b>
              </div>
              <div className="status-row">
                <span>PDF processing</span>
                <b>In your browser</b>
              </div>
              <p className="muted small">
                Public source searches are keyless. Optional AI uses your
                configured provider and may incur charges. Export a workspace
                backup before clearing browser storage.
              </p>
              <Button primary onClick={() => setStatus(false)}>
                Back to research
              </Button>
            </div>
          </Modal>
        )}
      </div>
    </Ctx.Provider>
  );
}
const quickActions = [
  ["Search Papers", Search, "search"],
  ["Literature Review", FileSearch, "review"],
  ["Draft", FileText, "draft"],
  ["Diagrams", Network, "diagram"],
  ["Presentation", Presentation, "slides"],
];
export function Composer({
  value,
  setValue,
  onSubmit,
  busy = false,
  mode = "search",
  setMode,
  researchMode = "deep",
  setResearchMode,
  placeholder = "Give me any task to work on...",
  compact = false,
}) {
  const { navigate, notify } = useApp();
  const [tools, setTools] = useState(false);
  const [listening, setListening] = useState(false);
  const menuRef = useRef();
  useEffect(() => {
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) {
        setTools(false);
      }
    };
    document.addEventListener("pointerdown", close);
    const escape = (e) => { if(e.key === "Escape") setTools(false); };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, []);
  const speech = () => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech)
      return notify(
        "Speech input is unavailable in this browser. You can type your task.",
        true,
      );
    const recognition = new Speech();
    recognition.lang = "en-US";
    recognition.onresult = (e) =>
      setValue(value + " " + e.results[0][0].transcript);
    recognition.onerror = () => {
      setListening(false);
      notify("Microphone access was unavailable. Please type your task.", true);
    };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  };
  return (
    <form
      className={`composer ${compact ? "compact" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit();
      }}
    >
      <textarea
        aria-label="Research task input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (value.trim() && !busy) onSubmit();
          }
        }}
      />
      <div className="composer-bar">
        <button
          type="button"
          className="attach-btn"
          aria-label="Upload files"
          onClick={() => navigate("/chat-pdf")}
        >
          <Plus size={19} />
        </button>
        <div className="composer-menus" ref={menuRef}>
          <button
            type="button"
            className="text-btn"
            aria-expanded={tools}
            onClick={() => {
              setTools(!tools);
            }}
          >
            <Sparkles size={18} className="composer-mode-icon" aria-hidden="true" />
            <span className="composer-tool-label">{mode === "search"
              ? researchModes.find((item) => item.id === researchMode)?.title || "Tools"
              : quickActions.find((q) => q[2] === mode)?.[0] || "Tools"}</span>
            <ChevronDown size={13} />
          </button>
          {tools && (
            <div className="popover tool-popover research-tools-popover">
              <span className="section-label">Select tools for your research</span>
              {setResearchMode && researchModes.map((item, index) => {
                const Icon = [Search, Atom, CheckCheck, FlaskConical][index];
                return <button key={item.id} type="button" aria-pressed={mode === "search" && researchMode === item.id}
                  onClick={() => {setResearchMode(item.id);setMode?.("search");setTools(false);}}>
                  <span className={`research-tool-icon tool-${item.id}`}><Icon size={20}/></span><span><b>{item.title}</b><small>{item.description}</small></span>
                  {mode === "search" && researchMode === item.id && <Check size={16}/>}</button>;
              })}
              {setResearchMode && <span className="section-label tool-create-label">Create & explore</span>}
              {quickActions.filter((item) => !setResearchMode || !["search", "review"].includes(item[2])).map(([label, Icon, id]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMode?.(id);
                    setTools(false);
                  }}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                  {mode === id && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
          <span className="composer-assistant"><Sparkles size={14} aria-hidden="true"/> ScrapeTx AI</span>
        </div>
        <button
          type="button"
          className={`icon-btn mic ${listening ? "recording" : ""}`}
          aria-label="Start speech input"
          onClick={speech}
        >
          <Mic size={17} />
        </button>
        <button
          className="submit-btn"
          aria-label="Submit research task"
          disabled={!value.trim() || busy}
        >
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <ArrowUp size={18} />
          )}
        </button>
      </div>
    </form>
  );
}
function SearchForm({ q, setQ, search, source, setSource, busy }) {
  const { history } = useApp();
  const recent = history.filter((item,index,items) => item.query && items.findIndex((other) => other.query === item.query) === index).slice(0,8);
  return (
    <form
      className="search-form"
      onSubmit={(e) => {
        e.preventDefault();
        search();
      }}
    >
      <label className="sr-only" htmlFor="research-query">
        Research query
      </label>
      <Search size={19} />
      <input
        id="research-query"
        list="research-recent-queries"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ask a research question or search for papers…"
      />
      <datalist id="research-recent-queries">{recent.map((item) => <option key={item.id} value={item.query}/>)}</datalist>
      <select
        aria-label="Research database"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      >
        <option value="crossref">All research</option>
        <option value="europepmc">Life sciences</option>
        <option value="deep">Deep search · multiple sources</option>
        <option value="pubmed">PubMed</option>
      </select>
      <Button primary disabled={!q.trim() || busy} aria-label="Search papers">
        {busy ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <ArrowRight size={17} />
        )}
      </Button>
    </form>
  );
}
function savedFilters(value) {
  try { return value ? normalizeResearchFilters(JSON.parse(value)) : defaultResearchFilters; }
  catch { return defaultResearchFilters; }
}
function ResearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const provider = params.get("source") || "crossref";
  const filterParam = params.get("filters") || "";
  const [q, setQ] = useState(query);
  const [source, setSource] = useState(provider);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState(params.get("view") || "papers");
  const [filters, setFilters] = useState(() => savedFilters(filterParam));
  const [exportFormat, setExportFormat] = useState("CSV");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState([]);
  const [compare, setCompare] = useState(false);
  const [paper, setPaper] = useState(null);
  const [retry, setRetry] = useState(0);
  const { history, refreshHistory, notify, navigate } = useApp();
  useEffect(() => {
    setQ(query);
    setSource(provider);
    if (!query) {
      setResult(null);
      setError("");
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    setError("");
    setResult(null);
    setFilters(savedFilters(filterParam));
    setSelected([]);
    api(
      provider === "deep"
        ? `/api/discovery/search?q=${encodeURIComponent(query)}`
        : provider === "pubmed"
          ? `/api/biomedical/pubmed?q=${encodeURIComponent(query)}`
          : `/api/papers?q=${encodeURIComponent(query)}&source=${provider}`,
      {
        signal: controller.signal,
      },
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        setResult({ ...data, papers: data.papers || data.results || [] });
        if (["deep","pubmed"].includes(provider)) {
          api("/api/records/searches/"+crypto.randomUUID(),{method:"PUT",body:JSON.stringify({query,source:provider,created_at:new Date().toISOString()})}).then(refreshHistory).catch(()=>{});
        } else refreshHistory();
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [query, provider, retry, filterParam]);
  const search = () => {
    if (!q.trim()) return;
    if (wantsResearchGuide(q)) { navigate("/chat?guide=1&q=" + encodeURIComponent(q.trim())); return; }
    if (q.trim() === query && source === provider) setRetry((v) => v + 1);
    else setParams({ q: q.trim(), source });
  };
  const papers = filterResearchPapers(result?.papers || [], filters);
  const changeFilters = (next) => {
    setFilters(next);
    const visibleIds = new Set(filterResearchPapers(result?.papers || [], next).map((item) => item.id));
    const remaining = selected.filter((id) => visibleIds.has(id));
    setSelected(remaining);
    if(remaining.length < 2) setCompare(false);
  };
  const exportPapers = () => {
    const values = selected.length ? papers.filter((p) => selected.includes(p.id)) : papers;
    if (exportFormat === "CSV") download("scrapetx-research.csv", csv(values), "text/csv");
    else if (exportFormat === "HTML") download("scrapetx-bibliography.html", bibliographyHtml(values), "text/html");
    else download(`scrapetx-research.${exportFormat === "RIS" ? "ris" : "bib"}`, values.map((p) => citation(p, exportFormat)).join("\n\n"));
    notify(`${values.length} ${selected.length ? "selected " : ""}sources exported.`);
  };
  const saveSearch = async () => {
    setSaving(true);
    try {
      const record = {id:crypto.randomUUID(),type:"literature-search",title:query,query,source:provider,filters,result:{...result,papers},createdAt:new Date().toISOString()};
      await api("/api/records/notes/"+record.id,{method:"PUT",body:JSON.stringify(record)});
      notify("Search, filters, and loaded evidence saved to My Library.");
    } catch(e) {notify(e.message,true);} finally {setSaving(false);}
  };
  return (
    <section className={`research-page page ${!query ? "search-landing" : ""}`}>
      <div className="page-heading">
        <div>
          <h1>{query ? "Your research, connected." : "Literature Search"}</h1>
          {query && (
            <p>
              Discover, read, and compare the evidence behind your question.
            </p>
          )}
        </div>
        {query && result && (
          <div className="research-header-actions"><Button icon={saving ? LoaderCircle : Bookmark} disabled={saving} onClick={saveSearch}>Save search</Button>
          <select aria-label="Export research format" value={exportFormat} onChange={(e) => setExportFormat(e.target.value)}><option>CSV</option><option>RIS</option><option>BibTeX</option><option value="HTML">Linked bibliography</option></select>
          <Button icon={Download} onClick={exportPapers} disabled={!papers.length}>Export{selected.length ? ` ${selected.length} selected` : ""}</Button></div>
        )}
      </div>
      <SearchForm
        q={q}
        setQ={setQ}
        search={search}
        source={source}
        setSource={setSource}
        busy={busy}
      />
      <PromptSuggestions key={source} examples={source === "pubmed" || source === "europepmc" ? toolExamples.pubmed : toolExamples.search} value={q} onChoose={setQ} disabled={busy} inputId="research-query" />
      {!query && (
        <>
          {history.length > 0 && (
            <div className="search-history">
              <h3>
                <Clock size={16} /> My searches
              </h3>
              {history
                .filter(
                  (h, i, a) => a.findIndex((x) => x.query === h.query) === i,
                )
                .slice(0, 5)
                .map((h) => (
                  <Link
                    key={h.id}
                    to={
                      "/search?q=" +
                      encodeURIComponent(h.query) +
                      "&source=" +
                      h.source
                    }
                  >
                    <Search size={15} />
                    <span>{h.query}</span>
                    <ChevronRight size={15} />
                  </Link>
                ))}
            </div>
          )}
          <div className="research-intro">
            <div className="eyebrow">
              A LITTLE STRUCTURE. A LOT MORE CLARITY.
            </div>
            <h2>A better way to explore the literature.</h2>
            <div className="intro-steps">
              {[
                [
                  "01",
                  "Ask a focused question",
                  "Start with the topic, population, or idea you want to understand.",
                ],
                [
                  "02",
                  "Explore the evidence",
                  "Check real paper metadata and source abstracts. Save what matters.",
                ],
                [
                  "03",
                  "See the connections",
                  "Compare sources in a table, build a reading list, and export references.",
                ],
              ].map(([n, t, d]) => (
                <div key={n}>
                  <span>{n}</span>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              ))}
            </div>
            <p className="small muted">
              Powered by public Crossref, Europe PMC, and PubMed APIs. Search results
              depend on provider coverage.
            </p>
          </div>
        </>
      )}
      {query && (
        <>
          <div className="result-toolbar">
            <div className="tabs">
              {[
                ["papers", List, "Papers"],
                ["overview", Sparkles, "Overview"],
                ["table", Table2, "Table"],
              ].map(([id, I, t]) => (
                <button
                  key={id}
                  className={view === id ? "active" : ""}
                  onClick={() => setView(id)}
                >
                  <I size={15} />
                  {t}
                </button>
              ))}
            </div>
          </div>
          <SearchProcess query={query} source={result?.source || provider} loading={busy} loadedCount={result?.papers?.length || 0}/>
          {result && <SearchRefinements papers={result.papers || []} value={filters} onChange={changeFilters}/>}
          {busy && (
            <div className="loading-results" role="status">
              <div>
                <LoaderCircle className="spin" size={18} />
                <span>
                  Searching{" "}
                  {{ europepmc: "Europe PMC", crossref: "Crossref", pubmed: "PubMed", deep: "Crossref and Europe PMC" }[provider] || "the research sources"} for
                  your question…
                </span>
              </div>
              {[1, 2, 3].map((i) => (
                <div className="skeleton-card" key={i}>
                  <i />
                  <i />
                  <i />
                </div>
              ))}
            </div>
          )}
          {error && (
            <div className="error-panel" role="alert">
              <AlertCircle size={23} />
              <h3>We couldn’t reach the research database</h3>
              <p>{error}</p>
              <Button icon={RotateCcw} onClick={() => setRetry((v) => v + 1)}>
                Try again
              </Button>
            </div>
          )}
          {result && (
            <>
              <div className="result-meta">
                <span>
                  {papers.length} of {result.papers.length} loaded papers shown <span className="dot">·</span>{" "}
                  {Number(result.total || 0).toLocaleString()} {result.coverage ? "unique returned records" : "database matches"}
                </span>
                <span>
                  <span className="live-dot" /> {result.source} · Live results
                </span>
              </div>
              {result.partial && (
                <p className="notice" role="status">
                  Partial search: {result.sources.filter((s) => s.status !== "ok").map((s) => s.name).join(", ")} could not be reached. Results include the available sources only.
                </p>
              )}
              {selected.length > 0 && (
                <div className="selection-bar">
                  <span>{selected.length} papers selected</span>
                  <Button
                    icon={Table2}
                    disabled={selected.length < 2}
                    onClick={() => setCompare(true)}
                  >
                    Compare papers
                  </Button>
                  <button className="text-btn" onClick={() => setSelected([])}>
                    Clear
                  </button>
                </div>
              )}
              {!papers.length ? (
                <Empty icon={Search} title="No papers match these filters">
                  Clear filters, widen the year range, or try another topic.
                </Empty>
              ) : view === "table" ? (
                <PaperTable papers={papers} onOpen={setPaper} />
              ) : view === "overview" ? (
                <Overview papers={papers} query={query} onOpen={setPaper} />
              ) : (
                <div className="paper-list">
                  {papers.map((p, i) => (
                    <PaperCard
                      key={p.id}
                      paper={p}
                      index={i + 1}
                      onOpen={() => setPaper(p)}
                      selected={selected.includes(p.id)}
                      onSelect={() =>
                        setSelected((v) =>
                          v.includes(p.id)
                            ? v.filter((x) => x !== p.id)
                            : [...v, p.id],
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
      {paper && <PaperDetail paper={paper} onClose={() => setPaper(null)} />}{" "}
      {compare && (
        <Modal
          title="Compare your selected papers"
          wide
          onClose={() => setCompare(false)}
        >
          <div className="modal-body">
            <PaperTable
              papers={papers.filter((p) => selected.includes(p.id))}
              onOpen={setPaper}
            />
            <Button
              icon={Download}
              onClick={() =>
                download(
                  "scrapetx-comparison.csv",
                  csv(papers.filter((p) => selected.includes(p.id))),
                  "text/csv",
                )
              }
            >
              Export comparison
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
function PaperCard({ paper: p, index, onOpen, selected, onSelect }) {
  const { library, savePaper } = useApp();
  const saved = library.some((x) => x.id === p.id);
  return (
    <article className="paper-card">
      <div className="paper-number">
        {onSelect ? (
          <input
            type="checkbox"
            aria-label={`Select ${p.title}`}
            checked={selected}
            onChange={onSelect}
          />
        ) : (
          <FileText size={18} />
        )}
      </div>
      <div className="paper-content">
        <div className="paper-tags">
          <span>{p.year || "Year unavailable"}</span>
          <span>{p.type?.replaceAll("-", " ")}</span>
          {p.openAccess && <span className="oa">Open access</span>}
        </div>
        <button className="paper-title" onClick={onOpen}>
          {p.title}
        </button>
        <p className="paper-authors">
          {p.authors.slice(0, 3).join(", ") || "Authors unavailable"}
          {p.authors.length > 3 ? " et al." : ""}
        </p>
        <p className="paper-journal">{p.journal}</p>
        {p.abstract && (
          <p className="paper-abstract">{excerpt(p.abstract, 330)}</p>
        )}
        <div className="paper-footer">
          <span>
            <Quote size={13} />
            {p.citations == null
              ? "Unavailable"
              : Number(p.citations).toLocaleString()}{" "}
            citations
          </span>
          <button className="text-btn" onClick={onOpen}>
            <BookOpen size={14} /> Read abstract
          </button>
          <a className="text-btn" href={p.url} target="_blank" rel="noreferrer">
            View source <ExternalLink size={13} />
          </a>
        </div>
      </div>
      <button
        className={`icon-btn bookmark ${saved ? "saved" : ""}`}
        aria-label={
          saved ? "Remove paper from library" : "Save paper to library"
        }
        onClick={() => savePaper(p)}
      >
        {saved ? (
          <Bookmark size={18} fill="currentColor" />
        ) : (
          <Bookmark size={18} />
        )}
      </button>
    </article>
  );
}
function PaperTable({ papers, onOpen }) {
  return <ResearchTable papers={papers} onOpen={onOpen} />;
}
function Overview({ papers, query, onOpen }) {
  const withAbstract = papers.filter((p) => p.abstract);
  return (
    <div className="overview">
      <div className="overview-head">
        <span className="soft-icon">
          <Layers size={21} />
        </span>
        <div>
          <h2>Research overview</h2>
          <p>Source excerpts for “{query}”</p>
        </div>
      </div>
      <AiPanel
        task="synthesis"
        prompt={`Synthesize the available evidence for this question: ${query}. Distinguish findings, study limitations, and missing evidence.`}
        evidence={papers.filter((p) => p.abstract).slice(0, 16)}
        label="Generate cited synthesis"
      />
      <div className="notice">
        <Info size={16} />
        <span>
          This overview surfaces published metadata and abstract excerpts. It
          does not infer conclusions or evaluate study quality.{" "}
          {withAbstract.length === 0
            ? "Try Life sciences for sources with richer abstracts."
            : ""}
        </span>
      </div>
      <div className="overview-stats">
        <div>
          <strong>{papers.length}</strong>
          <span>Papers in this view</span>
        </div>
        <div>
          <strong>{withAbstract.length}</strong>
          <span>Abstracts available</span>
        </div>
        <div>
          <strong>
            {[...new Set(papers.map((p) => p.journal).filter(Boolean))].length}
          </strong>
          <span>Publication venues</span>
        </div>
      </div>
      <h3>What the sources say</h3>
      {(withAbstract.length ? withAbstract : papers).slice(0, 5).map((p, i) => (
        <div className="source-excerpt" key={p.id}>
          <span className="source-index">{i + 1}</span>
          <div>
            <button onClick={() => onOpen(p)}>{p.title}</button>
            <p>
              {p.abstract
                ? excerpt(p.abstract, 700)
                : "Abstract unavailable from this provider. Open the original paper to read its findings."}
            </p>
            <small>
              {p.authors[0] || "Author unavailable"} · {p.year || "n.d."} ·{" "}
              {p.source}
            </small>
          </div>
        </div>
      ))}
      <div className="overview-next">
        <h3>Build your next step</h3>
        <p>
          Compare the full texts for methods, sample sizes, and limitations
          before drawing a conclusion.
        </p>
        <Link
          className="btn"
          to={"/ai-writer?topic=" + encodeURIComponent(query)}
        >
          <PenLine size={15} /> Create a working draft
        </Link>
      </div>
    </div>
  );
}
function PaperDetail({ paper: p, onClose }) {
  const { library, savePaper, notify } = useApp();
  const [style, setStyle] = useState("APA");
  const [fullText, setFullText] = useState(null);
  const [reading, setReading] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(citation(p, style));
      notify("Citation copied.");
    } catch {
      notify("Clipboard unavailable. Use Download instead.", true);
    }
  };
  return (
    <Modal title="Paper details" wide onClose={onClose}>
      <div className="modal-body paper-detail">
        <div className="paper-tags">
          <span>{p.year || "n.d."}</span>
          <span>{p.source}</span>
        </div>
        <h2>{p.title}</h2>
        <p className="muted">{p.authors.join(", ")}</p>
        <p className="small muted">
          {p.journal} ·{" "}
          {p.citations == null
            ? "Citation count unavailable"
            : `${p.citations} citations`}
        </p>
        <div className="inline-actions">
          <Button icon={Bookmark} onClick={() => savePaper(p)}>
            {library.some((x) => x.id === p.id)
              ? "Saved to library"
              : "Save to library"}
          </Button>
          <a className="btn" href={p.url} target="_blank" rel="noreferrer">
            Open original <ExternalLink size={14} />
          </a>
          {(p.pdf || p.librarySync?.provider === "mendeley") && (
            <Link className="btn" to={pdfReaderLink(p)} onClick={onClose}>Read PDF in app <BookOpen size={14}/></Link>
          )}
          {p.pmcid && (
            <Button
              disabled={reading}
              icon={BookOpen}
              onClick={async () => {
                setReading(true);
                try {
                  setFullText(
                    await api(
                      "/api/discovery/fulltext?pmcid=" +
                        encodeURIComponent(p.pmcid),
                    ),
                  );
                } catch (e) {
                  notify(e.message, true);
                } finally {
                  setReading(false);
                }
              }}
            >
              {reading ? "Loading text…" : "Read open full text"}
            </Button>
          )}
        </div>
        <PaperVerification paper={p} />
        <h3>Abstract</h3>
        <p className="abstract-full">
          {p.abstract ||
            "This database record does not include an abstract. Please open the original source to read the paper."}
        </p>
        {fullText && (
          <section className="fulltext-reader">
            <div className="section-heading">
              <h3>Open-access source text</h3>
              <Button
                icon={Download}
                onClick={() => download(fullText.pmcid + ".txt", fullText.text)}
              >
                Export text
              </Button>
            </div>
            <p className="small muted">
              {fullText.license?.text ||
                "Check the original source for reuse terms."}{" "}
              <a href={fullText.sourceUrl} target="_blank" rel="noreferrer">
                Original article <ExternalLink size={11} />
              </a>
            </p>
            {fullText.coverage?.notes?.map((note) => (
              <p className="small muted" key={note}>{note}</p>
            ))}
            <div
              style={{
                maxHeight: 500,
                overflow: "auto",
                padding: 20,
                border: "1px solid #e7e5e4",
                borderRadius: 7,
              }}
            >
              {fullText.sections.map((s) => (
                <section key={s.id}>
                  <h3>{s.title}</h3>
                  <p
                    style={{
                      whiteSpace: "pre-wrap",
                      fontSize: 12,
                      lineHeight: 1.9,
                    }}
                  >
                    {s.text}
                  </p>
                </section>
              ))}
            </div>
          </section>
        )}
        <div className="citation-box">
          <div>
            <h3>Cite this paper</h3>
            <select
              aria-label="Citation format"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            >
              {["APA", "MLA", "IEEE", "BibTeX", "RIS"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <pre>{citation(p, style)}</pre>
          <BibliographySourceLink record={p} />
          <div className="inline-actions">
            <Button icon={Copy} onClick={copy}>
              Copy citation
            </Button>
            <Button
              icon={Download}
              onClick={() =>
                download(
                  "citation." +
                    (style === "BibTeX"
                      ? "bib"
                      : style === "RIS"
                        ? "ris"
                        : "txt"),
                  citation(p, style),
                )
              }
            >
              Download
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
function Writer() {
  const [params] = useSearchParams();
  const { notify, library } = useApp();
  const [sources, setSources] = useState([]);
  const [exportFormat, setExportFormat] = useState("docx");
  const [topic, setTopic] = useState(params.get("topic") || "");
  const [title, setTitle] = useState(
    templateById(params.get("template"))?.title || params.get("template") || "Untitled document",
  );
  const [content, setContent] = useState("");
  const [id, setId] = useState(() => crypto.randomUUID());
  const [drafts, setDrafts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const editor = useRef();
  useEffect(() => {
    api("/api/drafts")
      .then(setDrafts)
      .catch((e) => notify(e.message, true));
    const t = params.get("template");
    if (t) {
      const selected = templateById(t);
      setContent(selected ? templateContent(selected) : `# ${t}\n\n## Introduction\nDescribe your topic and why it matters.\n\n## Research question\nState the specific question this work explores.\n\n## Approach\nOutline how you will find and assess evidence.\n\n## Discussion\nCompare the sources, surface disagreements, and identify limitations.\n\n## Conclusion\nSummarize the contribution and open questions.\n\n## References\nAdd your verified sources here.`);
    }
  }, []);
  const generate = async () => {
    if (!topic.trim()) return;
    setBusy(true);
    try {
      const r = await api("/api/papers?q=" + encodeURIComponent(topic));
      setSources(r.papers.slice(0, 16));
      setTitle(topic);
      setContent(
        `# ${topic}\n\n## Working draft\nThis document is a research outline. Replace the prompts below with your own analysis after reading the sources.\n\n## Introduction\nDefine the scope of ${topic.toLowerCase()}. Explain the problem, context, and significance of your research question.\n\n## Research question\nWhat does the published evidence tell us about ${topic.toLowerCase()}, and which questions remain open?\n\n## Source notes\n${r.papers
          .slice(0, 5)
          .map(
            (p, i) =>
              `### ${i + 1}. ${p.title}\n${p.abstract ? "Abstract excerpt: " + excerpt(p.abstract, 700) : "Read the original paper and record its methods, findings, and limitations."}\nSource: ${p.url}`,
          )
          .join(
            "\n\n",
          )}\n\n## Discussion\nGroup the evidence by theme. Compare methods and populations. Distinguish reported findings from your interpretation.\n\n## Conclusion\nSummarize what the sources support and identify the next research step.\n\n## References\n${r.papers
          .slice(0, 5)
          .map((p) => citation(p))
          .join("\n\n")}`,
      );
      setSaved(false);
      notify("Working draft created with real research references.");
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    try {
      await api("/api/drafts/" + id, {
        method: "PUT",
        body: JSON.stringify({ title, content }),
      });
      setSaved(true);
      setDrafts(await api("/api/drafts"));
      notify("Draft saved to your workspace.");
    } catch (e) {
      notify(e.message, true);
    }
  };
  const insert = (before, after = "") => {
    const el = editor.current;
    const start = el.selectionStart,
      end = el.selectionEnd;
    setContent(
      content.slice(0, start) +
        before +
        content.slice(start, end) +
        after +
        content.slice(end),
    );
    setSaved(false);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, end + before.length);
    });
  };
  return (
    <div className="writer-layout">
      <aside className="writer-sidebar">
        <h2>
          <PenLine size={19} /> AI Writer
        </h2>
        <p className="small muted">Your ideas, with a little structure.</p>
        <PromptSuggestions examples={toolExamples.writer} value={topic} onChoose={setTopic} disabled={busy} />
        <label className="field-label">
          What are you writing about?
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. The role of AI in education"
            rows={4}
          />
        </label>
        <Button
          primary
          icon={busy ? LoaderCircle : Sparkles}
          disabled={!topic.trim() || busy}
          onClick={generate}
        >
          {busy ? "Finding sources…" : "Create working draft"}
        </Button>
        <p className="tool-note">
          Build source notes first, then use your configured AI provider to
          draft from the evidence.
        </p>
        <AiPanel
          task="draft"
          prompt={`Write an academic working draft about ${topic}. ${content ? "Existing draft context: " + content.slice(0, 4000) : ""}`}
          evidence={(sources.length ? sources : library).slice(0, 16)}
          label="Draft with AI"
          onResult={(r) => {
            setContent(
              r.text +
                "\n\n## References\n" +
                r.citations.map((p) => p.title + " — " + p.url).join("\n"),
            );
            setTitle(topic || title);
            setSaved(false);
          }}
        />
        <div className="section-label">Your documents</div>
        <button
          className="draft-link"
          onClick={() => {
            setId(crypto.randomUUID());
            setTitle("Untitled document");
            setContent("");
            setSaved(false);
          }}
        >
          <Plus size={15} /> New document
        </button>
        {drafts.map((d) => (
          <button
            key={d.id}
            className={`draft-link ${d.id === id ? "active" : ""}`}
            onClick={() => {
              setId(d.id);
              setTitle(d.title);
              setContent(d.content);
              setSaved(true);
            }}
          >
            <FileText size={15} />
            <span>{d.title}</span>
          </button>
        ))}
      </aside>
      <section className="writer-main">
        <div className="writer-top">
          <label className="sr-only" htmlFor="draft-title">
            Document title
          </label>
          <input
            id="draft-title"
            className="document-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSaved(false);
            }}
          />
          <div>
            <span className="small muted save-state">
              {saved ? "Saved to workspace" : "Unsaved changes"}
            </span>
            <Button icon={Save} onClick={save} disabled={!content.trim()}>
              Save draft
            </Button>
            <select
              aria-label="Document export format"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
            >
              <option value="docx">Word (.docx)</option>
              <option value="tex">LaTeX (.tex)</option>
              <option value="html">HTML / print PDF</option>
              <option value="md">Markdown</option>
            </select>
            <Button
              icon={Download}
              disabled={!content.trim()}
              onClick={async () => {
                try {
                  if (exportFormat === "md")
                    download(
                      (title || "document") + ".md",
                      content,
                      "text/markdown",
                    );
                  else
                    await exportDocument({
                      title: title || "Research document",
                      content,
                      format: exportFormat,
                    });
                } catch (e) {
                  notify(e.message, true);
                }
              }}
            >
              Export
            </Button>
          </div>
        </div>
        <div className="editor-toolbar">
          <button aria-label="Insert heading" onClick={() => insert("## ")}>
            <Heading2 size={17} />
          </button>
          <button
            aria-label="Bold selected text"
            onClick={() => insert("**", "**")}
          >
            <Bold size={16} />
          </button>
          <button
            aria-label="Italicize selected text"
            onClick={() => insert("*", "*")}
          >
            <Italic size={16} />
          </button>
          <span />
          <button onClick={() => insert("\n> ")}>
            <Quote size={15} /> Quote
          </button>
          <button onClick={() => insert("\n- ")}>
            <List size={15} /> List
          </button>
          <button
            onClick={() => {
              insert("\n\n## References\n");
              notify(
                "Reference section added. Paste verified citations from Citation Generator.",
              );
            }}
          >
            <BookOpen size={15} /> References
          </button>
        </div>
        <div className="editor-paper">
          <textarea
            aria-label="Document editor"
            ref={editor}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setSaved(false);
            }}
            placeholder="Start with a thought, a question, or a first sentence…"
            spellCheck
          />
        </div>
        <div className="editor-status">
          <span>Markdown document</span>
          <span>
            {wordCount(content)} words · {content.length} characters
          </span>
        </div>
      </section>
    </div>
  );
}
function Topics() {
  const [params] = useSearchParams();
  const [topic, setTopic] = useState(params.get("topic") || "");
  const [done, setDone] = useState("");
  const { navigate } = useApp();
  const topics = done
    ? [
        `Recent advances in ${done}`,
        `Challenges and limitations of ${done}`,
        `${done} in real-world applications`,
        `Ethical implications of ${done}`,
        `Comparative studies of ${done}`,
        `Future directions for ${done}`,
      ]
    : [];
  return (
    <section className="page tool-page">
      <div className="center-heading">
        <span className="soft-icon">
          <Shapes size={24} />
        </span>
        <h1>Find your next research question.</h1>
        <p>Start with an idea. Explore where it could take you.</p>
      </div>
      <PromptSuggestions examples={toolExamples.topics} value={topic} onChoose={setTopic} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setDone(topic);
        }}
        className="search-form"
      >
        <Search size={18} />
        <input
          aria-label="Research area"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter a topic or research area…"
        />
        <Button primary disabled={!topic.trim()}>
          Explore topics <ArrowRight size={15} />
        </Button>
      </form>
      {done ? (
        <>
          <div className="section-heading">
            <h2>Directions to explore</h2>
            <span className="tag">Question prompts</span>
          </div>
          <p className="muted small">
            These prompts broaden your starting point. Search the literature to
            check what has already been studied.
          </p>
          <div className="topic-grid">
            {topics.map((t, i) => (
              <button
                key={t}
                onClick={() => navigate("/search?q=" + encodeURIComponent(t))}
              >
                <span>0{i + 1}</span>
                <h3>{t}</h3>
                <p>
                  Explore published research <ArrowRight size={14} />
                </p>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="topic-starters">
          <span className="section-label">A few places to begin</span>
          {[
            "Artificial intelligence",
            "Climate change",
            "Mental health",
            "Renewable energy",
            "Quantum computing",
            "Higher education",
          ].map((t) => (
            <button
              key={t}
              className="btn"
              onClick={() => {
                setTopic(t);
                setDone(t);
              }}
            >
              {t}
              <ArrowUp size={13} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
function BibliographySourceLink({ record }) {
  const url = sourceUrl(record);
  return url ? (
    <a className="bibliography-source-link" href={url} target="_blank" rel="noopener noreferrer"
      aria-label={"Open original source for " + record.title + " (opens in a new tab)"}>
      <ExternalLink size={13} aria-hidden="true" />
      <span>Open original source <small>{new URL(url).hostname}</small></span>
    </a>
  ) : <span className="small muted">Source link unavailable</span>;
}
function Citations() {
  const { library, notify } = useApp();
  const [q, setQ] = useState("");
  const [papers, setPapers] = useState([]);
  const [style, setStyle] = useState("APA");
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState("");
  const search = async (e) => {
    e.preventDefault();
    setBusy(true);
    setSearched(true);
    setPapers([]);
    setSearchError("");
    try {
      const result = await api("/api/papers?scope=all&q=" + encodeURIComponent(q));
      setPapers(result.papers);
    } catch (e) {
      setSearchError(e.message);
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        selected.map((p) => citation(p, style)).join("\n\n"),
      );
      notify("Bibliography copied.");
    } catch {
      notify("Use Download to export your bibliography.", true);
    }
  };
  return (
    <section className="page citation-page">
      <div className="center-heading">
        <span className="soft-icon">
          <Quote size={24} />
        </span>
        <h1>Citation Generator</h1>
        <p>Find articles and books. Follow every reference to its original source.</p>
      </div>
      <PromptSuggestions examples={toolExamples.citations} value={q} onChoose={setQ} disabled={busy} />
      <form className="search-form" onSubmit={search}>
        <Search size={18} />
        <input
          aria-label="Drug keyword, article or book title, or DOI"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Drug keyword, article or book title, or DOI…"
        />
        <Button primary aria-label="Find source" disabled={!q.trim() || busy}>
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <>
              Find source <ArrowRight size={15} />
            </>
          )}
        </Button>
      </form>
      <div className="citation-workspace">
        <div>
          <div className="section-heading">
            <h2>{searched ? "Search results" : "From your library"}</h2>
            <span className="small muted">
              {(searched ? papers : library).length} sources
            </span>
          </div>
          {busy && <p className="small muted" role="status">Searching source metadata…</p>}
          {searchError && <p className="notice" role="alert">{searchError}</p>}
          {(searched ? papers : library).map((p) => (
            <div className="citation-source" key={p.id}>
              <FileText size={18} />
              <div>
                <h3>{sourceUrl(p) ? <a className="citation-title-link" href={sourceUrl(p)} target="_blank" rel="noopener noreferrer">{p.title}<ExternalLink size={12} aria-hidden="true" /></a> : p.title}</h3>
                <p>
                  {p.authors[0] || "Author unavailable"} · {p.year || "n.d."} · {p.type || "Source record"}
                </p>
                <BibliographySourceLink record={p} />
              </div>
              <button
                className="icon-btn"
                aria-label={"Add citation for " + p.title}
                disabled={selected.some((x) => x.id === p.id)}
                onClick={() => setSelected((v) => [...v, p])}
              >
                {selected.some((x) => x.id === p.id) ? (
                  <Check size={17} />
                ) : (
                  <Plus size={17} />
                )}
              </button>
            </div>
          ))}
          {!busy && !searchError && !(searched ? papers : library).length && (
            <Empty
              icon={Quote}
              title={searched ? "No sources found" : "Your sources start here"}
            >
              Search for a paper above, or save papers to your library.
            </Empty>
          )}
        </div>
        <aside className="bibliography">
          <div className="section-heading">
            <h2>My bibliography</h2>
            <select
              aria-label="Bibliography style"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            >
              {["APA", "MLA", "IEEE", "BibTeX", "RIS"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          {!selected.length ? (
            <p className="muted small">
              Add sources to create your bibliography.
            </p>
          ) : (
            selected.map((p, i) => (
              <div className="bibliography-item" key={p.id}>
                <span>{i + 1}</span>
                <div className="bibliography-entry">
                  <pre>{citation(p, style)}</pre>
                  <BibliographySourceLink record={p} />
                </div>
                <button
                  className="icon-btn"
                  aria-label={"Remove citation " + (i + 1)}
                  onClick={() =>
                    setSelected((v) => v.filter((x) => x.id !== p.id))
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
          <div className="inline-actions">
            <Button icon={Copy} disabled={!selected.length} onClick={copy}>
              Copy all
            </Button>
            <Button
              icon={Download}
              disabled={!selected.length}
              onClick={() =>
                download(
                  "bibliography." +
                    (style === "BibTeX"
                      ? "bib"
                      : style === "RIS"
                        ? "ris"
                        : "txt"),
                  selected.map((p) => citation(p, style)).join("\n\n"),
                )
              }
            >
              Download
            </Button>
            <Button icon={ExternalLink} disabled={!selected.length} onClick={() =>
              download("bibliography.html", bibliographyHtml(selected, style), "text/html")
            }>
              Download linked HTML
            </Button>
          </div>
          <p className="tool-note">
            Citation formats are a starting point. Check metadata and your
            institution’s style requirements. Links open publisher or source records;
            full-text access depends on the source. The HTML export keeps clickable links.
          </p>
        </aside>
      </div>
    </section>
  );
}
function TextTool({ kind }) {
  const { notify } = useApp();
  const [text, setText] = useState("");
  const [output, setOutput] = useState("");
  const [tone, setTone] = useState("Standard");
  const [busy, setBusy] = useState(false);
  const detector = kind === "detector";
  const human = kind === "humanizer";
  const title = detector
    ? "AI Detector"
    : human
      ? "AI Humanizer"
      : "Paraphraser";
  const transform = () => {
    setBusy(true);
    setTimeout(() => {
      if (detector) {
        const words = wordCount(text),
          sentences = text.split(/[.!?]+/).filter((s) => s.trim()).length;
        const avg = Math.round(words / Math.max(1, sentences));
        const diversity = Math.round(
          (new Set(text.toLowerCase().match(/\b\w+\b/g) || []).size /
            Math.max(1, words)) *
            100,
        );
        setOutput(
          `Text profile\n\n${words} words · ${sentences} sentences\n${avg} words per sentence on average\n${diversity}% unique words\n\n${avg > 25 ? "Your sentences are relatively long. Consider splitting some to improve readability." : "Your sentence length is generally concise."}\n\nAI authorship: Not determined. Text statistics cannot reliably distinguish AI writing from human writing. This demo does not make an authorship prediction.`,
        );
      } else {
        const replacements =
          human || tone === "Simple"
            ? [
                [/\bin order to\b/gi, "to"],
                [/\butilize\b/gi, "use"],
                [/\bfurthermore\b/gi, "also"],
                [/\bmoreover\b/gi, "also"],
                [/\ba significant number of\b/gi, "many"],
                [/\bdue to the fact that\b/gi, "because"],
                [/\bcommence\b/gi, "start"],
                [/\bprior to\b/gi, "before"],
                [/\bsubsequently\b/gi, "then"],
                [/\bhas the ability to\b/gi, "can"],
                [/\bapproximately\b/gi, "about"],
              ]
            : tone === "Formal"
              ? [
                  [/\ba lot of\b/gi, "many"],
                  [/\bget\b/gi, "obtain"],
                  [/\bshow\b/gi, "demonstrate"],
                  [/\bfind out\b/gi, "investigate"],
                  [/\bcan't\b/gi, "cannot"],
                  [/\bdon't\b/gi, "do not"],
                ]
              : [
                  [/\bin order to\b/gi, "to"],
                  [/\bit is important to note that\b\s*/gi, ""],
                  [/\bdue to the fact that\b/gi, "because"],
                  [/\ba number of\b/gi, "several"],
                  [/\butilize\b/gi, "use"],
                ];
        let result = text;
        for (const [re, val] of replacements) result = result.replace(re, val);
        result = result
          .replace(/ {2,}/g, " ")
          .replace(/(^|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());
        setOutput(result);
        if (result === text)
          notify(
            "No matching phrases found. The original wording has been retained.",
          );
      }
      setBusy(false);
    }, 300);
  };
  useEffect(() => {
    setOutput("");
    setTone(detector ? "Text analysis" : human ? "Natural" : "Standard");
  }, [kind]);
  return (
    <section className="page text-tool-page">
      <div className="center-heading">
        <span className="soft-icon">
          {detector ? <ScanText size={24} /> : <PenLine size={24} />}
        </span>
        <h1>{title}</h1>
        <p>
          {detector
            ? "Take a closer look at the patterns in your writing."
            : human
              ? "A lighter, clearer version of your words."
              : "Find a clearer way to say it."}
        </p>
      </div>
      <PromptSuggestions examples={detector ? toolExamples.detector : toolExamples.paraphraser} value={text} onChoose={value => { setText(value); setOutput(""); }} inputId="source-text" title="Try sample text" hint="Sample wording for practice. Replace it with your own text when ready." />
      <div className="text-tool">
        <div className="text-tool-controls">
          <div className="tabs">
            {(detector
              ? ["Text analysis"]
              : human
                ? ["Natural", "Simple"]
                : ["Standard", "Formal", "Simple"]
            ).map((t) => (
              <button
                key={t}
                className={tone === t || detector ? "active" : ""}
                onClick={() => setTone(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="tag">Local text rules + optional AI</span>
        </div>
        <div className="text-panels">
          <div>
            <label className="field-label" htmlFor="source-text">
              Your text
            </label>
            <textarea
              id="source-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your text here…"
              maxLength={20000}
            />
            <div className="text-panel-footer">
              <span>{wordCount(text)} words</span>
              <button
                className="text-btn"
                onClick={() => {
                  setText("");
                  setOutput("");
                }}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="text-output">
            <span className="field-label">
              {detector ? "Text profile" : "Result"}
            </span>
            <div className="output-copy">
              {output || (
                <span className="muted">
                  {detector
                    ? "Your text analysis will appear here."
                    : "Your revised text will appear here."}
                </span>
              )}
            </div>
            {output && (
              <div className="inline-actions">
                <Button
                  icon={Copy}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(output);
                      notify("Result copied.");
                    } catch {
                      notify(
                        "Clipboard unavailable. Download the result instead.",
                        true,
                      );
                    }
                  }}
                >
                  Copy
                </Button>
                <Button
                  icon={Download}
                  onClick={() => download("scrapetx-" + kind + ".txt", output)}
                >
                  Download
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="text-tool-bottom">
          <p>
            {detector
              ? "Readability metrics only. AI authorship cannot be reliably determined from this demo."
              : "This demo simplifies common phrases and adjusts wording using local text rules."}
          </p>
          <Button
            primary
            icon={busy ? LoaderCircle : Sparkles}
            disabled={!text.trim() || busy}
            onClick={transform}
          >
            {busy
              ? "Working…"
              : detector
                ? "Analyze text"
                : human
                  ? "Make clearer"
                  : "Paraphrase"}
          </Button>
        </div>
      </div>
      {!detector && (
        <AiPanel
          task="paraphrase"
          prompt={`Revise the following text in a ${tone.toLowerCase()} style, preserving meaning, technical terminology, and source citations. Do not invent claims.\n\n${text}`}
          label={human ? "Revise with AI" : "Paraphrase with AI"}
          onResult={(r) => setOutput(r.text)}
        />
      )}
    </section>
  );
}
function DiagramTool({ slides = false }) {
  const [params] = useSearchParams();
  const { notify, library, saveNote } = useApp();
  const [selectedEvidence, setSelectedEvidence] = useState([]);
  const [requestedEvidence, setRequestedEvidence] = useState([]);
  const [requestRevision, setRequestRevision] = useState(0);
  const [diagramMode, setDiagramMode] = useState("flowchart");
  const [requestedMode, setRequestedMode] = useState("flowchart");
  const [topic, setTopic] = useState(params.get("topic") || "");
  const [done, setDone] = useState("");
  const [step, setStep] = useState(0);
  const [edits, setEdits] = useState({});
  const deck = [
    "Research question",
    "Why it matters",
    "Approach & methods",
    "Evidence & findings",
    "Limitations",
    "Next steps",
  ];
  const title = slides ? "Presentation" : "Diagrams";
  return (
    <section className="page tool-page">
      <div className="center-heading">
        <span className="soft-icon">
          {slides ? <Presentation size={24} /> : <Network size={24} />}
        </span>
        <h1>
          {slides
            ? "Give your research a story."
            : "Make your thinking visible."}
        </h1>
        <p>
          {slides
            ? "Build an editable presentation outline."
            : "Create a visual flowchart or scientific process diagram. Download it as PNG or SVG."}
        </p>
      </div>
      <PromptSuggestions examples={slides ? toolExamples.presentation : toolExamples.diagrams} value={topic} onChoose={setTopic} />
      {!slides && <label className="diagram-output-choice">Output <select value={diagramMode} onChange={e=>setDiagramMode(e.target.value)}><option value="flowchart">Editable flowchart</option><option value="image">AI-generated image</option></select></label>}
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          setDone(topic.trim());
          setRequestedMode(diagramMode);
          setRequestedEvidence(
            library.filter((p) => selectedEvidence.includes(p.id)).slice(0, 6),
          );
          setRequestRevision((n) => n + 1);
          setEdits({});
          setStep(0);
        }}
      >
        <input
          aria-label={title + " topic"}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What is your research about?"
        />
        <Button primary disabled={!topic.trim()}>
          Create {slides ? "outline" : diagramMode === "image" ? "image" : "diagram"} <ArrowRight size={15} />
        </Button>
      </form>
      {!slides && library.some((p) => p.abstract) && (
        <details className="diagram-source-picker">
          <summary>Use saved research sources (optional)</summary>
          <p>
            Select up to six sources. Their supplied abstracts are sent with
            your diagram request.
          </p>
          {library
            .filter((p) => p.abstract)
            .slice(0, 80)
            .map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={selectedEvidence.includes(p.id)}
                  disabled={
                    !selectedEvidence.includes(p.id) &&
                    selectedEvidence.length >= 6
                  }
                  onChange={(e) =>
                    setSelectedEvidence((ids) =>
                      e.target.checked
                        ? [...ids, p.id]
                        : ids.filter((id) => id !== p.id),
                    )
                  }
                />
                <span>{p.title}</span>
              </label>
            ))}
        </details>
      )}
      {done ? (
        <div className="visual-result">
          <div className="section-heading">
            <h2>{done}</h2>
            {slides && (
              <Button
                icon={Download}
                onClick={() =>
                  download(
                    slides ? "presentation-outline.md" : "research-workflow.md",
                    `# ${done}\n\n` +
                      deck
                        .map(
                          (t, i) =>
                            `## ${i + 1}. ${t}\n${edits[i] || `Add your ${t.toLowerCase()} for ${done}.`}`,
                        )
                        .join("\n\n"),
                    "text/markdown",
                  )
                }
              >
                Export outline
              </Button>
            )}
          </div>
          {slides && <span className="tag">Editable template</span>}
          {slides && (
            <Button
              icon={Download}
              onClick={async () => {
                try {
                  await exportSlides({
                    title: done,
                    slides: deck.map((t, i) => ({
                      title: t,
                      content:
                        edits[i] || `${done}\nAdd your ${t.toLowerCase()}.`,
                    })),
                  });
                  notify("PowerPoint exported.");
                } catch (e) {
                  notify(e.message, true);
                }
              }}
            >
              Export PowerPoint
            </Button>
          )}
          {(slides || requestedMode === "flowchart") && <AiPanel
            key={requestRevision}
            task={slides ? "draft" : "diagram"}
            evidence={slides ? [] : requestedEvidence}
            prompt={
              slides
                ? `Create a six-slide research presentation outline about ${done}. Do not invent results or references.`
                : `Create the diagram requested by the user: ${done}. Show the actual process, inputs, transformations and outputs, not steps for researching the topic. Use concise readable labels, meaningful directed connections, and scientifically appropriate relationships. Aim for 6–12 nodes unless the request needs more.`
            }
            autoGenerate={!slides}
            label={
              slides
                ? "Generate slide outline with AI"
                : "Generate scientific diagram"
            }
          />}
          {slides ? (
            <div className="slides-workspace">
              <div className="slide-thumbnails">
                {deck.map((t, i) => (
                  <button
                    className={step === i ? "active" : ""}
                    key={t}
                    onClick={() => setStep(i)}
                  >
                    <span>{i + 1}</span>
                    {t}
                  </button>
                ))}
              </div>
              <div className="slide-canvas">
                <span>SCRAPETX / RESEARCH PRESENTATION</span>
                <h2>{deck[step]}</h2>
                <p>{done}</p>
                <textarea
                  aria-label={"Content for slide " + (step + 1)}
                  value={edits[step] || ""}
                  onChange={(e) =>
                    setEdits({ ...edits, [step]: e.target.value })
                  }
                  placeholder={
                    "Add your " + deck[step].toLowerCase() + " here…"
                  }
                />
                <footer>
                  {step + 1} / {deck.length}
                </footer>
              </div>
            </div>
          ) : null}
          {!slides && <ImageGenerator key={'image-'+requestRevision} context="diagram" prompt={done} autoGenerate={requestedMode === "image"} onSave={asset=>saveNote({title:done.slice(0,150),content:"AI-generated conceptual illustration. Review scientific details before using it as teaching material.",image:asset})} onGenerated={()=>notify("AI illustration ready. Download it below.")}/>}
          <p className="tool-note">
            A starting structure for your own research. Add verified findings
            and sources before presenting.
          </p>
        </div>
      ) : (
        <Empty
          icon={slides ? Presentation : Network}
          title={
            slides
              ? "From research to presentation"
              : "Connect the steps in your research"
          }
        >
          Enter a topic to create a structure you can make your own.
        </Empty>
      )}
    </section>
  );
}
