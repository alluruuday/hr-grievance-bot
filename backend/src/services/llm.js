/**
 * LLM Service — Claude-powered intent classification and response generation.
 *
 * Flow:
 *   1. classifyIntent(message)  → { category, subCategory, confidence, keywords }
 *   2. generateResponse(session, kbSnippets, history) → { text, suggestTicket }
 *   3. extractTicketFields(conversation) → { severity, description, ... }
 */

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CATEGORIES = [
  { name: 'Leave & Attendance',      slug: 'leave-attendance',       keywords: ['leave', 'attendance', 'absent', 'roster', 'shift', 'half day', 'casual leave', 'sick leave'] },
  { name: 'Payroll & Compensation',  slug: 'payroll-compensation',   keywords: ['salary', 'payslip', 'ctc', 'incentive', 'reimbursement', 'fnf', 'payroll', 'compensation', 'hike', 'bonus'] },
  { name: 'HRMS / Documentation',    slug: 'hrms-documentation',     keywords: ['hrms', 'hr letter', 'profile', 'bank details', 'employment letter', 'login', 'portal', 'document'] },
  { name: 'Workplace / Manager',     slug: 'workplace-manager',      keywords: ['manager', 'team', 'conflict', 'workload', 'unfair', 'treatment', 'role', 'communication', 'behavior'] },
  { name: 'Policy Clarification',    slug: 'policy-clarification',   keywords: ['policy', 'wfh', 'work from home', 'working hours', 'appraisal policy', 'code of conduct', 'wfo'] },
  { name: 'Performance / Growth',    slug: 'performance-growth',     keywords: ['appraisal', 'feedback', 'target', 'kpi', 'growth', 'promotion', 'performance review'] },
  { name: 'Exit / Separation',       slug: 'exit-separation',        keywords: ['resign', 'notice period', 'relieving', 'exit', 'last working day', 'fnf exit', 'separation'] },
  { name: 'Sensitive / Confidential',slug: 'sensitive-confidential', keywords: ['harassment', 'discrimination', 'bias', 'psychological', 'safety', 'ethical', 'misconduct'] },
];

const SYSTEM_PROMPT = `You are an HR support assistant for Bhanzu, an ed-tech company.
Your job is to help employees resolve HR-related queries, guide them through HR policies, and create support tickets when needed.

Available categories:
${CATEGORIES.map(c => `- ${c.name}: ${c.keywords.slice(0,5).join(', ')}`).join('\n')}

Guidelines:
- Be warm, professional, and empathetic
- For sensitive/confidential topics (harassment, discrimination) be especially careful — assure privacy
- Provide specific, actionable guidance from the knowledge base when available
- After providing guidance, always ask "Did this resolve your query?"
- If the employee says No, initiate ticket creation — collect: description, severity (Low/Medium/High/Critical)
- Keep responses concise (2-4 sentences max per point)
- Never share other employees' information
- If you don't know something, say so honestly and offer to raise a ticket`;

/**
 * Classify the intent of a user message.
 * Returns the best-matching category + sub-category and keywords for KB search.
 */
async function classifyIntent(message, conversationHistory = []) {
  const messages = [
    ...conversationHistory.slice(-4),
    {
      role: 'user',
      content: `Classify this HR query into a category and sub-category. Reply with valid JSON only, no markdown.
User message: "${message}"

JSON format:
{
  "categorySlug": "<slug from list or null>",
  "subCategorySlug": "<sub-category slug or null>",
  "confidence": <0-1 float>,
  "keywords": ["keyword1", "keyword2"],
  "isConfidential": <true if harassment/discrimination/ethics>,
  "suggestedSeverity": "low|medium|high|critical"
}`,
    },
  ];

  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `You are a classifier. Return JSON only. Categories: ${CATEGORIES.map(c => c.slug).join(', ')}`,
      messages,
    });
    const text = resp.content[0].text.trim();
    const parsed = JSON.parse(text);
    return parsed;
  } catch (err) {
    logger.warn('Intent classification failed, falling back to keyword match', { error: err.message });
    return keywordFallback(message);
  }
}

function keywordFallback(message) {
  const lower = message.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const cat of CATEGORIES) {
    const score = cat.keywords.filter(k => lower.includes(k)).length;
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return {
    categorySlug: best?.slug || null,
    subCategorySlug: null,
    confidence: bestScore > 0 ? 0.5 : 0,
    keywords: best ? best.keywords.filter(k => lower.includes(k)) : [],
    isConfidential: lower.includes('harass') || lower.includes('discriminat'),
    suggestedSeverity: 'medium',
  };
}

/**
 * Generate a conversational HR response using KB snippets as context.
 */
async function generateResponse({ userMessage, conversationHistory, kbSnippets, category, subCategory, userName }) {
  const kbContext = kbSnippets.length > 0
    ? `\n\nRelevant HR Knowledge Base:\n${kbSnippets.map(s => `[${s.title}]: ${s.content}${s.policy_url ? ` (Full policy: ${s.policy_url})` : ''}`).join('\n\n')}`
    : '';

  const contextNote = category
    ? `\n\nContext: Employee is asking about "${category}"${subCategory ? ` > "${subCategory}"` : ''}.`
    : '';

  const systemWithContext = SYSTEM_PROMPT + kbContext + contextNote;

  const messages = [
    ...conversationHistory.slice(-8).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: systemWithContext,
    messages,
  });

  const text = resp.content[0].text;

  // Detect if response is suggesting ticket creation
  const suggestTicket = /create.{0,20}ticket|raise.{0,20}ticket|log.{0,20}ticket|submit.{0,20}ticket/i.test(text)
    || /not.{0,15}resolve|couldn.t.{0,15}help|escalate/i.test(text);

  return { text, suggestTicket };
}

/**
 * Extract structured ticket fields from the conversation.
 * Called after user says "No, this didn't resolve my issue".
 */
async function extractTicketFields(conversationHistory, category) {
  const convo = conversationHistory
    .slice(-10)
    .map(m => `${m.role === 'user' ? 'Employee' : 'Bot'}: ${m.content}`)
    .join('\n');

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: 'You extract structured fields from HR conversations. Return valid JSON only.',
    messages: [{
      role: 'user',
      content: `Based on this HR support conversation, extract ticket fields. Return JSON only.

Conversation:
${convo}

JSON format:
{
  "description": "<clear 1-3 sentence summary of the issue>",
  "severity": "low|medium|high|critical",
  "department": "<if mentioned>",
  "managerName": "<if mentioned>"
}

Severity guide: critical=harassment/safety, high=payroll/urgent, medium=most issues, low=general query`,
    }],
  });

  try {
    return JSON.parse(resp.content[0].text.trim());
  } catch {
    return { description: 'HR support ticket — see chat history', severity: 'medium' };
  }
}

module.exports = { classifyIntent, generateResponse, extractTicketFields, CATEGORIES };
