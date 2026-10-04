/**
 * Blindspot — Frontend Application
 * 
 * Handles form submission, API communication, loading states,
 * result rendering, and error display.
 * 
 * SECURITY: No API keys in frontend. All AI calls go through /api/analyze.
 * ACCESSIBILITY: ARIA live regions, focus management, keyboard navigation.
 * EFFICIENCY: Single API call, debounce protection, disabled button during load.
 */

"use strict";

(function() {

  // ── DOM References ──
  const form = document.getElementById("analysis-form");
  const decisionInput = document.getElementById("decision-input");
  const contextInput = document.getElementById("context-input");
  const concernsInput = document.getElementById("concerns-input");
  const submitBtn = document.getElementById("submit-btn");
  const errorBanner = document.getElementById("error-banner");
  const errorMessage = document.getElementById("error-message");
  const errorCloseBtn = document.getElementById("error-close-btn");
  const formSection = document.getElementById("form-section");
  const loadingOverlay = document.getElementById("loading-overlay");
  const resultsContainer = document.getElementById("results-container");

  // Character counters
  const decisionCount = document.getElementById("decision-count");
  const contextCount = document.getElementById("context-count");
  const concernsCount = document.getElementById("concerns-count");
  const decisionCharCount = document.getElementById("decision-char-count");
  const contextCharCount = document.getElementById("context-char-count");
  const concernsCharCount = document.getElementById("concerns-char-count");

  // Loading step elements
  const loadingSteps = [
    document.getElementById("step-understanding"),
    document.getElementById("step-facts"),
    document.getElementById("step-assumptions"),
    document.getElementById("step-blindspots"),
    document.getElementById("step-questions"),
  ];

  let isProcessing = false;
  let loadingTimer = null;


  // ── Character Counting ──
  function updateCharCount(input, countEl, charCountEl, max) {
    const len = input.value.length;
    countEl.textContent = len;

    charCountEl.classList.remove("warning", "error");
    if (len > max * 0.9) {
      charCountEl.classList.add("warning");
    }
    if (len >= max) {
      charCountEl.classList.add("error");
    }
  }

  decisionInput.addEventListener("input", () => {
    updateCharCount(decisionInput, decisionCount, decisionCharCount, 3000);
  });
  contextInput.addEventListener("input", () => {
    updateCharCount(contextInput, contextCount, contextCharCount, 1500);
  });
  concernsInput.addEventListener("input", () => {
    updateCharCount(concernsInput, concernsCount, concernsCharCount, 1000);
  });


  // ── Example Buttons ──
  document.querySelectorAll(".example-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      decisionInput.value = btn.getAttribute("data-decision");
      updateCharCount(decisionInput, decisionCount, decisionCharCount, 3000);
      decisionInput.focus();
    });
  });


  // ── Error Display ──
  function showError(msg) {
    errorMessage.textContent = msg;
    errorBanner.classList.add("visible");
    errorBanner.focus();
  }

  function hideError() {
    errorBanner.classList.remove("visible");
  }

  errorCloseBtn.addEventListener("click", hideError);


  // ── Loading State Animation ──
  function startLoadingAnimation() {
    let step = 0;
    loadingSteps.forEach(function(el) {
      el.classList.remove("active", "done");
      var icon = el.querySelector(".loading-step-icon");
      if (icon) icon.textContent = "◌";
    });

    loadingSteps[0].classList.add("active");

    loadingTimer = setInterval(function() {
      if (step < loadingSteps.length) {
        loadingSteps[step].classList.remove("active");
        loadingSteps[step].classList.add("done");
        var doneIcon = loadingSteps[step].querySelector(".loading-step-icon");
        if (doneIcon) doneIcon.textContent = "✓";
      }
      step++;
      if (step < loadingSteps.length) {
        loadingSteps[step].classList.add("active");
      }
    }, 1500);
  }

  function stopLoadingAnimation() {
    if (loadingTimer) {
      clearInterval(loadingTimer);
      loadingTimer = null;
    }
  }


  // ── State Transitions ──
  function showLoading() {
    formSection.style.display = "none";
    resultsContainer.classList.remove("visible");
    loadingOverlay.classList.add("visible");
    submitBtn.classList.add("loading");
    submitBtn.disabled = true;
    startLoadingAnimation();
  }

  function showResults() {
    stopLoadingAnimation();
    loadingOverlay.classList.remove("visible");
    resultsContainer.classList.add("visible");
    resultsContainer.focus();

    // Scroll to results
    resultsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showForm() {
    stopLoadingAnimation();
    loadingOverlay.classList.remove("visible");
    resultsContainer.classList.remove("visible");
    formSection.style.display = "";
    submitBtn.classList.remove("loading");
    submitBtn.disabled = false;
    isProcessing = false;
  }

  function showFormWithError(msg) {
    showForm();
    showError(msg);
  }


  // ── Sanitize text for safe DOM insertion ──
  function escapeHtml(text) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
  }


  // ── Render Results ──
  function renderResults(analysis, metadata) {
    var sections = [
      { key: "priorities",  icon: "🧠", title: "Your Reasoning & Priorities", data: analysis.priorities, section: "priorities" },
      { key: "facts",       icon: "✅", title: "Facts You Mentioned",         data: analysis.facts,      section: "facts" },
      { key: "assumptions", icon: "⚠️", title: "Assumptions to Examine",     data: analysis.assumptions, section: "assumptions" },
      { key: "blind_spots", icon: "🕳️", title: "Potential Blind Spots",      data: analysis.blind_spots, section: "blind_spots" },
      { key: "overlooked",  icon: "🔍", title: "Overlooked Factors",          data: analysis.overlooked_factors, section: "overlooked" },
      { key: "conflicts",   icon: "⚔️", title: "Conflicting Priorities",     data: analysis.conflicts,  section: "conflicts" },
      { key: "unknowns",    icon: "❓", title: "Important Unknowns",          data: analysis.unknowns,   section: "unknowns" },
      { key: "perspectives",icon: "🔄", title: "Alternative Perspectives",    data: analysis.alternative_perspectives, section: "perspectives" },
      { key: "questions",   icon: "💡", title: "Questions Worth Exploring",   data: analysis.critical_questions, section: "questions" },
    ];

    var html = '';

    // Results header
    html += '<div class="results-header">';
    html += '  <h2 class="results-title">Decision Analysis</h2>';
    html += '  <p class="results-decision">' + escapeHtml(analysis.decision) + '</p>';
    html += '  <p class="results-disclaimer">This analysis surfaces factors to consider — the final decision is yours.</p>';
    html += '</div>';

    // Section cards
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      var items = sec.data;

      // Skip empty sections
      if (!items || items.length === 0) continue;

      html += '<div class="result-section" data-section="' + sec.section + '" role="region" aria-label="' + escapeHtml(sec.title) + '">';
      html += '  <div class="section-header">';
      html += '    <span class="section-icon" aria-hidden="true">' + sec.icon + '</span>';
      html += '    <h3 class="section-title">' + escapeHtml(sec.title) + '</h3>';
      html += '    <span class="section-count">' + items.length + '</span>';
      html += '  </div>';
      html += '  <ul class="section-list" role="list">';

      for (var j = 0; j < items.length; j++) {
        html += '    <li role="listitem">' + escapeHtml(items[j]) + '</li>';
      }

      html += '  </ul>';
      html += '</div>';
    }

    // Reflection card
    if (analysis.reflection) {
      html += '<div class="reflection-card" role="region" aria-label="Neutral reflection">';
      html += '  <div class="section-header">';
      html += '    <span class="section-icon" aria-hidden="true">🪞</span>';
      html += '    <h3 class="section-title">Neutral Reflection</h3>';
      html += '  </div>';
      html += '  <p class="reflection-text">' + escapeHtml(analysis.reflection) + '</p>';
      html += '</div>';
    }

    // Metadata
    if (metadata && metadata.guardrailTriggered) {
      html += '<p style="text-align:center;font-size:0.75rem;color:var(--color-text-dim);margin-top:var(--space-sm);">';
      html += '  ⚡ Safety guardrails were applied to ensure neutral analysis.';
      html += '</p>';
    }

    // New Analysis button
    html += '<button class="new-analysis-btn" id="new-analysis-btn" aria-label="Start a new analysis">';
    html += '  ← Analyze Another Decision';
    html += '</button>';

    resultsContainer.innerHTML = html;
    resultsContainer.setAttribute("tabindex", "-1");

    // Bind new analysis button
    var newBtn = document.getElementById("new-analysis-btn");
    if (newBtn) {
      newBtn.addEventListener("click", function() {
        hideError();
        showForm();
        decisionInput.focus();
      });
    }
  }


  // ── Form Submission ──
  form.addEventListener("submit", async function(e) {
    e.preventDefault();

    // Prevent double submission
    if (isProcessing) return;

    hideError();

    var decision = decisionInput.value.trim();
    var context = contextInput.value.trim();
    var concerns = concernsInput.value.trim();

    // Client-side validation
    if (!decision) {
      showError("Please describe the decision you're considering.");
      decisionInput.focus();
      return;
    }

    if (decision.length < 10) {
      showError("Please describe your decision in more detail (at least 10 characters).");
      decisionInput.focus();
      return;
    }

    isProcessing = true;
    showLoading();

    try {
      var response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: decision,
          context: context,
          concerns: concerns
        }),
      });

      var data;
      try {
        data = await response.json();
      } catch (parseErr) {
        throw new Error("The server returned an invalid response. Please try again.");
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Analysis could not be completed. Please try again.");
      }

      // Render results
      renderResults(data.analysis, data.metadata);
      showResults();

    } catch (err) {
      var msg = err.message || "Analysis could not be completed. Please try again.";

      // Don't show raw technical errors to users
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        msg = "Could not connect to the server. Please check your connection and try again.";
      }

      showFormWithError(msg);
    }

    isProcessing = false;
  });

})();
