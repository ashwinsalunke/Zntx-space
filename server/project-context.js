import { isResearchProject } from '../shared/project-workspace.js';

// Keep project membership separate from an editor's potentially stale snapshot.
// The queue prevents parallel saves and explicit attachment from losing membership.
export function createProjectWriter({ getRecord, putRecord }) {
  const queues = new Map();
  return function write(token, collection, id, data, projectId = '', attach = false) {
    const key = JSON.stringify([token, collection, id]);
    const job = (queues.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
      const before = await getRecord(token, collection, id);
      const ids = [...new Set(before?.projectIds || [])];
      const shouldAttach = projectId && (!before || attach) && !isResearchProject(data);
      if (shouldAttach) {
        const project = await getRecord(token, 'projects', projectId);
        if (!isResearchProject(project)) throw Object.assign(new Error('Choose an available research project before saving.'), { status: 400 });
        if (!ids.includes(projectId)) ids.push(projectId);
      }
      if (attach && !before) throw Object.assign(new Error('This saved item is no longer available.'), { status: 404 });
      return putRecord(token, collection, id, { ...(attach ? before : data), projectIds: ids });
    });
    queues.set(key, job);
    job.finally(() => { if (queues.get(key) === job) queues.delete(key); }).catch(() => {});
    return job;
  };
}
