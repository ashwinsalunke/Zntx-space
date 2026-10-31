import { useState } from 'react';
import { api, getActiveProjectId } from './lib.js';
// Capture ownership when a tool opens, including delayed AI completions and
// unmount autosaves. Changing the selector must not reassign in-flight work.
export function useProjectApi() {
  const [projectId] = useState(getActiveProjectId);
  return (url, options = {}) => api(url, { projectId, ...options });
}
