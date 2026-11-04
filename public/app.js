const state = {
  config: null,
  technicians: [],
  adminTechnicians: [],
  bookings: [],
  payments: [],
  customers: [],
  summary: null,
  selectedTechnician: null,
  transportEstimate: null,
  activeProfileId: null,
  wizardStep: 0,
  saveTechnicianAsDraft: false,
  currentTechnicianId: 1,
  reviewingBookingId: null,
  paymentMethodFilter: "",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const ROUTES = new Set(["home", "customer", "technician", "admin", "about", "how-it-works", "help", "contact", "terms", "privacy"]);

function isKnownRoute(view) {
  return ROUTES.has(view) || view.startsWith("profile-");
}

function routeTab(view, baseView) {
  if (["about", "how-it-works", "help", "contact", "terms", "privacy"].includes(baseView)) return "home";
  if (baseView === "profile") return "customer";
  return view;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("is-visible");
  window.setTimeout(() => node.classList.remove("is-visible"), 2800);
}

function options(items, placeholder = "All") {
  return [`<option value="">${placeholder}</option>`, ...items.map((item) => `<option>${escapeHtml(item)}</option>`)].join("");
}

function selectOptions(items) {
  return items.map((item) => `<option>${escapeHtml(item)}</option>`).join("");
}

function serviceMarketWhatsAppUrl(message) {
  return `https://wa.me/263784425268?text=${encodeURIComponent(message)}`;
}

function openServiceMarketWhatsApp(message) {
  window.open(serviceMarketWhatsAppUrl(message), "_blank", "noopener,noreferrer");
}

function setView(view) {
  if (!isKnownRoute(view)) view = "home";
  const baseView = view.startsWith("profile-") ? "profile" : view;
  if (view.startsWith("profile-")) state.activeProfileId = Number(view.replace("profile-", ""));
  document.body.dataset.view = baseView;
  $$(".view").forEach((node) => node.classList.toggle("is-active", node.id === `${baseView}-view`));
  $$("[data-view-link]").forEach((node) => node.classList.toggle("is-active", node.dataset.viewLink === view));
  $$(".tab").forEach((node) => node.classList.toggle("is-active", node.dataset.viewLink === routeTab(view, baseView)));
  window.location.hash = view;
  if (baseView === "profile") renderTechnicianProfile();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function initNavigation() {
  $$("[data-view-link]").forEach((node) => {
    node.addEventListener("click", () => setView(node.dataset.viewLink));
  });
  const startView = (window.location.hash || "#home").slice(1);
  setView(isKnownRoute(startView) ? startView : "home");
  window.addEventListener("hashchange", () => {
    const nextView = (window.location.hash || "#home").slice(1);
    setView(isKnownRoute(nextView) ? nextView : "home");
  });
}

function populateSelects() {
  const setOptions = (selector, html) => {
    const node = $(selector);
    if (node) node.innerHTML = html;
  };
  setOptions("#category-filter", options(state.config.serviceCategories, "All categories"));
  setOptions("#area-filter", options(state.config.serviceAreas, "All areas"));
  setOptions("#booking-area", selectOptions(state.config.serviceAreas));
  setOptions("#booking-category", selectOptions(state.config.serviceCategories));
  setOptions("#admin-booking-status-filter", options(state.config.bookingStatuses, "All statuses"));
  setOptions("#admin-job-city-filter", options(state.config.serviceAreas, "All cities"));
  setOptions("#admin-job-trade-filter", options(state.config.serviceCategories, "All trades"));
  setOptions("#admin-payment-method-filter", options(state.config.paymentMethods, "All methods"));
  setOptions("#tech-area", selectOptions(state.config.serviceAreas));
  setOptions("#tech-trade", selectOptions(state.config.serviceCategories));
  populateTransportSettings();
  setOptions(
    "#trust-engine-pillars",
    state.config.trustEnginePillars
      .map(
        (pillar) => `
      <article class="pillar-card">
        <strong>${escapeHtml(pillar.title)}</strong>
        <p>${escapeHtml(pillar.text)}</p>
      </article>`
      )
      .join("")
  );
}

function populateTransportSettings() {
  const settings = state.config?.transportPricing || {};
  const setValue = (selector, value) => {
    const node = $(selector);
    if (node) node.value = value ?? "";
  };
  setValue("#transport-currency", settings.currency || "USD");
  setValue("#transport-diagnostic-fee", settings.diagnosticFee);
  setValue("#transport-free-radius", settings.freeRadiusKm);
  setValue("#transport-minimum-fee", settings.minimumFee);
  setValue("#transport-price-per-km", settings.pricePerKm);
  setValue("#transport-maximum-fee", settings.maximumFee);
  setValue("#transport-emergency-surcharge", settings.emergencySurcharge);
  setValue("#transport-after-hours-surcharge", settings.afterHoursSurcharge);
  const override = $("#transport-admin-override");
  if (override) override.checked = settings.allowAdminOverride !== false;
}

function technicianPhoto(technician) {
  const initials = technician.fullName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return `<div class="avatar" aria-hidden="true">${escapeHtml(initials)}</div>`;
}

function badge(text, tone = "") {
  return `<span class="badge ${tone}">${escapeHtml(text)}</span>`;
}

const reviewLabels = {
  professionalism: "Professionalism",
  communication: "Communication",
  quality: "Quality",
  punctuality: "Punctuality",
  cleanliness: "Cleanliness",
  value: "Value",
};

const trustLabels = {
  identityVerified: "Identity verified",
  tradeQualificationVerified: "Qualification verified",
  profileCompleted: "Profile completed",
  referencesProvided: "References added",
  warrantyOffered: "Warranty offered",
  fastResponse: "Fast response",
  completedJobs: "Completed jobs",
  averageRating: "Average rating",
  noComplaints: "No complaints",
  adminRecommendation: "Admin recommendation",
};

const jobPipelineStatuses = ["Accepted", "Travelling", "Nearby", "Arrived", "Working", "Paused", "Completed", "Customer Confirmed", "Closed"];
const journeyStatuses = ["Accepted", "Travelling", "Nearby", "Arrived", "Working", "Completed"];

function yesNo(value) {
  return value ? "Yes" : "No";
}

function ratingOptions(selected = 5) {
  return [5, 4, 3, 2, 1]
    .map((value) => `<option value="${value}" ${Number(selected) === value ? "selected" : ""}>${value}</option>`)
    .join("");
}

function renderCustomerStats() {
  const target = $("#customer-stats");
  if (!target) return;
  const verified = state.technicians.filter((tech) => tech.adminVerified).length;
  const avgResponse = Math.round(
    state.technicians.reduce((sum, tech) => sum + Number(tech.responseMinutes || 0), 0) / Math.max(1, state.technicians.length)
  );
  const jobs = state.technicians.reduce((sum, tech) => sum + Number(tech.completedJobs || 0), 0);
  target.innerHTML = [
    statCard("Admin verified", verified),
    statCard("Avg response", `${avgResponse} min`),
    statCard("Completed jobs", jobs),
  ].join("");
}

function statCard(label, value) {
  return `<div class="stat-card"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function renderFeaturedTechnicians() {
  const target = $("#featured-technicians");
  if (!target) return;
  const featured = [...state.technicians]
    .sort((a, b) => Number(b.trustScore || 0) - Number(a.trustScore || 0))
    .slice(0, 3);
  target.innerHTML = featured
    .map(
      (technician) => `
        <article class="featured-tech-card">
          <div class="tech-top">
            ${technicianPhoto(technician)}
            <div>
              <h3>${escapeHtml(technician.fullName)}</h3>
              <p>${escapeHtml(technician.trade)} in ${escapeHtml(technician.area)}</p>
            </div>
          </div>
          <div class="compact-trust-line">
            <div class="score-ring small" style="--score:${technician.trustScore}"><strong>${technician.trustScore}</strong></div>
            <div><strong>${escapeHtml(technician.trustLevel)}</strong><span>${escapeHtml(technician.completedJobs)} completed jobs</span></div>
          </div>
          <div class="badge-row">
            ${badge("Admin Approved", technician.adminVerified ? "good" : "muted")}
            ${badge("Identity Verified", technician.idChecked ? "good" : "muted")}
          </div>
          <button class="secondary-button wide" type="button" data-profile-tech="${technician.id}">View Profile</button>
        </article>
      `
    )
    .join("");
  target.querySelectorAll("[data-profile-tech]").forEach((button) => {
    button.addEventListener("click", () => setView(`profile-${button.dataset.profileTech}`));
  });
}

function renderTechnicians() {
  const target = $("#technician-list");
  if (!target) return;
  if (!state.technicians.length) {
    target.innerHTML = `<div class="empty-state">No technicians match this search yet. Try another service area or submit an open request.</div>`;
    return;
  }
  target.innerHTML = state.technicians
    .map((technician) => {
      const identityBadge = technician.idChecked || technician.trustStatuses?.identityStatus === "Verified" ? badge("Identity Verified", "good") : badge("Identity Pending", "muted");
      const adminBadge = technician.adminVerified ? badge("Admin Approved", "good") : badge("Admin Review", "muted");
      const rating = technician.rating ? `${technician.rating}/5` : "New";
      return `
        <article class="technician-card compact-tech-card">
          <div class="tech-top">
            ${technicianPhoto(technician)}
            <div>
              <h3>${escapeHtml(technician.fullName)}</h3>
              <p>${escapeHtml(technician.trade || technician.categories?.[0] || "Technical Services")}</p>
            </div>
          </div>
          <div class="badge-row">${identityBadge}${adminBadge}</div>
          <div class="compact-trust-line">
            <div class="score-ring small" style="--score:${technician.trustScore}"><strong>${technician.trustScore}</strong></div>
            <div>
              <strong>Trust Score</strong>
              <span>${escapeHtml(rating)} average rating</span>
            </div>
          </div>
          <dl class="mini-details compact-listing-details">
            <div><dt>Jobs</dt><dd>${escapeHtml(technician.completedJobs)}</dd></div>
            <div><dt>Response</dt><dd>${escapeHtml(technician.responseMinutes)} min</dd></div>
            <div><dt>Area</dt><dd>${escapeHtml(technician.area)}</dd></div>
          </dl>
          <div class="card-actions">
            <button class="secondary-button" type="button" data-profile-tech="${technician.id}">View Profile</button>
            <a class="call-button" href="${technician.callLink}">Call</a>
            <a class="whatsapp-button" href="${technician.whatsappLink}" target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </article>
      `;
    })
    .join("");

  $$("[data-book-tech]").forEach((button) => {
    button.addEventListener("click", () => selectTechnician(Number(button.dataset.bookTech)));
  });
  $$("[data-profile-tech]").forEach((button) => {
    button.addEventListener("click", () => setView(`profile-${button.dataset.profileTech}`));
  });
}

function renderTrustProfile(technician) {
  const statuses = technician.trustStatuses || {};
  return `
    <div class="trust-profile">
      <div class="trust-profile-grid">
        <span><strong>Identity</strong>${escapeHtml(statuses.identityStatus || "Pending")}</span>
        <span><strong>Qualifications</strong>${escapeHtml(statuses.qualificationStatus || "Pending")}</span>
        <span><strong>Repeat customers</strong>${escapeHtml(statuses.repeatCustomerRate || 0)}%</span>
        <span><strong>Complaints</strong>${escapeHtml(statuses.complaintCount || 0)}</span>
        <span><strong>Admin recommended</strong>${yesNo(statuses.adminRecommended)}</span>
        <span><strong>Profile views</strong>${escapeHtml(technician.profileViews || 0)}</span>
        <span><strong>Emergency</strong>${yesNo(statuses.emergencyAvailable)}</span>
        <span><strong>Pricing</strong>${escapeHtml(statuses.pricingMethod || "Quote")}</span>
      </div>
      <div class="trust-breakdown">
        ${Object.entries(technician.trustBreakdown || {})
          .map(([key, points]) => {
            const max = state.config.trustWeights[key] || 1;
            return `
              <div class="trust-factor">
                <span>${escapeHtml(trustLabels[key] || key)}</span>
                <strong>${points}/${max}</strong>
                <div class="progress-track"><i style="width:${Math.min(100, Math.round((points / max) * 100))}%"></i></div>
              </div>`;
          })
          .join("")}
      </div>
      <details>
        <summary>Why this score?</summary>
        <ul class="plain-list">
          ${(technician.trustExplanation || []).map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}
        </ul>
      </details>
      <details>
        <summary>How to improve</summary>
        <ul class="plain-list">
          ${(technician.trustSuggestions || ["Keep documenting great service."]).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </details>
    </div>
  `;
}

function renderReviewPreview(technician) {
  const reviews = technician.reviews || [];
  if (!reviews.length) return "";
  const firstReview = reviews[0];
  const photos = (firstReview.photos || []).map((photo) => `<span class="photo-chip">${escapeHtml(photo.name)}</span>`).join("");
  return `
    <div class="review-preview">
      <div class="rating-grid">
        ${Object.entries(technician.reviewBreakdown || {})
          .map(([key, value]) => `<span>${escapeHtml(reviewLabels[key] || key)} <strong>${value || "-"}</strong></span>`)
          .join("")}
      </div>
      <blockquote>${escapeHtml(firstReview.text)}</blockquote>
      ${firstReview.technicianResponse ? `<p class="tech-response"><strong>Technician response:</strong> ${escapeHtml(firstReview.technicianResponse.text)}</p>` : ""}
      ${photos ? `<div class="photo-row">${photos}</div>` : ""}
    </div>
  `;
}

function renderTrustHistory(technician) {
  const history = technician.trustHistory?.length
    ? technician.trustHistory
    : [{ title: "Joined platform", detail: "Trust journey starts when the technician creates a profile.", at: "Pending" }];
  return `
    <ol class="status-timeline trust-history">
      ${history
        .slice(0, 8)
        .map(
          (item) => `
          <li>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.at || "")}</span>
            <p>${escapeHtml(item.detail || "")}</p>
          </li>`
        )
        .join("")}
    </ol>
  `;
}

function profileDetails(technician) {
  const trade = technician.trade || "Technical Services";
  const area = technician.area || "Harare";
  return {
    bio: `${technician.fullName} runs ${technician.businessName}, serving ${area} customers with a focus on honest diagnosis, clear communication and quality workmanship. This profile is designed to show the evidence a customer needs before making contact.`,
    qualifications: (technician.credentials || ["Trade references checked"]).map((name, index) => ({
      name,
      authority: index === 0 ? "Service Market Admin Review" : "Trade or manufacturer reference",
      status: technician.trustStatuses?.qualificationStatus || "Pending",
      date: index === 0 ? "2026-07-01" : "2026-06-18",
    })),
    services: ["Installation", "Repairs", "Maintenance", "Diagnostics", "Emergency Callouts", "Preventive Maintenance"],
    pricing: {
      inspectionFee: technician.trade === "Carpentry" ? "Quote after measurements" : "USD 15-35",
      hourlyRate: technician.trade === "Auto Mechanic" ? "USD 20-35/hr" : "USD 18-40/hr",
      emergencyFee: technician.trustStatuses?.emergencyAvailable ? "USD 20-50 surcharge" : "Not offered",
      typicalRange: technician.priceRange || "Negotiable",
      method: technician.trustStatuses?.pricingMethod || "Quote",
    },
    warranty: {
      period: technician.trustStatuses?.warrantyOffered ? technician.serviceGuarantee || "7 days workmanship" : "Not currently offered",
      covered: "Workmanship on the agreed repair or installation scope.",
      excluded: "Customer-supplied faulty parts, unrelated faults and misuse after completion.",
    },
    portfolio: [
      {
        title: `${trade} repair in ${area}`,
        text: "Before and after documentation placeholder for a completed customer job.",
        date: "2026-06-24",
      },
      {
        title: "Preventive maintenance visit",
        text: "Inspection, diagnosis and customer handover documented for accountability.",
        date: "2026-06-12",
      },
    ],
    availability: {
      today: technician.trustStatuses?.emergencyAvailable ? "Available today" : "Next available tomorrow",
      hours: "Mon-Fri, 8:00-17:30",
      weekend: technician.trustStatuses?.emergencyAvailable ? "Saturday emergency slots" : "By appointment",
      emergency: technician.trustStatuses?.emergencyAvailable ? "Emergency callouts available" : "Emergency callouts not listed",
      areas: technician.trustStatuses?.serviceAreas || ["Harare", "Borrowdale", "Avondale", "CBD", "Chitungwiza"],
    },
    acceptanceRate: Math.max(72, Math.min(98, Math.round(100 - Number(technician.responseMinutes || 30) / 2))),
    joinedDate: "2026-06-01",
  };
}

function renderTechnicianProfile() {
  const technician = [...state.technicians, ...state.adminTechnicians].find((item) => item.id === state.activeProfileId);
  const target = $("#technician-profile");
  if (!target) return;
  if (!technician) {
    target.innerHTML = `<section class="panel"><h2>Profile loading</h2><p class="fine-print">Technician details are being loaded.</p></section>`;
    return;
  }
  const details = profileDetails(technician);
  const reviews = technician.reviews || [];
  const similar = state.technicians.filter((item) => item.id !== technician.id).slice(0, 3);
  const docs = technician.documents || {};
  target.innerHTML = `
    <section class="profile-hero">
      <div class="profile-cover" aria-hidden="true"><span>${escapeHtml(technician.trade || "Service Professional")}</span></div>
      <button class="ghost-button profile-back" type="button" data-view-link="customer">Back to marketplace</button>
      <div class="profile-photo">${technicianPhoto(technician)}</div>
      <div class="profile-title">
        <p class="eyebrow">Technician Trust Profile</p>
        <h1>${escapeHtml(technician.fullName)}</h1>
        <p>${escapeHtml(technician.businessName)} - ${escapeHtml(technician.trade)} - ${escapeHtml(technician.area)}</p>
        <div class="badge-row">${technician.badges.map((item) => badge(item, "good")).join("")}</div>
      </div>
      <div class="profile-score-card">
        <div class="score-ring" style="--score:${technician.trustScore}"><strong>${technician.trustScore}</strong></div>
        <strong>${escapeHtml(technician.trustLevel)}</strong>
        <span>${escapeHtml(technician.rating || "New")} rating / ${escapeHtml(technician.completedJobs)} completed jobs</span>
      </div>
    </section>

    <div class="profile-layout">
      <div class="profile-main">
        <section class="profile-section">
          <h2>Performance Summary</h2>
          <dl class="profile-metrics">
            <div><dt>Rating</dt><dd>${escapeHtml(technician.rating || "New")}</dd></div>
            <div><dt>Completed jobs</dt><dd>${escapeHtml(technician.completedJobs)}</dd></div>
            <div><dt>Repeat customers</dt><dd>${escapeHtml(technician.trustStatuses.repeatCustomerRate || 0)}%</dd></div>
            <div><dt>Response time</dt><dd>${escapeHtml(technician.responseMinutes)} min</dd></div>
            <div><dt>Acceptance rate</dt><dd>${details.acceptanceRate}%</dd></div>
            <div><dt>Complaint rate</dt><dd>${escapeHtml(technician.trustStatuses.complaintCount || 0)} open</dd></div>
            <div><dt>Joined</dt><dd>${details.joinedDate}</dd></div>
            <div><dt>Experience</dt><dd>${escapeHtml(technician.yearsExperience)} years</dd></div>
          </dl>
        </section>

        <section class="profile-section">
          <h2>Customer Trust View</h2>
          <p class="trust-intro">This Trust Score is calculated using verified qualifications, job history, customer feedback and platform verification.</p>
          <dl class="profile-metrics">
            <div><dt>Trust Score</dt><dd>${escapeHtml(technician.trustScore)}/100</dd></div>
            <div><dt>Trust Level</dt><dd>${escapeHtml(technician.trustLevel)}</dd></div>
            <div><dt>Years experience</dt><dd>${escapeHtml(technician.yearsExperience)}</dd></div>
            <div><dt>Completed jobs</dt><dd>${escapeHtml(technician.completedJobs)}</dd></div>
            <div><dt>Customer rating</dt><dd>${escapeHtml(technician.rating || "New")}</dd></div>
            <div><dt>Response time</dt><dd>${escapeHtml(technician.responseMinutes)} min</dd></div>
            <div><dt>Repeat customers</dt><dd>${escapeHtml(technician.trustStatuses.repeatCustomerRate || 0)}%</dd></div>
            <div><dt>Complaints</dt><dd>${escapeHtml(technician.trustStatuses.complaintCount || 0)}</dd></div>
            <div><dt>Warranty</dt><dd>${yesNo(technician.trustStatuses.warrantyOffered)}</dd></div>
          </dl>
        </section>

        <section class="profile-section">
          <h2>Verification and Documents</h2>
          <div class="profile-card-grid">
            <article><strong>Identity verification</strong><span class="badge ${technician.idChecked || technician.trustStatuses.identityStatus === "Verified" ? "good" : "muted"}">${escapeHtml(technician.trustStatuses.identityStatus || (technician.idChecked ? "Verified" : "Pending"))}</span><small>National ID ${docs.nationalId ? "submitted" : "placeholder"}</small></article>
            <article><strong>Qualification verification</strong><span class="badge ${technician.trustStatuses.qualificationStatus === "Verified" ? "good" : "muted"}">${escapeHtml(technician.trustStatuses.qualificationStatus || "Pending")}</span><small>Trade certificate ${docs.tradeCertificate ? "submitted" : "review placeholder"}</small></article>
            <article><strong>Admin approval</strong><span class="badge ${technician.adminVerified ? "good" : "muted"}">${technician.adminVerified ? "Admin Approved" : "Admin Review"}</span><small>Platform verification status</small></article>
            <article><strong>Police clearance</strong><span class="badge ${docs.policeClearance || technician.trustStatuses.backgroundChecked ? "good" : "muted"}">${docs.policeClearance || technician.trustStatuses.backgroundChecked ? "Submitted" : "Placeholder"}</span><small>Optional background document</small></article>
          </div>
        </section>

        <section class="profile-section">
          <h2>Trust Score Breakdown</h2>
          <div class="trust-breakdown">
            ${(technician.trustExplanation || [])
              .map(
                (item) => `
                <div class="trust-factor">
                  <span>${escapeHtml(item.label)}</span>
                  <strong>${escapeHtml(item.points)}/${escapeHtml(item.max)}</strong>
                  <div class="progress-track"><i style="width:${Math.min(100, Math.round((item.points / item.max) * 100))}%"></i></div>
                </div>`
              )
              .join("")}
          </div>
          ${technician.trustScoreAdjustment ? `<p class="fine-print">Admin adjustment applied: ${escapeHtml(technician.trustScoreAdjustment)} points. Final score is capped at 100.</p>` : `<p class="fine-print">Final score is capped at 100.</p>`}
        </section>

        <section class="profile-section">
          <h2>Professional Journey</h2>
          ${renderTrustHistory(technician)}
        </section>

        <section class="profile-section"><h2>About</h2><p>${escapeHtml(details.bio)}</p></section>

        <section class="profile-section">
          <h2>Qualifications</h2>
          <div class="profile-card-grid">
            ${details.qualifications
              .map(
                (item) => `<article><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.authority)}</span><span class="badge good">${escapeHtml(item.status)}</span><small>Verified ${escapeHtml(item.date)}</small></article>`
              )
              .join("")}
          </div>
        </section>

        <section class="profile-section">
          <h2>Services Offered</h2>
          <div class="badge-row">${details.services.map((item) => badge(item, "muted")).join("")}</div>
        </section>

        <section class="profile-section">
          <h2>Pricing</h2>
          <dl class="profile-metrics">
            <div><dt>Inspection fee</dt><dd>${escapeHtml(details.pricing.inspectionFee)}</dd></div>
            <div><dt>Hourly rate</dt><dd>${escapeHtml(details.pricing.hourlyRate)}</dd></div>
            <div><dt>Emergency fee</dt><dd>${escapeHtml(details.pricing.emergencyFee)}</dd></div>
            <div><dt>Typical range</dt><dd>${escapeHtml(details.pricing.typicalRange)}</dd></div>
            <div><dt>Pricing method</dt><dd>${escapeHtml(details.pricing.method)}</dd></div>
          </dl>
        </section>

        <section class="profile-section">
          <h2>Warranty</h2>
          <div class="profile-card-grid">
            <article><strong>${escapeHtml(details.warranty.period)}</strong><span>Covered: ${escapeHtml(details.warranty.covered)}</span><span>Excluded: ${escapeHtml(details.warranty.excluded)}</span></article>
          </div>
        </section>

        <section class="profile-section">
          <h2>Job Gallery and Before/After Photos</h2>
          <div class="portfolio-grid">
            ${details.portfolio
              .map(
                (item) => `<article><div class="before-after"><span>Before</span><span>After</span></div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.text)}</p><small>${escapeHtml(item.date)}</small></article>`
              )
              .join("")}
          </div>
        </section>

        <section class="profile-section">
          <h2>Verified Reviews</h2>
          <div class="review-list">
            ${reviews
              .slice(0, 4)
              .map(
                (review) => `<article><div class="booking-head"><strong>${escapeHtml(review.customerName)}</strong><span class="badge good">Verified booking</span></div><p>${escapeHtml(review.averageRating || technician.rating)}/5 - ${escapeHtml(technician.trade)}</p><blockquote>${escapeHtml(review.text)}</blockquote><small>${escapeHtml((review.createdAt || "2026-06-20").slice(0, 10))}</small></article>`
              )
              .join("") || `<p class="fine-print">No verified reviews yet.</p>`}
          </div>
        </section>

        <section class="profile-section">
          <h2>Availability and Service Area</h2>
          <dl class="profile-metrics">
            <div><dt>Availability</dt><dd>${escapeHtml(details.availability.today)}</dd></div>
            <div><dt>Working hours</dt><dd>${escapeHtml(details.availability.hours)}</dd></div>
            <div><dt>Weekend</dt><dd>${escapeHtml(details.availability.weekend)}</dd></div>
            <div><dt>Emergency</dt><dd>${escapeHtml(details.availability.emergency)}</dd></div>
          </dl>
          <div class="badge-row">${details.availability.areas.map((item) => badge(item, "muted")).join("")}</div>
          <div class="map-placeholder">Map placeholder: ${details.availability.areas.map(escapeHtml).join(", ")}</div>
        </section>

        <section class="profile-section">
          <h2>Similar Technicians</h2>
          <div class="similar-grid">
            ${similar
              .map(
                (item) => `<article><div class="tech-top">${technicianPhoto(item)}<div><h3>${escapeHtml(item.fullName)}</h3><p>${escapeHtml(item.trade)} - Trust ${escapeHtml(item.trustScore)}</p></div></div><button class="secondary-button" type="button" data-profile-tech="${item.id}">View Profile</button></article>`
              )
              .join("")}
          </div>
        </section>
      </div>

      <aside class="profile-contact-card">
        <p class="eyebrow">Ready to hire?</p>
        <h2>${escapeHtml(technician.fullName)}</h2>
        <button class="primary-button wide" type="button" data-profile-book="${technician.id}">Book Technician</button>
        <button class="secondary-button wide" type="button" data-profile-book="${technician.id}">Request Quote</button>
        <a class="whatsapp-button" href="${technician.whatsappLink}" target="_blank" rel="noreferrer">WhatsApp</a>
        <a class="call-button" href="${technician.callLink}">Call</a>
        <button class="ghost-button" type="button">Save Technician</button>
        <button class="ghost-button" type="button">Share Profile</button>
      </aside>
    </div>
  `;
  target.querySelectorAll("[data-view-link]").forEach((node) => node.addEventListener("click", () => setView(node.dataset.viewLink)));
  target.querySelectorAll("[data-profile-tech]").forEach((node) => node.addEventListener("click", () => setView(`profile-${node.dataset.profileTech}`)));
  target.querySelectorAll("[data-profile-book]").forEach((node) =>
    node.addEventListener("click", () => {
      setView("customer");
      window.setTimeout(() => selectTechnician(Number(node.dataset.profileBook)), 0);
    })
  );
}

function selectTechnician(id) {
  const technician = state.technicians.find((item) => item.id === id);
  if (!technician) return;
  state.selectedTechnician = technician;
  $("#booking-technician-id").value = technician.id;
  $("#booking-category").value = technician.categories[0] || technician.trade;
  $("#booking-area").value = technician.area;
  $("#booking-estimate").textContent = `Estimated range: ${technician.priceRange} (${technician.currency || "USD"}). Final price agreed after inspection.`;
  $("#selected-technician").innerHTML = `Selected: <strong>${escapeHtml(technician.fullName)}</strong> in ${escapeHtml(technician.area)}.`;
  loadTransportEstimate();
  document.querySelector(".booking-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setTransportConfirmation(enabled = false) {
  const confirmation = $("#transport-confirmation");
  if (!confirmation) return;
  confirmation.disabled = !enabled;
  if (!enabled) confirmation.checked = false;
}

function renderTransportEstimate() {
  const target = $("#transport-quote");
  if (!target) return;
  const estimate = state.transportEstimate;
  if (!estimate) {
    target.innerHTML = `
      <strong>Transport estimate pending</strong>
      <p>Select a technician and service location to preview the travel fee before submitting.</p>
    `;
    setTransportConfirmation(false);
    return;
  }
  target.innerHTML = `
    <div class="booking-head">
      <div>
        <strong>Transport estimate</strong>
        <p>${escapeHtml(estimate.technicianName)} to ${escapeHtml(estimate.city)} service location</p>
      </div>
      <span class="status-pill">${money(estimate.transportFee, estimate.currency)}</span>
    </div>
    <dl class="mini-details">
      <div><dt>Service</dt><dd>${escapeHtml(estimate.serviceCategory)}</dd></div>
      <div><dt>Distance</dt><dd>${escapeHtml(estimate.distanceKm)} km</dd></div>
      <div><dt>ETA</dt><dd>${escapeHtml(estimate.estimatedArrival)} (${escapeHtml(estimate.travelTimeMinutes)} min)</dd></div>
      <div><dt>Diagnostic fee</dt><dd>${money(estimate.diagnosticFee, estimate.currency)}</dd></div>
      <div><dt>Estimated total before repairs</dt><dd>${money(estimate.estimatedTotalBeforeRepair, estimate.currency)}</dd></div>
      <div><dt>Location source</dt><dd>${escapeHtml(estimate.customerLocation?.source || "Service area estimate")}</dd></div>
    </dl>
    <p class="transport-warning">${escapeHtml(estimate.explanation)}</p>
    <details>
      <summary>How is this calculated?</summary>
      <p>${escapeHtml(estimate.calculationMethod)} Free radius ${escapeHtml(estimate.freeRadiusKm)} km, minimum ${money(estimate.minimumFee, estimate.currency)}, ${money(estimate.pricePerKm, estimate.currency)} per km, capped at ${money(estimate.maximumFee, estimate.currency)}.</p>
    </details>
  `;
  setTransportConfirmation(true);
}

async function loadTransportEstimate() {
  setTransportConfirmation(false);
  const technicianId = $("#booking-technician-id")?.value || state.selectedTechnician?.id || null;
  const payload = {
    technicianId: technicianId ? Number(technicianId) : null,
    area: $("#booking-area")?.value || "Harare",
    category: $("#booking-category")?.value || state.selectedTechnician?.trade || "HVAC/Refrigeration",
    urgency: $("#booking-urgency")?.value || "Normal",
    customerLatitude: $("#booking-latitude")?.value || undefined,
    customerLongitude: $("#booking-longitude")?.value || undefined,
  };
  try {
    state.transportEstimate = await api("/api/transport/estimate", { method: "POST", body: JSON.stringify(payload) });
    renderTransportEstimate();
  } catch (error) {
    state.transportEstimate = null;
    renderTransportEstimate();
    toast(error.message);
  }
}

async function loadTechnicians() {
  const params = new URLSearchParams();
  if ($("#search-input")?.value.trim()) params.set("search", $("#search-input").value.trim());
  if ($("#category-filter")?.value) params.set("category", $("#category-filter").value);
  if ($("#area-filter")?.value) params.set("area", $("#area-filter").value);
  if ($("#trust-filter")?.value) params.set("minTrust", $("#trust-filter").value);
  if ($("#availability-filter")?.value) params.set("availability", $("#availability-filter").value);
  if ($("#sort-filter")?.value) params.set("sort", $("#sort-filter").value);
  if ($("#verified-filter")?.checked) params.set("verified", "true");
  state.technicians = await api(`/api/technicians?${params.toString()}`);
  renderCustomerStats();
  renderFeaturedTechnicians();
  renderTechnicians();
  if (state.activeProfileId) renderTechnicianProfile();
}

async function loadBookings() {
  state.bookings = await api("/api/bookings");
  state.payments = await api("/api/payments");
  renderCustomerBookings();
  renderTechnicianJobs();
  renderAdminBookings();
  renderAdminPayments();
}

function renderStatusTimeline(history = []) {
  const items = history.length ? history : [{ status: "Submitted", note: "Booking created", at: "" }];
  return `
    <ol class="status-timeline">
      ${items
        .map(
          (entry) => `
          <li>
            <strong>${escapeHtml(entry.status)}</strong>
            <span>${entry.at ? new Date(entry.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Pending"}</span>
            ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}
          </li>`
        )
        .join("")}
    </ol>
  `;
}

function formatDuration(ms = 0) {
  const totalMinutes = Math.max(0, Math.round(Number(ms || 0) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

function renderJobProgress(booking) {
  const currentIndex = Math.max(0, jobPipelineStatuses.indexOf(booking.status));
  return `
    <div class="job-progress" aria-label="Job progress">
      ${jobPipelineStatuses
        .map((status, index) => `<span class="${index <= currentIndex ? "is-complete" : ""} ${status === booking.status ? "is-current" : ""}">${escapeHtml(status)}</span>`)
        .join("")}
    </div>
  `;
}

function renderNotifications(booking, audience = "customer") {
  const notifications = (booking.notifications || []).filter((item) => item.audience === audience).slice(0, 3);
  if (!notifications.length) return "";
  return `
    <div class="notification-list">
      ${notifications
        .map(
          (item) => `
          <p>
            <strong>${escapeHtml(item.message)}</strong>
            <span>${item.at ? new Date(item.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : ""}</span>
          </p>`
        )
        .join("")}
    </div>
  `;
}

function renderJourneyTimeline(booking) {
  const history = booking.journeyHistory || [];
  const currentIndex = Math.max(0, journeyStatuses.indexOf(booking.status));
  return `
    <div class="journey-timeline" aria-label="Live journey timeline">
      ${journeyStatuses
        .map((status, index) => {
          const item = history.find((entry) => entry.status === status);
          return `
            <div class="journey-step ${index <= currentIndex ? "is-complete" : ""} ${status === booking.status ? "is-current" : ""}">
              <i></i>
              <strong>${escapeHtml(status)}</strong>
              <span>${item?.at ? new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : index <= currentIndex ? "Updated" : "Pending"}</span>
            </div>`;
        })
        .join("")}
    </div>
  `;
}

function renderMapPlaceholder(booking, compact = false) {
  const live = booking.liveLocation || {};
  const technicianLocation = live.technicianLocation || {};
  const customerLocation = live.customerLocation || {};
  return `
    <div class="live-map ${compact ? "compact" : ""}">
      <div class="map-canvas" aria-label="Placeholder map for future Google Maps, Mapbox or OpenStreetMap integration">
        <span class="map-pin technician-pin">Tech</span>
        <span class="map-pin customer-pin">Customer</span>
        <div>
          <strong>Map placeholder</strong>
          <p>Ready for Google Maps, Mapbox or OpenStreetMap.</p>
        </div>
      </div>
      <div class="map-provider-row">
        ${(live.providers || state.config?.mapProviders || ["Google Maps", "Mapbox", "OpenStreetMap"]).map((provider) => `<span>${escapeHtml(provider)}</span>`).join("")}
      </div>
      <dl class="mini-details">
        <div><dt>Technician</dt><dd>${escapeHtml(technicianLocation.label || "Simulated technician location")}</dd></div>
        <div><dt>Customer</dt><dd>${escapeHtml(customerLocation.label || booking.address || booking.area)}</dd></div>
        <div><dt>Distance</dt><dd>${escapeHtml(live.distanceLabel || "TBC")}</dd></div>
        <div><dt>Travel time</dt><dd>${escapeHtml(live.travelTimeLabel || "TBC")}</dd></div>
      </dl>
    </div>
  `;
}

function renderLiveOpsCard(booking, audience = "customer") {
  const live = booking.liveLocation || {};
  const eta = booking.etaDetails || live.etaDetails || {};
  const contactButtons =
    audience === "customer" && booking.technicianId
      ? `<div class="inline-actions">
          ${booking.technicianCallLink ? `<a class="call-button" href="${booking.technicianCallLink}">Call technician</a>` : ""}
          ${booking.technicianWhatsappLink ? `<a class="whatsapp-button" href="${booking.technicianWhatsappLink}" target="_blank" rel="noreferrer">WhatsApp</a>` : ""}
          ${booking.emergencyContactLink ? `<a class="ghost-button danger" href="${booking.emergencyContactLink}">Emergency contact</a>` : ""}
        </div>`
      : "";
  return `
    <section class="live-ops-card">
      <div class="booking-head">
        <div>
          <p class="eyebrow">Live operations</p>
          <h3>${escapeHtml(live.statusLabel || booking.status)}</h3>
          <p>${escapeHtml(booking.technicianName || "Technician pending")} - ETA ${escapeHtml(eta.estimatedArrivalLabel || live.estimatedArrival || booking.estimatedArrival || "TBC")}</p>
        </div>
        <span class="status-pill ${eta.isDelayed ? "danger" : ""}">${eta.isDelayed ? "Delayed" : escapeHtml(live.distanceLabel || "Distance TBC")}</span>
      </div>
      <div class="live-status-grid">
        <span><strong>${escapeHtml(live.travelTimeLabel || "TBC")}</strong> travel time</span>
        <span><strong>${escapeHtml(live.siteTime || booking.jobTimer?.label || "0 min")}</strong> time on site</span>
        <span><strong>${escapeHtml(live.completionTime && live.completionTime !== "To be confirmed" ? new Date(live.completionTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "TBC")}</strong> completion</span>
        <span><strong>${escapeHtml(booking.locationPermissionStatus || "Not Requested")}</strong> location permission</span>
        <span><strong>${escapeHtml(booking.technicianAppState || "Offline")}</strong> technician state</span>
        <span><strong>${booking.locationTrackingActive ? "Active" : "Off"}</strong> tracking</span>
        <span><strong>${escapeHtml(eta.estimatedArrivalLabel || "TBC")}</strong> calculated ETA</span>
        <span><strong>${escapeHtml(eta.actualArrivalLabel || "Not arrived")}</strong> arrival timestamp</span>
        <span><strong>${escapeHtml(eta.varianceLabel || "Pending")}</strong> ETA variance</span>
      </div>
      <p class="eta-source">${escapeHtml(eta.source || "Placeholder ETA calculation - ready for Google Maps or Mapbox route ETA.")}</p>
      <p class="privacy-copy">${escapeHtml(booking.locationPrivacyMessage || state.config?.locationPrivacyMessage || "")}</p>
      ${renderJourneyTimeline(booking)}
      ${renderMapPlaceholder(booking)}
      ${contactButtons}
    </section>
  `;
}

function money(value, currency = "USD") {
  return `${escapeHtml(currency)} ${Number(value || 0).toFixed(2)}`;
}

function transportAmount(booking = {}) {
  return Number(booking.transport?.estimatedTotalBeforeRepair || booking.estimatedTotalBeforeRepair || booking.payment?.amount || 0);
}

function renderTransportSummary(transport = {}, context = "customer") {
  if (!transport || transport.transportFee === undefined) return "";
  const audit = Array.isArray(transport.auditHistory) ? transport.auditHistory : [];
  return `
    <div class="transport-summary">
      <div class="booking-head">
        <div>
          <strong>Approved transport fee</strong>
          <p>${escapeHtml(transport.calculationMethod || "Distance-based estimate")}</p>
        </div>
        <span class="status-pill">${money(transport.transportFee, transport.currency || "USD")}</span>
      </div>
      <dl class="mini-details">
        <div><dt>Distance</dt><dd>${escapeHtml(transport.distanceKm || 0)} km</dd></div>
        <div><dt>ETA</dt><dd>${escapeHtml(transport.estimatedArrival || `${transport.travelTimeMinutes || 0} min`)}</dd></div>
        <div><dt>Diagnostic fee</dt><dd>${money(transport.diagnosticFee || 0, transport.currency || "USD")}</dd></div>
        <div><dt>Total before repairs</dt><dd>${money(transport.estimatedTotalBeforeRepair || 0, transport.currency || "USD")}</dd></div>
        <div><dt>Customer approval</dt><dd>${transport.customerApproved ? `Approved ${escapeHtml((transport.customerApprovedAt || "").slice(0, 10))}` : "Needs confirmation if revised"}</dd></div>
        <div><dt>Route method</dt><dd>${escapeHtml(transport.routeProvider || "Placeholder route estimate")}</dd></div>
      </dl>
      ${context === "admin" && audit.length ? `<details><summary>Override and calculation history</summary><div class="audit-list">${audit.slice(0, 5).map((item) => `<p><strong>${escapeHtml(item.type)}</strong> ${escapeHtml(item.note || "")} <span>${escapeHtml((item.at || "").slice(0, 16).replace("T", " "))}</span></p>`).join("")}</div></details>` : ""}
      <details>
        <summary>How is this calculated?</summary>
        <p>${escapeHtml(transport.explanation || "Transport fee is calculated from technician location to customer service location.")}</p>
        <p>Free radius: ${escapeHtml(transport.freeRadiusKm || 0)} km. Minimum fee: ${money(transport.minimumFee || 0, transport.currency || "USD")}. Per km: ${money(transport.pricePerKm || 0, transport.currency || "USD")}. Emergency surcharge: ${money(transport.emergencySurchargeApplied || 0, transport.currency || "USD")}.</p>
      </details>
    </div>
  `;
}

function paymentStatusBadge(status = "Payment Pending") {
  const tone = status === "Paid" ? "good" : status === "Rejected" ? "danger" : "muted";
  return badge(status, tone);
}

function bookingCard(booking, actions = "", options = {}) {
  const technicianLine = booking.technicianId
    ? `<p><strong>${escapeHtml(booking.technicianName)}</strong> - ${escapeHtml(booking.technicianTrade)} - Trust Score ${escapeHtml(booking.technicianTrustScore || 0)}</p>`
    : "<p><strong>Unassigned</strong> - admin can assign a technician.</p>";
  const timer = booking.jobTimer || {};
  return `
    <article class="booking-item">
      <div class="booking-head">
        <div>
          <span class="status-pill">${escapeHtml(booking.status)}</span>
          <h3>${escapeHtml(booking.bookingCode || `#${booking.id}`)} - ${escapeHtml(booking.category)} in ${escapeHtml(booking.area)}</h3>
        </div>
        <strong>${escapeHtml(booking.estimatedPriceRange)}</strong>
      </div>
      ${technicianLine}
      <p>${escapeHtml(booking.issue)}</p>
      <p><strong>Customer:</strong> ${escapeHtml(booking.customerName)} - ${escapeHtml(booking.customerPhone)}${booking.address ? ` - ${escapeHtml(booking.address)}` : ""}</p>
      <div class="booking-meta">
        <span>${escapeHtml(booking.urgency)}</span>
        <span>${escapeHtml(booking.preferredTime || "Flexible")}</span>
        <span>Payment: ${escapeHtml(booking.payment?.status || "Payment Pending")}</span>
        <span>ETA: ${escapeHtml(booking.estimatedArrival || "To be confirmed")}</span>
        <span>Transport: ${money(booking.transportFee || booking.transport?.transportFee || 0, booking.transport?.currency || booking.currency || "USD")}</span>
        <span>Duration: ${escapeHtml(timer.label || formatDuration(timer.elapsedMs))}</span>
        ${booking.customerImage ? `<span>Image: ${escapeHtml(booking.customerImage.name)}</span>` : ""}
      </div>
      ${booking.transport ? renderTransportSummary(booking.transport, options.transportContext || "customer") : ""}
      ${options.jobProgress ? renderJobProgress(booking) : ""}
      ${options.liveOps ? renderLiveOpsCard(booking, options.notifications || "customer") : ""}
      ${options.timeline ? renderStatusTimeline(booking.statusHistory) : ""}
      ${options.notifications ? renderNotifications(booking, options.notifications) : ""}
      ${
        booking.technicianCallLink && !options.liveOps
          ? `<div class="inline-actions"><a class="call-button" href="${booking.technicianCallLink}">Call technician</a>${booking.technicianWhatsappLink ? `<a class="whatsapp-button" href="${booking.technicianWhatsappLink}" target="_blank" rel="noreferrer">WhatsApp</a>` : ""}</div>`
          : ""
      }
      ${booking.serviceReport ? renderServiceReport(booking.serviceReport) : ""}
      ${booking.review ? renderBookingReview(booking.review) : ""}
      ${booking.dispute ? `<p class="dispute-note">Problem reported: ${escapeHtml(booking.dispute.reason)} ${booking.dispute.resolved ? "(resolved)" : "(open)"}</p>` : ""}
      ${actions}
    </article>
  `;
}

function renderServiceReport(report) {
  return `
    <div class="service-report-card">
      <div class="booking-head">
        <strong>Service report ${escapeHtml(report.id || "")}</strong>
        <span class="badge good">${report.customerConfirmation ? "Customer confirmed" : "Awaiting confirmation"}</span>
      </div>
      <dl class="mini-details">
        <div><dt>Job ID</dt><dd>${escapeHtml(report.jobId || report.jobNumber || "-")}</dd></div>
        <div><dt>Customer</dt><dd>${escapeHtml(report.customerName || "-")}</dd></div>
        <div><dt>Technician</dt><dd>${escapeHtml(report.technicianName || "-")}</dd></div>
        <div><dt>Date</dt><dd>${escapeHtml((report.date || report.createdAt || "").slice(0, 10) || "-")}</dd></div>
        <div><dt>Category</dt><dd>${escapeHtml(report.serviceCategory || "-")}</dd></div>
        <div><dt>Problem</dt><dd>${escapeHtml(report.problemReported || "-")}</dd></div>
        <div><dt>Diagnosis</dt><dd>${escapeHtml(report.diagnosis || "-")}</dd></div>
        <div><dt>Work performed</dt><dd>${escapeHtml(report.workPerformed || "-")}</dd></div>
        <div><dt>Parts used</dt><dd>${escapeHtml(report.partsUsed || "-")}</dd></div>
        <div><dt>Labour hours</dt><dd>${escapeHtml(report.labourHours || report.hoursWorked || 0)}</dd></div>
        <div><dt>Before photo</dt><dd>${escapeHtml(report.beforePhoto || "Placeholder")}</dd></div>
        <div><dt>After photo</dt><dd>${escapeHtml(report.afterPhoto || "Placeholder")}</dd></div>
        <div><dt>Warranty</dt><dd>${escapeHtml(report.warrantyPeriod || "-")}</dd></div>
        <div><dt>Notes</dt><dd>${escapeHtml(report.technicianNotes || "-")}</dd></div>
      </dl>
    </div>
  `;
}

function renderBookingReview(review) {
  const ratings = review.categoryRatings || {};
  const photos = (review.photos || []).map((photo) => `<span class="photo-chip">${escapeHtml(photo.name)}</span>`).join("");
  return `
    <div class="posted-review">
      <div class="booking-head">
        <strong>Customer review: ${escapeHtml(review.averageRating || "")}/5</strong>
        <span class="badge ${review.recommend ? "good" : "muted"}">${review.recommend ? "Would recommend" : "Would not recommend"}</span>
      </div>
      <div class="rating-grid">
        ${Object.entries(ratings)
          .map(([key, value]) => `<span>${escapeHtml(reviewLabels[key] || key)} <strong>${escapeHtml(value)}</strong></span>`)
          .join("")}
      </div>
      <p>${escapeHtml(review.text || "")}</p>
      ${photos ? `<div class="photo-row">${photos}</div>` : ""}
      ${review.technicianResponse ? `<p class="tech-response"><strong>Technician response:</strong> ${escapeHtml(review.technicianResponse.text)}</p>` : ""}
    </div>
  `;
}

function renderCustomerBookings() {
  const active = state.bookings.filter((booking) => !["Customer Confirmed", "Closed", "Cancelled"].includes(booking.status));
  const completed = state.bookings.filter((booking) => ["Customer Confirmed", "Closed"].includes(booking.status));
  const cancelled = state.bookings.filter((booking) => booking.status === "Cancelled");
  const group = (title, bookings) => `
    <section class="booking-group">
      <div class="section-heading compact">
        <h3>${title}</h3>
        <span class="badge muted">${bookings.length}</span>
      </div>
      ${
        bookings.length
          ? bookings
              .slice(0, 6)
              .map((booking) =>
                bookingCard(
                  booking,
                  `<div class="inline-actions">
                    <button class="secondary-button" type="button" data-complete-booking="${booking.id}" ${booking.status !== "Completed" ? "disabled" : ""}>Confirm complete</button>
                    <button class="ghost-button danger" type="button" data-dispute-booking="${booking.id}">Report issue</button>
                  </div>
                  ${["Completed", "Customer Confirmed", "Closed"].includes(booking.status) ? renderCustomerPaymentPanel(booking) : ""}`,
                  { timeline: true, jobProgress: true, notifications: "customer", liveOps: !["Submitted", "Waiting for Technician", "Cancelled"].includes(booking.status) }
                )
              )
              .join("")
          : `<div class="empty-state">No ${title.toLowerCase()}.</div>`
      }
    </section>`;

  $("#customer-bookings").innerHTML = [group("Active bookings", active), group("Completed bookings", completed), group("Cancelled bookings", cancelled)].join("");

  $$("[data-complete-booking]").forEach((button) =>
    button.addEventListener("click", () => updateBooking(button.dataset.completeBooking, { customerConfirmedComplete: true }, "Completion confirmed."))
  );
  $$("[data-dispute-booking]").forEach((button) =>
    button.addEventListener("click", () => reportProblem(button.dataset.disputeBooking))
  );
  $$("[data-payment-method]").forEach((select) =>
    select.addEventListener("change", () => renderCustomerBookings())
  );
  $$("[data-payment-form]").forEach((form) => form.addEventListener("submit", submitPayment));
}

function renderCustomerPaymentPanel(booking) {
  const payment = booking.payment || {};
  const amountDue = payment.amount || transportAmount(booking);
  const method = document.querySelector(`[data-payment-method="${booking.id}"]`)?.value || payment.method || "EcoCash";
  return `
    <div class="payment-panel">
      <div class="booking-head">
        <div>
          <strong>Payment</strong>
          <p>${escapeHtml(booking.bookingCode)} - ${escapeHtml(booking.technicianName)} - ${escapeHtml(booking.category)}</p>
        </div>
        ${paymentStatusBadge(payment.status)}
      </div>
      <dl class="mini-details">
        <div><dt>Amount due</dt><dd>${money(amountDue, payment.currency || booking.transport?.currency || "USD")}</dd></div>
        <div><dt>Diagnostic fee</dt><dd>${money(booking.diagnosticFee || booking.transport?.diagnosticFee || 0, payment.currency || "USD")}</dd></div>
        <div><dt>Transport fee</dt><dd>${money(booking.transportFee || booking.transport?.transportFee || 0, payment.currency || "USD")}</dd></div>
        <div><dt>Method</dt><dd>${escapeHtml(payment.method || "Not selected")}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(payment.status || "Payment Pending")}</dd></div>
        <div><dt>Reference</dt><dd>${escapeHtml(payment.reference || "Pending")}</dd></div>
      </dl>
      <form class="payment-form" data-payment-form="${booking.id}">
        <label><span>Payment method</span><select data-payment-method="${booking.id}" name="method">${state.config.paymentMethods
          .map((item) => `<option value="${escapeHtml(item)}" ${item === method ? "selected" : ""}>${escapeHtml(item)}</option>`)
          .join("")}</select></label>
        ${renderPaymentMethodFields(method, booking, payment)}
        <button class="secondary-button" type="submit">Submit Payment Record</button>
      </form>
      ${payment.receipt ? renderReceipt(payment.receipt, payment.revenue) : ""}
    </div>
  `;
}

function renderPaymentMethodFields(method, booking, payment = {}) {
  const amount = payment.amount || booking.payment?.amount || transportAmount(booking);
  if (method === "EcoCash") {
    return `
      <p class="fine-print">Complete the EcoCash payment using your mobile phone and enter the transaction reference below.</p>
      <div class="two-column">
        <label><span>EcoCash number</span><input name="phoneNumber" value="${escapeHtml(payment.phoneNumber || booking.customerWhatsapp || "")}" inputmode="tel" /></label>
        <label><span>Amount</span><input name="amount" type="number" min="0" step="0.01" value="${escapeHtml(amount)}" /></label>
      </div>
      <label><span>Transaction reference</span><input name="reference" value="${escapeHtml(payment.reference || "")}" placeholder="EcoCash reference" /></label>
    `;
  }
  if (method === "ZIPIT Bank Transfer") {
    return `
      <dl class="mini-details">
        <div><dt>Bank name</dt><dd>${escapeHtml(state.config.bankDetails.bankName)}</dd></div>
        <div><dt>Account number</dt><dd>${escapeHtml(state.config.bankDetails.accountNumber)}</dd></div>
        <div><dt>Reference</dt><dd>${escapeHtml(booking.bookingCode)}</dd></div>
        <div><dt>Amount</dt><dd>${money(amount)}</dd></div>
      </dl>
      <label><span>Transaction reference</span><input name="reference" value="${escapeHtml(payment.reference || "")}" /></label>
      <input name="amount" type="hidden" value="${escapeHtml(amount)}" />
    `;
  }
  if (method === "Direct Bank Transfer") {
    return `
      <dl class="mini-details">
        <div><dt>Bank</dt><dd>${escapeHtml(state.config.bankDetails.bankName)}</dd></div>
        <div><dt>Account</dt><dd>${escapeHtml(state.config.bankDetails.accountNumber)}</dd></div>
      </dl>
      <label><span>Transfer reference</span><input name="reference" value="${escapeHtml(payment.reference || "")}" /></label>
      <label><span>Proof of payment placeholder</span><input name="proofOfPayment" value="${escapeHtml(payment.proofOfPayment || "")}" placeholder="proof-file.jpg" /></label>
      <input name="amount" type="hidden" value="${escapeHtml(amount)}" />
    `;
  }
  if (method === "Cash") {
    return `
      <label class="check-row"><input name="customerConfirmed" type="checkbox" ${payment.customerConfirmed ? "checked" : ""} /><span>Customer confirmed cash payment</span></label>
      <label><span>Cash reference</span><input name="reference" value="${escapeHtml(payment.reference || `CASH-${booking.bookingCode}`)}" /></label>
      <input name="amount" type="hidden" value="${escapeHtml(amount)}" />
    `;
  }
  return `
    <p class="fine-print">Pay Later is a placeholder for approved business accounts.</p>
    <label><span>Business account reference</span><input name="reference" value="${escapeHtml(payment.reference || "")}" /></label>
    <input name="amount" type="hidden" value="${escapeHtml(amount)}" />
  `;
}

function renderReceipt(receipt, revenue = {}) {
  return `
    <div class="receipt-card">
      <div class="booking-head"><strong>Receipt ${escapeHtml(receipt.receiptNumber)}</strong><button class="ghost-button" type="button" disabled>Download PDF</button></div>
      <dl class="mini-details">
        <div><dt>Booking ID</dt><dd>${escapeHtml(receipt.bookingId)}</dd></div>
        <div><dt>Customer</dt><dd>${escapeHtml(receipt.customer)}</dd></div>
        <div><dt>Technician</dt><dd>${escapeHtml(receipt.technician)}</dd></div>
        <div><dt>Amount</dt><dd>${money(receipt.amount, receipt.currency)}</dd></div>
        <div><dt>Diagnostic fee</dt><dd>${money(receipt.diagnosticFee || 0, receipt.currency)}</dd></div>
        <div><dt>Transport fee</dt><dd>${money(receipt.transportFee || 0, receipt.currency)}</dd></div>
        <div><dt>Total before repairs</dt><dd>${money(receipt.estimatedTotalBeforeRepair || receipt.amount || 0, receipt.currency)}</dd></div>
        <div><dt>Method</dt><dd>${escapeHtml(receipt.paymentMethod)}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(receipt.paymentStatus)}</dd></div>
        <div><dt>Platform commission</dt><dd>${money(revenue.platformCommission || 0, receipt.currency)}</dd></div>
        <div><dt>Technician earnings</dt><dd>${money(revenue.technicianEarnings || 0, receipt.currency)}</dd></div>
      </dl>
    </div>
  `;
}

async function submitPayment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    method: form.elements.method.value,
    amount: form.elements.amount?.value || 0,
    phoneNumber: form.elements.phoneNumber?.value || "",
    reference: form.elements.reference?.value || "",
    proofOfPayment: form.elements.proofOfPayment?.value || "",
    customerConfirmed: Boolean(form.elements.customerConfirmed?.checked),
  };
  await api(`/api/bookings/${form.dataset.paymentForm}/payment`, { method: "POST", body: JSON.stringify(payload) });
  toast("Payment record submitted for verification.");
  await loadBookings();
}

function renderReviewForm(booking) {
  const existing = booking.review || {};
  const existingRatings = existing.categoryRatings || {};
  return `
    <form class="review-form" data-review-form="${booking.id}">
      <h3>Rate the completed job</h3>
      <div class="rating-inputs">
        ${state.config.reviewCategories
          .map(
            (category) => `
            <label>
              <span>${escapeHtml(reviewLabels[category] || category)}</span>
              <select name="${escapeHtml(category)}">${ratingOptions(existingRatings[category] || 5)}</select>
            </label>`
          )
          .join("")}
      </div>
      <label class="check-row">
        <input name="recommend" type="checkbox" ${existing.recommend !== false ? "checked" : ""} />
        <span>Recommend to others</span>
      </label>
      <label>
        <span>Upload completion photos</span>
        <input name="photos" type="file" accept="image/*" multiple />
      </label>
      <label>
        <span>Review comments</span>
        <textarea name="text" rows="3" placeholder="What went well? What should future customers know?">${escapeHtml(existing.text || "")}</textarea>
      </label>
      <div class="inline-actions">
        <button class="primary-button" type="submit">Publish Review</button>
        <button class="ghost-button" type="button" data-cancel-review="${booking.id}">Cancel</button>
      </div>
    </form>
  `;
}

async function submitBooking(event) {
  event.preventDefault();
  if (!$("#transport-confirmation")?.checked) {
    toast("Please review and accept the transport fee before submitting.");
    return;
  }
  const selectedTechnician = state.selectedTechnician;
  const payload = {
    technicianId: $("#booking-technician-id").value || null,
    customerName: $("#customer-name").value,
    customerPhone: $("#customer-phone").value,
    customerWhatsapp: $("#customer-whatsapp").value || $("#customer-phone").value,
    area: $("#booking-area").value,
    address: $("#booking-address").value,
    category: $("#booking-category").value,
    issue: $("#booking-issue").value,
    urgency: $("#booking-urgency").value,
    preferredTime: $("#booking-time").value,
    currency: $("#booking-currency").value,
    customerImage: fileMeta($("#booking-image")),
    estimatedPriceRange: selectedTechnician ? selectedTechnician.priceRange : "Request quote",
    customerLatitude: $("#booking-latitude").value || undefined,
    customerLongitude: $("#booking-longitude").value || undefined,
    transportFeeAccepted: true,
  };
  const created = await api("/api/bookings", { method: "POST", body: JSON.stringify(payload) });
  event.target.reset();
  $("#booking-technician-id").value = "";
  $("#booking-estimate").textContent = "Estimated price range appears after selecting a technician.";
  $("#selected-technician").textContent = "Choose a technician or submit an open request.";
  state.selectedTechnician = null;
  state.transportEstimate = null;
  renderTransportEstimate();
  toast(`Booking ${created.bookingCode} submitted.`);
  await loadBookings();
  await loadAdmin();
}

async function submitStructuredReview(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.dataset.reviewForm;
  const categoryRatings = {};
  state.config.reviewCategories.forEach((category) => {
    categoryRatings[category] = Number(form.elements[category].value);
  });
  const photos = Array.from(form.elements.photos.files || []).slice(0, 4).map((file) => ({
    name: file.name,
    size: file.size,
    type: file.type || "image",
  }));
  await updateReview(id, {
    categoryRatings,
    recommend: form.elements.recommend.checked,
    text: form.elements.text.value || "Reviewed by customer.",
    photos,
  });
  state.reviewingBookingId = null;
}

async function updateReview(id, payload) {
  await api(`/api/bookings/${id}/review`, { method: "POST", body: JSON.stringify(payload) });
  toast("Review saved.");
  await Promise.all([loadBookings(), loadTechnicians(), loadAdmin()]);
}

function reportProblem(id) {
  const reason = window.prompt("What problem should admin review?");
  if (!reason) return;
  updateBooking(id, { disputeReason: reason }, "Problem reported to admin.");
}

async function updateBooking(id, payload, message = "Booking updated.") {
  try {
    await api(`/api/bookings/${id}/status`, { method: "PATCH", body: JSON.stringify(payload) });
    toast(message);
    await Promise.all([loadBookings(), loadAdmin(), loadTechnicians()]);
  } catch (error) {
    toast(error.message);
    await Promise.all([loadBookings(), loadAdmin()]);
  }
}

function renderJourneyControls(booking) {
  const permissionGranted = booking.locationPermissionStatus === "Granted";
  return `
    <div class="journey-controls">
      <button class="secondary-button" type="button" data-tech-status="${booking.id}:Travelling">Start Navigation</button>
      <button class="secondary-button" type="button" data-tech-location="${booking.id}">Update location</button>
      <button class="secondary-button" type="button" data-tech-status="${booking.id}:Nearby">Mark nearby</button>
      <button class="secondary-button" type="button" data-tech-status="${booking.id}:Arrived">Mark arrived</button>
      <button class="secondary-button" type="button" data-tech-status="${booking.id}:Working">${booking.status === "Paused" ? "Resume journey" : "Start work"}</button>
      <button class="secondary-button" type="button" data-tech-status="${booking.id}:Paused">Pause journey</button>
      <button class="secondary-button" type="button" data-tech-eta="${booking.id}">Share ETA</button>
      <button class="secondary-button" type="button" data-tech-status="${booking.id}:Completed">Complete</button>
      <button class="ghost-button danger" type="button" data-tech-location-refuse="${booking.id}" ${permissionGranted ? "disabled" : ""}>Refuse location access</button>
      <button class="ghost-button danger" type="button" data-tech-decline="${booking.id}">Cancel journey</button>
    </div>
  `;
}

function renderTechnicianJobs() {
  const jobs = state.bookings.filter((booking) => booking.technicianId === state.currentTechnicianId);
  const completed = jobs.filter((booking) => ["Completed", "Customer Confirmed", "Closed"].includes(booking.status));
  const estimatedEarnings = completed.reduce((sum, booking) => sum + estimateValue(booking.estimatedPriceRange), 0);
  const technician = state.adminTechnicians.find((item) => item.id === state.currentTechnicianId) || state.technicians.find((item) => item.id === state.currentTechnicianId);
  $("#technician-earnings").innerHTML = technician
    ? `${renderReputationDashboard(technician)}${renderTechnicianPaymentSummary(technician)}`
    : `<strong>$${Math.round(estimatedEarnings)}</strong><span>simple completed earnings estimate</span>`;
  $("#technician-jobs").innerHTML =
    jobs
      .map((booking) =>
        bookingCard(
          booking,
          `${renderFieldOpsForm(booking)}
          ${["Completed", "Customer Confirmed", "Closed"].includes(booking.status) ? renderServiceReportForm(booking) : ""}
          ${booking.review ? renderTechnicianResponseForm(booking) : ""}
          ${renderJourneyControls(booking)}
          <div class="inline-actions">
            <button class="secondary-button" type="button" data-tech-status="${booking.id}:Accepted">Accept</button>
            <button class="ghost-button danger" type="button" data-tech-decline="${booking.id}">Decline job</button>
          </div>`,
          { timeline: true, jobProgress: true, notifications: "technician", liveOps: !["Submitted", "Waiting for Technician", "Cancelled"].includes(booking.status) }
        )
      )
      .join("") || `<div class="empty-state">No jobs assigned to this demo technician.</div>`;

  $$("[data-tech-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const [id, status] = button.dataset.techStatus.split(":");
      updateBooking(id, { ...fieldOpsPayload(id), status, note: `Technician moved job to ${status}.` }, `Job moved to ${status}.`);
    });
  });
  $$("[data-tech-decline]").forEach((button) =>
    button.addEventListener("click", () => {
      const payload = fieldOpsPayload(button.dataset.techDecline);
      updateBooking(button.dataset.techDecline, { ...payload, status: "Cancelled", cancelReason: payload.jobNotes || "Declined by technician." }, "Job declined.");
    })
  );
  $$("[data-tech-location]").forEach((button) =>
    button.addEventListener("click", () =>
      updateBooking(button.dataset.techLocation, { ...fieldOpsPayload(button.dataset.techLocation), simulateLocation: true, note: "Technician shared simulated location update." }, "Location updated.")
    )
  );
  $$("[data-tech-eta]").forEach((button) =>
    button.addEventListener("click", () =>
      updateBooking(button.dataset.techEta, { ...fieldOpsPayload(button.dataset.techEta), simulateLocation: true, note: "Technician shared ETA update." }, "ETA shared.")
    )
  );
  $$("[data-tech-location-refuse]").forEach((button) =>
    button.addEventListener("click", () =>
      updateBooking(
        button.dataset.techLocationRefuse,
        { ...fieldOpsPayload(button.dataset.techLocationRefuse), locationPermissionGranted: false, locationPermissionRefused: true, status: "Travelling", note: "Technician refused required active-job location access." },
        "Location refusal recorded."
      )
    )
  );
  $$("[data-save-field-ops]").forEach((button) =>
    button.addEventListener("click", () => updateBooking(button.dataset.saveFieldOps, fieldOpsPayload(button.dataset.saveFieldOps), "Job details saved."))
  );
  $$("[data-response-form]").forEach((form) => form.addEventListener("submit", submitTechnicianResponse));
  $$("[data-service-report-form]").forEach((form) => form.addEventListener("submit", submitServiceReport));
  $$("[data-cash-received]").forEach((button) =>
    button.addEventListener("click", () =>
      api(`/api/bookings/${button.dataset.cashReceived}/payment`, {
        method: "POST",
        body: JSON.stringify({ method: "Cash", cashReceived: true, reference: `CASH-${button.dataset.cashReceived}` }),
      })
        .then(() => {
          toast("Cash payment marked received.");
          return loadBookings();
        })
        .catch((error) => toast(error.message))
    )
  );
}

function renderTechnicianPaymentSummary(technician) {
  const payments = state.payments.filter((payment) => Number(payment.technicianId) === Number(technician.id));
  const pending = payments.filter((payment) => payment.status === "Awaiting Verification" || payment.status === "Payment Pending");
  const paid = payments.filter((payment) => payment.status === "Paid");
  const cash = payments.filter((payment) => payment.method === "Cash");
  const outstanding = state.bookings.filter(
    (booking) => Number(booking.technicianId) === Number(technician.id) && ["Completed", "Customer Confirmed", "Closed"].includes(booking.status) && booking.payment?.status !== "Paid"
  );
  return `
    <div class="payment-summary">
      <strong>Payment Status</strong>
      <dl class="mini-details">
        <div><dt>Pending</dt><dd>${pending.length}</dd></div>
        <div><dt>Paid jobs</dt><dd>${paid.length}</dd></div>
        <div><dt>Cash</dt><dd>${cash.length}</dd></div>
        <div><dt>Outstanding</dt><dd>${outstanding.length}</dd></div>
      </dl>
      ${renderPaymentHistory(payments.slice(0, 4), true)}
    </div>
  `;
}

function renderPaymentHistory(payments, allowCashAction = false) {
  if (!payments.length) return `<div class="empty-state">No payment history yet.</div>`;
  return `
    <div class="payment-history">
      ${payments
        .map(
          (payment) => `
          <article class="payment-row">
            <div>
              <strong>${escapeHtml(payment.bookingCode)}</strong>
              <p>${escapeHtml(payment.method)} - ${money(payment.amount, payment.currency)} - Ref: ${escapeHtml(payment.reference || "Pending")}</p>
              <small>${escapeHtml((payment.updatedAt || payment.createdAt || "").slice(0, 10))}</small>
            </div>
            <div class="inline-actions">
              ${paymentStatusBadge(payment.status)}
              ${allowCashAction && payment.method === "Cash" ? `<button class="ghost-button" type="button" data-cash-received="${payment.bookingId}" ${payment.cashReceived ? "disabled" : ""}>${payment.cashReceived ? "Cash received" : "Cash Received"}</button>` : ""}
            </div>
          </article>`
        )
        .join("")}
    </div>
  `;
}

function renderReputationDashboard(technician) {
  const details = profileDetails(technician);
  return `
    <div class="reputation-dashboard">
      <div class="score-ring small" style="--score:${technician.trustScore}"><strong>${technician.trustScore}</strong></div>
      <div>
        <strong>${escapeHtml(technician.trustLevel)}</strong>
        <span>${escapeHtml(technician.verificationStatus)} verification</span>
      </div>
      <dl class="mini-details">
        <div><dt>Jobs</dt><dd>${escapeHtml(technician.completedJobs)}</dd></div>
        <div><dt>Rating</dt><dd>${escapeHtml(technician.rating || "New")}</dd></div>
        <div><dt>Repeat</dt><dd>${escapeHtml(technician.trustStatuses.repeatCustomerRate || 0)}%</dd></div>
        <div><dt>Response</dt><dd>${escapeHtml(technician.responseMinutes)} min</dd></div>
        <div><dt>Acceptance</dt><dd>${details.acceptanceRate}%</dd></div>
        <div><dt>Complaints</dt><dd>${escapeHtml(technician.trustStatuses.complaintCount || 0)}</dd></div>
        <div><dt>Views</dt><dd>${escapeHtml(technician.profileViews || 0)}</dd></div>
      </dl>
      <div class="trust-recommendations">
        <strong>Improve Trust Score</strong>
        <ul class="plain-list">${(technician.trustSuggestions || ["Keep documenting great service."]).slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
    </div>
  `;
}

function renderFieldOpsForm(booking) {
  const live = booking.liveLocation || {};
  const permissionGranted = booking.locationPermissionStatus === "Granted";
  const trackingLabel = booking.locationTrackingActive ? "Live tracking active" : booking.status === "Completed" ? "Tracking stopped" : "Tracking inactive";
  return `
    <div class="field-ops-form">
      <div class="privacy-permission-card compact">
        <div class="booking-head">
          <div>
            <strong>Location permission</strong>
            <p>${escapeHtml(booking.locationPrivacyMessage || state.config?.locationPrivacyMessage || "Service Market only tracks technician location during active jobs to improve safety, transparency and accountability.")}</p>
          </div>
          <span class="badge ${permissionGranted ? "good" : booking.locationPermissionStatus === "Refused" ? "danger" : "muted"}">${escapeHtml(booking.locationPermissionStatus || "Not Requested")}</span>
        </div>
        <div class="booking-meta">
          <span>App state: ${escapeHtml(booking.technicianAppState || "Offline")}</span>
          <span>${escapeHtml(trackingLabel)}</span>
          ${booking.arrivedLocationRecordedAt ? `<span>Arrived recorded: ${new Date(booking.arrivedLocationRecordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>` : ""}
          ${booking.workingLocationRecordedAt ? `<span>On-site recorded: ${new Date(booking.workingLocationRecordedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>` : ""}
        </div>
        <label class="check-row"><input data-job-location-consent="${booking.id}" type="checkbox" ${permissionGranted ? "checked" : ""} /><span>Allow location sharing for this active job.</span></label>
      </div>
      <div class="two-column">
        <label><span>Estimated arrival</span><input data-job-eta="${booking.id}" value="${escapeHtml(booking.estimatedArrival || "")}" placeholder="e.g. 20 minutes" /></label>
        <label><span>Total duration</span><input value="${escapeHtml(booking.jobTimer?.label || "0 min")}" disabled /></label>
      </div>
      <div class="two-column">
        <label><span>Distance to customer</span><input data-job-distance="${booking.id}" type="number" min="0" step="0.1" value="${escapeHtml(live.distanceKm ?? booking.distanceKm ?? "")}" placeholder="e.g. 6.5" /></label>
        <label><span>Travel time minutes</span><input data-job-travel-time="${booking.id}" type="number" min="0" step="1" value="${escapeHtml(live.travelTimeMinutes ?? booking.travelTimeMinutes ?? "")}" placeholder="e.g. 22" /></label>
      </div>
      <div class="two-column">
        <label><span>Map provider placeholder</span><select data-job-map-provider="${booking.id}">${(state.config?.mapProviders || ["Google Maps", "Mapbox", "OpenStreetMap"]).map((provider) => `<option ${String(live.provider || "").includes(provider) ? "selected" : ""}>${escapeHtml(provider)}</option>`).join("")}</select></label>
        <label><span>Location update note</span><input data-job-location-note="${booking.id}" value="${escapeHtml(booking.locationNote || "")}" placeholder="e.g. Passing Avondale Shops" /></label>
      </div>
      <label><span>Diagnosis</span><textarea rows="2" data-job-diagnosis="${booking.id}" placeholder="What caused the problem?">${escapeHtml(booking.diagnosis || booking.serviceReport?.diagnosis || "")}</textarea></label>
      <label><span>Work performed</span><textarea rows="2" data-job-work="${booking.id}" placeholder="What work was completed?">${escapeHtml(booking.workPerformed || booking.serviceReport?.workPerformed || "")}</textarea></label>
      <label><span>Parts used</span><input data-job-parts="${booking.id}" value="${escapeHtml(booking.partsUsed || booking.serviceReport?.partsUsed || "")}" placeholder="Placeholder text, e.g. capacitor, cable, seal" /></label>
      <div class="two-column">
        <label><span>Before photo placeholder</span><input data-job-before="${booking.id}" value="${escapeHtml(booking.beforePhoto || booking.serviceReport?.beforePhoto || "Before photo placeholder")}" /></label>
        <label><span>After photo placeholder</span><input data-job-after="${booking.id}" value="${escapeHtml(booking.afterPhoto || booking.serviceReport?.afterPhoto || "After photo placeholder")}" /></label>
      </div>
      <label class="notes-label"><span>Technician notes</span><textarea rows="2" data-job-notes="${booking.id}">${escapeHtml(booking.jobNotes || booking.serviceReport?.technicianNotes || "")}</textarea></label>
      <button class="ghost-button" type="button" data-save-field-ops="${booking.id}">Save job details</button>
    </div>
  `;
}

function fieldOpsPayload(id) {
  const distance = document.querySelector(`[data-job-distance="${id}"]`)?.value;
  const travelTime = document.querySelector(`[data-job-travel-time="${id}"]`)?.value;
  const payload = {
    estimatedArrival: document.querySelector(`[data-job-eta="${id}"]`)?.value || "",
    locationPermissionGranted: Boolean(document.querySelector(`[data-job-location-consent="${id}"]`)?.checked),
    mapProvider: document.querySelector(`[data-job-map-provider="${id}"]`)?.value || "",
    locationNote: document.querySelector(`[data-job-location-note="${id}"]`)?.value || "",
    diagnosis: document.querySelector(`[data-job-diagnosis="${id}"]`)?.value || "",
    workPerformed: document.querySelector(`[data-job-work="${id}"]`)?.value || "",
    partsUsed: document.querySelector(`[data-job-parts="${id}"]`)?.value || "",
    beforePhoto: document.querySelector(`[data-job-before="${id}"]`)?.value || "",
    afterPhoto: document.querySelector(`[data-job-after="${id}"]`)?.value || "",
    jobNotes: document.querySelector(`[data-job-notes="${id}"]`)?.value || "",
  };
  if (distance !== "") payload.distanceKm = distance;
  if (travelTime !== "") payload.travelTimeMinutes = travelTime;
  return payload;
}

function renderServiceReportForm(booking) {
  const report = booking.serviceReport || {};
  return `
    <form class="service-report-form" data-service-report-form="${booking.id}">
      <h3>Generated service report</h3>
      <div class="two-column">
        <label><span>Job number</span><input name="jobNumber" value="${escapeHtml(report.jobNumber || booking.bookingCode || booking.id)}" /></label>
        <label><span>Labour hours</span><input name="hoursWorked" type="number" min="0" step="0.01" value="${escapeHtml(report.labourHours || report.hoursWorked || booking.jobTimer?.labourHours || "")}" /></label>
      </div>
      <label><span>Problem reported</span><textarea name="problemReported" rows="2">${escapeHtml(report.problemReported || booking.issue)}</textarea></label>
      <label><span>Diagnosis</span><textarea name="diagnosis" rows="2">${escapeHtml(report.diagnosis || booking.diagnosis || "")}</textarea></label>
      <label><span>Work performed</span><textarea name="workPerformed" rows="2">${escapeHtml(report.workPerformed || booking.workPerformed || "")}</textarea></label>
      <label><span>Parts used</span><input name="partsUsed" value="${escapeHtml(report.partsUsed || booking.partsUsed || "")}" /></label>
      <div class="two-column">
        <label><span>Before photo placeholder</span><input name="beforePhoto" value="${escapeHtml(report.beforePhoto || booking.beforePhoto || "Before photo placeholder")}" /></label>
        <label><span>After photo placeholder</span><input name="afterPhoto" value="${escapeHtml(report.afterPhoto || booking.afterPhoto || "After photo placeholder")}" /></label>
      </div>
      <label><span>Warranty period</span><input name="warrantyPeriod" value="${escapeHtml(report.warrantyPeriod || "")}" placeholder="e.g. 7 days workmanship" /></label>
      <label class="check-row"><input name="customerConfirmation" type="checkbox" ${report.customerConfirmation || booking.customerConfirmedComplete ? "checked" : ""} /><span>Customer confirmation received</span></label>
      <label><span>Technician notes</span><textarea name="technicianNotes" rows="2">${escapeHtml(report.technicianNotes || booking.jobNotes || "")}</textarea></label>
      <button class="secondary-button" type="submit">Save Service Report</button>
    </form>
  `;
}

async function submitServiceReport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    jobNumber: form.elements.jobNumber.value,
    problemReported: form.elements.problemReported.value,
    diagnosis: form.elements.diagnosis.value,
    workPerformed: form.elements.workPerformed.value,
    partsUsed: form.elements.partsUsed.value,
    hoursWorked: form.elements.hoursWorked.value,
    beforePhoto: form.elements.beforePhoto.value,
    afterPhoto: form.elements.afterPhoto.value,
    warrantyPeriod: form.elements.warrantyPeriod.value,
    customerConfirmation: form.elements.customerConfirmation.checked,
    technicianNotes: form.elements.technicianNotes.value,
  };
  await api(`/api/bookings/${form.dataset.serviceReportForm}/service-report`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  toast("Service report saved.");
  await Promise.all([loadBookings(), loadAdmin()]);
}

function renderTechnicianResponseForm(booking) {
  return `
    <form class="response-form" data-response-form="${booking.id}">
      <label>
        <span>Public response to customer review</span>
        <textarea name="response" rows="2" placeholder="Thank the customer or explain the follow-up.">${escapeHtml(booking.review.technicianResponse?.text || "")}</textarea>
      </label>
      <button class="secondary-button" type="submit">Publish Response</button>
    </form>
  `;
}

async function submitTechnicianResponse(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const text = form.elements.response.value.trim();
  if (!text) return toast("Response text is required.");
  await api(`/api/bookings/${form.dataset.responseForm}/review-response`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  toast("Public response saved.");
  await Promise.all([loadBookings(), loadTechnicians(), loadAdmin()]);
}

function estimateValue(range) {
  const matches = String(range || "").match(/\d+(\.\d+)?/g);
  if (!matches) return 0;
  const nums = matches.map(Number);
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function fileMeta(input, multiple = false) {
  const files = Array.from(input?.files || []);
  const mapped = files.map((file) => ({ name: file.name, size: file.size, type: file.type || "document" }));
  return multiple ? mapped : mapped[0] || null;
}

function technicianWizardPayload(saveAsDraft = false) {
  return {
    saveAsDraft,
    fullName: $("#tech-name").value,
    businessName: $("#tech-business").value,
    phone: $("#tech-phone").value,
    whatsapp: $("#tech-whatsapp").value || $("#tech-phone").value,
    area: $("#tech-area").value,
    trade: $("#tech-trade").value,
    categories: [$("#tech-trade").value],
    yearsExperience: $("#tech-years").value,
    credentials: $("#tech-credentials").value,
    priceRange: $("#tech-price").value || "Negotiable",
    notes: $("#tech-notes").value,
    warrantyPolicy: $("#tech-warranty").value,
    locationPolicyAccepted: $("#tech-location-policy").checked,
    availableLocationPing: $("#tech-available-ping").checked,
    serviceGuarantee: $("#tech-warranty").value || "To be agreed before work starts",
    references: [$("#tech-reference-one").value, $("#tech-reference-two").value].filter(Boolean),
    documents: {
      nationalId: fileMeta($("#tech-national-id")),
      profilePhoto: fileMeta($("#tech-profile-photo")),
      tradeCertificate: fileMeta($("#tech-trade-certificate")),
      additionalCertificates: fileMeta($("#tech-additional-certificates"), true),
      policeClearance: fileMeta($("#tech-police-clearance")),
    },
  };
}

function wizardCompletion(payload = technicianWizardPayload(true)) {
  const checks = [
    Boolean(payload.fullName && payload.phone),
    Boolean(payload.trade && payload.area && Number(payload.yearsExperience) >= 0),
    Boolean(payload.documents.nationalId),
    Boolean(payload.documents.profilePhoto),
    Boolean(payload.documents.tradeCertificate),
    Boolean(payload.references.length),
    Boolean(payload.warrantyPolicy),
    Boolean(payload.locationPolicyAccepted),
  ];
  const complete = checks.filter(Boolean).length;
  return { complete, total: checks.length, percent: Math.round((complete / checks.length) * 100), checks };
}

function renderWizard() {
  const panels = $$("[data-wizard-step]");
  if (!panels.length || !$("#wizard-progress-bar")) return;
  const steps = $$("#wizard-steps li");
  panels.forEach((panel) => panel.classList.toggle("is-active", Number(panel.dataset.wizardStep) === state.wizardStep));
  steps.forEach((step, index) => {
    step.classList.toggle("is-active", index === state.wizardStep);
    step.classList.toggle("is-complete", index < state.wizardStep);
  });
  const completion = wizardCompletion();
  $("#wizard-progress-bar").style.width = `${completion.percent}%`;
  $("#wizard-progress-text").textContent = `${completion.percent}% complete`;
  $("#wizard-status").textContent = state.saveTechnicianAsDraft ? "Draft" : "Pending Verification";
  $("#wizard-back").disabled = state.wizardStep === 0;
  $("#wizard-next").style.display = state.wizardStep === panels.length - 1 ? "none" : "inline-flex";
  $("#wizard-submit").style.display = state.wizardStep === panels.length - 1 ? "inline-flex" : "none";
  const review = $("#wizard-review");
  if (review) {
    const payload = technicianWizardPayload(true);
    review.innerHTML = `
      <div class="profile-metrics">
        <div><dt>Name</dt><dd>${escapeHtml(payload.fullName || "-")}</dd></div>
        <div><dt>Trade</dt><dd>${escapeHtml(payload.trade || "-")}</dd></div>
        <div><dt>Area</dt><dd>${escapeHtml(payload.area || "-")}</dd></div>
        <div><dt>Documents</dt><dd>${completion.complete}/${completion.total}</dd></div>
      </div>
      <div class="badge-row">
        ${payload.documents.nationalId ? badge("National ID uploaded", "good") : badge("National ID missing", "muted")}
        ${payload.documents.tradeCertificate ? badge("Trade certificate uploaded", "good") : badge("Trade certificate missing", "muted")}
        ${payload.references.length ? badge("References provided", "good") : badge("References missing", "muted")}
        ${payload.warrantyPolicy ? badge("Warranty offered", "good") : badge("Warranty missing", "muted")}
        ${payload.locationPolicyAccepted ? badge("Active-job location policy accepted", "good") : badge("Location policy required", "danger")}
      </div>
    `;
  }
}

async function submitTechnician(event) {
  event.preventDefault();
  state.saveTechnicianAsDraft = false;
  const payload = technicianWizardPayload(false);
  await api("/api/technicians", { method: "POST", body: JSON.stringify(payload) });
  event.target.reset();
  state.wizardStep = 0;
  renderWizard();
  toast("Profile submitted for verification.");
  await Promise.all([loadTechnicians(), loadAdmin()]);
}

async function saveTechnicianDraft() {
  const payload = {
    ...technicianWizardPayload(true),
    saveAsDraft: true,
  };
  await api("/api/technicians", { method: "POST", body: JSON.stringify(payload) });
  state.saveTechnicianAsDraft = true;
  toast("Draft saved.");
  await Promise.all([loadTechnicians(), loadAdmin()]);
}

async function loadAdmin() {
  const [customers, bookings, summary, technicians, payments] = await Promise.all([
    api("/api/customers"),
    api("/api/bookings"),
    api("/api/admin/summary"),
    api("/api/technicians?admin=true"),
    api("/api/payments"),
  ]);
  state.customers = customers;
  state.bookings = bookings;
  state.summary = summary;
  state.adminTechnicians = technicians;
  state.payments = payments;
  renderAdmin();
  if (state.activeProfileId) renderTechnicianProfile();
}

function renderAdmin() {
  $("#admin-metrics").innerHTML = [
    statCard("Total bookings", state.summary.totalBookings),
    statCard("Active jobs", state.summary.activeJobs || 0),
    statCard("Travelling techs", state.summary.travellingTechnicians || 0),
    statCard("Jobs in progress", state.summary.jobsInProgress || 0),
    statCard("Delayed jobs", state.summary.delayedJobs || 0),
    statCard("Location disabled", state.summary.locationDisabledJobs || 0),
    statCard("Completed today", state.summary.completedToday || 0),
    statCard("Cancelled jobs", state.summary.cancelledJobs || 0),
    statCard("Completed jobs", state.summary.completedJobs),
    statCard("Active technicians", state.summary.activeTechnicians),
    statCard("Pending approvals", state.summary.pendingApprovals),
    statCard("Open disputes", state.summary.disputes),
    statCard("Pending payments", state.summary.pendingPayments || 0),
    statCard("Verified payments", state.summary.verifiedPayments || 0),
    statCard("Est. platform revenue", `$${state.summary.estimatedRevenue}`),
  ].join("");
  const technicianFilter = $("#admin-job-technician-filter");
  if (technicianFilter) {
    const current = technicianFilter.value;
    technicianFilter.innerHTML = [`<option value="">All technicians</option>`, ...state.adminTechnicians.map((tech) => `<option value="${tech.id}">${escapeHtml(tech.fullName)}</option>`)].join("");
    technicianFilter.value = current;
  }
  renderAdminTechnicians();
  renderAdminBookings();
  renderAdminCustomers();
  renderAdminPayments();
}

function renderAdminTechnicians() {
  $("#admin-technicians").innerHTML = state.adminTechnicians
    .map(
      (technician) => `
      <article class="admin-item trust-admin-row">
        <div>
          <div class="tech-top">
            <div class="score-ring small" style="--score:${technician.trustScore}"><strong>${technician.trustScore}</strong></div>
            <div>
              <h3>${escapeHtml(technician.fullName)}</h3>
              <p>${escapeHtml(technician.trade)} - ${escapeHtml(technician.area)} - ${escapeHtml(technician.verificationStatus)}</p>
            </div>
          </div>
          ${renderVerificationProgress(technician)}
          <div class="badge-row">${technician.badges.map((item) => badge(item, item.includes("Verified") || item.includes("Approved") || item.includes("Warranty") ? "good" : "muted")).join("")}</div>
          <dl class="mini-details">
            <div><dt>Completed jobs</dt><dd>${escapeHtml(technician.completedJobs)}</dd></div>
            <div><dt>Rating</dt><dd>${escapeHtml(technician.rating || "New")}</dd></div>
            <div><dt>Complaints</dt><dd>${escapeHtml(technician.trustStatuses.complaintCount || 0)}</dd></div>
            <div><dt>Profile views</dt><dd>${escapeHtml(technician.profileViews || 0)}</dd></div>
          </dl>
          <div class="trust-breakdown compact">
            ${Object.entries(technician.trustBreakdown || {})
              .map(([key, points]) => `<span>${escapeHtml(trustLabels[key] || key)} <strong>${points}/${state.config.trustWeights[key]}</strong></span>`)
              .join("")}
          </div>
          <div class="document-list">${renderDocumentList(technician.documents)}</div>
          ${renderTrustHistory(technician)}
          ${technician.informationRequest ? `<p class="dispute-note">More information requested: ${escapeHtml(technician.informationRequest)}</p>` : ""}
        </div>
        <div class="admin-controls">
          <label class="check-row"><input data-admin-toggle="${technician.id}:identityVerified" type="checkbox" ${technician.trustStatuses.identityStatus === "Verified" ? "checked" : ""} /><span>Identity verified</span></label>
          <label class="check-row"><input data-admin-toggle="${technician.id}:qualificationsVerified" type="checkbox" ${technician.trustStatuses.qualificationStatus === "Verified" ? "checked" : ""} /><span>Qualification verified</span></label>
          <label class="check-row"><input data-admin-toggle="${technician.id}:warrantyOffered" type="checkbox" ${technician.trustStatuses.warrantyOffered ? "checked" : ""} /><span>Warranty offered</span></label>
          <label class="check-row"><input data-admin-toggle="${technician.id}:adminRecommended" type="checkbox" ${technician.trustStatuses.adminRecommended ? "checked" : ""} /><span>Recommend technician</span></label>
          <label class="check-row"><input data-admin-toggle="${technician.id}:backgroundChecked" type="checkbox" ${technician.trustStatuses.backgroundChecked ? "checked" : ""} /><span>Background checked</span></label>
          <label class="check-row"><input data-admin-toggle="${technician.id}:premiumProfessional" type="checkbox" ${technician.trustStatuses.premiumProfessional ? "checked" : ""} /><span>Premium professional</span></label>
          <div class="two-column">
            <label><span>Trust adjustment</span><input type="number" min="-20" max="20" data-admin-number="${technician.id}:trustScoreAdjustment" value="${escapeHtml(technician.trustScoreAdjustment || 0)}" /></label>
            <label><span>Complaints</span><input type="number" min="0" data-admin-number="${technician.id}:complaintCount" value="${escapeHtml(technician.trustStatuses.complaintCount || 0)}" /></label>
          </div>
          <div class="two-column">
            <label><span>Completed jobs</span><input type="number" min="0" data-admin-number="${technician.id}:completedJobs" value="${escapeHtml(technician.completedJobs || 0)}" /></label>
            <label><span>Rating</span><input type="number" min="0" max="5" step="0.1" data-admin-number="${technician.id}:rating" value="${escapeHtml(technician.rating || 0)}" /></label>
          </div>
          <label><span>Profile views</span><input type="number" min="0" data-admin-number="${technician.id}:profileViews" value="${escapeHtml(technician.profileViews || 0)}" /></label>
          <label><span>Internal notes</span><textarea rows="3" data-admin-notes="${technician.id}" placeholder="Private verification notes">${escapeHtml(technician.internalNotes || technician.verificationNotes || "")}</textarea></label>
          <label><span>Request more information</span><input data-admin-request="${technician.id}" value="${escapeHtml(technician.informationRequest || "")}" placeholder="e.g. Upload clearer National ID" /></label>
          <button class="secondary-button" type="button" data-admin-tech="${technician.id}:Approved">Approve</button>
          <button class="ghost-button" type="button" data-admin-tech="${technician.id}:Rejected">Reject</button>
          <button class="ghost-button" type="button" data-admin-more-info="${technician.id}">Request More Info</button>
          <button class="ghost-button danger" type="button" data-admin-suspend="${technician.id}">Suspend</button>
        </div>
      </article>`
    )
    .join("");

  $$("[data-admin-tech]").forEach((button) => {
    button.addEventListener("click", () => {
      const [id, verificationStatus] = button.dataset.adminTech.split(":");
      const notes = document.querySelector(`[data-admin-notes="${id}"]`)?.value || "";
      updateTechnician(id, { verificationStatus, idChecked: verificationStatus === "Approved", internalNotes: notes });
    });
  });
  $$("[data-admin-suspend]").forEach((button) => {
    button.addEventListener("click", () => updateTechnician(button.dataset.adminSuspend, { suspended: true }));
  });
  $$("[data-admin-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      const [id, field] = input.dataset.adminToggle.split(":");
      updateTechnician(id, { [field]: input.checked });
    });
  });
  $$("[data-admin-number]").forEach((input) => {
    input.addEventListener("change", () => {
      const [id, field] = input.dataset.adminNumber.split(":");
      updateTechnician(id, { [field]: Number(input.value || 0) });
    });
  });
  $$("[data-admin-notes]").forEach((textarea) => {
    textarea.addEventListener("change", () => updateTechnician(textarea.dataset.adminNotes, { internalNotes: textarea.value }));
  });
  $$("[data-admin-more-info]").forEach((button) => {
    button.addEventListener("click", () => {
      const request = document.querySelector(`[data-admin-request="${button.dataset.adminMoreInfo}"]`)?.value || "Please provide more verification information.";
      updateTechnician(button.dataset.adminMoreInfo, { verificationStatus: "Pending Verification", informationRequest: request });
    });
  });
}

function verificationProgressFor(technician) {
  const docs = technician.documents || {};
  const checks = [
    Boolean(docs.nationalId),
    Boolean(docs.profilePhoto),
    Boolean(docs.tradeCertificate),
    Boolean(technician.references?.length),
    Boolean(technician.warrantyPolicy || technician.trustStatuses?.warrantyOffered),
  ];
  return { complete: checks.filter(Boolean).length, total: checks.length, percent: Math.round((checks.filter(Boolean).length / checks.length) * 100) };
}

function renderVerificationProgress(technician) {
  const progress = verificationProgressFor(technician);
  return `<div class="verification-progress compact"><div class="progress-track"><i style="width:${progress.percent}%"></i></div><strong>${progress.percent}% complete (${progress.complete}/${progress.total})</strong></div>`;
}

function renderDocumentList(documents = {}) {
  const rows = [
    ["National ID", documents.nationalId],
    ["Profile photo", documents.profilePhoto],
    ["Trade certificate", documents.tradeCertificate],
    ["Additional certificates", documents.additionalCertificates],
    ["Police clearance", documents.policeClearance],
  ];
  return rows
    .map(([label, value]) => {
      const files = Array.isArray(value) ? value : value ? [value] : [];
      return `<div><strong>${escapeHtml(label)}</strong><span>${files.length ? files.map((file) => escapeHtml(file.name)).join(", ") : "Not uploaded"}</span></div>`;
    })
    .join("");
}

function serviceReportCountForTechnician(technicianId) {
  return state.bookings.filter((booking) => booking.technicianId === technicianId && booking.serviceReport).length;
}

async function updateTechnician(id, payload) {
  await api(`/api/technicians/${id}/admin`, { method: "PATCH", body: JSON.stringify(payload) });
  toast("Technician record updated.");
  await Promise.all([loadTechnicians(), loadAdmin()]);
}

function renderAdminBookings() {
  const target = $("#admin-bookings");
  if (!target) return;
  const selectedStatus = $("#admin-booking-status-filter")?.value || "";
  const selectedCity = $("#admin-job-city-filter")?.value || "";
  const selectedTrade = $("#admin-job-trade-filter")?.value || "";
  const selectedTechnician = $("#admin-job-technician-filter")?.value || "";
  const selectedTrust = Number($("#admin-job-trust-filter")?.value || 0);
  const visibleBookings = state.bookings.filter((booking) => {
    if (selectedStatus && booking.status !== selectedStatus) return false;
    if (selectedCity && booking.area !== selectedCity) return false;
    if (selectedTrade && booking.category !== selectedTrade) return false;
    if (selectedTechnician && Number(booking.technicianId) !== Number(selectedTechnician)) return false;
    if (selectedTrust && Number(booking.technicianTrustScore || 0) < selectedTrust) return false;
    return true;
  });
  const activeBookings = state.bookings.filter((booking) => ["Accepted", "Travelling", "Nearby", "Arrived", "Working", "Paused"].includes(booking.status));
  const activeOpsSummary = `
    <div class="ops-summary">
      <div>
        <strong>Active job visibility</strong>
        <p>Admin can monitor active jobs, simulated technician status, placeholder locations, ETA variance and location-permission risk.</p>
      </div>
      <div class="stats-row compact-stats">
        ${statCard("Active jobs", activeBookings.length)}
        ${statCard("Delayed", activeBookings.filter((booking) => booking.etaDetails?.isDelayed).length)}
        ${statCard("Location disabled", activeBookings.filter((booking) => booking.locationDisabledDuringActiveJob || booking.locationPermissionStatus === "Refused").length)}
        ${statCard("Tracking active", activeBookings.filter((booking) => booking.locationTrackingActive).length)}
      </div>
    </div>
  `;
  target.innerHTML = `${activeOpsSummary}${
    visibleBookings
    .map(
      (booking) => `
      <article class="admin-item">
        <div>
          <h3>${escapeHtml(booking.bookingCode || `#${booking.id}`)} - ${escapeHtml(booking.category)}</h3>
          <p>${escapeHtml(booking.customerName)} - ${escapeHtml(booking.customerPhone)} - ${escapeHtml(booking.area)}</p>
          <p>${escapeHtml(booking.address || "Address not supplied")} - ${escapeHtml(booking.issue)}</p>
          <p><strong>${escapeHtml(booking.status)}</strong> - ${escapeHtml(booking.urgency)} - ${escapeHtml(booking.preferredTime || "Flexible")} - ETA ${escapeHtml(booking.estimatedArrival || "TBC")}</p>
          <div class="ops-flag-row">
            ${booking.etaDetails?.isDelayed ? badge(`Delayed ${booking.etaDetails.currentDelayMinutes || booking.etaDetails.varianceLabel}`, "danger") : badge("ETA normal", "good")}
            ${booking.locationDisabledDuringActiveJob || booking.locationPermissionStatus === "Refused" ? badge("Location disabled during active job", "danger") : badge(`Location ${booking.locationPermissionStatus || "Not requested"}`, booking.locationPermissionStatus === "Granted" ? "good" : "muted")}
            ${booking.locationTrackingActive ? badge("Live tracking active", "good") : badge("Tracking off", "muted")}
          </div>
          ${
            (booking.adminAlerts || []).length
              ? `<div class="admin-alert-list">${booking.adminAlerts
                  .slice(0, 3)
                  .map((alert) => `<p><strong>Admin alert:</strong> ${escapeHtml(alert.message)} <span>${alert.at ? new Date(alert.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : ""}</span></p>`)
                  .join("")}</div>`
              : ""
          }
          ${renderJobProgress(booking)}
          ${!["Submitted", "Waiting for Technician"].includes(booking.status) ? renderLiveOpsCard(booking, "admin") : ""}
          ${booking.transport ? renderTransportSummary(booking.transport, "admin") : ""}
          ${renderStatusTimeline(booking.statusHistory)}
          <div class="booking-meta">
            <span>Duration: ${escapeHtml(booking.jobTimer?.label || "0 min")}</span>
            <span>Labour: ${escapeHtml(booking.jobTimer?.labourHours || 0)} hrs</span>
          </div>
          ${booking.serviceReport ? renderServiceReport(booking.serviceReport) : ""}
          ${booking.dispute ? `<p class="dispute-note">${escapeHtml(booking.dispute.reason)} ${booking.dispute.resolved ? "(resolved)" : "(open)"}</p>` : ""}
        </div>
        <div class="admin-controls">
          <label>
            <span>Assign technician</span>
          <select data-admin-assign="${booking.id}">
            <option value="">Unassigned</option>
            ${state.adminTechnicians
              .map((tech) => `<option value="${tech.id}" ${tech.id === booking.technicianId ? "selected" : ""}>${escapeHtml(tech.fullName)}</option>`)
              .join("")}
          </select>
          </label>
          <label>
            <span>Status</span>
          <select data-admin-status="${booking.id}">
            ${state.config.bookingStatuses.map((status) => `<option ${status === booking.status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
          </select>
          </label>
          <label><span>Cancellation reason</span><input data-admin-cancel-reason="${booking.id}" value="${escapeHtml(booking.cancellationReason || "")}" placeholder="Reason if cancelling" /></label>
          <label><span>Transport override</span><input data-admin-transport-fee="${booking.id}" type="number" min="0" step="0.01" value="${escapeHtml(booking.transportFee || booking.transport?.transportFee || 0)}" /></label>
          <label><span>Override note</span><input data-admin-transport-note="${booking.id}" placeholder="Reason for manual override" /></label>
          <button class="secondary-button" type="button" data-admin-transport-override="${booking.id}">Update Transport Fee</button>
          <button class="secondary-button" type="button" data-admin-pause="${booking.id}">Pause job</button>
          <button class="ghost-button danger" type="button" data-admin-cancel="${booking.id}">Cancel booking</button>
          ${booking.dispute && !booking.dispute.resolved ? `<button class="secondary-button" type="button" data-resolve-dispute="${booking.id}">Resolve dispute</button>` : ""}
        </div>
      </article>`
    )
    .join("") || `<div class="empty-state">No bookings match these operations filters.</div>`
  }`;

  $$("[data-admin-assign]").forEach((select) =>
    select.addEventListener("change", () => updateBooking(select.dataset.adminAssign, { technicianId: select.value ? Number(select.value) : null }, "Booking assignment updated."))
  );
  $$("[data-admin-status]").forEach((select) =>
    select.addEventListener("change", () => updateBooking(select.dataset.adminStatus, { status: select.value }, "Booking status updated."))
  );
  $$("[data-admin-cancel]").forEach((button) =>
    button.addEventListener("click", () => {
      const reason = document.querySelector(`[data-admin-cancel-reason="${button.dataset.adminCancel}"]`)?.value || "Cancelled by admin.";
      updateBooking(button.dataset.adminCancel, { status: "Cancelled", cancelReason: reason }, "Booking cancelled.");
    })
  );
  $$("[data-admin-pause]").forEach((button) =>
    button.addEventListener("click", () => updateBooking(button.dataset.adminPause, { status: "Paused", note: "Paused by admin." }, "Job paused."))
  );
  $$("[data-admin-transport-override]").forEach((button) =>
    button.addEventListener("click", () => {
      const id = button.dataset.adminTransportOverride;
      const fee = document.querySelector(`[data-admin-transport-fee="${id}"]`)?.value || 0;
      const note = document.querySelector(`[data-admin-transport-note="${id}"]`)?.value || "Admin reviewed transport fee.";
      updateTransportFee(id, { transportFee: fee, note });
    })
  );
  $$("[data-resolve-dispute]").forEach((button) =>
    button.addEventListener("click", () => updateBooking(button.dataset.resolveDispute, { resolveDispute: true }, "Dispute marked resolved."))
  );
}

async function updateTransportFee(id, payload) {
  await api(`/api/bookings/${id}/transport`, { method: "PATCH", body: JSON.stringify(payload) });
  toast("Transport fee updated with audit history.");
  await Promise.all([loadBookings(), loadAdmin()]);
}

function renderAdminCustomers() {
  $("#admin-customers").innerHTML = state.customers
    .map(
      (customer) => `
      <article class="admin-item compact">
        <div>
          <h3>${escapeHtml(customer.fullName)}</h3>
          <p>${escapeHtml(customer.area)}</p>
        </div>
        <div class="inline-actions">
          <a class="call-button" href="tel:${escapeHtml(customer.phone)}">Call</a>
          <a class="whatsapp-button" href="https://wa.me/${escapeHtml(customer.whatsapp.replace("+", ""))}" target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
      </article>`
    )
    .join("");
}

function paymentCounts() {
  return {
    all: state.payments.length,
    pending: state.payments.filter((payment) => payment.status === "Awaiting Verification" || payment.verificationStatus === "Pending").length,
    verified: state.payments.filter((payment) => payment.status === "Paid").length,
    rejected: state.payments.filter((payment) => payment.status === "Rejected").length,
    cash: state.payments.filter((payment) => payment.method === "Cash").length,
    ecocash: state.payments.filter((payment) => payment.method === "EcoCash").length,
    zipit: state.payments.filter((payment) => payment.method === "ZIPIT Bank Transfer").length,
    bank: state.payments.filter((payment) => payment.method === "Direct Bank Transfer").length,
  };
}

function renderAdminPayments() {
  const target = $("#admin-payments");
  if (!target) return;
  const method = $("#admin-payment-method-filter")?.value || "";
  const visible = method ? state.payments.filter((payment) => payment.method === method) : state.payments;
  const counts = paymentCounts();
  target.innerHTML = `
    <div class="stats-row compact-stats">
      ${statCard("All transactions", counts.all)}
      ${statCard("Pending", counts.pending)}
      ${statCard("Verified", counts.verified)}
      ${statCard("Rejected", counts.rejected)}
      ${statCard("Cash", counts.cash)}
      ${statCard("EcoCash", counts.ecocash)}
      ${statCard("ZIPIT", counts.zipit)}
      ${statCard("Bank", counts.bank)}
    </div>
    ${
      visible
        .map(
          (payment) => `
          <article class="admin-item payment-admin-row">
            <div>
              <div class="booking-head">
                <div>
                  <h3>${escapeHtml(payment.receipt.receiptNumber)} - ${escapeHtml(payment.method)}</h3>
                  <p>${escapeHtml(payment.bookingCode)} - ${escapeHtml(payment.customerName)} - ${escapeHtml(payment.technicianName)}</p>
                </div>
                ${paymentStatusBadge(payment.status)}
              </div>
              <dl class="mini-details">
                <div><dt>Amount</dt><dd>${money(payment.amount, payment.currency)}</dd></div>
                <div><dt>Reference</dt><dd>${escapeHtml(payment.reference || "Pending")}</dd></div>
                <div><dt>Verification</dt><dd>${escapeHtml(payment.verificationStatus)}</dd></div>
                <div><dt>Commission</dt><dd>${money(payment.revenue.platformCommission, payment.currency)}</dd></div>
                <div><dt>Technician earnings</dt><dd>${money(payment.revenue.technicianEarnings, payment.currency)}</dd></div>
                <div><dt>Date</dt><dd>${escapeHtml((payment.updatedAt || payment.createdAt || "").slice(0, 10))}</dd></div>
              </dl>
              ${renderReceipt(payment.receipt, payment.revenue)}
            </div>
            <div class="admin-controls">
              <label><span>Admin notes</span><textarea rows="3" data-payment-notes="${payment.id}">${escapeHtml(payment.notes || "")}</textarea></label>
              <button class="secondary-button" type="button" data-payment-action="${payment.id}:approve">Approve payment</button>
              <button class="ghost-button danger" type="button" data-payment-action="${payment.id}:reject">Reject payment</button>
              <button class="ghost-button" type="button" data-payment-action="${payment.id}:more-info">Request more information</button>
            </div>
          </article>`
        )
        .join("") || `<div class="empty-state">No payment records match this filter.</div>`
    }
  `;
  $$("[data-payment-action]").forEach((button) =>
    button.addEventListener("click", () => {
      const [id, action] = button.dataset.paymentAction.split(":");
      const notes = document.querySelector(`[data-payment-notes="${id}"]`)?.value || "";
      updatePayment(id, { action, notes });
    })
  );
}

async function updatePayment(id, payload) {
  await api(`/api/payments/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  toast("Payment record updated.");
  await Promise.all([loadBookings(), loadAdmin()]);
}

async function submitTransportSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    currency: form.elements.currency.value || "USD",
    diagnosticFee: form.elements.diagnosticFee.value,
    freeRadiusKm: form.elements.freeRadiusKm.value,
    minimumFee: form.elements.minimumFee.value,
    pricePerKm: form.elements.pricePerKm.value,
    maximumFee: form.elements.maximumFee.value,
    emergencySurcharge: form.elements.emergencySurcharge.value,
    afterHoursSurcharge: form.elements.afterHoursSurcharge.value,
    allowAdminOverride: Boolean(form.elements.allowAdminOverride.checked),
  };
  state.config.transportPricing = await api("/api/settings/transport", { method: "PATCH", body: JSON.stringify(payload) });
  populateTransportSettings();
  await loadTransportEstimate();
  toast("Transport tariff settings saved.");
}

function bindEvents() {
  const on = (selector, eventName, handler) => {
    const node = $(selector);
    if (node) node.addEventListener(eventName, handler);
  };
  ["search-input", "category-filter", "area-filter", "trust-filter", "availability-filter", "sort-filter", "verified-filter"].forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.addEventListener("input", loadTechnicians);
  });
  $("#landing-hero-search")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const request = $("#landing-search-input")?.value.trim() || "I need a verified technician.";
    openServiceMarketWhatsApp(`Hi Service Market Bot, ${request}. Please guide me from matching to job completion and EcoCash payment confirmation.`);
  });
  $$("[data-landing-category]").forEach((button) => {
    button.addEventListener("click", () => {
      openServiceMarketWhatsApp(`Hi Service Market Bot, I need help with ${button.dataset.landingCategory}. Please match me with a verified technician and manage the job process.`);
    });
  });
  $$("[data-admin-scroll]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById(button.dataset.adminScroll)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  on("#clear-filters", "click", () => {
    $("#search-input").value = "";
    $("#category-filter").value = "";
    $("#area-filter").value = "";
    $("#trust-filter").value = "";
    $("#availability-filter").value = "";
    $("#sort-filter").value = "trust";
    $("#verified-filter").checked = true;
    loadTechnicians();
  });
  on("#admin-booking-status-filter", "input", renderAdminBookings);
  ["#admin-job-city-filter", "#admin-job-trade-filter", "#admin-job-technician-filter", "#admin-job-trust-filter"].forEach((selector) => {
    const node = $(selector);
    if (node) node.addEventListener("input", renderAdminBookings);
  });
  on("#admin-payment-method-filter", "input", renderAdminPayments);
  ["#booking-area", "#booking-category", "#booking-urgency", "#booking-latitude", "#booking-longitude"].forEach((selector) => {
    const node = $(selector);
    if (node) node.addEventListener("input", loadTransportEstimate);
  });
  on("#transport-settings-form", "submit", submitTransportSettings);
  on("#booking-form", "submit", submitBooking);
  on("#technician-form", "submit", submitTechnician);
  on("#technician-form", "input", renderWizard);
  on("#technician-form", "change", renderWizard);
  on("#wizard-next", "click", () => {
    state.wizardStep = Math.min(4, state.wizardStep + 1);
    renderWizard();
  });
  on("#wizard-back", "click", () => {
    state.wizardStep = Math.max(0, state.wizardStep - 1);
    renderWizard();
  });
  on("#wizard-save-draft", "click", saveTechnicianDraft);
  renderWizard();
}

async function init() {
  try {
    initNavigation();
    state.config = await api("/api/config");
    populateSelects();
    bindEvents();
    await Promise.all([loadTechnicians(), loadBookings(), loadAdmin()]);
  } catch (error) {
    console.error(error);
    toast(error.message);
  }
}

document.addEventListener("DOMContentLoaded", init);
