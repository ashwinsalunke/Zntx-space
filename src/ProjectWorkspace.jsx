import PromptSuggestions from "./PromptSuggestions.jsx";
import { toolQuestions } from "./tool-examples.js";
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FolderOpen, Plus, ArrowRight, Search, BookOpen, FileText, Presentation, NotebookPen, Scale, ExternalLink } from 'lucide-react';
import { useApp } from './app-context.js';
import { api, activeProjectKey, getActiveProjectId, sourceUrl } from './lib.js';
import { isResearchProject, belongsToProject, projectSection, projectSections, projectToolPath } from '../shared/project-workspace.js';
import { pdfReaderLink } from './SourcePdfReader.jsx';
import './project-workspace.css';

export function useProjectWorkspace(navigate) {
  const [projects, setProjects] = useState([]), [activeId, setActiveId] = useState(getActiveProjectId);
  const [projectError, setError] = useState(''), [projectLoading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  const refreshProjects = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const rows = await api('/api/records/projects');
      if(version === requestVersion.current) {setProjects(rows.filter(isResearchProject)); setError('');}
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { refreshProjects(); window.addEventListener('project-records-changed', refreshProjects); return () => window.removeEventListener('project-records-changed', refreshProjects); }, [refreshProjects]);
  function selectProject(id) {
    localStorage.setItem(activeProjectKey(), id); setActiveId(id);
    navigate('/projects');
  }
  async function createProject(title, question) {
    const project = { id: crypto.randomUUID(), type: 'research-project', title: title.trim(), question: question.trim(), papers: {}, createdAt: new Date().toISOString() };
    await api('/api/records/projects/' + project.id, { method: 'PUT', projectId: '', body: JSON.stringify(project) });
    setProjects(rows => [project, ...rows.filter(p => p.id !== project.id)]); selectProject(project.id);
  }
  return { projects, activeProjectId: activeId, activeProject: projects.find(p => p.id === activeId), selectProject, createProject, refreshProjects, projectError, projectLoading };
}

export function ProjectSelector() {
  const { projects, activeProjectId, selectProject, projectLoading, navigate } = useApp();
  return <div className="project-selector"><Link to="/projects" aria-label="Open project home"><FolderOpen size={16} aria-hidden="true"/></Link><label htmlFor="active-research-project">Project</label><select id="active-research-project" value={activeProjectId} disabled={projectLoading} onChange={e => e.target.value === '__new' ? navigate('/projects?new=1') : selectProject(e.target.value)}>
    <option value="">No project</option>
    {activeProjectId && !projects.some(p => p.id === activeProjectId) && <option value={activeProjectId}>Project unavailable</option>}
    {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
    <option value="__new">+ New project</option>
  </select></div>;
}

export const projectTools = [
  ['Find a topic', 'Explore ideas and choose a research question.', '/concepts', Search],
  ['Collect papers', 'Search published research and save useful sources.', '/search', BookOpen],
  ['Open a paper', 'Read a PDF and save passages or notes.', '/chat-pdf', FileText],
  ['Compare evidence', 'Compare methods, findings, and limitations.', '/projects/screening', Scale],
  ['Write your paper', 'Build a reference-based paper from your sources.', '/research-workflow', NotebookPen],
  ['Make a presentation', 'Create slides from a saved paper or new topic.', '/presentation', Presentation],
];

export function ProjectHomeCard() {
  const { activeProject } = useApp();
  return <div className="project-home-card"><FolderOpen size={24}/><div><strong>{activeProject ? activeProject.title : 'One project, from first idea to final paper'}</strong><p>{activeProject ? 'Your sources, notes, evidence, papers, and slides in one place.' : 'Create a project once. Keep your research together across every tool.'}</p></div><Link className="btn" to={activeProject ? '/projects' : '/projects?new=1'}>{activeProject ? 'Continue project' : 'Start a project'}<ArrowRight size={16}/></Link></div>;
}

const collections = ['papers','notes','drafts','projects','chats','searches','reviews','agents'];
export default function ProjectWorkspace() {
  const location = useLocation();
  const { activeProject: project, activeProjectId, projects, createProject, selectProject, projectError, projectLoading, refreshProjects, refreshLibrary } = useApp();
  const [creating, setCreating] = useState(new URLSearchParams(location.search).get('new') === '1');
  const [title, setTitle] = useState(''), [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [tab, setTab] = useState('Overview'), [adding, setAdding] = useState(false), [query, setQuery] = useState('');
  useEffect(() => { setCreating(new URLSearchParams(location.search).get('new') === '1'); }, [location.search]);
  const load = useCallback(async () => {
    setLoading(true);
    try { const values = await Promise.all(collections.map(async collection => (await api('/api/records/' + collection)).map(record => ({ collection, record })))); setItems(values.flat().filter(i => !isResearchProject(i.record) && i.record.type !== 'library-collection')); setError(''); }
    catch(e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load, activeProjectId]);
  useEffect(() => { setTab('Overview'); setAdding(false); }, [activeProjectId]);
  useEffect(() => { const id = new URLSearchParams(location.search).get('project'); if (id && id !== activeProjectId && projects.some(p=>p.id===id)) selectProject(id); }, [location.search, projects, activeProjectId]);
  const linked = items.filter(i => belongsToProject(i.record, activeProjectId) || (i.collection === 'papers' && project?.papers?.[i.record.id]));
  function openPath({collection, record}) {
    if (record.type === 'research-workflow') return (tab === 'Slides' ? '/presentation?id=' : '/research-workflow?id=') + encodeURIComponent(record.id);
    if (record.type === 'research-notebook') return '/notebooks/' + encodeURIComponent(record.id);
    if (record.type === 'template-manuscript') return '/template-writing?' + new URLSearchParams({id:record.id,template:record.templateId});
    if (collection === 'agents') return '/automations?id=' + encodeURIComponent(record.id);
    if (collection === 'chats') return '/chat/' + encodeURIComponent(record.id);
    if (collection === 'searches') return '/search?' + new URLSearchParams({q:record.query || '',source:record.source || 'deep'});
    if (collection === 'drafts') return '/ai-writer?id=' + encodeURIComponent(record.id);
    if (collection === 'papers' && (record.pdf || record.librarySync?.provider === 'mendeley')) return pdfReaderLink(record);
    return '/library?item=' + encodeURIComponent((collection === 'papers' ? 'paper:' : 'note:') + record.id);
  }
  async function attach(item) {
    setBusy(true); setError('');
    try { await api(`/api/project-items/${item.collection}/${encodeURIComponent(item.record.id)}`, {method:'POST', body:JSON.stringify({projectId: activeProjectId})}); await refreshLibrary(); await load(); }
    catch(e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="page shared-project-page">
    <div className="shared-project-heading"><div><p className="project-eyebrow">RESEARCH PROJECTS</p><h1>{project?.title || 'Your research, together'}</h1><p>{project?.question || 'Start with a topic, a paper, or an idea. Continue in any tool.'}</p></div><button className="btn" onClick={() => setCreating(true)}><Plus size={16}/> New project</button></div>
    {(error || projectError) && <div role="alert" className="project-error">{error || projectError}<button className="btn" onClick={() => {load(); refreshProjects();}}>Retry</button></div>}
    {creating && <form className="project-create-form" onSubmit={async e => {e.preventDefault();setBusy(true);setError('');try {await createProject(title,question);setCreating(false);setTitle('');setQuestion('');}catch(e){setError(e.message);}finally{setBusy(false);}}}>
      <h2>Start a project</h2><label>Project name<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Antibiotic resistance" autoFocus/></label><label>What would you like to understand? <span>(optional)</span><textarea maxLength={5000} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="You can decide on your research question later." rows={2}/></label><div><button className="btn primary" disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Create project'}</button><button type="button" className="btn" onClick={()=>setCreating(false)} disabled={busy}>Cancel</button></div>
    </form>}
    {!project && <div className="project-list">{projectLoading ? <p role="status">Loading projects…</p> : projects.map(p=><button key={p.id} onClick={()=>selectProject(p.id)}><FolderOpen size={22}/><span><strong>{p.title}</strong><small>{p.question || 'Open project'}</small></span><ArrowRight size={18}/></button>)}{!projectLoading && !projects.length && !creating && <p>Create your first project to keep sources and outputs together.</p>}</div>}
    {project && <>
      <nav className="project-tabs" aria-label="Project sections">{projectSections.map(section=><button key={section} aria-current={section===tab ? 'page' : undefined} onClick={()=>{setTab(section);setAdding(false);}}>{section}{section !== 'Overview' && <span>{linked.filter(i=>projectSection(i.collection,i.record)===section || (section === 'Slides' && i.record.workflow?.slides?.length)).length}</span>}</button>)}</nav>
      {tab === 'Overview' ? <><div className="project-next"><h2>What would you like to do?</h2><p>Choose any starting point. Saved work stays linked to this project.</p></div><div className="project-tool-grid">{projectTools.map(([name,description,path,Icon])=><Link key={path} to={path === '/projects/screening' ? path+'?project='+project.id : projectToolPath(path,project)}><Icon size={22}/><strong>{name}</strong><p>{description}</p><ArrowRight size={18}/></Link>)}</div><div className="project-home-card"><NotebookPen size={22}/><div><strong>Keep your thinking alongside your sources</strong><p>Create a notebook for questions, reading notes, and useful passages.</p></div><Link className="btn" to="/notebooks">Open notebooks</Link></div></> : null}
      {tab === 'Evidence' && <Link className="btn" to={'/projects/screening?project='+project.id}>Open evidence screening and decisions <ArrowRight size={16}/></Link>}
      <div className="project-items-heading"><h2>{adding ? 'Add existing work' : tab === 'Overview' ? 'Recently saved in this project' : tab}</h2><button className="btn" onClick={()=>setAdding(!adding)}>{adding ? 'Done' : 'Add from My Library'}</button></div>
      {adding && <label className="project-item-search">Find saved work<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by title"/></label>}
      {loading ? <p role="status">Loading project work…</p> : <div className="project-item-list">{(adding ? items.filter(i=>!linked.includes(i) && String(i.record.title || i.record.query || '').toLowerCase().includes(query.toLowerCase())) : linked.filter(i=>tab==='Overview'||projectSection(i.collection,i.record)===tab||(tab==='Slides'&&i.record.workflow?.slides?.length))).map(item=><article key={item.collection+item.record.id}><FileText size={20}/><div><strong>{item.record.title || item.record.query || 'Saved research'}</strong><small>{projectSection(item.collection,item.record)} · {item.record.type?.replaceAll('-',' ') || item.collection}</small></div>{adding ? <button className="btn" disabled={busy} onClick={()=>attach(item)}>Add</button> : <><Link className="btn" to={openPath(item)}>Open</Link>{item.collection==='papers' && sourceUrl(item.record) && <a className="btn" href={sourceUrl(item.record)} target="_blank" rel="noreferrer" aria-label={'Original source: '+item.record.title}><ExternalLink size={16}/></a>}{item.record.workflow?.generated?.paper && <Link className="btn" to={'/presentation?id='+encodeURIComponent(item.record.id)}>Make slides</Link>}</>}</article>)}{!adding && !linked.some(i=>tab==='Overview'||projectSection(i.collection,i.record)===tab||(tab==='Slides'&&i.record.workflow?.slides?.length)) && <p className="project-empty">Nothing saved here yet. Use a tool above or add existing work from your library.</p>}</div>}
      <p className="project-help">The project selector applies to new saved work. Existing documents keep their project links. You choose which sources to use when generating a paper or slides.</p>
    </>}
    <PromptSuggestions examples={toolQuestions.projects} title="Help with your project" />
  </section>;
}
