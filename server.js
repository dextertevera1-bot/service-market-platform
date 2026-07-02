const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 4173;
const PUBLIC_DIR = path.join(__dirname, "public");

const SERVICE_AREAS = [
  "Harare",
  "Bulawayo",
  "Mutare",
  "Gweru",
  "Masvingo",
  "Chitungwiza",
  "Kwekwe",
  "Victoria Falls",
];

const SERVICE_CATEGORIES = [
  "HVAC/Refrigeration",
  "Plumbing",
  "Electrical",
  "Appliance Repair",
  "Auto Mechanic",
  "Generator Repair",
  "Solar/Inverter",
  "Borehole Pumps",
  "Welding",
  "Carpentry",
  "Painting",
  "Tiling",
];

const PAYMENT_METHODS = ["Cash", "EcoCash", "Bank Transfer", "Other"];
const PAYMENT_STATUSES = ["Not Paid", "Paid to Technician", "Paid via Platform", "Disputed"];
const BOOKING_STATUSES = [
  "New Request",
  "Assigned",
  "Accepted",
  "Rejected",
  "In Progress",
  "Completed",
  "Cancelled",
  "Disputed",
];
const VERIFICATION_STATUSES = ["Pending", "Admin Verified", "Rejected", "Suspended"];
const REVIEW_CATEGORIES = ["professionalism", "communication", "quality", "punctuality", "cleanliness", "value"];
const REVIEW_LABELS = {
  professionalism: "professionalism",
  communication: "communication",
  quality: "quality",
  punctuality: "punctuality",
  cleanliness: "cleanliness",
  value: "value",
};

let technicians = [
  {
    id: 1,
    fullName: "Tendai Moyo",
    businessName: "Moyo Cool Systems",
    trade: "HVAC/Refrigeration",
    categories: ["HVAC/Refrigeration", "Appliance Repair"],
    area: "Harare",
    phone: "+263771234567",
    whatsapp: "+263771234567",
    yearsExperience: 12,
    verificationStatus: "Admin Verified",
    idChecked: true,
    licenseStatus: "Valid refrigeration trade license",
    insuranceStatus: "Active public liability cover",
    credentials: ["Refrigeration and air conditioning certificate", "Commercial cold-room service training"],
    priceRange: "$35-$120",
    currency: "USD",
    rating: 4.8,
    completedJobs: 142,
    responseMinutes: 18,
    serviceGuarantee: "7-day workmanship follow-up",
    suspended: false,
    notes: "Works on domestic AC units, cold rooms, and upright fridges.",
    reviews: [
      { customerName: "R. Chari", rating: 5, text: "Arrived the same afternoon and fixed the freezer leak." },
      { customerName: "M. Banda", rating: 5, text: "Clear pricing and professional work." },
    ],
  },
  {
    id: 2,
    fullName: "Rudo Ndlovu",
    businessName: "Ndlovu Plumbing",
    trade: "Plumbing",
    categories: ["Plumbing", "Borehole Pumps"],
    area: "Bulawayo",
    phone: "+263772345678",
    whatsapp: "+263772345678",
    yearsExperience: 9,
    verificationStatus: "Admin Verified",
    idChecked: true,
    licenseStatus: "City plumbing permit checked",
    insuranceStatus: "Basic job liability cover",
    credentials: ["Domestic plumbing certificate", "Pump installation training"],
    priceRange: "$25-$90",
    currency: "USD",
    rating: 4.7,
    completedJobs: 96,
    responseMinutes: 24,
    serviceGuarantee: "Leak repair recheck within 48 hours",
    suspended: false,
    notes: "Specialises in burst pipes, blocked drains, geysers, and pump faults.",
    reviews: [{ customerName: "T. Sibanda", rating: 5, text: "Good communication on WhatsApp and neat finish." }],
  },
  {
    id: 3,
    fullName: "Farai Chigwedere",
    businessName: "Brightline Electrical",
    trade: "Electrical",
    categories: ["Electrical", "Solar/Inverter", "Generator Repair"],
    area: "Chitungwiza",
    phone: "+263773456789",
    whatsapp: "+263773456789",
    yearsExperience: 14,
    verificationStatus: "Admin Verified",
    idChecked: true,
    licenseStatus: "Journeyman electrician card checked",
    insuranceStatus: "Active",
    credentials: ["Electrical journeyman card", "Hybrid inverter installation certificate"],
    priceRange: "$30-$160",
    currency: "USD",
    rating: 4.9,
    completedJobs: 188,
    responseMinutes: 16,
    serviceGuarantee: "Workmanship guarantee on approved installations",
    suspended: false,
    notes: "Handles DB boards, inverter installs, changeovers, and generator wiring.",
    reviews: [{ customerName: "L. Mutsvangwa", rating: 5, text: "Explained the fault and isolated the unsafe circuit." }],
  },
  {
    id: 4,
    fullName: "Nyasha Dube",
    businessName: "Dube Pumps and Power",
    trade: "Borehole Pumps",
    categories: ["Borehole Pumps", "Generator Repair", "Solar/Inverter"],
    area: "Mutare",
    phone: "+263774567890",
    whatsapp: "+263774567890",
    yearsExperience: 8,
    verificationStatus: "Pending",
    idChecked: true,
    licenseStatus: "Credentials under admin review",
    insuranceStatus: "Not submitted",
    credentials: ["Pump diagnostics short course"],
    priceRange: "$40-$180",
    currency: "USD",
    rating: 4.5,
    completedJobs: 61,
    responseMinutes: 35,
    serviceGuarantee: "Inspection report before parts purchase",
    suspended: false,
    notes: "Available for pump pulling, motor checks, and generator servicing.",
    reviews: [{ customerName: "P. Mutasa", rating: 4, text: "Solved the low-pressure issue after checking wiring." }],
  },
  {
    id: 5,
    fullName: "Musa Sibanda",
    businessName: "RoadReady Mechanics",
    trade: "Auto Mechanic",
    categories: ["Auto Mechanic"],
    area: "Gweru",
    phone: "+263775678901",
    whatsapp: "+263775678901",
    yearsExperience: 11,
    verificationStatus: "Admin Verified",
    idChecked: true,
    licenseStatus: "Workshop reference checked",
    insuranceStatus: "Workshop cover",
    credentials: ["Petrol and diesel diagnostics", "Fleet service record checked"],
    priceRange: "$20-$140",
    currency: "USD",
    rating: 4.6,
    completedJobs: 120,
    responseMinutes: 28,
    serviceGuarantee: "Road test and repair notes included",
    suspended: false,
    notes: "Mobile diagnostics, suspension, brakes, and no-start faults.",
    reviews: [{ customerName: "K. Ncube", rating: 5, text: "Found the sensor fault quickly and saved me towing fees." }],
  },
  {
    id: 6,
    fullName: "Linda Mavhunga",
    businessName: "Mavhunga Finish Works",
    trade: "Carpentry",
    categories: ["Carpentry", "Painting", "Tiling"],
    area: "Masvingo",
    phone: "+263776789012",
    whatsapp: "+263776789012",
    yearsExperience: 7,
    verificationStatus: "Admin Verified",
    idChecked: true,
    licenseStatus: "Portfolio and references checked",
    insuranceStatus: "Not required for small jobs",
    credentials: ["Cabinet fitting references", "Tiling portfolio checked"],
    priceRange: "Negotiable",
    currency: "Negotiable",
    rating: 4.8,
    completedJobs: 74,
    responseMinutes: 22,
    serviceGuarantee: "Snag list correction within 5 days",
    suspended: false,
    notes: "Built-ins, ceiling repairs, painting, tiling, and small renovations.",
    reviews: [{ customerName: "A. Zhou", rating: 5, text: "Beautiful cupboard work and honest material estimate." }],
  },
];

let customers = [
  { id: 1, fullName: "Blessing M.", phone: "+263778111222", whatsapp: "+263778111222", area: "Harare" },
  { id: 2, fullName: "Nomsa K.", phone: "+263779222333", whatsapp: "+263779222333", area: "Bulawayo" },
  { id: 3, fullName: "Kuda P.", phone: "+263780333444", whatsapp: "+263780333444", area: "Chitungwiza" },
];

let bookings = [
  {
    id: 1001,
    customerId: 1,
    customerName: "Blessing M.",
    customerPhone: "+263778111222",
    customerWhatsapp: "+263778111222",
    technicianId: 1,
    category: "HVAC/Refrigeration",
    area: "Harare",
    address: "Avondale, Harare",
    issue: "Fridge is running but not cooling.",
    urgency: "Normal",
    preferredTime: "Tomorrow morning",
    estimatedPriceRange: "$35-$120",
    currency: "USD",
    paymentMethod: "EcoCash",
    paymentStatus: "Not Paid",
    status: "Accepted",
    jobNotes: "Customer asked technician to call before arrival.",
    dispute: null,
    customerConfirmedComplete: false,
    review: null,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 1002,
    customerId: 2,
    customerName: "Nomsa K.",
    customerPhone: "+263779222333",
    customerWhatsapp: "+263779222333",
    technicianId: 2,
    category: "Plumbing",
    area: "Bulawayo",
    address: "Hillside, Bulawayo",
    issue: "Blocked kitchen drain and leaking trap.",
    urgency: "Urgent",
    preferredTime: "Today",
    estimatedPriceRange: "$25-$90",
    currency: "USD",
    paymentMethod: "Cash",
    paymentStatus: "Paid to Technician",
    status: "Completed",
    jobNotes: "Paid cash after completion.",
    dispute: null,
    customerConfirmedComplete: true,
    review: { rating: 5, text: "Fast and professional." },
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: 1003,
    customerId: 3,
    customerName: "Kuda P.",
    customerPhone: "+263780333444",
    customerWhatsapp: "+263780333444",
    technicianId: 3,
    category: "Solar/Inverter",
    area: "Chitungwiza",
    address: "Unit L, Chitungwiza",
    issue: "Inverter switches off when load increases.",
    urgency: "Normal",
    preferredTime: "Saturday afternoon",
    estimatedPriceRange: "$30-$160",
    currency: "USD",
    paymentMethod: "Bank Transfer",
    paymentStatus: "Disputed",
    status: "Disputed",
    jobNotes: "Admin reviewing dispute over replacement battery quote.",
    dispute: { reason: "Customer wants second opinion on parts cost.", resolved: false },
    customerConfirmedComplete: false,
    review: null,
    createdAt: new Date(Date.now() - 259200000).toISOString(),
  },
];

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text, contentType = "text/plain") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(text);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

function waMe(phone) {
  const cleaned = normalizePhone(phone).replace(/^\+/, "");
  return cleaned ? `https://wa.me/${cleaned}` : "";
}

function clampRating(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 5;
  return Math.max(1, Math.min(5, Math.round(number)));
}

function normalizeReview(review, fallbackCustomerName = "Customer") {
  if (!review) return null;
  const categoryRatings = review.categoryRatings || {
    professionalism: review.rating || 5,
    communication: review.rating || 5,
    quality: review.rating || 5,
    punctuality: review.rating || 5,
    cleanliness: review.rating || 5,
    value: review.rating || 5,
  };
  const normalizedRatings = REVIEW_CATEGORIES.reduce((ratings, category) => {
    ratings[category] = clampRating(categoryRatings[category]);
    return ratings;
  }, {});
  const averageRating =
    REVIEW_CATEGORIES.reduce((sum, category) => sum + normalizedRatings[category], 0) / REVIEW_CATEGORIES.length;
  return {
    id: review.id || `${review.customerName || fallbackCustomerName}-${review.text || "legacy-review"}`,
    customerName: review.customerName || fallbackCustomerName,
    categoryRatings: normalizedRatings,
    averageRating: Number(averageRating.toFixed(1)),
    recommend: review.recommend !== undefined ? Boolean(review.recommend) : Number(review.rating || averageRating) >= 4,
    text: String(review.text || "Reviewed by customer."),
    photos: Array.isArray(review.photos) ? review.photos.slice(0, 4) : [],
    technicianResponse: review.technicianResponse || null,
    createdAt: review.createdAt || new Date().toISOString(),
  };
}

function technicianReviews(technician) {
  return (technician.reviews || []).map((review) => normalizeReview(review)).filter(Boolean);
}

function reviewAverage(review) {
  const normalized = normalizeReview(review);
  return normalized ? normalized.averageRating : 0;
}

function reviewBreakdown(reviews) {
  if (!reviews.length) {
    return REVIEW_CATEGORIES.reduce((summary, category) => {
      summary[category] = 0;
      return summary;
    }, {});
  }
  return REVIEW_CATEGORIES.reduce((summary, category) => {
    const average = reviews.reduce((sum, review) => sum + review.categoryRatings[category], 0) / reviews.length;
    summary[category] = Number(average.toFixed(1));
    return summary;
  }, {});
}

function generateReviewSummary(reviews) {
  if (!reviews.length) {
    return "Customers are still building a review history for this technician.";
  }
  const breakdown = reviewBreakdown(reviews);
  const strongest = REVIEW_CATEGORIES.filter((category) => breakdown[category] >= 4.6)
    .map((category) => REVIEW_LABELS[category])
    .slice(0, 3);
  const recommended = Math.round((reviews.filter((review) => review.recommend).length / reviews.length) * 100);
  const photoCount = reviews.reduce((sum, review) => sum + review.photos.length, 0);
  const praise = strongest.length ? strongest.join(", ") : "steady service quality";
  const photoPhrase = photoCount ? ` Several reviews include completion photos for accountability.` : "";
  return `Customers consistently praise ${praise}. ${recommended}% say they would recommend this technician to others.${photoPhrase}`;
}

function recalculateTechnicianRating(technician) {
  const reviews = technicianReviews(technician);
  if (!reviews.length) {
    technician.rating = 0;
    return;
  }
  technician.rating = Number((reviews.reduce((sum, review) => sum + review.averageRating, 0) / reviews.length).toFixed(1));
}

function calculateTrustScore(technician) {
  let score = 0;
  if (technician.verificationStatus === "Admin Verified") score += 28;
  if (technician.idChecked) score += 14;
  if (technician.insuranceStatus && !/not/i.test(technician.insuranceStatus)) score += 8;
  score += Math.min(16, Number(technician.yearsExperience || 0) * 1.6);
  score += Math.min(12, (technician.credentials || []).length * 4);
  score += Math.min(10, Number(technician.completedJobs || 0) / 15);
  score += Math.min(8, Math.max(0, Number(technician.rating || 0) - 3) * 4);
  if (Number(technician.responseMinutes || 999) <= 30) score += 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function publicTechnician(technician) {
  const reviews = technicianReviews(technician);
  const breakdown = reviewBreakdown(reviews);
  const recommendRate = reviews.length ? Math.round((reviews.filter((review) => review.recommend).length / reviews.length) * 100) : 0;
  return {
    ...technician,
    reviews,
    trustScore: calculateTrustScore(technician),
    reviewSummary: generateReviewSummary(reviews),
    reviewBreakdown: breakdown,
    recommendRate,
    adminVerified: technician.verificationStatus === "Admin Verified",
    callLink: `tel:${normalizePhone(technician.phone)}`,
    whatsappLink: waMe(technician.whatsapp),
    badges: [
      technician.verificationStatus === "Admin Verified" ? "Admin Verified" : technician.verificationStatus,
      technician.idChecked ? "ID Checked" : "ID Pending",
    ],
  };
}

function sortTechnicians(a, b) {
  const verifiedDiff = Number(b.verificationStatus === "Admin Verified") - Number(a.verificationStatus === "Admin Verified");
  if (verifiedDiff) return verifiedDiff;
  const scoreDiff = calculateTrustScore(b) - calculateTrustScore(a);
  if (scoreDiff) return scoreDiff;
  const ratingDiff = Number(b.rating || 0) - Number(a.rating || 0);
  if (ratingDiff) return ratingDiff;
  const responseDiff = Number(a.responseMinutes || 999) - Number(b.responseMinutes || 999);
  if (responseDiff) return responseDiff;
  return Number(b.completedJobs || 0) - Number(a.completedJobs || 0);
}

function filterTechnicians(searchParams) {
  const search = String(searchParams.get("search") || "").toLowerCase();
  const category = searchParams.get("category") || "";
  const area = searchParams.get("area") || "";
  const verifiedOnly = searchParams.get("verified") === "true";
  const adminView = searchParams.get("admin") === "true";

  return technicians
    .filter((technician) => adminView || !technician.suspended)
    .filter((technician) => !verifiedOnly || technician.verificationStatus === "Admin Verified")
    .filter((technician) => !category || technician.categories.includes(category) || technician.trade === category)
    .filter((technician) => !area || technician.area === area)
    .filter((technician) => {
      if (!search) return true;
      return [
        technician.fullName,
        technician.businessName,
        technician.trade,
        technician.area,
        technician.notes,
        ...(technician.categories || []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    })
    .sort(sortTechnicians)
    .map(publicTechnician);
}

function technicianById(id) {
  return technicians.find((technician) => technician.id === Number(id));
}

function bookingView(booking) {
  const technician = technicianById(booking.technicianId);
  return {
    ...booking,
    review: normalizeReview(booking.review, booking.customerName),
    technicianName: technician ? technician.fullName : "Unassigned",
    technicianTrade: technician ? technician.trade : "",
    technicianPhone: technician ? technician.phone : "",
    technicianWhatsapp: technician ? technician.whatsapp : "",
    technicianCallLink: technician ? `tel:${normalizePhone(technician.phone)}` : "",
    technicianWhatsappLink: technician ? waMe(technician.whatsapp) : "",
  };
}

function parseEstimate(range) {
  if (!range || /negotiable/i.test(range)) return 0;
  const values = String(range).match(/\d+(\.\d+)?/g);
  if (!values || !values.length) return 0;
  const nums = values.map(Number);
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function platformSummary() {
  const activeTechnicians = technicians.filter((technician) => !technician.suspended).length;
  const pendingApprovals = technicians.filter((technician) => technician.verificationStatus === "Pending").length;
  const completedJobs = bookings.filter((booking) => booking.status === "Completed").length;
  const disputes = bookings.filter((booking) => booking.status === "Disputed" || booking.paymentStatus === "Disputed" || (booking.dispute && !booking.dispute.resolved)).length;
  const estimatedServiceValue = bookings
    .filter((booking) => booking.status === "Completed")
    .reduce((sum, booking) => sum + parseEstimate(booking.estimatedPriceRange), 0);
  return {
    totalBookings: bookings.length,
    completedJobs,
    activeTechnicians,
    pendingApprovals,
    disputes,
    estimatedServiceValue: Math.round(estimatedServiceValue),
    estimatedRevenue: Math.round(estimatedServiceValue * 0.08),
  };
}

function validateBooking(payload) {
  const required = ["customerName", "customerPhone", "category", "area", "issue", "paymentMethod"];
  const missing = required.filter((field) => !String(payload[field] || "").trim());
  if (missing.length) return `Missing required fields: ${missing.join(", ")}`;
  if (!SERVICE_CATEGORIES.includes(payload.category)) return "Unknown service category.";
  if (!SERVICE_AREAS.includes(payload.area)) return "Unknown service area.";
  if (!PAYMENT_METHODS.includes(payload.paymentMethod)) return "Unknown payment method.";
  return "";
}

function csvEscape(value) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
  return stringValue;
}

function bookingsCsv() {
  const rows = [
    ["ID", "Customer", "Phone", "Technician", "Category", "Area", "Status", "Payment Method", "Payment Status", "Estimate", "Issue"],
    ...bookings.map((booking) => {
      const view = bookingView(booking);
      return [
        view.id,
        view.customerName,
        view.customerPhone,
        view.technicianName,
        view.category,
        view.area,
        view.status,
        view.paymentMethod,
        view.paymentStatus,
        view.estimatedPriceRange,
        view.issue,
      ];
    }),
  ];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function serveStatic(req, res) {
  const requestedPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const filePath = requestedPath === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, requestedPath);
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(PUBLIC_DIR)) return sendText(res, 403, "Forbidden");

  fs.readFile(normalized, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallbackContent) => {
          if (fallbackError) return sendText(res, 404, "Not found");
          sendText(res, 200, fallbackContent, "text/html");
        });
        return;
      }
      return sendText(res, 500, "Server error");
    }

    const ext = path.extname(normalized);
    const types = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".svg": "image/svg+xml",
    };
    sendText(res, 200, content, types[ext] || "application/octet-stream");
  });
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname === "/api/config") {
      return sendJson(res, 200, {
        serviceAreas: SERVICE_AREAS,
        serviceCategories: SERVICE_CATEGORIES,
        paymentMethods: PAYMENT_METHODS,
        paymentStatuses: PAYMENT_STATUSES,
        bookingStatuses: BOOKING_STATUSES,
        verificationStatuses: VERIFICATION_STATUSES,
        reviewCategories: REVIEW_CATEGORIES,
        defaultCurrency: "USD",
        currencies: ["USD", "ZWL", "Negotiable"],
      });
    }

    if (req.method === "GET" && url.pathname === "/api/technicians") {
      return sendJson(res, 200, filterTechnicians(url.searchParams));
    }

    if (req.method === "POST" && url.pathname === "/api/technicians") {
      const payload = await parseBody(req);
      if (!payload.fullName || !payload.phone || !payload.whatsapp || !payload.area || !payload.trade) {
        return sendJson(res, 400, { error: "Name, phone, WhatsApp, service area, and trade are required." });
      }
      const technician = {
        id: Date.now(),
        fullName: String(payload.fullName).trim(),
        businessName: String(payload.businessName || "").trim() || `${payload.fullName} Services`,
        trade: String(payload.trade),
        categories: Array.isArray(payload.categories) && payload.categories.length ? payload.categories : [String(payload.trade)],
        area: String(payload.area),
        phone: normalizePhone(payload.phone),
        whatsapp: normalizePhone(payload.whatsapp),
        yearsExperience: Number(payload.yearsExperience || 0),
        verificationStatus: "Pending",
        idChecked: false,
        licenseStatus: String(payload.licenseStatus || "Submitted for admin review"),
        insuranceStatus: String(payload.insuranceStatus || "Not submitted"),
        credentials: String(payload.credentials || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        priceRange: String(payload.priceRange || "Negotiable"),
        currency: String(payload.currency || "USD"),
        rating: 0,
        completedJobs: 0,
        responseMinutes: 60,
        serviceGuarantee: String(payload.serviceGuarantee || "To be agreed before work starts"),
        suspended: false,
        notes: String(payload.notes || ""),
        reviews: [],
      };
      technicians.push(technician);
      return sendJson(res, 201, publicTechnician(technician));
    }

    const technicianAdminMatch = url.pathname.match(/^\/api\/technicians\/(\d+)\/admin$/);
    if (req.method === "PATCH" && technicianAdminMatch) {
      const technician = technicianById(technicianAdminMatch[1]);
      if (!technician) return sendJson(res, 404, { error: "Technician not found." });
      const payload = await parseBody(req);
      if (payload.verificationStatus && VERIFICATION_STATUSES.includes(payload.verificationStatus)) {
        technician.verificationStatus = payload.verificationStatus;
      }
      if (typeof payload.idChecked === "boolean") technician.idChecked = payload.idChecked;
      if (typeof payload.suspended === "boolean") {
        technician.suspended = payload.suspended;
        if (payload.suspended) technician.verificationStatus = "Suspended";
      }
      return sendJson(res, 200, publicTechnician(technician));
    }

    if (req.method === "GET" && url.pathname === "/api/customers") {
      return sendJson(res, 200, customers);
    }

    if (req.method === "GET" && url.pathname === "/api/bookings") {
      return sendJson(res, 200, bookings.map(bookingView));
    }

    if (req.method === "POST" && url.pathname === "/api/bookings") {
      const payload = await parseBody(req);
      const error = validateBooking(payload);
      if (error) return sendJson(res, 400, { error });

      let customer = customers.find((item) => normalizePhone(item.phone) === normalizePhone(payload.customerPhone));
      if (!customer) {
        customer = {
          id: Date.now(),
          fullName: String(payload.customerName).trim(),
          phone: normalizePhone(payload.customerPhone),
          whatsapp: normalizePhone(payload.customerWhatsapp || payload.customerPhone),
          area: payload.area,
        };
        customers.push(customer);
      }

      const requestedTechnician = technicianById(payload.technicianId);
      const estimatedPriceRange = payload.estimatedPriceRange || (requestedTechnician ? requestedTechnician.priceRange : "Request quote");
      const booking = {
        id: Date.now(),
        customerId: customer.id,
        customerName: customer.fullName,
        customerPhone: customer.phone,
        customerWhatsapp: customer.whatsapp,
        technicianId: requestedTechnician ? requestedTechnician.id : null,
        category: payload.category,
        area: payload.area,
        address: String(payload.address || ""),
        issue: String(payload.issue).trim(),
        urgency: payload.urgency === "Urgent" ? "Urgent" : "Normal",
        preferredTime: String(payload.preferredTime || "Flexible"),
        estimatedPriceRange,
        currency: ["USD", "ZWL", "Negotiable"].includes(payload.currency) ? payload.currency : "USD",
        paymentMethod: payload.paymentMethod,
        paymentStatus: "Not Paid",
        status: requestedTechnician ? "Assigned" : "New Request",
        jobNotes: "",
        dispute: null,
        customerConfirmedComplete: false,
        review: null,
        createdAt: new Date().toISOString(),
      };
      bookings.unshift(booking);
      return sendJson(res, 201, bookingView(booking));
    }

    const bookingStatusMatch = url.pathname.match(/^\/api\/bookings\/(\d+)\/status$/);
    if (req.method === "PATCH" && bookingStatusMatch) {
      const booking = bookings.find((item) => item.id === Number(bookingStatusMatch[1]));
      if (!booking) return sendJson(res, 404, { error: "Booking not found." });
      const payload = await parseBody(req);
      if (payload.status && BOOKING_STATUSES.includes(payload.status)) booking.status = payload.status;
      if (payload.paymentStatus && PAYMENT_STATUSES.includes(payload.paymentStatus)) booking.paymentStatus = payload.paymentStatus;
      if (payload.paymentMethod && PAYMENT_METHODS.includes(payload.paymentMethod)) booking.paymentMethod = payload.paymentMethod;
      if (payload.technicianId !== undefined) {
        const technician = technicianById(payload.technicianId);
        booking.technicianId = technician ? technician.id : null;
        if (technician && booking.status === "New Request") booking.status = "Assigned";
      }
      if (payload.jobNotes !== undefined) booking.jobNotes = String(payload.jobNotes || "");
      if (payload.customerConfirmedComplete === true) {
        booking.customerConfirmedComplete = true;
        booking.status = "Completed";
      }
      if (payload.disputeReason) {
        booking.dispute = { reason: String(payload.disputeReason), resolved: false };
        booking.status = "Disputed";
        booking.paymentStatus = "Disputed";
      }
      if (payload.resolveDispute === true && booking.dispute) {
        booking.dispute.resolved = true;
        if (booking.status === "Disputed") booking.status = "Completed";
      }
      return sendJson(res, 200, bookingView(booking));
    }

    const reviewMatch = url.pathname.match(/^\/api\/bookings\/(\d+)\/review$/);
    if (req.method === "POST" && reviewMatch) {
      const booking = bookings.find((item) => item.id === Number(reviewMatch[1]));
      if (!booking) return sendJson(res, 404, { error: "Booking not found." });
      if (!booking.technicianId) return sendJson(res, 400, { error: "Assign a technician before reviewing the job." });
      const payload = await parseBody(req);
      const categoryRatings = REVIEW_CATEGORIES.reduce((ratings, category) => {
        ratings[category] = clampRating(payload.categoryRatings?.[category]);
        return ratings;
      }, {});
      const review = normalizeReview(
        {
          id: booking.review?.id || Date.now(),
          customerName: booking.customerName,
          categoryRatings,
          recommend: payload.recommend,
          text: payload.text,
          photos: Array.isArray(payload.photos)
            ? payload.photos.slice(0, 4).map((photo) => ({
                name: String(photo.name || "completion-photo"),
                size: Number(photo.size || 0),
                type: String(photo.type || "image"),
              }))
            : [],
          technicianResponse: booking.review?.technicianResponse || null,
          createdAt: booking.review?.createdAt || new Date().toISOString(),
        },
        booking.customerName
      );
      booking.review = review;
      const technician = technicianById(booking.technicianId);
      if (technician) {
        const existingIndex = (technician.reviews || []).findIndex((item) => normalizeReview(item).id === review.id);
        if (existingIndex >= 0) technician.reviews[existingIndex] = review;
        else technician.reviews.unshift(review);
        recalculateTechnicianRating(technician);
      }
      return sendJson(res, 200, bookingView(booking));
    }

    const responseMatch = url.pathname.match(/^\/api\/bookings\/(\d+)\/review-response$/);
    if (req.method === "POST" && responseMatch) {
      const booking = bookings.find((item) => item.id === Number(responseMatch[1]));
      if (!booking) return sendJson(res, 404, { error: "Booking not found." });
      if (!booking.review) return sendJson(res, 400, { error: "No customer review exists for this booking yet." });
      const payload = await parseBody(req);
      const text = String(payload.text || "").trim();
      if (!text) return sendJson(res, 400, { error: "Response text is required." });
      booking.review.technicianResponse = { text, createdAt: new Date().toISOString() };
      const technician = technicianById(booking.technicianId);
      if (technician) {
        const reviewId = normalizeReview(booking.review).id;
        const existingIndex = (technician.reviews || []).findIndex((item) => normalizeReview(item).id === reviewId);
        if (existingIndex >= 0) technician.reviews[existingIndex] = normalizeReview(booking.review, booking.customerName);
      }
      return sendJson(res, 200, bookingView(booking));
    }

    if (req.method === "GET" && url.pathname === "/api/admin/summary") {
      return sendJson(res, 200, platformSummary());
    }

    if (req.method === "GET" && url.pathname === "/api/reports/bookings.csv") {
      res.writeHead(200, {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="service-market-bookings.csv"',
      });
      return res.end(bookingsCsv());
    }

    return sendJson(res, 404, { error: "API route not found." });
  } catch (error) {
    if (error instanceof SyntaxError) return sendJson(res, 400, { error: "Invalid JSON body." });
    console.error(error);
    return sendJson(res, 500, { error: "Server error." });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Service Market Zimbabwe running at http://localhost:${PORT}`);
});
