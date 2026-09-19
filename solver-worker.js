import { runRules } from './rules.js';
import { suggestMoves, buildPlan } from './solver.js';

self.onmessage = ({ data }) => {
  try {
    const suggestions = runRules(data).map(issue => ({ id: issue.id, moves: suggestMoves(data, issue) }));
    self.postMessage({ suggestions, plan: buildPlan(data) });
  } catch (error) { self.postMessage({ error: error.message }); }
};
