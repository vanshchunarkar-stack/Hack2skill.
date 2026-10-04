"use strict";

/**
 * AI Analyzer Service
 * 
 * Handles communication with the Gemini API to produce structured
 * decision analysis. Includes retry logic, output validation,
 * recommendation guardrails, and error handling.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");
const {
  SYSTEM_PROMPT,
  OUTPUT_SCHEMA,
  detectRecommendations,
  sanitizeRecommendations,
} = require("./config");

// ────────────────────────────────────────────────────────────────────
// Gemini Client — initialized lazily to avoid startup crashes
// ────────────────────────────────────────────────────────────────────

let genAI = null;
let model = null;

function getModel() {
  if (!model) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_gemini_api_key_here") {
      throw new Error("GEMINI_API_KEY is not configured. Set it in your .env file.");
    }
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: OUTPUT_SCHEMA,
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    });
  }
  return model;
}


// ────────────────────────────────────────────────────────────────────
// Build the user prompt from structured input
// ────────────────────────────────────────────────────────────────────

function buildUserPrompt(decision, context, concerns) {
  let prompt = `DECISION BEING CONSIDERED:\n${decision}`;

  if (context && context.trim()) {
    prompt += `\n\nUSER'S CURRENT REASONING / WHY THEY LEAN THIS WAY:\n${context}`;
  }

  if (concerns && concerns.trim()) {
    prompt += `\n\nSPECIFIC CONCERNS:\n${concerns}`;
  }

  prompt += `\n\nPlease analyze this decision for blind spots, assumptions, overlooked factors, conflicts, and unknowns. Return your analysis as the specified JSON structure.`;

  return prompt;
}


// ────────────────────────────────────────────────────────────────────
// Validate the AI response structure
// ────────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = [
  "decision", "priorities", "facts", "assumptions", "blind_spots",
  "overlooked_factors", "conflicts", "unknowns", "alternative_perspectives",
  "critical_questions", "reflection"
];

function validateAnalysisStructure(analysis) {
  if (!analysis || typeof analysis !== "object") {
    return { valid: false, error: "AI returned invalid response structure" };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in analysis)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  // Validate types
  if (typeof analysis.decision !== "string") {
    return { valid: false, error: "Field 'decision' must be a string" };
  }
  if (typeof analysis.reflection !== "string") {
    return { valid: false, error: "Field 'reflection' must be a string" };
  }

  const arrayFields = [
    "priorities", "facts", "assumptions", "blind_spots",
    "overlooked_factors", "conflicts", "unknowns",
    "alternative_perspectives", "critical_questions"
  ];

  for (const field of arrayFields) {
    if (!Array.isArray(analysis[field])) {
      return { valid: false, error: `Field '${field}' must be an array` };
    }
  }

  return { valid: true };
}


// ────────────────────────────────────────────────────────────────────
// Main analysis function
// ────────────────────────────────────────────────────────────────────

/**
 * Analyzes a decision for blind spots, assumptions, and overlooked factors.
 * 
 * @param {string} decision - The decision the user is considering
 * @param {string} [context] - Why they lean a certain way
 * @param {string} [concerns] - Specific concerns
 * @returns {Promise<object>} - Structured analysis result
 */
async function analyzeDecision(decision, context = "", concerns = "") {
  const activeModel = getModel();
  const userPrompt = buildUserPrompt(decision, context, concerns);

  let lastError = null;
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await activeModel.generateContent(userPrompt);
      const response = result.response;
      const text = response.text();

      // Parse JSON response
      let analysis;
      try {
        analysis = JSON.parse(text);
      } catch (parseErr) {
        // Try to extract JSON from possible markdown fencing
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("AI response was not valid JSON");
        }
      }

      // Validate structure
      const validation = validateAnalysisStructure(analysis);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Guardrail: detect and sanitize recommendations
      const guardCheck = detectRecommendations(analysis);
      if (guardCheck.hasRecommendation) {
        console.warn("[GUARDRAIL] Recommendation language detected, sanitizing:", guardCheck.violations);
        analysis = sanitizeRecommendations(analysis);
      }

      return {
        success: true,
        analysis,
        metadata: {
          model: "gemini-2.0-flash",
          timestamp: new Date().toISOString(),
          guardrailTriggered: guardCheck.hasRecommendation,
        }
      };

    } catch (err) {
      lastError = err;
      console.error(`[AI] Attempt ${attempt + 1} failed:`, err.message);

      // Don't retry on auth errors
      if (err.message?.includes("API key") || err.status === 401 || err.status === 403) {
        break;
      }

      // Wait before retry (exponential backoff)
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  // All retries exhausted
  return {
    success: false,
    error: "Analysis could not be completed. Please try again.",
    details: process.env.NODE_ENV === "development" ? lastError?.message : undefined
  };
}


module.exports = {
  analyzeDecision,
  buildUserPrompt,
  validateAnalysisStructure,
  getModel,
};
