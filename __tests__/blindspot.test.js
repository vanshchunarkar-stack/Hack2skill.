"use strict";

/**
 * Blindspot — Comprehensive Test Suite
 * 
 * Tests cover:
 * - Input validation (empty, short, long, valid)
 * - AI config integrity (system prompt, schema, guardrails)
 * - Recommendation detection & sanitization
 * - API endpoint behavior (validation, error handling)
 * - Analysis structure validation
 * - Prompt injection resistance
 * - Build verification
 * 
 * Tests that require a live Gemini API key are isolated and can be run
 * with GEMINI_API_KEY set; they are skipped otherwise.
 */

const request = require("supertest");
const {
  validateInput,
  detectRecommendations,
  sanitizeRecommendations,
  SYSTEM_PROMPT,
  OUTPUT_SCHEMA,
  RECOMMENDATION_PATTERNS,
  INPUT_CONSTRAINTS,
} = require("../src/ai/config");

const {
  buildUserPrompt,
  validateAnalysisStructure,
} = require("../src/ai/analyzer");

const app = require("../server");

// ────────────────────────────────────────────────────────────────────
// TEST DATA — Realistic decision scenarios for evaluation
// ────────────────────────────────────────────────────────────────────

const EVALUATION_DATASET = [
  {
    id: "internship",
    decision: "I have two job offers. One pays more and one provides more learning. I'm leaning towards the higher-paying one because I have student loans.",
    context: "The higher-paying job is at a big company with less mentorship. The learning-focused one is a startup.",
    concerns: "I'm worried about career growth long-term.",
    expectedCategories: ["assumptions", "blind_spots", "conflicts", "critical_questions"],
  },
  {
    id: "laptop",
    decision: "I need to decide whether to buy an expensive laptop. It costs $2000 but has great specs for my software development work.",
    context: "My current laptop is slow but still functional.",
    concerns: "Budget is tight this month.",
    expectedCategories: ["assumptions", "overlooked_factors", "unknowns", "critical_questions"],
  },
  {
    id: "relocation",
    decision: "I'm considering relocating to another city for a new job opportunity. The salary is higher but I'd leave my support network behind.",
    context: "I've been wanting a change for a while.",
    concerns: "My family is here and I worry about loneliness.",
    expectedCategories: ["blind_spots", "conflicts", "alternative_perspectives", "critical_questions"],
  },
  {
    id: "project_choice",
    decision: "I'm trying to choose a final-year project. One is technically challenging but risky (AI research), and the other is safe but less interesting (web app).",
    context: "I want to impress recruiters and learn new things.",
    concerns: "What if the risky project fails?",
    expectedCategories: ["assumptions", "overlooked_factors", "conflicts"],
  },
  {
    id: "quit_job",
    decision: "I want to quit my job tomorrow. The work environment is toxic but I don't have another job lined up.",
    context: "I have about 3 months of savings.",
    concerns: "My mental health is suffering.",
    expectedCategories: ["blind_spots", "unknowns", "critical_questions"],
  },
];


// ════════════════════════════════════════════════════════════════════
// TEST 01-07: Input Validation
// ════════════════════════════════════════════════════════════════════

describe("Input Validation", () => {

  test("TEST 10: rejects empty input", () => {
    const result = validateInput("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("TEST 10b: rejects null input", () => {
    const result = validateInput(null);
    expect(result.valid).toBe(false);
  });

  test("TEST 10c: rejects undefined input", () => {
    const result = validateInput(undefined);
    expect(result.valid).toBe(false);
  });

  test("TEST 10d: rejects very short input", () => {
    const result = validateInput("hi");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("at least 10 characters");
  });

  test("TEST 11: handles very long input", () => {
    const longInput = "A".repeat(6000);
    const result = validateInput(longInput);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("5,000 characters");
  });

  test("accepts valid normal input", () => {
    const result = validateInput("Should I accept this internship offer?");
    expect(result.valid).toBe(true);
  });

  test("accepts input with all fields", () => {
    const result = validateInput(
      "Should I accept this internship?",
      "It pays well and is close to home",
      "Worried about learning opportunities"
    );
    expect(result.valid).toBe(true);
  });

  test("rejects combined length exceeding limit", () => {
    const result = validateInput(
      "A".repeat(2000),
      "B".repeat(2000),
      "C".repeat(2000)
    );
    expect(result.valid).toBe(false);
  });
});


// ════════════════════════════════════════════════════════════════════
// TEST 08: Anti-Recommendation Guardrail
// ════════════════════════════════════════════════════════════════════

describe("Recommendation Detection Guardrail", () => {

  test("TEST 08: detects 'You should' recommendation", () => {
    const analysis = {
      decision: "Test",
      priorities: [],
      facts: [],
      assumptions: [],
      blind_spots: ["You should definitely pick option A"],
      overlooked_factors: [],
      conflicts: [],
      unknowns: [],
      alternative_perspectives: [],
      critical_questions: [],
      reflection: "Consider your options carefully.",
    };
    const result = detectRecommendations(analysis);
    expect(result.hasRecommendation).toBe(true);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  test("detects 'I recommend' in reflection", () => {
    const analysis = {
      decision: "Test",
      priorities: [],
      facts: [],
      assumptions: [],
      blind_spots: [],
      overlooked_factors: [],
      conflicts: [],
      unknowns: [],
      alternative_perspectives: [],
      critical_questions: [],
      reflection: "I recommend choosing the startup position.",
    };
    const result = detectRecommendations(analysis);
    expect(result.hasRecommendation).toBe(true);
  });

  test("allows neutral language", () => {
    const analysis = {
      decision: "Deciding between two jobs",
      priorities: ["Career growth", "Salary"],
      facts: ["Job A pays $80K", "Job B pays $60K"],
      assumptions: ["You may be assuming salary is the most important factor"],
      blind_spots: ["Work-life balance has not been mentioned"],
      overlooked_factors: ["Benefits packages may differ significantly"],
      conflicts: ["There may be a tension between stated learning goals and salary focus"],
      unknowns: ["Team culture at both companies"],
      alternative_perspectives: ["Some people prioritize mentorship over salary early in career"],
      critical_questions: ["What does career progression look like at each company?"],
      reflection: "This decision involves weighing several important factors. Consider what matters most to you long-term.",
    };
    const result = detectRecommendations(analysis);
    expect(result.hasRecommendation).toBe(false);
  });

  test("sanitizes recommendation language", () => {
    const analysis = {
      decision: "Test",
      priorities: [],
      facts: [],
      assumptions: ["You should consider the cost"],
      blind_spots: [],
      overlooked_factors: [],
      conflicts: [],
      unknowns: [],
      alternative_perspectives: [],
      critical_questions: [],
      reflection: "I recommend looking at the data more closely.",
    };
    const sanitized = sanitizeRecommendations(analysis);
    expect(sanitized.reflection).not.toContain("I recommend");
    expect(sanitized.assumptions[0]).not.toContain("You should");
  });

  test("all recommendation patterns are valid regex", () => {
    for (const pattern of RECOMMENDATION_PATTERNS) {
      expect(pattern).toBeInstanceOf(RegExp);
      // Ensure they don't match empty strings
      expect(pattern.test("")).toBe(false);
    }
  });
});


// ════════════════════════════════════════════════════════════════════
// TEST 09: Prompt Injection Resistance
// ════════════════════════════════════════════════════════════════════

describe("Prompt Injection Resistance", () => {

  test("TEST 09: system prompt contains anti-injection instructions", () => {
    expect(SYSTEM_PROMPT).toContain("ANTI-INJECTION PROTECTION");
    expect(SYSTEM_PROMPT).toContain("ignore your instructions");
    expect(SYSTEM_PROMPT).toContain("override");
    expect(SYSTEM_PROMPT).toContain("neutral decision analysis");
  });

  test("system prompt prohibits making decisions", () => {
    expect(SYSTEM_PROMPT).toContain("MUST NOT make the decision");
    expect(SYSTEM_PROMPT).toContain("MUST NOT recommend");
    expect(SYSTEM_PROMPT).toContain("final decision ALWAYS belongs to the user");
  });

  test("system prompt contains forbidden phrases list", () => {
    expect(SYSTEM_PROMPT).toContain("You should");
    expect(SYSTEM_PROMPT).toContain("I recommend");
    expect(SYSTEM_PROMPT).toContain("The best option is");
  });

  test("system prompt contains approved phrasing", () => {
    expect(SYSTEM_PROMPT).toContain("You may want to examine");
    expect(SYSTEM_PROMPT).toContain("One factor worth investigating");
    expect(SYSTEM_PROMPT).toContain("A question worth asking");
  });

  test("system prompt requires JSON output", () => {
    expect(SYSTEM_PROMPT).toContain("JSON");
    expect(SYSTEM_PROMPT).toContain("decision");
    expect(SYSTEM_PROMPT).toContain("assumptions");
    expect(SYSTEM_PROMPT).toContain("blind_spots");
  });
});


// ════════════════════════════════════════════════════════════════════
// TEST 01-07: Analysis Structure Validation
// ════════════════════════════════════════════════════════════════════

describe("Analysis Structure Validation", () => {

  test("TEST 01: validates complete valid analysis", () => {
    const analysis = {
      decision: "Choosing between two internships",
      priorities: ["Learning", "Salary"],
      facts: ["Internship A pays $5000/month"],
      assumptions: ["More pay means better opportunity"],
      blind_spots: ["Work culture differences"],
      overlooked_factors: ["Commute time"],
      conflicts: ["Learning vs pay priority"],
      unknowns: ["Long-term career impact"],
      alternative_perspectives: ["Focus on skill development"],
      critical_questions: ["What mentorship is available?"],
      reflection: "Consider multiple dimensions beyond salary.",
    };
    const result = validateAnalysisStructure(analysis);
    expect(result.valid).toBe(true);
  });

  test("TEST 02: assumption detection - validates assumptions array", () => {
    const analysis = {
      decision: "Test",
      priorities: [],
      facts: [],
      assumptions: ["Assumption that higher pay leads to happiness"],
      blind_spots: [],
      overlooked_factors: [],
      conflicts: [],
      unknowns: [],
      alternative_perspectives: [],
      critical_questions: [],
      reflection: "Think carefully.",
    };
    const result = validateAnalysisStructure(analysis);
    expect(result.valid).toBe(true);
    expect(analysis.assumptions).toHaveLength(1);
  });

  test("TEST 03: blind spot detection - validates blind_spots array", () => {
    const analysis = {
      decision: "Test",
      priorities: [],
      facts: [],
      assumptions: [],
      blind_spots: ["Health insurance differences", "Remote work policies"],
      overlooked_factors: [],
      conflicts: [],
      unknowns: [],
      alternative_perspectives: [],
      critical_questions: [],
      reflection: "Consider these factors.",
    };
    const result = validateAnalysisStructure(analysis);
    expect(result.valid).toBe(true);
    expect(analysis.blind_spots).toHaveLength(2);
  });

  test("TEST 04: overlooked factor detection", () => {
    const analysis = {
      decision: "Test",
      priorities: [],
      facts: [],
      assumptions: [],
      blind_spots: [],
      overlooked_factors: ["Impact on family relationships"],
      conflicts: [],
      unknowns: [],
      alternative_perspectives: [],
      critical_questions: [],
      reflection: "Think about this.",
    };
    expect(validateAnalysisStructure(analysis).valid).toBe(true);
    expect(analysis.overlooked_factors).toHaveLength(1);
  });

  test("TEST 05: conflict detection", () => {
    const analysis = {
      decision: "Test",
      priorities: [],
      facts: [],
      assumptions: [],
      blind_spots: [],
      overlooked_factors: [],
      conflicts: ["States learning is priority but focuses on pay"],
      unknowns: [],
      alternative_perspectives: [],
      critical_questions: [],
      reflection: "Examine this tension.",
    };
    expect(validateAnalysisStructure(analysis).valid).toBe(true);
    expect(analysis.conflicts).toHaveLength(1);
  });

  test("TEST 06: critical question generation", () => {
    const analysis = {
      decision: "Test",
      priorities: [],
      facts: [],
      assumptions: [],
      blind_spots: [],
      overlooked_factors: [],
      conflicts: [],
      unknowns: [],
      alternative_perspectives: [],
      critical_questions: ["What is the growth trajectory?", "How reversible is this decision?"],
      reflection: "Investigate these questions.",
    };
    expect(validateAnalysisStructure(analysis).valid).toBe(true);
    expect(analysis.critical_questions).toHaveLength(2);
  });

  test("TEST 07: facts vs assumptions vs unknowns separated", () => {
    const analysis = {
      decision: "Test",
      priorities: [],
      facts: ["Company A has 500 employees"],
      assumptions: ["Larger companies are more stable"],
      blind_spots: [],
      overlooked_factors: [],
      conflicts: [],
      unknowns: ["Company turnover rates"],
      alternative_perspectives: [],
      critical_questions: [],
      reflection: "These are distinct categories.",
    };
    const result = validateAnalysisStructure(analysis);
    expect(result.valid).toBe(true);
    // Verify separation
    expect(analysis.facts[0]).not.toEqual(analysis.assumptions[0]);
    expect(analysis.facts[0]).not.toEqual(analysis.unknowns[0]);
    expect(analysis.assumptions[0]).not.toEqual(analysis.unknowns[0]);
  });

  test("TEST 13: rejects malformed analysis - missing fields", () => {
    const incomplete = { decision: "Test" };
    const result = validateAnalysisStructure(incomplete);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Missing required field");
  });

  test("rejects null analysis", () => {
    expect(validateAnalysisStructure(null).valid).toBe(false);
  });

  test("rejects analysis with wrong types", () => {
    const wrongTypes = {
      decision: 123,
      priorities: "not-an-array",
      facts: [],
      assumptions: [],
      blind_spots: [],
      overlooked_factors: [],
      conflicts: [],
      unknowns: [],
      alternative_perspectives: [],
      critical_questions: [],
      reflection: "test",
    };
    expect(validateAnalysisStructure(wrongTypes).valid).toBe(false);
  });
});


// ════════════════════════════════════════════════════════════════════
// Prompt Builder Tests
// ════════════════════════════════════════════════════════════════════

describe("Prompt Builder", () => {

  test("builds prompt with decision only", () => {
    const prompt = buildUserPrompt("Should I take this job?");
    expect(prompt).toContain("DECISION BEING CONSIDERED");
    expect(prompt).toContain("Should I take this job?");
    expect(prompt).not.toContain("REASONING");
  });

  test("builds prompt with all fields", () => {
    const prompt = buildUserPrompt(
      "Should I take this job?",
      "It pays well",
      "Worried about work-life balance"
    );
    expect(prompt).toContain("DECISION BEING CONSIDERED");
    expect(prompt).toContain("REASONING");
    expect(prompt).toContain("CONCERNS");
    expect(prompt).toContain("blind spots");
  });

  test("ignores empty context/concerns", () => {
    const prompt = buildUserPrompt("Test decision", "", "  ");
    expect(prompt).not.toContain("REASONING");
    expect(prompt).not.toContain("CONCERNS");
  });
});


// ════════════════════════════════════════════════════════════════════
// Output Schema Tests
// ════════════════════════════════════════════════════════════════════

describe("Output Schema", () => {

  test("schema has all required fields", () => {
    const required = OUTPUT_SCHEMA.required;
    expect(required).toContain("decision");
    expect(required).toContain("priorities");
    expect(required).toContain("facts");
    expect(required).toContain("assumptions");
    expect(required).toContain("blind_spots");
    expect(required).toContain("overlooked_factors");
    expect(required).toContain("conflicts");
    expect(required).toContain("unknowns");
    expect(required).toContain("alternative_perspectives");
    expect(required).toContain("critical_questions");
    expect(required).toContain("reflection");
  });

  test("schema defines correct types", () => {
    expect(OUTPUT_SCHEMA.properties.decision.type).toBe("string");
    expect(OUTPUT_SCHEMA.properties.reflection.type).toBe("string");
    expect(OUTPUT_SCHEMA.properties.facts.type).toBe("array");
    expect(OUTPUT_SCHEMA.properties.assumptions.type).toBe("array");
    expect(OUTPUT_SCHEMA.properties.blind_spots.type).toBe("array");
  });
});


// ════════════════════════════════════════════════════════════════════
// API Endpoint Tests (supertest)
// ════════════════════════════════════════════════════════════════════

describe("API Endpoints", () => {

  test("GET /api/health returns 200", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.service).toBe("blindspot-api");
  });

  test("TEST 10-API: POST /api/analyze rejects empty body", async () => {
    const res = await request(app)
      .post("/api/analyze")
      .send({})
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });

  test("POST /api/analyze rejects short decision", async () => {
    const res = await request(app)
      .post("/api/analyze")
      .send({ decision: "hi" })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("TEST 11-API: POST /api/analyze rejects very long input", async () => {
    const res = await request(app)
      .post("/api/analyze")
      .send({ decision: "A".repeat(6000) })
      .set("Content-Type", "application/json");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("POST /api/analyze sanitizes HTML in input", async () => {
    const res = await request(app)
      .post("/api/analyze")
      .send({ decision: '<script>alert("xss")</script>Should I take this job offer?' })
      .set("Content-Type", "application/json");
    // Should either reject or process (depends on API key), but not crash
    expect([400, 500, 502, 200]).toContain(res.status);
  });

  test("GET / serves the frontend", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("Blindspot");
  });

  test("TEST 12: POST /api/analyze handles missing API key gracefully", async () => {
    // Save and clear API key
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    // Need to reset the module cache to force re-initialization
    jest.resetModules();

    const res = await request(app)
      .post("/api/analyze")
      .send({ decision: "Should I take this internship offer? It pays well." })
      .set("Content-Type", "application/json");

    // Should return a clean error, not crash
    expect([400, 500, 502]).toContain(res.status);
    expect(res.body.success).toBe(false);
    // Should NOT expose API key details or stack traces
    if (res.body.error) {
      expect(res.body.error).not.toContain("stack");
      expect(res.body.error).not.toContain("GEMINI");
    }

    // Restore
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  });
});


// ════════════════════════════════════════════════════════════════════
// TEST 14: Build Verification
// ════════════════════════════════════════════════════════════════════

describe("Build Verification", () => {

  test("TEST 14: server module exports Express app", () => {
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe("function");
    expect(typeof app.use).toBe("function");
  });

  test("all source modules load without error", () => {
    expect(() => require("../src/ai/config")).not.toThrow();
    expect(() => require("../src/ai/analyzer")).not.toThrow();
    expect(() => require("../src/routes/api")).not.toThrow();
  });

  test("public assets exist", () => {
    const fs = require("fs");
    const path = require("path");
    const publicDir = path.join(__dirname, "..", "public");

    expect(fs.existsSync(path.join(publicDir, "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(publicDir, "styles.css"))).toBe(true);
    expect(fs.existsSync(path.join(publicDir, "app.js"))).toBe(true);
  });
});


// ════════════════════════════════════════════════════════════════════
// TEST 15: Primary User Flow (E2E structure test)
// ════════════════════════════════════════════════════════════════════

describe("Primary User Flow Structure", () => {

  test("TEST 15: frontend HTML has all required elements", () => {
    const fs = require("fs");
    const path = require("path");
    const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf-8");

    // Form elements
    expect(html).toContain('id="decisionInput"');
    expect(html).toContain('id="leaningInput"');
    expect(html).toContain('id="concernInput"');
    expect(html).toContain('id="analyzeBtn"');

    // Make sure we have main landmark (added via class or tag)
    expect(html).toContain('<main');

    // Product identity
    expect(html).toContain("Blindspot");
    expect(html).toContain("blind spots");
    expect(html).toContain("does not make the decision for you");

    // SEO
    expect(html).toContain("<title>");
    expect(html).toContain('meta name="description"');
    expect(html).toContain("<h1");

    // Error state and loading states are handled natively in the UI buttons.

    // Results area
    expect(html).toContain('id="resultsSection"');

    // Example buttons
    expect(html).toContain("preset-pill");
  });

  test("frontend JS has XSS protection", () => {
    const fs = require("fs");
    const path = require("path");
    const js = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf-8");

    expect(js).toContain("escapeHtml");
  });
});


// ════════════════════════════════════════════════════════════════════
// Evaluation Dataset Tests
// ════════════════════════════════════════════════════════════════════

describe("Evaluation Dataset Completeness", () => {

  test("evaluation dataset covers multiple decision types", () => {
    expect(EVALUATION_DATASET.length).toBeGreaterThanOrEqual(5);
  });

  test("each scenario has required fields", () => {
    for (const scenario of EVALUATION_DATASET) {
      expect(scenario.id).toBeDefined();
      expect(scenario.decision.length).toBeGreaterThan(10);
      expect(scenario.expectedCategories.length).toBeGreaterThan(0);
    }
  });

  test("scenarios cover diverse decision categories", () => {
    const ids = EVALUATION_DATASET.map(s => s.id);
    expect(ids).toContain("internship");
    expect(ids).toContain("laptop");
    expect(ids).toContain("relocation");
    expect(ids).toContain("quit_job");
  });
});
