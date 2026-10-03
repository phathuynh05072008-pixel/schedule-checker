import { runRules } from './rules.js';
import { suggestMoves, buildPlan } from './solver.js';

self.onmessage = ({ data }) => {
  try {
    const schedule = data.schedule || data;
    const suggestions = runRules(schedule).map(issue => ({ id: issue.id, moves: suggestMoves(schedule, issue) }));
    self.postMessage({ suggestions, plan: data.recommendationsOnly ? null : buildPlan(schedule) });
  } catch (error) { self.postMessage({ error: error.message }); }
};
