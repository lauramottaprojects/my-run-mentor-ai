import { loadKnowledgeBase } from "../lib/knowledge.mjs";

const kb = await loadKnowledgeBase();
const counts = {
  training_principles: kb.training_principles.length,
  session_library: kb.session_library.length,
  progression_rules: kb.progression_rules.length,
  plan_templates: kb.plan_templates.length,
  safety_rules: kb.safety_rules.length,
  intensity_guidance: kb.intensity_guidance.length,
  sources: kb.sources.length,
};
console.log(JSON.stringify({ meta: kb.meta, counts }, null, 2));
