export const isResearchProject = record => record?.type === 'research-project' || (!record?.type && !!record?.papers && !record?.workflow);
export const belongsToProject = (record, id) => !!id && (record?.projectIds || []).includes(id);
export const projectSections = ['Overview', 'Sources', 'Notes', 'Evidence', 'Drafts', 'Slides'];
export function projectSection(collection, record) {
  if (collection === 'papers') return 'Sources';
  if (collection === 'drafts' || record.type === 'template-manuscript') return 'Drafts';
  if (record.type === 'research-workflow') return record.workflow?.deliverable === 'presentation' ? 'Slides' : 'Drafts';
  if (['chats', 'searches', 'reviews'].includes(collection) || ['literature-search', 'research-chat-turn'].includes(record.type)) return 'Evidence';
  return 'Notes';
}
export function projectToolPath(path, project) {
  const params = new URLSearchParams();
  const topic = project?.question || project?.title || '';
  if (topic) params.set(path === '/search' || path === '/chat' ? 'q' : 'topic', topic);
  if (path === '/search') params.set('source', 'deep');
  return path + (params.size ? '?' + params : '');
}
