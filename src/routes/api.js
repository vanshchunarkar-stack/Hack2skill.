"use strict";

/**
 * API Routes
 *
 * Defines the /api/analyze endpoint with input validation,
 * rate limiting references, and clean error responses.
 */

const express = require("express");
const { validateInput } = require("../ai/config");
const { analyzeDecision } = require("../ai/analyzer");

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
// POST /api/analyze — Main analysis endpoint
// ────────────────────────────────────────────────────────────────────

router.post("/analyze", async (req, res) => {
  try {
    const { decision, context, concerns } = req.body;

    // Input validation
    const validation = validateInput(decision, context, concerns);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    // Sanitize inputs (basic XSS prevention — strip HTML tags)
    const sanitize = (str) => {
      if (!str || typeof str !== "string") return "";
      return str.replace(/<[^>]*>/g, "").trim();
    };

    const cleanDecision = sanitize(decision);
    const cleanContext = sanitize(context || "");
    const cleanConcerns = sanitize(concerns || "");

    // Run AI analysis
    const result = await analyzeDecision(
      cleanDecision,
      cleanContext,
      cleanConcerns,
    );

    if (!result.success) {
      return res.status(502).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      analysis: result.analysis,
      metadata: result.metadata,
    });
  } catch (err) {
    // console.error("[API] Unexpected error in /api/analyze:", err.message);
    return res.status(500).json({
      success: false,
      error: "An unexpected error occurred. Please try again.",
    });
  }
});

// ────────────────────────────────────────────────────────────────────
// GET /api/health — Health check
// ────────────────────────────────────────────────────────────────────

router.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "blindspot-api",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
