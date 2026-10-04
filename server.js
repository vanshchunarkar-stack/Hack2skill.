"use strict";

/**
 * Blindspot — Decision Blind-Spot Analyzer
 * 
 * Express server that serves the static frontend and provides
 * the /api/analyze endpoint for AI-powered decision analysis.
 * 
 * Security: Helmet headers, CORS, rate limiting, input size limits.
 * Deployment: Cloud Run compatible (PORT env, 0.0.0.0 binding).
 */

const path = require("path");

// Load .env in non-production (never require .env in production Cloud Run)
if (process.env.NODE_ENV !== "production" || !process.env.GEMINI_API_KEY) {
  require("dotenv").config({ path: path.resolve(__dirname, ".env") });
}

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const apiRoutes = require("./src/routes/api");

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 8080;

// ────────────────────────────────────────────────────────────────────
// SECURITY MIDDLEWARE
// ────────────────────────────────────────────────────────────────────

// Helmet — secure HTTP headers (relaxed CSP for inline styles/scripts in SPA)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.tailwindcss.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS — allow same-origin; restrict in production
app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));

// Rate limiting — 20 analysis requests per minute per IP
const analysisLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please wait a moment and try again." },
});

// Body parser — limit payload size (prevent abuse)
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: false, limit: "16kb" }));

// ────────────────────────────────────────────────────────────────────
// STATIC FILES — Serve frontend
// ────────────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, "public"), {
  maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
  etag: true,
}));

// ────────────────────────────────────────────────────────────────────
// API ROUTES
// ────────────────────────────────────────────────────────────────────

app.use("/api", analysisLimiter, apiRoutes);

// ────────────────────────────────────────────────────────────────────
// SPA FALLBACK — serve index.html for non-API routes
// ────────────────────────────────────────────────────────────────────

app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ────────────────────────────────────────────────────────────────────
// GLOBAL ERROR HANDLER — never expose stack traces
// ────────────────────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error("[SERVER] Unhandled error:", err.message);
  res.status(500).json({
    success: false,
    error: "An internal server error occurred.",
  });
});

// ────────────────────────────────────────────────────────────────────
// START SERVER
// ────────────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Blindspot] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[Blindspot] Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

module.exports = app;
