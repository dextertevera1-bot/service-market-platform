const state = {
  config: null,
  technicians: [],
  adminTechnicians: [],
  bookings: [],
  customers: [],
  summary: null,
  selectedTechnician: null,
  currentTechnicianId: 1,
  reviewingBookingId: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

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

function setView(view) {
  $$(".view").forEach((node) => node.classList.toggle("is-active", node.id === `${view}-view`));
  $$(".tab").forEach((node) => node.classList.toggle("is-active", node.dataset.viewLink === view));
  window.location.hash = view;
}

function initNavigation() {
  $$("[data-view-link]").forEach((node) => {
    node.addEventListener("click", () => setView(node.dataset.viewLink));
  });
  const startView = (window.location.hash || "#customer").slice(1);
  if (["customer", "technician", "admin"].includes(startView)) setView(startView);
}

function populateSelects() {
  $("#category-filter").innerHTML = options(state.config.serviceCategories, "All categories");
  $("#area-filter").innerHTML = options(state.config.serviceAreas, "All areas");
  $("#booking-area").innerHTML = selectOptions(state.config.serviceAreas);
  $("#booking-category").innerHTML = selectOptions(state.config.serviceCategories);
  $("#booking-payment-method").innerHTML = selectOptions(state.config.paymentMethods);
  $("#tech-area").innerHTML = selectOptions(state.config.serviceAreas);
  $("#tech-trade").innerHTML = selectOptions(state.config.serviceCategories);
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

function ratingOptions(selected = 5) {
  return [5, 4, 3, 2, 1]
    .map((value) => `<option value="${value}" ${Number(selected) === value ? "selected" : ""}>${value}</option>`)
    .join("");
}

function renderCustomerStats() {
  const verified = state.technicians.filter((tech) => tech.adminVerified).length;
  const avgResponse = Math.round(
    state.technicians.reduce((sum, tech) => sum + Number(tech.responseMinutes || 0), 0) / Math.max(1, state.technicians.length)
  );
  const jobs = state.technicians.reduce((sum, tech) => sum + Number(tech.completedJobs || 0), 0);
  $("#customer-stats").innerHTML = [
    statCard("Admin verified", verified),
    statCard("Avg response", `${avgResponse} min`),
    statCard("Completed jobs", jobs),
  ].join("");
}

function statCard(label, value) {
  return `<div class="stat-card"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function renderTechnicians() {
  if (!state.technicians.length) {
    $("#technician-list").innerHTML = `<div class="empty-state">No technicians match this search yet. Try another service area or submit an open request.</div>`;
    return;
  }
  $("#technician-list").innerHTML = state.technicians
    .map((technician) => {
      const verifiedBadge = technician.adminVerified ? badge("Admin Verified", "good") : badge(technician.verificationStatus, "muted");
      const idBadge = technician.idChecked ? badge("ID Checked", "good") : badge("ID Pending", "muted");
      return `
        <article class="technician-card">
          <div class="tech-top">
            ${technicianPhoto(technician)}
            <div>
              <h3>${escapeHtml(technician.fullName)}</h3>
              <p>${escapeHtml(technician.businessName)} - ${escapeHtml(technician.area)}</p>
            </div>
          </div>
          <div class="badge-row">${verifiedBadge}${idBadge}</div>
          <div class="review-summary">
            <strong>Review summary</strong>
            <p>${escapeHtml(technician.reviewSummary)}</p>
          </div>
          <div class="trust-row">
            <strong>${technician.trustScore}</strong>
            <span>Trust Score</span>
            <small>${escapeHtml(technician.trade)}</small>
          </div>
          <dl class="mini-details">
            <div><dt>Rating</dt><dd>${technician.rating || "New"}</dd></div>
            <div><dt>Jobs</dt><dd>${technician.completedJobs}</dd></div>
            <div><dt>Experience</dt><dd>${technician.yearsExperience} yrs</dd></div>
            <div><dt>Response</dt><dd>${technician.responseMinutes} min</dd></div>
            <div><dt>Price</dt><dd>${escapeHtml(technician.priceRange)}</dd></div>
            <div><dt>Area</dt><dd>${escapeHtml(technician.area)}</dd></div>
            <div><dt>Recommend</dt><dd>${technician.recommendRate || 0}%</dd></div>
          </dl>
          ${renderReviewPreview(technician)}
          <p class="tech-note">${escapeHtml(technician.notes)}</p>
          <div class="card-actions">
            <a class="call-button" href="${technician.callLink}">Call</a>
            <a class="whatsapp-button" href="${technician.whatsappLink}" target="_blank" rel="noreferrer">WhatsApp</a>
            <button class="primary-button" type="button" data-book-tech="${technician.id}">Request Quote</button>
          </div>
        </article>
      `;
    })
    .join("");

  $$("[data-book-tech]").forEach((button) => {
    button.addEventListener("click", () => selectTechnician(Number(button.dataset.bookTech)));
  });
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

function selectTechnician(id) {
  const technician = state.technicians.find((item) => item.id === id);
  if (!technician) return;
  state.selectedTechnician = technician;
  $("#booking-technician-id").value = technician.id;
  $("#booking-category").value = technician.categories[0] || technician.trade;
  $("#booking-area").value = technician.area;
  $("#booking-estimate").textContent = `Estimated range: ${technician.priceRange} (${technician.currency || "USD"}). Final price agreed after inspection.`;
  $("#selected-technician").innerHTML = `Selected: <strong>${escapeHtml(technician.fullName)}</strong> in ${escapeHtml(technician.area)}.`;
  document.querySelector(".booking-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadTechnicians() {
  const params = new URLSearchParams();
  if ($("#search-input").value.trim()) params.set("search", $("#search-input").value.trim());
  if ($("#category-filter").value) params.set("category", $("#category-filter").value);
  if ($("#area-filter").value) params.set("area", $("#area-filter").value);
  if ($("#verified-filter").checked) params.set("verified", "true");
  state.technicians = await api(`/api/technicians?${params.toString()}`);
  renderCustomerStats();
  renderTechnicians();
}

async function loadBookings() {
  state.bookings = await api("/api/bookings");
  renderCustomerBookings();
  renderTechnicianJobs();
  renderAdminBookings();
}

function bookingCard(booking, actions = "") {
  const technicianLine = booking.technicianId
    ? `<p><strong>${escapeHtml(booking.technicianName)}</strong> - ${escapeHtml(booking.technicianTrade)}</p>`
    : "<p><strong>Unassigned</strong> - admin can assign a technician.</p>";
  return `
    <article class="booking-item">
      <div class="booking-head">
        <div>
          <span class="status-pill">${escapeHtml(booking.status)}</span>
          <h3>${escapeHtml(booking.category)} in ${escapeHtml(booking.area)}</h3>
        </div>
        <strong>${escapeHtml(booking.estimatedPriceRange)}</strong>
      </div>
      ${technicianLine}
      <p>${escapeHtml(booking.issue)}</p>
      <div class="booking-meta">
        <span>${escapeHtml(booking.urgency)}</span>
        <span>${escapeHtml(booking.paymentMethod)}</span>
        <span>${escapeHtml(booking.paymentStatus)}</span>
      </div>
      ${booking.technicianCallLink ? `<div class="inline-actions"><a class="call-button" href="${booking.technicianCallLink}">Call technician</a><a class="whatsapp-button" href="${booking.technicianWhatsappLink}" target="_blank" rel="noreferrer">WhatsApp</a></div>` : ""}
      ${booking.review ? renderBookingReview(booking.review) : ""}
      ${booking.dispute ? `<p class="dispute-note">Problem reported: ${escapeHtml(booking.dispute.reason)} ${booking.dispute.resolved ? "(resolved)" : "(open)"}</p>` : ""}
      ${actions}
    </article>
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
  const recent = state.bookings.slice(0, 6);
  $("#customer-bookings").innerHTML =
    recent
      .map((booking) =>
        bookingCard(
          booking,
          `<div class="inline-actions">
            <button class="secondary-button" type="button" data-complete-booking="${booking.id}">Confirm complete</button>
            <button class="ghost-button" type="button" data-review-booking="${booking.id}" ${booking.status !== "Completed" ? "disabled" : ""}>Leave review</button>
            <button class="ghost-button danger" type="button" data-dispute-booking="${booking.id}">Report problem</button>
          </div>
          ${state.reviewingBookingId === booking.id ? renderReviewForm(booking) : ""}`
        )
      )
      .join("") || `<div class="empty-state">No bookings yet.</div>`;

  $$("[data-complete-booking]").forEach((button) =>
    button.addEventListener("click", () => updateBooking(button.dataset.completeBooking, { customerConfirmedComplete: true }, "Job marked completed."))
  );
  $$("[data-review-booking]").forEach((button) =>
    button.addEventListener("click", () => {
      state.reviewingBookingId = Number(button.dataset.reviewBooking);
      renderCustomerBookings();
    })
  );
  $$("[data-dispute-booking]").forEach((button) =>
    button.addEventListener("click", () => reportProblem(button.dataset.disputeBooking))
  );
  $$("[data-review-form]").forEach((form) => form.addEventListener("submit", submitStructuredReview));
  $$("[data-cancel-review]").forEach((button) =>
    button.addEventListener("click", () => {
      state.reviewingBookingId = null;
      renderCustomerBookings();
    })
  );
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
    paymentMethod: $("#booking-payment-method").value,
    estimatedPriceRange: selectedTechnician ? selectedTechnician.priceRange : "Request quote",
  };
  await api("/api/bookings", { method: "POST", body: JSON.stringify(payload) });
  event.target.reset();
  $("#booking-technician-id").value = "";
  $("#booking-estimate").textContent = "Estimated price range appears after selecting a technician.";
  $("#selected-technician").textContent = "Choose a technician or submit an open request.";
  state.selectedTechnician = null;
  toast("Booking request submitted. The technician or admin can contact you by phone or WhatsApp.");
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
  await api(`/api/bookings/${id}/status`, { method: "PATCH", body: JSON.stringify(payload) });
  toast(message);
  await Promise.all([loadBookings(), loadAdmin(), loadTechnicians()]);
}

function renderTechnicianJobs() {
  const jobs = state.bookings.filter((booking) => booking.technicianId === state.currentTechnicianId);
  const completed = jobs.filter((booking) => booking.status === "Completed");
  const estimatedEarnings = completed.reduce((sum, booking) => sum + estimateValue(booking.estimatedPriceRange), 0);
  $("#technician-earnings").innerHTML = `<strong>$${Math.round(estimatedEarnings)}</strong><span>simple completed earnings estimate</span>`;
  $("#technician-jobs").innerHTML =
    jobs
      .map((booking) =>
        bookingCard(
          booking,
          `<label class="notes-label"><span>Job notes</span><textarea rows="2" data-job-notes="${booking.id}">${escapeHtml(booking.jobNotes)}</textarea></label>
          ${booking.review ? renderTechnicianResponseForm(booking) : ""}
          <div class="inline-actions">
            <button class="secondary-button" type="button" data-tech-status="${booking.id}:Accepted">Accept</button>
            <button class="secondary-button" type="button" data-tech-status="${booking.id}:In Progress">In progress</button>
            <button class="secondary-button" type="button" data-tech-status="${booking.id}:Completed">Complete</button>
            <button class="ghost-button danger" type="button" data-tech-status="${booking.id}:Rejected">Reject</button>
          </div>`
        )
      )
      .join("") || `<div class="empty-state">No jobs assigned to this demo technician.</div>`;

  $$("[data-tech-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const [id, status] = button.dataset.techStatus.split(":");
      const notes = document.querySelector(`[data-job-notes="${id}"]`)?.value || "";
      updateBooking(id, { status, jobNotes: notes }, `Job moved to ${status}.`);
    });
  });
  $$("[data-response-form]").forEach((form) => form.addEventListener("submit", submitTechnicianResponse));
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

async function submitTechnician(event) {
  event.preventDefault();
  const payload = {
    fullName: $("#tech-name").value,
    businessName: $("#tech-business").value,
    phone: $("#tech-phone").value,
    whatsapp: $("#tech-whatsapp").value,
    area: $("#tech-area").value,
    trade: $("#tech-trade").value,
    categories: [$("#tech-trade").value],
    yearsExperience: $("#tech-years").value,
    credentials: $("#tech-credentials").value,
    priceRange: $("#tech-price").value || "Negotiable",
  };
  await api("/api/technicians", { method: "POST", body: JSON.stringify(payload) });
  event.target.reset();
  toast("Profile submitted for admin review.");
  await Promise.all([loadTechnicians(), loadAdmin()]);
}

async function loadAdmin() {
  const [customers, bookings, summary, technicians] = await Promise.all([
    api("/api/customers"),
    api("/api/bookings"),
    api("/api/admin/summary"),
    api("/api/technicians?admin=true"),
  ]);
  state.customers = customers;
  state.bookings = bookings;
  state.summary = summary;
  state.adminTechnicians = technicians;
  renderAdmin();
}

function renderAdmin() {
  $("#admin-metrics").innerHTML = [
    statCard("Total bookings", state.summary.totalBookings),
    statCard("Completed jobs", state.summary.completedJobs),
    statCard("Active technicians", state.summary.activeTechnicians),
    statCard("Pending approvals", state.summary.pendingApprovals),
    statCard("Open disputes", state.summary.disputes),
    statCard("Est. platform revenue", `$${state.summary.estimatedRevenue}`),
  ].join("");
  renderAdminTechnicians();
  renderAdminBookings();
  renderAdminCustomers();
}

function renderAdminTechnicians() {
  $("#admin-technicians").innerHTML = state.adminTechnicians
    .map(
      (technician) => `
      <article class="admin-item">
        <div>
          <h3>${escapeHtml(technician.fullName)}</h3>
          <p>${escapeHtml(technician.trade)} - ${escapeHtml(technician.area)} - Trust ${technician.trustScore}</p>
          <div class="badge-row">${technician.badges.map((item) => badge(item, item.includes("Verified") || item.includes("Checked") ? "good" : "muted")).join("")}</div>
        </div>
        <div class="inline-actions">
          <button class="secondary-button" type="button" data-admin-tech="${technician.id}:Admin Verified">Approve</button>
          <button class="ghost-button" type="button" data-admin-tech="${technician.id}:Rejected">Reject</button>
          <button class="ghost-button danger" type="button" data-admin-suspend="${technician.id}">Suspend</button>
        </div>
      </article>`
    )
    .join("");

  $$("[data-admin-tech]").forEach((button) => {
    button.addEventListener("click", () => {
      const [id, verificationStatus] = button.dataset.adminTech.split(":");
      updateTechnician(id, { verificationStatus, idChecked: verificationStatus === "Admin Verified" });
    });
  });
  $$("[data-admin-suspend]").forEach((button) => {
    button.addEventListener("click", () => updateTechnician(button.dataset.adminSuspend, { suspended: true }));
  });
}

async function updateTechnician(id, payload) {
  await api(`/api/technicians/${id}/admin`, { method: "PATCH", body: JSON.stringify(payload) });
  toast("Technician record updated.");
  await Promise.all([loadTechnicians(), loadAdmin()]);
}

function renderAdminBookings() {
  const target = $("#admin-bookings");
  if (!target) return;
  target.innerHTML = state.bookings
    .map(
      (booking) => `
      <article class="admin-item">
        <div>
          <h3>#${booking.id} - ${escapeHtml(booking.category)}</h3>
          <p>${escapeHtml(booking.customerName)} - ${escapeHtml(booking.area)} - ${escapeHtml(booking.issue)}</p>
          <p><strong>${escapeHtml(booking.status)}</strong> / ${escapeHtml(booking.paymentStatus)}</p>
          ${booking.dispute ? `<p class="dispute-note">${escapeHtml(booking.dispute.reason)} ${booking.dispute.resolved ? "(resolved)" : "(open)"}</p>` : ""}
        </div>
        <div class="admin-controls">
          <select data-admin-assign="${booking.id}">
            <option value="">Unassigned</option>
            ${state.adminTechnicians
              .map((tech) => `<option value="${tech.id}" ${tech.id === booking.technicianId ? "selected" : ""}>${escapeHtml(tech.fullName)}</option>`)
              .join("")}
          </select>
          <select data-admin-status="${booking.id}">
            ${state.config.bookingStatuses.map((status) => `<option ${status === booking.status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
          </select>
          <select data-admin-payment="${booking.id}">
            ${state.config.paymentStatuses.map((status) => `<option ${status === booking.paymentStatus ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
          </select>
          ${booking.dispute && !booking.dispute.resolved ? `<button class="secondary-button" type="button" data-resolve-dispute="${booking.id}">Resolve dispute</button>` : ""}
        </div>
      </article>`
    )
    .join("");

  $$("[data-admin-assign]").forEach((select) =>
    select.addEventListener("change", () => updateBooking(select.dataset.adminAssign, { technicianId: select.value ? Number(select.value) : null }, "Booking assignment updated."))
  );
  $$("[data-admin-status]").forEach((select) =>
    select.addEventListener("change", () => updateBooking(select.dataset.adminStatus, { status: select.value }, "Booking status updated."))
  );
  $$("[data-admin-payment]").forEach((select) =>
    select.addEventListener("change", () => updateBooking(select.dataset.adminPayment, { paymentStatus: select.value }, "Payment status updated."))
  );
  $$("[data-resolve-dispute]").forEach((button) =>
    button.addEventListener("click", () => updateBooking(button.dataset.resolveDispute, { resolveDispute: true }, "Dispute marked resolved."))
  );
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

function bindEvents() {
  ["search-input", "category-filter", "area-filter", "verified-filter"].forEach((id) => {
    document.getElementById(id).addEventListener("input", loadTechnicians);
  });
  $("#clear-filters").addEventListener("click", () => {
    $("#search-input").value = "";
    $("#category-filter").value = "";
    $("#area-filter").value = "";
    $("#verified-filter").checked = true;
    loadTechnicians();
  });
  $("#booking-form").addEventListener("submit", submitBooking);
  $("#technician-form").addEventListener("submit", submitTechnician);
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
