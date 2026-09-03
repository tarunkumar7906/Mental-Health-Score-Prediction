(() => {
  "use strict";

  const API_BASE_URL = "http://127.0.0.1:8000";
  const PREDICT_ENDPOINT = `${API_BASE_URL}/predict`;

  const form = document.getElementById("predict-form");
  const submitBtn = document.getElementById("submit-btn");
  const formError = document.getElementById("form-error");
  const resultCard = document.getElementById("result-card");
  const resultNumber = document.getElementById("result-number");
  const resultMeterFill = document.getElementById("result-meter-fill");
  const resultMessage = document.getElementById("result-message");
  const resultClose = document.getElementById("result-close");
  const resultRetry = document.getElementById("result-retry");

  // Wire up live labels for range sliders
  const rangeFields = [
    "avg_daily_usage_hours",
    "study_hours",
    "physical_activity_hours",
    "sleep_hours_per_night",
  ];

  rangeFields.forEach((name) => {
    const input = document.getElementById(name);
    const output = document.getElementById(`${name}-value`);
    if (!input || !output) return;
    const updateLabel = () => {
      const val = parseFloat(input.value);
      const rounded = Number.isInteger(val) ? val : val.toFixed(1);
      output.textContent = `${rounded} hr${val === 1 ? "" : "s"}`;
    };
    input.addEventListener("input", updateLabel);
    updateLabel();
  });

  // Field-level validation rules mirroring the StudentData pydantic model
  const validators = {
    age: (v) => {
      const n = Number(v);
      if (v === "" || Number.isNaN(n)) return "Enter your age.";
      if (n < 0 || n > 100) return "Age must be between 0 and 100.";
      return null;
    },
    gender: (v) => (v ? null : "Select a gender."),
    country: (v) => (v.trim() ? null : "Enter your country."),
    academic_level: (v) => (v ? null : "Select your academic level."),
    most_used_platform: (v) => (v ? null : "Select a platform."),
    purpose_of_use: (v) => (v ? null : "Select a purpose."),
    avg_daily_usage_hours: (v) => rangeCheck(v, 0, 24),
    daily_unlocks: (v) => {
      const n = Number(v);
      if (v === "" || Number.isNaN(n)) return "Enter daily unlocks.";
      if (n < 0) return "Must be 0 or more.";
      return null;
    },
    study_hours: (v) => rangeCheck(v, 0, 24),
    physical_activity_hours: (v) => rangeCheck(v, 0, 24),
    sleep_hours_per_night: (v) => rangeCheck(v, 0, 24),
    stress_level: (v) => (v ? null : "Select your stress level."),
  };

  function rangeCheck(v, min, max) {
    const n = Number(v);
    if (v === "" || Number.isNaN(n)) return "This field is required.";
    if (n < min || n > max) return `Must be between ${min} and ${max}.`;
    return null;
  }

  function clearFieldError(name) {
    const field = form.elements[name]?.closest(".field");
    const errorEl = form.querySelector(`[data-error-for="${name}"]`);
    if (field) field.classList.remove("invalid");
    if (errorEl) errorEl.textContent = "";
  }

  function setFieldError(name, message) {
    const field = form.elements[name]?.closest(".field");
    const errorEl = form.querySelector(`[data-error-for="${name}"]`);
    if (field) field.classList.add("invalid");
    if (errorEl) errorEl.textContent = message;
  }

  function validateForm(data) {
    let firstInvalid = null;
    let isValid = true;

    Object.entries(validators).forEach(([name, validate]) => {
      const message = validate(String(data[name] ?? ""));
      if (message) {
        isValid = false;
        setFieldError(name, message);
        if (!firstInvalid) firstInvalid = name;
      } else {
        clearFieldError(name);
      }
    });

    return { isValid, firstInvalid };
  }

  function readFormData() {
    const fd = new FormData(form);
    return {
      age: Number(fd.get("age")),
      gender: fd.get("gender"),
      country: (fd.get("country") || "").trim(),
      academic_level: fd.get("academic_level"),
      most_used_platform: fd.get("most_used_platform"),
      purpose_of_use: fd.get("purpose_of_use"),
      avg_daily_usage_hours: Number(fd.get("avg_daily_usage_hours")),
      daily_unlocks: Number(fd.get("daily_unlocks")),
      study_hours: Number(fd.get("study_hours")),
      physical_activity_hours: Number(fd.get("physical_activity_hours")),
      sleep_hours_per_night: Number(fd.get("sleep_hours_per_night")),
      stress_level: fd.get("stress_level"),
    };
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  function hideFormError() {
    formError.hidden = true;
    formError.textContent = "";
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle("loading", isLoading);
  }

  function scoreMessage(score) {
    if (score >= 8) {
      return "Your habits line up with strong reported wellbeing. Keep the balance going.";
    }
    if (score >= 6) {
      return "A generally healthy balance, with some room to fine-tune sleep, activity, or screen time.";
    }
    if (score >= 4) {
      return "There are a few areas — sleep, stress, or usage — worth paying closer attention to.";
    }
    return "Several factors here are linked to lower wellbeing scores. Consider talking to someone you trust.";
  }

  function meterColor(score) {
    if (score >= 6) return "var(--sage-deep)";
    if (score >= 4) return "#b08a3e";
    return "var(--clay)";
  }

  function showResult(score) {
    const clamped = Math.max(0, Math.min(10, score));
    resultNumber.textContent = score.toFixed(2);
    resultMessage.textContent = scoreMessage(score);
    resultMeterFill.style.background = meterColor(score);

    resultCard.hidden = false;
    // Animate the meter fill in on the next frame
    resultMeterFill.style.width = "0%";
    requestAnimationFrame(() => {
      resultMeterFill.style.width = `${(clamped / 10) * 100}%`;
    });

    resultCard.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function hideResult() {
    resultCard.hidden = true;
  }

  async function submitPrediction(payload) {
    let response;
    try {
      response = await fetch(PREDICT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (networkErr) {
      throw new Error(
        "Couldn't reach the prediction server. Make sure the FastAPI backend is running at " +
          API_BASE_URL +
          "."
      );
    }

    if (!response.ok) {
      if (response.status === 422) {
        let detailMsg = "The server rejected some of the values submitted.";
        try {
          const body = await response.json();
          if (Array.isArray(body.detail) && body.detail.length) {
            const first = body.detail[0];
            const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : "";
            detailMsg = `${field ? field + ": " : ""}${first.msg}`;
          }
        } catch (_) {
          /* fall back to generic message */
        }
        throw new Error(detailMsg);
      }
      throw new Error(`Server error (${response.status}). Please try again in a moment.`);
    }

    return response.json();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideFormError();
    hideResult();

    const data = readFormData();
    const { isValid, firstInvalid } = validateForm(data);

    if (!isValid) {
      showFormError("Please fix the highlighted fields before continuing.");
      const el = form.elements[firstInvalid];
      if (el) el.focus();
      return;
    }

    setLoading(true);
    try {
      const result = await submitPrediction(data);
      showResult(result.predicted_mental_health_score);
    } catch (err) {
      showFormError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  });

  // Clear individual field errors as the user fixes them
  Object.keys(validators).forEach((name) => {
    const el = form.elements[name];
    if (!el) return;
    const evt = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evt, () => clearFieldError(name));
  });

  resultClose.addEventListener("click", hideResult);
  resultRetry.addEventListener("click", () => {
    hideResult();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
