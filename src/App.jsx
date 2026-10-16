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
} from "lucide-react";
import { api, download, citation, csv, excerpt, wordCount, sourceUrl, bibliographyHtml } from "./lib.js";
import { relevantPassages } from "../server/research.js";
import AiPanel from "./AiPanel.jsx";
import { exportDocument, exportSlides } from "./export-client.js";
const PdfWorkspace = lazy(() => import("./PdfWorkspace.jsx"));
const PharmaHub = lazy(() => import("./PharmaHub.jsx"));
const ResearchProjects = lazy(() => import("./ResearchProjects.jsx"));
const Integrations = lazy(() => import("./Integrations.jsx"));
const ResearchChat = lazy(() => import("./ResearchChat.jsx"));
const Ctx = createContext();
export const useApp = () => useContext(Ctx);
const navigation = [
  ["/", Home, "Home"],
  ["/agents", Shapes, "Agent Gallery"],
  ["/templates", Files, "Templates"],
  ["/chat-pdf", MessageSquare, "Chat with PDF"],
  ["/search", FileSearch, "Literature Review"],
  ["/pharma", FlaskConical, "Pharma Research"],
  ["/projects", FolderOpen, "Research Projects"],
  ["/chat", MessageSquare, "Research Agent"],
  ["/ai-writer", PenLine, "AI Writer"],
  ["/concepts", Shapes, "Find Topics"],
  ["/paraphraser", ScanText, "Paraphraser"],
  ["/citation-generator", Quote, "Citation Generator"],
  ["/extract-data", Zap, "Extract Data"],
  ["/ai-detector", ScanText, "AI Detector"],
  ["/ai-humanizer", Sparkles, "AI Humanizer"],
  ["/integrations", Settings2, "Integrations"],
];
function Logo({ full = true }) {
  return (
    <span className="logo">
      <img src="/logo.svg" alt="" />
      {full && <span>ZNTX SPACE</span>}
    </span>
  );
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
    document.title = `${navigation.find((n) => n[0] === location.pathname)?.[2] || { "/library": "My Library", "/diagrams": "Diagrams", "/presentation": "Presentation" }[location.pathname] || "Research workspace"} · Zntx Space`;
  }, [location.pathname]);
  const savePaper = async (p) => {
    try {
      if (library.some((x) => x.id === p.id)) {
        await api("/api/library/" + encodeURIComponent(p.id), {
          method: "DELETE",
        });
        setLibrary((v) => v.filter((x) => x.id !== p.id));
        notify("Paper removed from your library.");
      } else {
        await api("/api/library", { method: "POST", body: JSON.stringify(p) });
        setLibrary((v) => [p, ...v]);
        notify("Paper saved to your library.");
      }
    } catch (e) {
      notify(e.message, true);
    }
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
      "/presentation": "Presentation",
    }[location.pathname] ||
    "Research workspace";
  return (
    <Ctx.Provider
      value={{ library, savePaper, history, refreshHistory, notify, navigate }}
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
            <Link to="/" aria-label="Zntx Space home">
              <Logo full={!collapsed} />
            </Link>
            <button
              className="icon-btn collapse-btn"
              onClick={toggleSidebar}
              aria-label="Toggle sidebar"
            >
              <PanelLeft size={17} />
            </button>
          </div>
          <Link
            className="new-chat"
            to="/"
            onClick={() => navigate("/", { state: { reset: Date.now() } })}
            title="New Chat"
          >
            <Plus size={17} />
            <span>New Chat</span>
          </Link>
          <nav>
            {navigation.map(([path, Icon, label]) => (
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
          <div className="sidebar-bottom">
            <button className="profile" onClick={() => setStatus(true)}>
              <span className="avatar">A</span>
              <span className="profile-copy">
                <b>Your research workspace</b>
                <small>No login needed</small>
              </span>
              <MoreHorizontal size={17} />
            </button>
          </div>
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
                  aria-label="Zntx Space home"
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
                element={<HomePage key={location.state?.reset || "home"} />}
              />
              <Route path="/search" element={<ResearchPage />} />
              <Route path="/pharma" element={<PharmaHub />} />
              <Route path="/projects" element={<ResearchProjects />} />
              <Route path="/integrations" element={<Integrations />} />
              <Route path="/chat" element={<ResearchChat />} />
              <Route path="/chat/:id" element={<ResearchChat />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/agents" element={<Gallery />} />
              <Route path="/templates" element={<Templates />} />
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
              <Route path="/presentation" element={<DiagramTool slides />} />
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
          <Modal title="Welcome to Zntx Space" onClose={() => setHelp(false)}>
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
                <b>Zntx Space</b>
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
function Composer({
  value,
  setValue,
  onSubmit,
  busy = false,
  mode = "search",
  setMode,
  placeholder = "Give me any task to work on...",
  compact = false,
}) {
  const { navigate, notify } = useApp();
  const [tools, setTools] = useState(false);
  const [model, setModel] = useState("Lite");
  const [models, setModels] = useState(false);
  const [listening, setListening] = useState(false);
  const menuRef = useRef();
  useEffect(() => {
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) {
        setTools(false);
        setModels(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
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
        if (value.trim()) onSubmit(model);
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
            if (value.trim() && !busy) onSubmit(model);
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
              setModels(false);
            }}
          >
            {mode === "search"
              ? "Tools"
              : quickActions.find((q) => q[2] === mode)?.[0] || "Tools"}
            <ChevronDown size={13} />
          </button>
          {tools && (
            <div className="popover tool-popover">
              <span className="section-label">Choose a research tool</span>
              {quickActions.map(([label, Icon, id]) => (
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
          <div className="model-selector">
            <button
              type="button"
              className="text-btn"
              aria-expanded={models}
              onClick={() => {
                setModels(!models);
                setTools(false);
              }}
            >
              {model}
              <ChevronDown size={13} />
            </button>
            {models && (
              <div className="popover model-popover">
                {["Lite", "Research"].map((v) => (
                  <button
                    type="button"
                    key={v}
                    onClick={() => {
                      setModel(v);
                      setModels(false);
                      if (v === "Research")
                        notify(
                          "Research mode selected. Use Europe PMC in results for full abstracts.",
                        );
                    }}
                  >
                    <span>
                      <b>{v}</b>
                      <small>
                        {v === "Lite"
                          ? "Quick discovery"
                          : "Life science abstracts"}
                      </small>
                    </span>
                    {v === model && <Check size={15} />}
                  </button>
                ))}
                <p className="small muted">Public research data · Demo mode</p>
              </div>
            )}
          </div>
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
function HomePage() {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState("search");
  const { navigate } = useApp();
  const submit = (m = mode, model = "Lite") => {
    if (m === "draft")
      navigate("/ai-writer?topic=" + encodeURIComponent(value));
    else if (m === "diagram" || m === "slides")
      navigate(
        (m === "diagram" ? "/diagrams" : "/presentation") +
          "?topic=" +
          encodeURIComponent(value),
      );
    else
      navigate(
        "/chat?q=" +
          encodeURIComponent(value) +
          (m === "review" ? "&view=overview" : "") +
          (model === "Research" ? "&source=europepmc" : ""),
      );
  };
  return (
    <div className="home-content">
      <section className="home-hero">
        <div className="hero-brand">
          <img src="/logo.svg" alt="" />
          <span>Zntx Space</span>
        </div>
        <h1>How can I help with your research?</h1>
        <Composer
          value={value}
          setValue={setValue}
          onSubmit={(model) => submit(mode, model)}
          mode={mode}
          setMode={setMode}
        />
        <div className="quick-actions">
          {quickActions.map(([label, Icon, id]) => (
            <button
              className={`btn ${mode === id && mode !== "search" ? "selected" : ""}`}
              key={id}
              onClick={() => {
                if (value.trim()) submit(id);
                else {
                  setMode(id);
                  if (id === "draft") navigate("/ai-writer");
                  else if (id === "diagram") navigate("/diagrams");
                  else if (id === "slides") navigate("/presentation");
                  else if (id === "review") navigate("/search");
                  else document.querySelector("textarea")?.focus();
                }
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </section>
      <section className="home-more">
        <div className="eyebrow">YOUR NEXT DISCOVERY STARTS HERE</div>
        <h2>From a question to a clearer picture.</h2>
        <div className="home-features">
          {[
            [
              Search,
              "Find your starting point",
              "Discover papers from public scholarly databases.",
              "/search",
            ],
            [
              BookOpen,
              "Understand the details",
              "Read PDFs and find answers in source passages.",
              "/chat-pdf",
            ],
            [
              PenLine,
              "Make room for your ideas",
              "Build a draft and keep your references close.",
              "/ai-writer",
            ],
          ].map(([I, t, d, p]) => (
            <Link key={p} to={p}>
              <I size={24} />
              <h3>{t}</h3>
              <p>{d}</p>
              <span>
                Explore <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>
        <p className="home-footnote">
          Zntx Space · Open research workspace, inspired by SciSpace
        </p>
      </section>
    </div>
  );
}
function SearchForm({ q, setQ, search, source, setSource, busy }) {
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
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Ask a research question or search for papers…"
      />
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
function ResearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const provider = params.get("source") || "crossref";
  const [q, setQ] = useState(query);
  const [source, setSource] = useState(provider);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState(params.get("view") || "papers");
  const [sort, setSort] = useState("relevance");
  const [year, setYear] = useState("all");
  const [selected, setSelected] = useState([]);
  const [compare, setCompare] = useState(false);
  const [paper, setPaper] = useState(null);
  const [retry, setRetry] = useState(0);
  const { history, refreshHistory, notify } = useApp();
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
        setResult({ ...data, papers: data.papers || data.results || [] });
        refreshHistory();
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [query, provider, retry]);
  const search = () => {
    if (!q.trim()) return;
    if (q.trim() === query && source === provider) setRetry((v) => v + 1);
    else setParams({ q: q.trim(), source });
  };
  const papers = (result?.papers || [])
    .filter((p) => year === "all" || p.year >= Number(year))
    .sort((a, b) =>
      sort === "citations"
        ? (b.citations || 0) - (a.citations || 0)
        : sort === "newest"
          ? (b.year || 0) - (a.year || 0)
          : 0,
    );
  const exportPapers = () => {
    download("zntx-research.csv", csv(papers), "text/csv");
    notify("Research table exported.");
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
          <Button icon={Download} onClick={exportPapers}>
            Export
          </Button>
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
      {!query && (
        <>
          <div className="search-presets">
            <span className="muted small">Try searching for:</span>
            {[
              "How does climate change impact biodiversity?",
              "Applications of machine learning in healthcare",
            ].map((s) => (
              <button key={s} onClick={() => setParams({ q: s, source })}>
                {s}
                <ArrowUp size={14} />
              </button>
            ))}
          </div>
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
            <div className="filters">
              <select
                aria-label="Publication year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="all">All years</option>
                <option value="2025">2025 onwards</option>
                <option value="2020">2020 onwards</option>
                <option value="2015">2015 onwards</option>
              </select>
              <select
                aria-label="Sort papers"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="relevance">Most relevant</option>
                <option value="newest">Newest first</option>
                <option value="citations">Most cited</option>
              </select>
            </div>
          </div>
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
                  {papers.length} papers loaded <span className="dot">·</span>{" "}
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
                  Try another topic or expand the publication year.
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
                  "zntx-comparison.csv",
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
  return (
    <div className="table-wrap">
      <table className="paper-table">
        <thead>
          <tr>
            <th>Paper</th>
            <th>Year</th>
            <th>Citations</th>
            <th>Abstract / source evidence</th>
          </tr>
        </thead>
        <tbody>
          {papers.map((p) => (
            <tr key={p.id}>
              <td>
                <button onClick={() => onOpen(p)}>{p.title}</button>
                <small>{p.authors.slice(0, 2).join(", ")}</small>
                <a href={p.url} target="_blank" rel="noreferrer">
                  {p.doi || "View source"} <ExternalLink size={11} />
                </a>
              </td>
              <td>{p.year || "—"}</td>
              <td>{p.citations}</td>
              <td>
                {p.abstract
                  ? excerpt(p.abstract, 500)
                  : "No abstract supplied by this provider. Read the original source to assess its findings."}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
          {p.pdf && (
            <a className="btn" href={p.pdf} target="_blank" rel="noreferrer">
              Read PDF <ExternalLink size={14} />
            </a>
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
function LibraryPage() {
  const { library, navigate } = useApp();
  const [q, setQ] = useState("");
  const [paper, setPaper] = useState(null);
  const papers = library.filter((p) =>
    (p.title + " " + p.authors.join(" "))
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>My Library</h1>
          <p>A home for the research you want to come back to.</p>
        </div>
        <Button
          icon={Download}
          disabled={!papers.length}
          onClick={() =>
            download(
              "zntx-library.bib",
              papers.map((p) => citation(p, "BibTeX")).join("\n\n"),
            )
          }
        >
          Export library
        </Button>
      </div>
      <div className="library-summary">
        <div>
          <Library size={23} />
          <strong>{library.length}</strong>
          <span>saved papers</span>
        </div>
        <span>
          <span className="live-dot" /> Private browser workspace
        </span>
      </div>
      <div className="field-with-icon">
        <Search size={17} />
        <input
          aria-label="Search library"
          placeholder="Search your library…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {!papers.length ? (
        <Empty
          icon={Library}
          title={q ? "No matching papers" : "Your next discovery belongs here"}
        >
          {q ? (
            "Try another title or author."
          ) : (
            <>
              Save interesting papers as you explore. They’ll be here whenever
              you need them.
              <br />
              <Button primary icon={Search} onClick={() => navigate("/search")}>
                Find papers
              </Button>
            </>
          )}
        </Empty>
      ) : (
        papers.map((p) => (
          <PaperCard key={p.id} paper={p} onOpen={() => setPaper(p)} />
        ))
      )}
      {paper && <PaperDetail paper={paper} onClose={() => setPaper(null)} />}
    </section>
  );
}
const agentData = [
  [
    "Literature Review Assistant",
    "Find relevant studies and organize a first reading list around your research question.",
    "Literature Review",
    "All domains",
    FileSearch,
    "search",
    "What are the recent advances in renewable energy storage?",
  ],
  [
    "Research Gap Explorer",
    "Explore the literature and build questions for your next research project.",
    "Deep Search",
    "All domains",
    Search,
    "concepts",
    "Sustainable urban development",
  ],
  [
    "Biomedical Evidence Finder",
    "Search life science publications and inspect source abstracts.",
    "Deep Search",
    "Biomedical",
    FlaskConical,
    "biomedical",
    "CRISPR gene editing delivery methods",
  ],
  [
    "Paper Comparison Matrix",
    "Bring publication details and abstracts together in an exportable table.",
    "Extract + Analyse",
    "All domains",
    Table2,
    "table",
    "Machine learning in healthcare",
  ],
  [
    "Academic Draft Builder",
    "Turn your topic and research sources into an editable working draft.",
    "Create + Write",
    "All domains",
    PenLine,
    "writer",
    "Artificial intelligence in higher education",
  ],
  [
    "PDF Reading Companion",
    "Locate relevant passages in your documents with page references.",
    "Extract + Analyse",
    "All domains",
    MessageSquare,
    "pdf",
    "",
  ],
  [
    "Climate Research Explorer",
    "Discover research on biodiversity, ecosystems, and a changing climate.",
    "Deep Search",
    "Environmental Science",
    Leaf,
    "search",
    "Climate change and biodiversity",
  ],
  [
    "Computer Science Scout",
    "Find publications about algorithms, language models, and computing.",
    "Deep Search",
    "Computer Science + AI",
    Brain,
    "search",
    "Large language models reasoning",
  ],
  [
    "Citation Organizer",
    "Build a bibliography from your papers in APA, MLA, IEEE, or BibTeX.",
    "Create + Write",
    "All domains",
    Quote,
    "citations",
    "",
  ],
  [
    "Research Presentation Builder",
    "Create an editable slide outline for your next research presentation.",
    "Create + Write",
    "All domains",
    Presentation,
    "slides",
    "My research project",
  ],
  [
    "Physics Paper Finder",
    "Explore the published literature in physics and materials science.",
    "Deep Search",
    "Physics",
    Atom,
    "search",
    "Quantum computing error correction",
  ],
  [
    "Study Data Extractor",
    "Extract document metadata, page text, and relevant evidence from a PDF.",
    "Extract + Analyse",
    "All domains",
    Zap,
    "extract",
    "",
  ],
];
function Gallery() {
  const { navigate } = useApp();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("Featured");
  const [agent, setAgent] = useState(null);
  const [task, setTask] = useState("");
  const [preview, setPreview] = useState(false);
  const categories = [
    "Featured",
    "Extract + Analyse",
    "Literature Review",
    "Create + Write",
    "Deep Search",
  ];
  const domains = [
    "Physics",
    "Computer Science + AI",
    "Biomedical",
    "Environmental Science",
  ];
  const agents = agentData.filter(
    (a) =>
      (category === "Featured" || a[2] === category || a[3] === category) &&
      (a[0] + " " + a[1] + " " + a[3]).toLowerCase().includes(q.toLowerCase()),
  );
  const run = () => {
    let type = agent[5];
    let s = encodeURIComponent(task);
    if (type === "pdf") navigate("/chat-pdf");
    else if (type === "extract") navigate("/extract-data");
    else if (type === "citations") navigate("/citation-generator");
    else if (type === "writer") navigate("/ai-writer?topic=" + s);
    else if (type === "slides") navigate("/presentation?topic=" + s);
    else if (type === "concepts") navigate("/concepts?topic=" + s);
    else
      navigate(
        "/search?q=" +
          s +
          (type === "table"
            ? "&view=table"
            : type === "biomedical"
              ? "&source=europepmc"
              : "&view=overview"),
      );
  };
  return (
    <div className="gallery-layout">
      <aside className="gallery-filter">
        <h2>Zntx Space Agent Gallery</h2>
        {categories.map((c, i) => (
          <button
            className={category === c ? "active" : ""}
            key={c}
            onClick={() => setCategory(c)}
          >
            {React.createElement(
              [Shapes, Table2, FileSearch, PenLine, Search][i],
              { size: 17 },
            )}
            {c}
          </button>
        ))}
        <span className="section-label">Browse by Domain</span>
        {domains.map((d, i) => (
          <button
            key={d}
            className={category === d ? "active" : ""}
            onClick={() => setCategory(d)}
          >
            {React.createElement([Atom, Brain, FlaskConical, Leaf][i], {
              size: 17,
            })}
            {d}
          </button>
        ))}
        <div className="gallery-note">
          <Sparkles size={17} />
          <p>Small tools. Big possibilities.</p>
          <small>Curated workflows for your research.</small>
        </div>
      </aside>
      <section className="gallery-content">
        <div className="field-with-icon">
          <Search size={17} />
          <input
            aria-label="Search all agents"
            placeholder="Search all Agents"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="gallery-count">
          Showing {agents.length} research workflows{" "}
          <button
            onClick={() => {
              setQ("");
              setCategory("Featured");
            }}
          >
            Show All
          </button>
        </div>
        <div className="agent-grid">
          {agents.map((a) => {
            const I = a[4];
            return (
              <article className="agent-card" key={a[0]}>
                <div className="agent-body">
                  <div className="agent-icon-stack">
                    <span>
                      <Files size={19} />
                    </span>
                    <span>
                      <I size={20} />
                    </span>
                    <span>
                      <FileText size={18} />
                    </span>
                  </div>
                  <h3>{a[0]}</h3>
                  <p>{a[1]}</p>
                  <span className="tag">{a[2]}</span>
                </div>
                <div className="agent-actions">
                  <button
                    onClick={() => {
                      setAgent(a);
                      setTask(a[6]);
                      setPreview(false);
                    }}
                  >
                    <Zap size={14} />
                    Run Task
                  </button>
                  <button
                    onClick={() => {
                      setAgent(a);
                      setTask(a[6]);
                      setPreview(true);
                    }}
                  >
                    <Files size={14} />
                    View Output
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {agents.length === 0 && (
          <Empty icon={Search} title="No matching workflows">
            Try another keyword or category.
          </Empty>
        )}
      </section>
      {agent && (
        <Modal title={agent[0]} onClose={() => setAgent(null)}>
          <div className="modal-body">
            <p className="muted">{agent[1]}</p>
            {preview ? (
              <div className="sample-output">
                <span className="tag">Example workflow</span>
                <h3>{agent[6] || "Your research document"}</h3>
                <ol>
                  <li>Provide a question, topic, or document.</li>
                  <li>Explore the matching sources and evidence.</li>
                  <li>Review and export your work.</li>
                </ol>
                <p className="small muted">
                  Outputs use public metadata, source excerpts, or editable
                  templates, depending on the tool.
                </p>
              </div>
            ) : (
              <label className="field-label">
                Your task
                <textarea
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="Describe your research task…"
                  rows={4}
                />
              </label>
            )}
            <Button
              primary
              icon={ArrowRight}
              onClick={run}
              disabled={
                !task.trim() &&
                !["pdf", "extract", "citations"].includes(agent[5])
              }
            >
              {preview ? "Open workflow" : "Run task"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
const templateData = [
  [
    "Literature Review",
    "Organize your sources into a clear, thematic review.",
    "Review",
  ],
  ["Research Paper", "Build your paper from abstract to references.", "Paper"],
  [
    "Research Proposal",
    "Frame your question, approach, and expected contribution.",
    "Proposal",
  ],
  [
    "Thesis Chapter",
    "Start a focused chapter with a structured argument.",
    "Thesis",
  ],
  ["Case Study", "Document context, observations, and analysis.", "Paper"],
  [
    "Conference Abstract",
    "Give your work a concise, compelling introduction.",
    "Abstract",
  ],
];
function Templates() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("All templates");
  const { navigate } = useApp();
  return (
    <section className="page templates-page">
      <div className="center-heading">
        <span className="soft-icon">
          <Files size={24} />
        </span>
        <h1>A head start for your next paper.</h1>
        <p>Simple structures. More space for your ideas.</p>
      </div>
      <div className="field-with-icon">
        <Search size={18} />
        <input
          aria-label="Search templates"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search templates…"
        />
      </div>
      <div className="filter-chips">
        {[
          "All templates",
          "Paper",
          "Review",
          "Proposal",
          "Thesis",
          "Abstract",
        ].map((c) => (
          <button
            key={c}
            className={c === category ? "active" : ""}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="template-grid">
        {templateData
          .filter(
            (t) =>
              (category === "All templates" || t[2] === category) &&
              t[0].toLowerCase().includes(q.toLowerCase()),
          )
          .map(([t, d, c], i) => (
            <button
              className="template-card"
              key={t}
              onClick={() =>
                navigate("/ai-writer?template=" + encodeURIComponent(t))
              }
            >
              <div className={`paper-preview preview-${i}`}>
                <div className="paper-preview-sheet">
                  <span>RESEARCH & DISCOVERY</span>
                  <h3>{t}</h3>
                  <i />
                  <i />
                  <i />
                  <h4>Introduction</h4>
                  <i />
                  <i />
                  <i />
                  <div className="preview-columns">
                    <div>
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div>
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                  <h4>Research approach</h4>
                  <i />
                  <i />
                </div>
                <span className="preview-open">
                  <PenLine size={14} /> Use template
                </span>
              </div>
              <div className="template-caption">
                <span className="tag">{c}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            </button>
          ))}
      </div>
      {!templateData.some(
        (t) =>
          (category === "All templates" || t[2] === category) &&
          t[0].toLowerCase().includes(q.toLowerCase()),
      ) && <Empty title="No templates found">Try another search.</Empty>}
    </section>
  );
}
function Writer() {
  const [params] = useSearchParams();
  const { notify, library } = useApp();
  const [sources, setSources] = useState([]);
  const [exportFormat, setExportFormat] = useState("docx");
  const [topic, setTopic] = useState(params.get("topic") || "");
  const [title, setTitle] = useState(
    params.get("template") || "Untitled document",
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
      setContent(
        `# ${t}\n\n## Introduction\nDescribe your topic and why it matters.\n\n## Research question\nState the specific question this work explores.\n\n## Approach\nOutline how you will find and assess evidence.\n\n## Discussion\nCompare the sources, surface disagreements, and identify limitations.\n\n## Conclusion\nSummarize the contribution and open questions.\n\n## References\nAdd your verified sources here.`,
      );
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
                  onClick={() => download("zntx-" + kind + ".txt", output)}
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
      <button
        className="example-link"
        onClick={() => {
          setText(
            "In order to improve the quality of research, we utilize a significant number of published sources. Furthermore, it is important to note that findings should be assessed prior to drawing conclusions.",
          );
          setOutput("");
        }}
      >
        Try an example <ArrowRight size={13} />
      </button>
    </section>
  );
}
function DiagramTool({ slides = false }) {
  const [params] = useSearchParams();
  const { notify } = useApp();
  const [topic, setTopic] = useState(params.get("topic") || "");
  const [done, setDone] = useState("");
  const [step, setStep] = useState(0);
  const [edits, setEdits] = useState({});
  const steps = [
    "Research question",
    "Literature search",
    "Evidence screening",
    "Data extraction",
    "Synthesis & discussion",
    "Conclusion",
  ];
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
            : "Create a research workflow diagram from your topic."}
        </p>
      </div>
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          setDone(topic);
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
          Create {slides ? "outline" : "diagram"} <ArrowRight size={15} />
        </Button>
      </form>
      {done ? (
        <div className="visual-result">
          <div className="section-heading">
            <h2>{done}</h2>
            <Button
              icon={Download}
              onClick={() =>
                download(
                  slides ? "presentation-outline.md" : "research-workflow.md",
                  `# ${done}\n\n` +
                    (slides ? deck : steps)
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
          </div>
          <span className="tag">Editable template</span>
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
          <AiPanel
            task={slides ? "draft" : "diagram"}
            prompt={
              slides
                ? `Create a six-slide research presentation outline about ${done}. Do not invent results or references.`
                : `Create a concept map for researching ${done}, showing related concepts and workflow relationships. Mark unverified content.`
            }
            label={
              slides
                ? "Generate slide outline with AI"
                : "Generate concept map with AI"
            }
          />
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
                <span>ZNTX SPACE / RESEARCH PRESENTATION</span>
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
          ) : (
            <div className="workflow-diagram">
              {steps.map((s, i) => (
                <React.Fragment key={s}>
                  <div>
                    <span>0{i + 1}</span>
                    <h3>{s}</h3>
                    <input
                      aria-label={"Note for " + s}
                      value={edits[i] || ""}
                      onChange={(e) =>
                        setEdits({ ...edits, [i]: e.target.value })
                      }
                      placeholder="Add a note…"
                    />
                  </div>
                  {i < steps.length - 1 && <ArrowRight size={20} />}
                </React.Fragment>
              ))}
            </div>
          )}
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
