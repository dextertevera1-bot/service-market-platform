const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 4173;
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY_BYTES = 1_000_000;
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

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

const PAYMENT_METHODS = ["EcoCash", "ZIPIT Bank Transfer", "Direct Bank Transfer", "Cash", "Pay Later"];
const PAYMENT_STATUSES = ["Payment Pending", "Awaiting Verification", "Paid", "Rejected", "Refund Pending", "Refunded"];
const METHOD_VERIFICATION_STATUSES = ["Pending", "Submitted", "Verified", "Rejected"];
const PLATFORM_COMMISSION_RATE = 0.1;
const BANK_DETAILS = {
  bankName: "Service Market Trust Account",
  accountNumber: "000123456789",
  branch: "Harare",
  referencePrefix: "SMZ",
};
const platformSettings = {
  transportPricing: {
    currency: "USD",
    diagnosticFee: 10,
    freeRadiusKm: 3,
    minimumFee: 3,
    pricePerKm: 0.5,
    maximumFee: 25,
    emergencySurcharge: 5,
    afterHoursSurcharge: 4,
    allowAdminOverride: true,
    cityRates: {
      Harare: { freeRadiusKm: 3, minimumFee: 3, pricePerKm: 0.5, maximumFee: 25, emergencySurcharge: 5, afterHoursSurcharge: 4 },
      Bulawayo: { freeRadiusKm: 4, minimumFee: 3, pricePerKm: 0.45, maximumFee: 22, emergencySurcharge: 5, afterHoursSurcharge: 4 },
      Mutare: { freeRadiusKm: 3, minimumFee: 3, pricePerKm: 0.45, maximumFee: 22, emergencySurcharge: 4, afterHoursSurcharge: 3 },
    },
  },
};
const BOOKING_STATUSES = [
  "Submitted",
  "Waiting for Technician",
  "Accepted",
  "Travelling",
  "Nearby",
  "Arrived",
  "Working",
  "Paused",
  "Completed",
  "Customer Confirmed",
  "Closed",
  "Cancelled",
];
const JOB_PIPELINE_STATUSES = ["Accepted", "Travelling", "Nearby", "Arrived", "Working", "Paused", "Completed", "Customer Confirmed", "Closed"];
const JOURNEY_STATUSES = ["Accepted", "Travelling", "Nearby", "Arrived", "Working", "Completed"];
const PLATFORM_EMERGENCY_CONTACT = "+263 77 000 0000";
const MAP_PROVIDER_PLACEHOLDERS = ["Google Maps", "Mapbox", "OpenStreetMap"];
const LOCATION_PRIVACY_MESSAGE = "Service Market only tracks technician location during active jobs to improve safety, transparency and accountability.";
const LOCATION_REQUIRED_STATUSES = ["Accepted", "Travelling", "Nearby", "Arrived", "Working"];
const LIVE_TRACKING_STATUSES = ["Travelling", "Nearby", "Arrived", "Working"];
const ACTIVE_JOB_STATUSES = ["Accepted", "Travelling", "Nearby", "Arrived", "Working", "Paused"];
const ETA_DELAY_THRESHOLD_MINUTES = 10;
const LOCATION_BY_AREA = {
  Harare: { lat: -17.8252, lng: 31.0335 },
  Borrowdale: { lat: -17.7596, lng: 31.0911 },
  Avondale: { lat: -17.7975, lng: 31.0332 },
  CBD: { lat: -17.8318, lng: 31.0457 },
  Chitungwiza: { lat: -18.0127, lng: 31.0756 },
  Bulawayo: { lat: -20.1325, lng: 28.6265 },
  Mutare: { lat: -18.9707, lng: 32.6709 },
  Gweru: { lat: -19.45, lng: 29.8167 },
  Masvingo: { lat: -20.0744, lng: 30.8328 },
  Kwekwe: { lat: -18.9281, lng: 29.8149 },
  "Victoria Falls": { lat: -17.9318, lng: 25.8257 },
};
const JOURNEY_PRESETS = {
  Submitted: { distanceKm: 0, travelTimeMinutes: 0, label: "Awaiting assignment" },
  "Waiting for Technician": { distanceKm: 0, travelTimeMinutes: 0, label: "Waiting for technician" },
  Accepted: { distanceKm: 12, travelTimeMinutes: 35, label: "Accepted" },
  Travelling: { distanceKm: 7.5, travelTimeMinutes: 24, label: "Travelling" },
  Nearby: { distanceKm: 1.2, travelTimeMinutes: 6, label: "Nearby" },
  Arrived: { distanceKm: 0.1, travelTimeMinutes: 0, label: "Arrived" },
  Working: { distanceKm: 0, travelTimeMinutes: 0, label: "Working on site" },
  Paused: { distanceKm: 0, travelTimeMinutes: 0, label: "Paused" },
  Completed: { distanceKm: 0, travelTimeMinutes: 0, label: "Completed" },
  "Customer Confirmed": { distanceKm: 0, travelTimeMinutes: 0, label: "Customer confirmed" },
  Closed: { distanceKm: 0, travelTimeMinutes: 0, label: "Closed" },
  Cancelled: { distanceKm: 0, travelTimeMinutes: 0, label: "Cancelled" },
};
const VERIFICATION_STATUSES = ["Draft", "Pending Verification", "Approved", "Rejected", "Suspended"];
const REVIEW_CATEGORIES = ["professionalism", "communication", "quality", "punctuality", "cleanliness", "value"];
const TRUST_WEIGHTS = {
  identityVerified: 15,
  tradeQualificationVerified: 20,
  profileCompleted: 10,
  referencesProvided: 10,
  warrantyOffered: 10,
  fastResponse: 10,
  completedJobs: 10,
  averageRating: 10,
  noComplaints: 5,
  adminRecommendation: 10,
};
const TRUST_ENGINE_PILLARS = [
  ["Identity verification", "ID, phone and WhatsApp checks reduce anonymous work."],
  ["Professional verification", "Trade qualifications, licenses and certificates are reviewed by admin."],
  ["Reputation", "Structured reviews measure professionalism, communication, quality and value."],
  ["Transparency", "Customers see evidence, not only a star rating."],
  ["Service documentation", "Completed jobs can include diagnosis, work done, parts and photos."],
  ["Accountability", "Complaints, disputes and admin suspensions affect visibility."],
  ["Pricing clarity", "Technicians show USD price ranges or negotiable pricing before inspection."],
  ["Platform guarantee", "Service Market keeps records so customers can escalate issues."],
];
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

const trustSeedOverrides = {
  1: {
    identityVerified: true,
    phoneVerified: true,
    qualificationsVerified: true,
    repeatCustomerRate: 42,
    complaintCount: 0,
    adminQualityScore: 96,
    adminRecommended: true,
    backgroundChecked: true,
    premiumProfessional: true,
    profileViews: 428,
    emergencyAvailable: true,
    warrantyOffered: true,
    pricingMethod: "USD diagnostic fee plus quote",
    serviceAreas: ["Harare CBD", "Avondale", "Borrowdale", "Mount Pleasant"],
  },
  2: {
    identityVerified: true,
    phoneVerified: true,
    qualificationsVerified: true,
    repeatCustomerRate: 31,
    complaintCount: 1,
    adminQualityScore: 88,
    adminRecommended: true,
    backgroundChecked: true,
    premiumProfessional: false,
    profileViews: 316,
    emergencyAvailable: true,
    warrantyOffered: true,
    pricingMethod: "USD call-out plus parts quote",
    serviceAreas: ["Harare CBD", "Mbare", "Highfield", "Waterfalls"],
  },
  3: {
    identityVerified: true,
    phoneVerified: true,
    qualificationsVerified: true,
    repeatCustomerRate: 48,
    complaintCount: 0,
    adminQualityScore: 98,
    adminRecommended: true,
    backgroundChecked: true,
    premiumProfessional: true,
    profileViews: 512,
    emergencyAvailable: true,
    warrantyOffered: true,
    pricingMethod: "USD inspection plus written quote",
    serviceAreas: ["Harare CBD", "Chitungwiza", "Hatfield", "Southerton"],
  },
  4: {
    identityVerified: true,
    phoneVerified: true,
    qualificationsVerified: false,
    repeatCustomerRate: 18,
    complaintCount: 2,
    adminQualityScore: 62,
    adminRecommended: false,
    backgroundChecked: false,
    premiumProfessional: false,
    profileViews: 91,
    emergencyAvailable: false,
    warrantyOffered: false,
    pricingMethod: "Quote after inspection",
    serviceAreas: ["Greendale", "Msasa", "Ruwa"],
  },
  5: {
    identityVerified: true,
    phoneVerified: true,
    qualificationsVerified: true,
    repeatCustomerRate: 26,
    complaintCount: 1,
    adminQualityScore: 82,
    adminRecommended: false,
    backgroundChecked: true,
    premiumProfessional: false,
    profileViews: 204,
    emergencyAvailable: true,
    warrantyOffered: false,
    pricingMethod: "USD mobile diagnosis and labour quote",
    serviceAreas: ["Harare CBD", "Eastlea", "Msasa", "Hatfield"],
  },
  6: {
    identityVerified: true,
    phoneVerified: true,
    qualificationsVerified: false,
    repeatCustomerRate: 34,
    complaintCount: 0,
    adminQualityScore: 78,
    adminRecommended: false,
    backgroundChecked: false,
    premiumProfessional: false,
    profileViews: 166,
    emergencyAvailable: false,
    warrantyOffered: true,
    pricingMethod: "Negotiable quote after measurements",
    serviceAreas: ["Avondale", "Marlborough", "Westgate"],
  },
};

technicians = technicians.map((technician) => {
  const overrides = trustSeedOverrides[technician.id] || {};
  const approved = technician.verificationStatus === "Admin Verified";
  return {
    ...technician,
    ...overrides,
    verificationStatus: approved ? "Approved" : "Pending Verification",
    verificationNotes: approved ? "Seed technician approved for marketplace demo." : "Awaiting admin verification.",
    informationRequest: "",
    documents: {
      nationalId: approved ? { name: "national-id.pdf", type: "application/pdf", status: "Submitted" } : null,
      profilePhoto: approved ? { name: "profile-photo.jpg", type: "image/jpeg", status: "Submitted" } : null,
      tradeCertificate: (overrides.qualificationsVerified || approved) ? { name: "trade-certificate.pdf", type: "application/pdf", status: "Submitted" } : null,
      additionalCertificates: (technician.credentials || []).slice(1).map((name) => ({ name: `${name}.pdf`, type: "application/pdf", status: "Submitted" })),
      policeClearance: technician.id === 3 ? { name: "police-clearance.pdf", type: "application/pdf", status: "Submitted" } : null,
    },
    references: approved ? ["Customer reference checked", "Previous job reference checked"] : ["One customer reference pending"],
    warrantyPolicy: overrides.warrantyOffered ? technician.serviceGuarantee : "",
    profileCompleted: true,
    trustScoreAdjustment: 0,
    trustHistory: [
      { title: "Joined platform", detail: `${technician.businessName} created a Service Market profile.`, at: "2026-06-01" },
      ...(approved ? [{ title: "Identity verified", detail: "National ID and contact details reviewed by admin.", at: "2026-06-03" }] : []),
      ...(overrides.qualificationsVerified ? [{ title: "Qualification verified", detail: "Trade credentials reviewed for marketplace trust.", at: "2026-06-05" }] : []),
      ...(Number(technician.completedJobs || 0) >= 100 ? [{ title: "100 jobs completed", detail: "Reached 100 completed jobs on Service Market.", at: "2026-06-20" }] : []),
      ...(Number(technician.rating || 0) >= 4.8 ? [{ title: "Top Rated badge earned", detail: "Maintained strong customer ratings.", at: "2026-06-24" }] : []),
      ...(Number(overrides.complaintCount || 0) === 0 ? [{ title: "Low complaint record", detail: "No open complaints in current platform records.", at: "2026-06-28" }] : []),
      ...(overrides.adminRecommended ? [{ title: "Admin recommendation", detail: "Recommended by admin for consistent reliability.", at: "2026-07-01" }] : []),
    ],
  };
});

let customers = [
  { id: 1, fullName: "Blessing M.", phone: "+263778111222", whatsapp: "+263778111222", area: "Harare" },
  { id: 2, fullName: "Nomsa K.", phone: "+263779222333", whatsapp: "+263779222333", area: "Bulawayo" },
  { id: 3, fullName: "Kuda P.", phone: "+263780333444", whatsapp: "+263780333444", area: "Chitungwiza" },
];

function makeBookingCode(id = Date.now()) {
  return `SMZ-${new Date().getFullYear()}-${String(id).slice(-6)}`;
}

function makeStatusHistory(status, note = "Booking created") {
  return [{ status, note, at: new Date().toISOString() }];
}

let bookings = [
  {
    id: 1001,
    bookingCode: "SMZ-2026-001001",
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
    paymentStatus: "Awaiting Verification",
    status: "Completed",
    statusHistory: [
      { status: "Submitted", note: "Customer submitted request.", at: new Date(Date.now() - 86400000).toISOString() },
      { status: "Waiting for Technician", note: "Assigned to Tendai Moyo.", at: new Date(Date.now() - 82000000).toISOString() },
      { status: "Accepted", note: "Technician accepted the job.", at: new Date(Date.now() - 79000000).toISOString() },
      { status: "Working", note: "Repair in progress.", at: new Date(Date.now() - 76000000).toISOString() },
      { status: "Completed", note: "Customer confirmed completion.", at: new Date(Date.now() - 72000000).toISOString() },
    ],
    jobNotes: "Customer asked technician to call before arrival.",
    dispute: null,
    customerConfirmedComplete: true,
    review: null,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 1002,
    bookingCode: "SMZ-2026-001002",
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
    paymentStatus: "Awaiting Verification",
    status: "Completed",
    statusHistory: [
      { status: "Submitted", note: "Customer submitted urgent request.", at: new Date(Date.now() - 172800000).toISOString() },
      { status: "Accepted", note: "Technician accepted the job.", at: new Date(Date.now() - 170000000).toISOString() },
      { status: "Completed", note: "Work completed.", at: new Date(Date.now() - 165000000).toISOString() },
    ],
    jobNotes: "Paid cash after completion.",
    dispute: null,
    customerConfirmedComplete: true,
    review: { rating: 5, text: "Fast and professional." },
    createdAt: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: 1003,
    bookingCode: "SMZ-2026-001003",
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
    paymentStatus: "Payment Pending",
    status: "Waiting for Technician",
    statusHistory: [
      { status: "Submitted", note: "Customer submitted request.", at: new Date(Date.now() - 259200000).toISOString() },
      { status: "Waiting for Technician", note: "Assigned technician reviewing details.", at: new Date(Date.now() - 250000000).toISOString() },
    ],
    jobNotes: "Admin reviewing dispute over replacement battery quote.",
    dispute: { reason: "Customer wants second opinion on parts cost.", resolved: false },
    customerConfirmedComplete: false,
    review: null,
    createdAt: new Date(Date.now() - 259200000).toISOString(),
  },
];

let payments = [
  {
    id: 9001,
    receiptNumber: "RCPT-SMZ-2026-001001",
    bookingId: 1001,
    bookingCode: "SMZ-2026-001001",
    customerName: "Blessing M.",
    technicianId: 1,
    technicianName: "Tendai Moyo",
    serviceSummary: "HVAC/Refrigeration - Fridge is running but not cooling.",
    method: "EcoCash",
    amount: 85,
    currency: "USD",
    reference: "EC123456789",
    phoneNumber: "+263778111222",
    proofOfPayment: "",
    status: "Awaiting Verification",
    verificationStatus: "Submitted",
    notes: "Seed EcoCash payment awaiting admin verification.",
    createdAt: new Date(Date.now() - 36000000).toISOString(),
    updatedAt: new Date(Date.now() - 36000000).toISOString(),
  },
  {
    id: 9002,
    receiptNumber: "RCPT-SMZ-2026-001002",
    bookingId: 1002,
    bookingCode: "SMZ-2026-001002",
    customerName: "Nomsa K.",
    technicianId: 2,
    technicianName: "Mandla Ndlovu",
    serviceSummary: "Plumbing - Blocked kitchen drain and leaking trap.",
    method: "Cash",
    amount: 60,
    currency: "USD",
    reference: "CASH-1002",
    phoneNumber: "",
    proofOfPayment: "",
    cashReceived: true,
    customerConfirmed: true,
    adminVerified: false,
    status: "Awaiting Verification",
    verificationStatus: "Submitted",
    notes: "Technician marked cash received.",
    createdAt: new Date(Date.now() - 140000000).toISOString(),
    updatedAt: new Date(Date.now() - 140000000).toISOString(),
  },
];

function sendJson(res, status, payload) {
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text, contentType = "text/plain") {
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": contentType });
  res.end(text);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        tooLarge = true;
        body = "";
      }
    });
    req.on("end", () => {
      if (tooLarge) {
        reject(Object.assign(new Error("Request body too large."), { statusCode: 413 }));
        return;
      }
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", (error) => {
      if (!tooLarge) reject(error);
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

function technicianTrustProfile(technician) {
  const qualificationsVerified =
    technician.qualificationsVerified !== undefined
      ? Boolean(technician.qualificationsVerified)
      : technician.verificationStatus === "Approved" && (technician.credentials || []).length > 0 && !/review|not/i.test(technician.licenseStatus || "");
  const identityVerified = technician.identityVerified !== undefined ? Boolean(technician.identityVerified) : Boolean(technician.idChecked);
  const warrantyOffered =
    technician.warrantyOffered !== undefined
      ? Boolean(technician.warrantyOffered)
      : Boolean(technician.serviceGuarantee && !/to be agreed|none|not/i.test(technician.serviceGuarantee));
  const profileCompleted = Boolean(technician.profileCompleted || (technician.fullName && technician.phone && technician.trade && technician.area && technician.yearsExperience));
  const referencesProvided = Array.isArray(technician.references) && technician.references.filter(Boolean).length > 0;
  const fastResponse = Number(technician.responseMinutes || 999) <= 30;
  const completedJobsEarned = Number(technician.completedJobs || 0) >= 25;
  const averageRatingEarned = Number(technician.rating || 0) >= 4.5;
  const noComplaints = Number(technician.complaintCount || 0) === 0;
  const adminRecommendation = Boolean(technician.adminRecommended);

  const breakdown = {
    identityVerified: identityVerified ? TRUST_WEIGHTS.identityVerified : 0,
    tradeQualificationVerified: qualificationsVerified ? TRUST_WEIGHTS.tradeQualificationVerified : 0,
    profileCompleted: profileCompleted ? TRUST_WEIGHTS.profileCompleted : 0,
    referencesProvided: referencesProvided ? TRUST_WEIGHTS.referencesProvided : 0,
    warrantyOffered: warrantyOffered ? TRUST_WEIGHTS.warrantyOffered : 0,
    fastResponse: fastResponse ? TRUST_WEIGHTS.fastResponse : 0,
    completedJobs: completedJobsEarned ? TRUST_WEIGHTS.completedJobs : 0,
    averageRating: averageRatingEarned ? TRUST_WEIGHTS.averageRating : 0,
    noComplaints: noComplaints ? TRUST_WEIGHTS.noComplaints : 0,
    adminRecommendation: adminRecommendation ? TRUST_WEIGHTS.adminRecommendation : 0,
  };
  const rawScore = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const adjustment = Math.max(-20, Math.min(20, Number(technician.trustScoreAdjustment || 0)));
  const score = Math.max(0, Math.min(100, rawScore + adjustment));
  const level =
    score >= 95
      ? "Elite Trusted"
      : score >= 90
      ? "Highly Trusted"
      : score >= 80
      ? "Verified Professional"
      : score >= 70
      ? "Verified"
      : "Needs Improvement";
  const labels = {
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
  const explanation = Object.entries(breakdown).map(([key, points]) => ({
    key,
    label: labels[key],
    points,
    max: TRUST_WEIGHTS[key],
    text: `${labels[key]} contributes ${points} of ${TRUST_WEIGHTS[key]} points.`,
  }));
  const suggestions = [];
  if (!identityVerified) suggestions.push("Verify identity (+15).");
  if (!qualificationsVerified) suggestions.push("Upload trade qualification documents (+20).");
  if (!profileCompleted) suggestions.push("Complete your profile (+10).");
  if (!referencesProvided) suggestions.push("Upload references (+10).");
  if (!warrantyOffered) suggestions.push("Offer a workmanship warranty (+10).");
  if (!fastResponse) suggestions.push("Improve response time to under 30 minutes (+10).");
  if (!completedJobsEarned) suggestions.push("Complete more platform jobs (+10).");
  if (!averageRatingEarned) suggestions.push("Maintain an average rating above 4.5 (+10).");
  if (!noComplaints) suggestions.push("Resolve open complaints (+5).");
  if (!adminRecommendation) suggestions.push("Earn admin recommendation through consistent quality (+10).");

  return {
    score,
    rawScore,
    adjustment,
    level,
    breakdown,
    explanation,
    suggestions,
    statuses: {
      identityStatus: identityVerified ? "Verified" : "Pending",
      qualificationStatus: qualificationsVerified ? "Verified" : "Pending",
      phoneVerified: technician.phoneVerified !== undefined ? Boolean(technician.phoneVerified) : Boolean(technician.phone),
      warrantyOffered,
      fastResponse,
      completedJobsEarned,
      averageRatingEarned,
      noComplaints,
      adminRecommended: adminRecommendation,
      backgroundChecked: Boolean(technician.backgroundChecked),
      premiumProfessional: Boolean(technician.premiumProfessional),
      complaintCount: Number(technician.complaintCount || 0),
      repeatCustomerRate: Number(technician.repeatCustomerRate || 0),
      adminQualityScore: Math.max(0, Math.min(100, Number(technician.adminQualityScore ?? 75))),
      trustScoreAdjustment: adjustment,
      emergencyAvailable: Boolean(technician.emergencyAvailable),
      pricingMethod: technician.pricingMethod || (technician.currency === "Negotiable" ? "Negotiable quote" : "USD price range"),
      serviceAreas: technician.serviceAreas || [technician.area],
      profileCompleted,
      referencesProvided,
    },
  };
}

function calculateTrustScore(technician) {
  return technicianTrustProfile(technician).score;
}

function publicTechnician(technician) {
  const reviews = technicianReviews(technician);
  const breakdown = reviewBreakdown(reviews);
  const recommendRate = reviews.length ? Math.round((reviews.filter((review) => review.recommend).length / reviews.length) * 100) : 0;
  const trustProfile = technicianTrustProfile(technician);
  const badges = buildTrustBadges(technician, trustProfile);
  return {
    ...technician,
    reviews,
    trustScore: trustProfile.score,
    trustLevel: trustProfile.level,
    trustBreakdown: trustProfile.breakdown,
    trustExplanation: trustProfile.explanation,
    trustSuggestions: trustProfile.suggestions,
    trustStatuses: trustProfile.statuses,
    trustRawScore: trustProfile.rawScore,
    trustScoreAdjustment: trustProfile.adjustment,
    trustHistory: technician.trustHistory || [],
    profileViews: Number(technician.profileViews || 0),
    reviewSummary: generateReviewSummary(reviews),
    reviewBreakdown: breakdown,
    recommendRate,
    adminVerified: technician.verificationStatus === "Approved",
    callLink: `tel:${normalizePhone(technician.phone)}`,
    whatsappLink: waMe(technician.whatsapp),
    badges,
  };
}

function buildTrustBadges(technician, trustProfile) {
  const badges = [];
  if (trustProfile.statuses.identityStatus === "Verified") badges.push("Identity Verified");
  if (trustProfile.statuses.phoneVerified) badges.push("Phone Verified");
  if (trustProfile.statuses.qualificationStatus === "Verified") badges.push("Trade Verified");
  if (technician.verificationStatus === "Approved") badges.push("Admin Approved");
  if (trustProfile.statuses.warrantyOffered) badges.push("Warranty Offered");
  if (trustProfile.statuses.emergencyAvailable) badges.push("Emergency Available");
  if (trustProfile.statuses.fastResponse) badges.push("Fast Response");
  if (Number(technician.rating || 0) >= 4.7) badges.push("Top Rated");
  if (trustProfile.statuses.backgroundChecked) badges.push("Background Checked");
  if (trustProfile.statuses.premiumProfessional) badges.push("Premium Professional");
  if (!badges.length) badges.push(technician.verificationStatus || "Pending");
  return badges;
}

function sortTechnicians(a, b, mode = "trust") {
  if (mode === "rating") return Number(b.rating || 0) - Number(a.rating || 0);
  if (mode === "experience") return Number(b.yearsExperience || 0) - Number(a.yearsExperience || 0);
  if (mode === "response") return Number(a.responseMinutes || 999) - Number(b.responseMinutes || 999);
  if (mode === "jobs") return Number(b.completedJobs || 0) - Number(a.completedJobs || 0);
  if (mode === "complaints") return Number(a.complaintCount || 0) - Number(b.complaintCount || 0);
  const verifiedDiff = Number(b.verificationStatus === "Approved") - Number(a.verificationStatus === "Approved");
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
  const minTrust = Number(searchParams.get("minTrust") || 0);
  const availability = searchParams.get("availability") || "";
  const sort = searchParams.get("sort") || "trust";

  return technicians
    .filter((technician) => adminView || !technician.suspended)
    .filter((technician) => !verifiedOnly || technician.verificationStatus === "Approved")
    .filter((technician) => !category || technician.categories.includes(category) || technician.trade === category)
    .filter((technician) => !area || technician.area === area)
    .filter((technician) => !minTrust || calculateTrustScore(technician) >= minTrust)
    .filter((technician) => {
      if (!availability) return true;
      if (availability === "today") return technician.emergencyAvailable || Number(technician.responseMinutes || 999) <= 30;
      if (availability === "emergency") return Boolean(technician.emergencyAvailable);
      return true;
    })
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
    .sort((a, b) => sortTechnicians(a, b, sort))
    .map(publicTechnician);
}

function technicianById(id) {
  return technicians.find((technician) => technician.id === Number(id));
}

function areaCoordinates(area = "Harare", offset = 0) {
  const base = LOCATION_BY_AREA[area] || LOCATION_BY_AREA.Harare;
  return {
    lat: Number((base.lat + offset).toFixed(5)),
    lng: Number((base.lng + offset).toFixed(5)),
  };
}

function clampNumber(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function transportSettingsForArea(area = "Harare") {
  const base = platformSettings.transportPricing;
  return {
    ...base,
    ...(base.cityRates?.[area] || {}),
    currency: base.currency || "USD",
    city: area,
  };
}

function haversineKm(from, to) {
  if (!from || !to) return 0;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateTravelMinutes(distanceKm, urgency = "Normal") {
  const averageSpeedKmh = urgency === "Urgent" ? 34 : 28;
  return Math.max(8, Math.round((Number(distanceKm || 0) / averageSpeedKmh) * 60 + 7));
}

function normalizeLatLng(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { lat: latitude, lng: longitude };
}

function transportAuditEntry(type, estimate, note = "") {
  return {
    type,
    note,
    at: new Date().toISOString(),
    distanceKm: estimate.distanceKm,
    travelTimeMinutes: estimate.travelTimeMinutes,
    transportFee: estimate.transportFee,
    estimatedTotalBeforeRepair: estimate.estimatedTotalBeforeRepair,
    calculationMethod: estimate.calculationMethod,
    technicianId: estimate.technicianId,
  };
}

function calculateTransportEstimate(payload = {}) {
  const technician = technicianById(payload.technicianId);
  const area = payload.area || technician?.area || "Harare";
  const settings = transportSettingsForArea(area);
  const customerCoords =
    normalizeLatLng(payload.customerLatitude, payload.customerLongitude) ||
    normalizeLatLng(payload.lat, payload.lng) ||
    areaCoordinates(area, 0);
  const technicianCoords =
    normalizeLatLng(payload.technicianLatitude, payload.technicianLongitude) ||
    normalizeLatLng(technician?.currentLatitude, technician?.currentLongitude) ||
    areaCoordinates(technician?.area || area, technician ? 0.018 : 0.03);
  const directDistance = haversineKm(technicianCoords, customerCoords);
  const routeDistance = Number((directDistance * 1.25).toFixed(1));
  const freeRadiusKm = clampNumber(settings.freeRadiusKm, 0);
  const minimumFee = clampNumber(settings.minimumFee, 0);
  const pricePerKm = clampNumber(settings.pricePerKm, 0);
  const maximumFee = clampNumber(settings.maximumFee, 0);
  const chargeableKm = Math.max(0, routeDistance - freeRadiusKm);
  let transportFee = chargeableKm > 0 ? minimumFee + chargeableKm * pricePerKm : 0;
  const emergencySurchargeApplied = payload.urgency === "Urgent" ? clampNumber(settings.emergencySurcharge, 0) : 0;
  const afterHoursSurchargeApplied = payload.afterHours === true ? clampNumber(settings.afterHoursSurcharge, 0) : 0;
  transportFee += emergencySurchargeApplied + afterHoursSurchargeApplied;
  if (maximumFee > 0) transportFee = Math.min(maximumFee, transportFee);
  transportFee = Number(transportFee.toFixed(2));
  const diagnosticFee = clampNumber(settings.diagnosticFee, platformSettings.transportPricing.diagnosticFee || 0);
  const travelTimeMinutes = estimateTravelMinutes(routeDistance, payload.urgency);
  const estimate = {
    currency: settings.currency || "USD",
    technicianId: technician?.id || null,
    technicianName: technician?.fullName || "Technician to be assigned",
    serviceCategory: payload.category || payload.serviceCategory || technician?.trade || "Service",
    city: area,
    customerLocation: {
      lat: Number(customerCoords.lat.toFixed(5)),
      lng: Number(customerCoords.lng.toFixed(5)),
      source: normalizeLatLng(payload.customerLatitude, payload.customerLongitude) ? "Customer shared location" : "Estimated from service area center",
    },
    technicianLocation: {
      lat: Number(technicianCoords.lat.toFixed(5)),
      lng: Number(technicianCoords.lng.toFixed(5)),
      source: technician ? "Technician registered/current service location" : "Estimated dispatch location",
    },
    distanceKm: routeDistance,
    directDistanceKm: Number(directDistance.toFixed(1)),
    travelTimeMinutes,
    estimatedArrival: etaFromMinutes(travelTimeMinutes),
    diagnosticFee,
    transportFee,
    estimatedTotalBeforeRepair: Number((diagnosticFee + transportFee).toFixed(2)),
    freeRadiusKm,
    minimumFee,
    pricePerKm,
    maximumFee,
    emergencySurchargeApplied,
    afterHoursSurchargeApplied,
    calculationMethod: normalizeLatLng(payload.customerLatitude, payload.customerLongitude)
      ? "Estimated route distance from technician location to shared customer location."
      : "Estimated route distance from technician location to service area center.",
    routeProvider: "Placeholder route estimate - ready for Google Maps or Mapbox.",
    customerApproved: false,
    customerApprovedAt: "",
    explanation:
      "The transport fee is calculated from the technician's location to your service location. This fee covers travel to the site and is payable even if the repair is deferred after inspection.",
  };
  estimate.auditHistory = [transportAuditEntry("calculated", estimate, "Initial transport fee calculation.")];
  return estimate;
}

function applyTransportEstimateToBooking(booking, estimate, approved = false, note = "Transport fee calculated.") {
  const applied = {
    ...estimate,
    customerApproved: Boolean(approved),
    customerApprovedAt: approved ? new Date().toISOString() : "",
    auditHistory: Array.isArray(booking.transport?.auditHistory) ? [...booking.transport.auditHistory] : [],
  };
  applied.auditHistory.unshift(transportAuditEntry(approved ? "customer-approved" : "recalculated", applied, note));
  applied.auditHistory = applied.auditHistory.slice(0, 20);
  booking.transport = applied;
  booking.transportFee = applied.transportFee;
  booking.diagnosticFee = applied.diagnosticFee;
  booking.estimatedTotalBeforeRepair = applied.estimatedTotalBeforeRepair;
  booking.distanceKm = applied.distanceKm;
  booking.travelTimeMinutes = applied.travelTimeMinutes;
  booking.estimatedArrival = applied.estimatedArrival;
  booking.customerLocation = {
    label: booking.address || `${booking.area} customer location`,
    area: booking.area,
    ...applied.customerLocation,
  };
  booking.technicianLocation = {
    label: applied.technicianName,
    area: booking.area,
    ...applied.technicianLocation,
  };
}

function etaFromMinutes(minutes = 0) {
  if (!minutes) return "On site";
  const eta = new Date(Date.now() + Number(minutes || 0) * 60000);
  return eta.toLocaleTimeString("en-ZW", { hour: "2-digit", minute: "2-digit" });
}

function etaIsoFromMinutes(minutes = 0) {
  return new Date(Date.now() + Number(minutes || 0) * 60000).toISOString();
}

function minutesBetween(start, end) {
  if (!start || !end) return null;
  const diff = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  return Number.isFinite(diff) ? diff : null;
}

function formatTimeLabel(value) {
  if (!value) return "TBC";
  return new Date(value).toLocaleTimeString("en-ZW", { hour: "2-digit", minute: "2-digit" });
}

function updateEtaForecast(booking, status = booking.status, payload = {}) {
  const preset = JOURNEY_PRESETS[status] || JOURNEY_PRESETS.Accepted;
  const minutes = Number(payload.travelTimeMinutes ?? booking.travelTimeMinutes ?? preset.travelTimeMinutes ?? 0);
  if (["Accepted", "Travelling", "Nearby"].includes(status) && (payload.travelTimeMinutes !== undefined || !booking.estimatedArrivalAt)) {
    booking.estimatedArrivalAt = etaIsoFromMinutes(minutes);
    booking.estimatedArrivalSource = "Placeholder ETA calculation - ready for Google Maps or Mapbox route ETA.";
  }
  if (status === "Nearby" && !booking.nearbyStatusMode) {
    booking.nearbyStatusMode = payload.statusUpdateMode || "Manual placeholder";
  }
  if (status === "Arrived") {
    booking.actualArrivalAt = booking.arrivedLocationRecordedAt || new Date().toISOString();
  }
}

function etaDetailsForBooking(booking) {
  const actualArrivalAt = booking.actualArrivalAt || booking.arrivedLocationRecordedAt || "";
  const estimatedArrivalAt = booking.estimatedArrivalAt || "";
  const varianceMinutes = actualArrivalAt && estimatedArrivalAt ? minutesBetween(estimatedArrivalAt, actualArrivalAt) : null;
  const currentDelay = !actualArrivalAt && estimatedArrivalAt && ["Travelling", "Nearby"].includes(booking.status) ? minutesBetween(estimatedArrivalAt, new Date().toISOString()) : null;
  const delayed = (varianceMinutes !== null && varianceMinutes > ETA_DELAY_THRESHOLD_MINUTES) || (currentDelay !== null && currentDelay > ETA_DELAY_THRESHOLD_MINUTES);
  return {
    estimatedArrivalAt,
    estimatedArrivalLabel: estimatedArrivalAt ? formatTimeLabel(estimatedArrivalAt) : booking.estimatedArrival || "TBC",
    actualArrivalAt,
    actualArrivalLabel: actualArrivalAt ? formatTimeLabel(actualArrivalAt) : "Not arrived",
    varianceMinutes,
    varianceLabel: varianceMinutes === null ? "Pending" : `${varianceMinutes > 0 ? "+" : ""}${varianceMinutes} min`,
    currentDelayMinutes: currentDelay !== null && currentDelay > 0 ? currentDelay : 0,
    isDelayed: delayed,
    source: booking.estimatedArrivalSource || "Placeholder ETA calculation - ready for Google Maps or Mapbox route ETA.",
    delayThresholdMinutes: ETA_DELAY_THRESHOLD_MINUTES,
  };
}

function journeyLabelForStatus(status) {
  const labels = {
    Accepted: "Booking accepted",
    Travelling: "Travel started",
    Nearby: "Technician nearby",
    Arrived: "Technician arrived",
    Working: "Work started",
    Paused: "Journey paused",
    Completed: "Work completed",
    "Customer Confirmed": "Customer confirmed",
    Cancelled: "Journey cancelled",
  };
  return labels[status] || status;
}

function liveLocationForBooking(booking) {
  const technician = technicianById(booking.technicianId);
  const preset = JOURNEY_PRESETS[booking.status] || JOURNEY_PRESETS.Accepted;
  const distanceKm = Number(booking.distanceKm ?? preset.distanceKm ?? 0);
  const travelTimeMinutes = Number(booking.travelTimeMinutes ?? preset.travelTimeMinutes ?? 0);
  const etaDetails = etaDetailsForBooking(booking);
  const customerLocation = booking.customerLocation || {
    label: booking.address || `${booking.area} customer location`,
    area: booking.area,
    ...areaCoordinates(booking.area, 0),
  };
  const technicianLocation = booking.technicianLocation || {
    label: technician ? `${technician.fullName} simulated location` : "Technician location pending",
    area: technician?.area || booking.area,
    ...areaCoordinates(technician?.area || booking.area, 0.025),
  };
  return {
    provider: booking.mapProvider || "Placeholder map ready for Google Maps, Mapbox or OpenStreetMap",
    providers: MAP_PROVIDER_PLACEHOLDERS,
    status: booking.status,
    statusLabel: preset.label || booking.status,
    distanceKm,
    distanceLabel: distanceKm ? `${distanceKm.toFixed(1)} km` : "On site",
    travelTimeMinutes,
    travelTimeLabel: travelTimeMinutes ? `${travelTimeMinutes} min` : "On site",
    estimatedArrival: etaDetails.estimatedArrivalLabel || booking.estimatedArrival || (travelTimeMinutes ? etaFromMinutes(travelTimeMinutes) : "On site"),
    etaDetails,
    technicianLocation,
    customerLocation,
    siteTime: jobTimerSummary(booking).label,
    completionTime: booking.jobFinishedAt || "To be confirmed",
    updatedAt: booking.locationUpdatedAt || booking.updatedAt || booking.createdAt || "",
  };
}

function ensureJourneyHistory(booking) {
  if (!Array.isArray(booking.journeyHistory)) {
    booking.journeyHistory = (booking.statusHistory || [])
      .filter((item) => JOURNEY_STATUSES.includes(item.status))
      .map((item) => ({
        status: item.status,
        label: journeyLabelForStatus(item.status),
        note: item.note || "",
        at: item.at,
      }));
  }
  return booking.journeyHistory;
}

function updateLiveLocation(booking, status = booking.status, payload = {}) {
  const preset = JOURNEY_PRESETS[status] || JOURNEY_PRESETS.Accepted;
  const now = new Date().toISOString();
  const technician = technicianById(booking.technicianId);
  const previousDistance = Number(booking.distanceKm ?? preset.distanceKm ?? 0);
  const distanceKm =
    payload.distanceKm !== undefined
      ? Number(payload.distanceKm || 0)
      : payload.simulateLocation
        ? Math.max(0, Number((previousDistance - 1.4).toFixed(1)))
        : preset.distanceKm;
  const travelTimeMinutes =
    payload.travelTimeMinutes !== undefined
      ? Number(payload.travelTimeMinutes || 0)
      : payload.simulateLocation
        ? Math.max(0, Number(booking.travelTimeMinutes || preset.travelTimeMinutes || 0) - 5)
        : preset.travelTimeMinutes;

  booking.distanceKm = Number(distanceKm || 0);
  booking.travelTimeMinutes = Number(travelTimeMinutes || 0);
  booking.locationUpdatedAt = now;
  booking.mapProvider = payload.mapProvider || booking.mapProvider || "Placeholder map ready for Google Maps, Mapbox or OpenStreetMap";
  if (!booking.estimatedArrival || payload.simulateLocation || payload.travelTimeMinutes !== undefined) {
    booking.estimatedArrival = booking.travelTimeMinutes ? etaFromMinutes(booking.travelTimeMinutes) : "On site";
  }
  booking.customerLocation = {
    label: booking.address || `${booking.area} customer location`,
    area: booking.area,
    ...(booking.transport?.customerLocation || areaCoordinates(booking.area, 0)),
  };
  booking.technicianLocation = {
    label: payload.locationNote || (technician ? `${technician.fullName} simulated location` : "Technician simulated location"),
    area: technician?.area || booking.area,
    ...areaCoordinates(technician?.area || booking.area, status === "Nearby" ? 0.004 : status === "Arrived" || status === "Working" || status === "Completed" ? 0 : 0.025),
  };
  if (!Array.isArray(booking.locationHistory)) booking.locationHistory = [];
  booking.locationHistory.unshift({
    status,
    distanceKm: booking.distanceKm,
    travelTimeMinutes: booking.travelTimeMinutes,
    note: payload.locationNote || journeyLabelForStatus(status),
    at: now,
  });
  booking.locationHistory = booking.locationHistory.slice(0, 20);
}

function bookingView(booking) {
  const technician = technicianById(booking.technicianId);
  const trustProfile = technician ? technicianTrustProfile(technician) : null;
  const timer = jobTimerSummary(booking);
  ensureJourneyHistory(booking);
  return {
    ...booking,
    bookingCode: booking.bookingCode || makeBookingCode(booking.id),
    statusHistory: booking.statusHistory || makeStatusHistory(booking.status || "Submitted"),
    journeyHistory: booking.journeyHistory || [],
    locationHistory: booking.locationHistory || [],
    liveLocation: liveLocationForBooking(booking),
    etaDetails: etaDetailsForBooking(booking),
    technicianAppState: technicianAppState(booking),
    locationPermissionStatus: booking.locationPermissionStatus || "Not Requested",
    locationTrackingActive: Boolean(booking.locationTrackingActive),
    locationDisabledDuringActiveJob: LOCATION_REQUIRED_STATUSES.includes(booking.status) && booking.locationPermissionStatus === "Refused",
    locationPrivacyMessage: LOCATION_PRIVACY_MESSAGE,
    adminAlerts: booking.adminAlerts || [],
    emergencyContact: PLATFORM_EMERGENCY_CONTACT,
    emergencyContactLink: `tel:${normalizePhone(PLATFORM_EMERGENCY_CONTACT)}`,
    jobTimer: timer,
    review: normalizeReview(booking.review, booking.customerName),
    technicianName: technician ? technician.fullName : "Unassigned",
    technicianTrade: technician ? technician.trade : "",
    technicianPhone: technician ? technician.phone : "",
    technicianWhatsapp: technician ? technician.whatsapp : "",
    technicianCallLink: technician ? `tel:${normalizePhone(technician.phone)}` : "",
    technicianWhatsappLink: technician ? waMe(technician.whatsapp) : "",
    technicianTrustScore: trustProfile ? trustProfile.score : 0,
    technicianTrustLevel: trustProfile ? trustProfile.level : "",
    payment: paymentForBookingView(booking),
  };
}

function notifyBooking(booking, audience, message) {
  if (!Array.isArray(booking.notifications)) booking.notifications = [];
  booking.notifications.unshift({ audience, message, at: new Date().toISOString(), read: false });
  booking.notifications = booking.notifications.slice(0, 12);
}

function alertAdmin(booking, message) {
  if (!Array.isArray(booking.adminAlerts)) booking.adminAlerts = [];
  booking.adminAlerts.unshift({ message, at: new Date().toISOString(), resolved: false });
  booking.adminAlerts = booking.adminAlerts.slice(0, 12);
  notifyBooking(booking, "admin", message);
}

function technicianAppState(booking) {
  if (["Completed", "Customer Confirmed", "Closed", "Cancelled"].includes(booking.status)) return "Offline";
  if (LIVE_TRACKING_STATUSES.includes(booking.status)) return booking.status === "Working" ? "Working" : "Live Tracking Active";
  if (booking.status === "Accepted") return "Job Accepted";
  if (booking.status === "Waiting for Technician") return "Available";
  return "Offline";
}

function requireLocationPermission(booking, payload = {}, targetStatus = booking.status) {
  if (!LOCATION_REQUIRED_STATUSES.includes(targetStatus)) return "";
  const technician = technicianById(booking.technicianId);
  if (payload.locationPermissionRefused === true) {
    booking.locationPermissionStatus = "Refused";
    booking.locationPermissionRefusedAt = new Date().toISOString();
    booking.locationTrackingActive = false;
    const technicianName = technician ? technician.fullName : "Assigned technician";
    alertAdmin(booking, `${technicianName} disabled required active-job location access for ${booking.bookingCode || makeBookingCode(booking.id)}. Booking may need reassignment.`);
    notifyBooking(booking, "technician", "Location sharing is required during active Service Market jobs.");
    return "Location permission is required during active Service Market jobs.";
  }
  const alreadyGranted = booking.locationPermissionStatus === "Granted";
  const grantedThisRequest = payload.locationPermissionGranted === true;
  if (alreadyGranted || grantedThisRequest) {
    booking.locationPermissionStatus = "Granted";
    booking.locationPermissionGrantedAt = booking.locationPermissionGrantedAt || new Date().toISOString();
    booking.locationPermissionRefusedAt = "";
    booking.locationTrackingActive = LIVE_TRACKING_STATUSES.includes(targetStatus);
    return "";
  }
  booking.locationPermissionStatus = "Required";
  booking.locationPermissionRefusedAt = booking.locationPermissionRefusedAt || "";
  booking.locationTrackingActive = false;
  const technicianName = technician ? technician.fullName : "Assigned technician";
  const message = `${technicianName} must grant location access before moving ${booking.bookingCode || makeBookingCode(booking.id)} to ${targetStatus}.`;
  alertAdmin(booking, message);
  notifyBooking(booking, "technician", "Location sharing is required during active Service Market jobs.");
  return "Location permission is required during active Service Market jobs.";
}

function notificationForStatus(status, booking) {
  const technician = technicianById(booking.technicianId);
  const technicianName = technician ? technician.fullName : "Your technician";
  const messages = {
    Accepted: `${technicianName} accepted the booking.`,
    Travelling: `${technicianName} is travelling to your location. Estimated arrival: ${booking.estimatedArrival || "to be confirmed"}.`,
    Nearby: `${technicianName} is nearby. Please be ready to receive the technician.`,
    Arrived: `${technicianName} has arrived.`,
    Working: "Work has started.",
    Completed: "Work has been completed. The service report is available.",
    "Customer Confirmed": "Customer confirmed job completion.",
    Paused: "The journey or job has been paused.",
    Cancelled: "This booking has been cancelled.",
  };
  return messages[status] || "";
}

function jobTimerSummary(booking, now = Date.now()) {
  const startedAt = booking.jobStartedAt ? new Date(booking.jobStartedAt).getTime() : 0;
  const finishedAt = booking.jobFinishedAt ? new Date(booking.jobFinishedAt).getTime() : 0;
  const pausedAt = booking.jobPausedAt ? new Date(booking.jobPausedAt).getTime() : 0;
  const pausedMs = Number(booking.totalPausedMs || 0) + (booking.status === "Paused" && pausedAt ? Math.max(0, now - pausedAt) : 0);
  const end = finishedAt || (startedAt ? now : 0);
  const elapsedMs = startedAt ? Math.max(0, end - startedAt - pausedMs) : 0;
  return {
    startedAt: booking.jobStartedAt || "",
    finishedAt: booking.jobFinishedAt || "",
    pausedAt: booking.jobPausedAt || "",
    totalPausedMs: Math.round(pausedMs),
    elapsedMs: Math.round(elapsedMs),
    labourHours: Number((elapsedMs / 3600000).toFixed(2)),
    label: formatDuration(elapsedMs),
    isActive: booking.status === "Working",
  };
}

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  return `${hours} hr ${minutes} min`;
}

function buildServiceReport(booking, payload = {}) {
  const technician = technicianById(booking.technicianId);
  const timer = jobTimerSummary(booking);
  return {
    id: booking.serviceReport?.id || `SR-${booking.bookingCode || booking.id}`,
    jobId: booking.bookingCode || makeBookingCode(booking.id),
    jobNumber: String(payload.jobNumber || booking.bookingCode || booking.id),
    customerName: booking.customerName,
    technicianName: technician ? technician.fullName : "Unassigned",
    date: new Date().toISOString(),
    serviceCategory: booking.category,
    problemReported: String(payload.problemReported || booking.issue || ""),
    diagnosis: String(payload.diagnosis ?? booking.diagnosis ?? ""),
    workPerformed: String(payload.workPerformed ?? booking.workPerformed ?? ""),
    partsUsed: String(payload.partsUsed ?? booking.partsUsed ?? ""),
    hoursWorked: Number(payload.hoursWorked || timer.labourHours || 0),
    labourHours: Number(payload.hoursWorked || timer.labourHours || 0),
    beforePhoto: String(payload.beforePhoto ?? booking.beforePhoto ?? "Before photo placeholder"),
    afterPhoto: String(payload.afterPhoto ?? booking.afterPhoto ?? "After photo placeholder"),
    warrantyPeriod: String(payload.warrantyPeriod || ""),
    technicianNotes: String(payload.technicianNotes ?? booking.jobNotes ?? ""),
    customerConfirmation: Boolean(payload.customerConfirmation || booking.customerConfirmedComplete),
    createdAt: booking.serviceReport?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function setBookingStatus(booking, status, note = "Status updated", payload = {}) {
  if (!BOOKING_STATUSES.includes(status)) return "";
  const permissionError = requireLocationPermission(booking, payload, status);
  if (permissionError) return permissionError;
  if (booking.status === status && Array.isArray(booking.statusHistory) && booking.statusHistory.length) return "";
  const previousStatus = booking.status;
  const now = new Date().toISOString();
  if (status === "Working") {
    if (!booking.jobStartedAt) booking.jobStartedAt = now;
    if (previousStatus === "Paused" && booking.jobPausedAt) {
      booking.totalPausedMs = Number(booking.totalPausedMs || 0) + Math.max(0, Date.now() - new Date(booking.jobPausedAt).getTime());
      booking.jobPausedAt = "";
    }
  }
  if (status === "Paused" && !booking.jobPausedAt) booking.jobPausedAt = now;
  if (status === "Completed" && !booking.jobFinishedAt) {
    if (!booking.jobStartedAt) booking.jobStartedAt = now;
    booking.jobFinishedAt = now;
  }
  booking.locationTrackingActive = LIVE_TRACKING_STATUSES.includes(status);
  if (["Completed", "Customer Confirmed", "Closed", "Cancelled"].includes(status)) {
    booking.locationTrackingActive = false;
  }
  if (status === "Arrived") booking.arrivedLocationRecordedAt = now;
  if (status === "Working") booking.workingLocationRecordedAt = now;
  updateEtaForecast(booking, status, payload);
  booking.status = status;
  updateLiveLocation(booking, status, payload);
  if (!Array.isArray(booking.statusHistory)) booking.statusHistory = [];
  booking.statusHistory.push({ status, note, at: now });
  if (JOURNEY_STATUSES.includes(status) || ["Paused", "Customer Confirmed", "Cancelled"].includes(status)) {
    const journey = ensureJourneyHistory(booking);
    journey.push({ status, label: journeyLabelForStatus(status), note, at: now });
  }
  const customerMessage = notificationForStatus(status, booking);
  if (customerMessage) notifyBooking(booking, "customer", customerMessage);
  if (["Customer Confirmed", "Cancelled"].includes(status)) {
    notifyBooking(booking, "technician", notificationForStatus(status, booking) || note);
  }
  if (status === "Completed") {
    booking.serviceReport = buildServiceReport(booking);
    notifyBooking(booking, "customer", "Service report is available for this job.");
  }
  return "";
}

function parseEstimate(range) {
  if (!range || /negotiable/i.test(range)) return 0;
  const values = String(range).match(/\d+(\.\d+)?/g);
  if (!values || !values.length) return 0;
  const nums = values.map(Number);
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function paymentByBookingId(bookingId) {
  return payments.find((payment) => payment.bookingId === Number(bookingId));
}

function paymentById(id) {
  return payments.find((payment) => payment.id === Number(id));
}

function makeReceiptNumber(booking) {
  return `RCPT-${booking.bookingCode || makeBookingCode(booking.id)}`;
}

function paymentRevenue(amount = 0) {
  const customerPayment = Number(amount || 0);
  const platformCommission = Number((customerPayment * PLATFORM_COMMISSION_RATE).toFixed(2));
  const technicianEarnings = Number((customerPayment - platformCommission).toFixed(2));
  return { customerPayment, platformCommission, technicianEarnings };
}

function paymentView(payment) {
  const booking = bookings.find((item) => item.id === payment.bookingId);
  const technician = technicianById(payment.technicianId || booking?.technicianId);
  const revenue = paymentRevenue(payment.amount);
  return {
    ...payment,
    bookingCode: payment.bookingCode || booking?.bookingCode || makeBookingCode(payment.bookingId),
    customerName: payment.customerName || booking?.customerName || "",
    technicianName: payment.technicianName || technician?.fullName || "Unassigned",
    serviceSummary: payment.serviceSummary || (booking ? `${booking.category} - ${booking.issue}` : ""),
    amount: Number(payment.amount || 0),
    currency: payment.currency || "USD",
    revenue,
    receipt: {
      receiptNumber: payment.receiptNumber || (booking ? makeReceiptNumber(booking) : `RCPT-${payment.id}`),
      bookingId: payment.bookingCode || booking?.bookingCode || payment.bookingId,
      customer: payment.customerName || booking?.customerName || "",
      technician: payment.technicianName || technician?.fullName || "Unassigned",
      amount: Number(payment.amount || 0),
      currency: payment.currency || "USD",
      diagnosticFee: booking?.diagnosticFee || 0,
      transportFee: booking?.transportFee || 0,
      estimatedTotalBeforeRepair: booking?.estimatedTotalBeforeRepair || 0,
      paymentMethod: payment.method,
      date: payment.updatedAt || payment.createdAt,
      paymentStatus: payment.status,
      pdfPlaceholder: "Download PDF placeholder",
    },
  };
}

function paymentForBookingView(booking) {
  const payment = paymentByBookingId(booking.id);
  if (payment) return paymentView(payment);
  const defaultAmount = Number(booking.estimatedTotalBeforeRepair || parseEstimate(booking.estimatedPriceRange) || 0);
  return {
    bookingId: booking.id,
    bookingCode: booking.bookingCode || makeBookingCode(booking.id),
    amount: defaultAmount,
    currency: booking.currency || "USD",
    method: booking.paymentMethod === "Not captured" ? "" : booking.paymentMethod || "",
    status: "Payment Pending",
    verificationStatus: "Pending",
    revenue: paymentRevenue(defaultAmount),
    receipt: null,
  };
}

function createPaymentFromBooking(booking, payload = {}) {
  const technician = technicianById(booking.technicianId);
  const approvedTransport = Number(booking.transport?.transportFee || booking.transportFee || 0);
  const requestedAmount = Number(payload.amount || booking.estimatedTotalBeforeRepair || parseEstimate(booking.estimatedPriceRange) || 0);
  const amount = Number(Math.max(requestedAmount, Number(booking.estimatedTotalBeforeRepair || 0)).toFixed(2));
  const method = PAYMENT_METHODS.includes(payload.method) ? payload.method : "EcoCash";
  const now = new Date().toISOString();
  const payment = {
    id: Date.now(),
    receiptNumber: makeReceiptNumber(booking),
    bookingId: booking.id,
    bookingCode: booking.bookingCode || makeBookingCode(booking.id),
    customerName: booking.customerName,
    technicianId: booking.technicianId,
    technicianName: technician ? technician.fullName : "Unassigned",
    serviceSummary: `${booking.category} - ${booking.issue}`,
    method,
    amount,
    currency: booking.currency || "USD",
    diagnosticFee: booking.diagnosticFee || 0,
    transportFee: approvedTransport,
    estimatedTotalBeforeRepair: booking.estimatedTotalBeforeRepair || 0,
    reference: String(payload.reference || payload.transactionReference || ""),
    phoneNumber: String(payload.phoneNumber || ""),
    proofOfPayment: String(payload.proofOfPayment || ""),
    cashReceived: Boolean(payload.cashReceived),
    customerConfirmed: Boolean(payload.customerConfirmed),
    adminVerified: false,
    status: method === "Cash" && payload.cashReceived ? "Awaiting Verification" : "Awaiting Verification",
    verificationStatus: payload.transactionReference || payload.reference || payload.proofOfPayment || payload.cashReceived ? "Submitted" : "Pending",
    notes: String(payload.notes || ""),
    createdAt: now,
    updatedAt: now,
  };
  payments.unshift(payment);
  booking.paymentMethod = method;
  booking.paymentStatus = payment.status;
  notifyBooking(booking, "customer", `Payment record created for ${method}.`);
  return payment;
}

function paymentsCsv() {
  const rows = [
    ["Receipt", "Booking ID", "Customer", "Technician", "Method", "Amount", "Currency", "Transport Fee", "Diagnostic Fee", "Status", "Reference", "Date", "Platform Commission", "Technician Earnings"],
    ...payments.map((payment) => {
      const view = paymentView(payment);
      return [
        view.receipt.receiptNumber,
        view.bookingCode,
        view.customerName,
        view.technicianName,
        view.method,
        view.amount,
        view.currency,
        view.receipt.transportFee || 0,
        view.receipt.diagnosticFee || 0,
        view.status,
        view.reference,
        view.updatedAt || view.createdAt,
        view.revenue.platformCommission,
        view.revenue.technicianEarnings,
      ];
    }),
  ];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function platformSummary() {
  const activeTechnicians = technicians.filter((technician) => !technician.suspended).length;
  const pendingApprovals = technicians.filter((technician) => technician.verificationStatus === "Pending Verification").length;
  const completedJobs = bookings.filter((booking) => ["Completed", "Customer Confirmed", "Closed"].includes(booking.status)).length;
  const disputes = bookings.filter((booking) => booking.dispute && !booking.dispute.resolved).length;
  const today = new Date().toISOString().slice(0, 10);
  const activeJobList = bookings.filter((booking) => ACTIVE_JOB_STATUSES.includes(booking.status));
  const activeJobs = activeJobList.length;
  const travellingTechnicians = bookings.filter((booking) => ["Travelling", "Nearby"].includes(booking.status)).length;
  const jobsInProgress = bookings.filter((booking) => ["Arrived", "Working", "Paused"].includes(booking.status)).length;
  const completedToday = bookings.filter((booking) => ["Completed", "Customer Confirmed", "Closed"].includes(booking.status) && String(booking.jobFinishedAt || booking.updatedAt || booking.createdAt || "").startsWith(today)).length;
  const cancelledJobs = bookings.filter((booking) => booking.status === "Cancelled").length;
  const delayedJobs = activeJobList.filter((booking) => etaDetailsForBooking(booking).isDelayed).length;
  const locationDisabledJobs = activeJobList.filter((booking) => booking.locationPermissionStatus === "Refused" || booking.locationDisabledDuringActiveJob).length;
  const estimatedServiceValue = bookings
    .filter((booking) => ["Completed", "Customer Confirmed", "Closed"].includes(booking.status))
    .reduce((sum, booking) => sum + parseEstimate(booking.estimatedPriceRange), 0);
  return {
    totalBookings: bookings.length,
    completedJobs,
    activeJobs,
    travellingTechnicians,
    jobsInProgress,
    delayedJobs,
    locationDisabledJobs,
    completedToday,
    cancelledJobs,
    activeTechnicians,
    pendingApprovals,
    disputes,
    totalPayments: payments.length,
    pendingPayments: payments.filter((payment) => payment.status === "Awaiting Verification").length,
    verifiedPayments: payments.filter((payment) => payment.status === "Paid").length,
    paymentRevenue: Math.round(payments.filter((payment) => payment.status === "Paid").reduce((sum, payment) => sum + paymentRevenue(payment.amount).platformCommission, 0)),
    estimatedServiceValue: Math.round(estimatedServiceValue),
    estimatedRevenue: Math.round(estimatedServiceValue * 0.08),
  };
}

function validateBooking(payload) {
  const required = ["customerName", "customerPhone", "category", "area", "issue"];
  const missing = required.filter((field) => !String(payload[field] || "").trim());
  if (missing.length) return `Missing required fields: ${missing.join(", ")}`;
  if (!SERVICE_CATEGORIES.includes(payload.category)) return "Unknown service category.";
  if (!SERVICE_AREAS.includes(payload.area)) return "Unknown service area.";
  if (payload.paymentMethod && !PAYMENT_METHODS.includes(payload.paymentMethod)) return "Unknown payment method.";
  if (payload.transportFeeAccepted !== true) return "Customer must confirm the estimated transport fee before submitting.";
  if (payload.customerLatitude !== undefined || payload.customerLongitude !== undefined) {
    if (!normalizeLatLng(payload.customerLatitude, payload.customerLongitude)) return "Customer location latitude and longitude are invalid.";
  }
  return "";
}

function csvEscape(value) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
  return stringValue;
}

function bookingsCsv() {
  const rows = [
    ["Booking ID", "Customer", "Phone", "WhatsApp", "Technician", "Category", "Area", "Address", "Urgency", "Preferred Time", "Status", "Estimate", "Transport Fee", "Distance Km", "ETA Minutes", "Issue", "Technician Notes", "Labour Hours", "Diagnosis", "Work Performed"],
    ...bookings.map((booking) => {
      const view = bookingView(booking);
      return [
        view.bookingCode,
        view.customerName,
        view.customerPhone,
        view.customerWhatsapp,
        view.technicianName,
        view.category,
        view.area,
        view.address,
        view.urgency,
        view.preferredTime,
        view.status,
        view.estimatedPriceRange,
        view.transportFee || view.transport?.transportFee || 0,
        view.transport?.distanceKm || view.distanceKm || 0,
        view.transport?.travelTimeMinutes || view.travelTimeMinutes || 0,
        view.issue,
        view.jobNotes,
        view.jobTimer?.labourHours || 0,
        view.diagnosis || view.serviceReport?.diagnosis || "",
        view.workPerformed || view.serviceReport?.workPerformed || "",
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
        paymentVerificationStatuses: METHOD_VERIFICATION_STATUSES,
        bankDetails: BANK_DETAILS,
        platformCommissionRate: PLATFORM_COMMISSION_RATE,
        transportPricing: platformSettings.transportPricing,
        bookingStatuses: BOOKING_STATUSES,
        journeyStatuses: JOURNEY_STATUSES,
        mapProviders: MAP_PROVIDER_PLACEHOLDERS,
        emergencyContact: PLATFORM_EMERGENCY_CONTACT,
        locationPrivacyMessage: LOCATION_PRIVACY_MESSAGE,
        verificationStatuses: VERIFICATION_STATUSES,
        reviewCategories: REVIEW_CATEGORIES,
        trustWeights: TRUST_WEIGHTS,
        trustEnginePillars: TRUST_ENGINE_PILLARS.map(([title, text]) => ({ title, text })),
        defaultCurrency: "USD",
        currencies: ["USD", "ZWL", "Negotiable"],
      });
    }

    if (req.method === "GET" && url.pathname === "/api/settings/transport") {
      return sendJson(res, 200, platformSettings.transportPricing);
    }

    if (req.method === "PATCH" && url.pathname === "/api/settings/transport") {
      const payload = await parseBody(req);
      const current = platformSettings.transportPricing;
      ["diagnosticFee", "freeRadiusKm", "minimumFee", "pricePerKm", "maximumFee", "emergencySurcharge", "afterHoursSurcharge"].forEach((field) => {
        if (payload[field] !== undefined) current[field] = clampNumber(payload[field], current[field] || 0);
      });
      if (payload.currency) current.currency = String(payload.currency || "USD").slice(0, 12);
      if (typeof payload.allowAdminOverride === "boolean") current.allowAdminOverride = payload.allowAdminOverride;
      if (payload.city && SERVICE_AREAS.includes(payload.city)) {
        current.cityRates[payload.city] = {
          ...(current.cityRates[payload.city] || {}),
          freeRadiusKm: clampNumber(payload.cityFreeRadiusKm ?? current.cityRates[payload.city]?.freeRadiusKm ?? current.freeRadiusKm, current.freeRadiusKm),
          minimumFee: clampNumber(payload.cityMinimumFee ?? current.cityRates[payload.city]?.minimumFee ?? current.minimumFee, current.minimumFee),
          pricePerKm: clampNumber(payload.cityPricePerKm ?? current.cityRates[payload.city]?.pricePerKm ?? current.pricePerKm, current.pricePerKm),
          maximumFee: clampNumber(payload.cityMaximumFee ?? current.cityRates[payload.city]?.maximumFee ?? current.maximumFee, current.maximumFee),
          emergencySurcharge: clampNumber(payload.cityEmergencySurcharge ?? current.cityRates[payload.city]?.emergencySurcharge ?? current.emergencySurcharge, current.emergencySurcharge),
          afterHoursSurcharge: clampNumber(payload.cityAfterHoursSurcharge ?? current.cityRates[payload.city]?.afterHoursSurcharge ?? current.afterHoursSurcharge, current.afterHoursSurcharge),
        };
      }
      return sendJson(res, 200, current);
    }

    if (req.method === "POST" && url.pathname === "/api/transport/estimate") {
      const payload = await parseBody(req);
      if (payload.category && !SERVICE_CATEGORIES.includes(payload.category)) return sendJson(res, 400, { error: "Unknown service category." });
      if (payload.area && !SERVICE_AREAS.includes(payload.area)) return sendJson(res, 400, { error: "Unknown service area." });
      const estimate = calculateTransportEstimate(payload);
      return sendJson(res, 200, estimate);
    }

    if (req.method === "GET" && url.pathname === "/api/technicians") {
      return sendJson(res, 200, filterTechnicians(url.searchParams));
    }

    if (req.method === "POST" && url.pathname === "/api/technicians") {
      const payload = await parseBody(req);
      if (!payload.saveAsDraft && (!payload.fullName || !payload.phone || !payload.area || !payload.trade)) {
        return sendJson(res, 400, { error: "Name, phone, service area, and trade are required." });
      }
      if (!payload.saveAsDraft && payload.locationPolicyAccepted !== true) {
        return sendJson(res, 400, { error: "Technicians must acknowledge active-job location sharing before submitting for verification." });
      }
      const documents = payload.documents && typeof payload.documents === "object" ? payload.documents : {};
      const references = Array.isArray(payload.references) ? payload.references.filter(Boolean) : [];
      const warrantyPolicy = String(payload.warrantyPolicy || "");
      const technician = {
        id: Date.now(),
        fullName: String(payload.fullName || "Draft Technician").trim(),
        businessName: String(payload.businessName || "").trim() || `${payload.fullName || "Draft Technician"} Services`,
        trade: String(payload.trade || "Pending Trade"),
        categories: Array.isArray(payload.categories) && payload.categories.length ? payload.categories : [String(payload.trade || "Pending Trade")],
        area: String(payload.area || "Harare"),
        phone: normalizePhone(payload.phone),
        whatsapp: normalizePhone(payload.whatsapp || payload.phone),
        yearsExperience: Number(payload.yearsExperience || 0),
        verificationStatus: payload.saveAsDraft ? "Draft" : "Pending Verification",
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
        identityVerified: false,
        phoneVerified: Boolean(payload.phone),
        qualificationsVerified: false,
        profileCompleted: Boolean(payload.fullName && payload.phone && payload.area && payload.trade && payload.yearsExperience),
        documents,
        references,
        warrantyPolicy,
        verificationNotes: payload.saveAsDraft ? "Draft saved by technician." : "Submitted for admin verification.",
        informationRequest: "",
        repeatCustomerRate: 0,
        complaintCount: 0,
        adminQualityScore: 60,
        emergencyAvailable: false,
        appState: "Offline",
        locationPolicyAccepted: Boolean(payload.locationPolicyAccepted),
        availableLocationPing: Boolean(payload.availableLocationPing),
        locationPermissionStatus: "Not Requested",
        warrantyOffered: Boolean(warrantyPolicy),
        pricingMethod: String(payload.priceRange || "Negotiable quote"),
        serviceAreas: [String(payload.area)],
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
      if (payload.verificationStatus === "Approved") {
        technician.identityVerified = true;
        technician.qualificationsVerified = true;
        technician.idChecked = true;
        technician.profileCompleted = true;
      }
      if (typeof payload.idChecked === "boolean") technician.idChecked = payload.idChecked;
      if (typeof payload.identityVerified === "boolean") technician.identityVerified = payload.identityVerified;
      if (typeof payload.phoneVerified === "boolean") technician.phoneVerified = payload.phoneVerified;
      if (typeof payload.qualificationsVerified === "boolean") technician.qualificationsVerified = payload.qualificationsVerified;
      if (typeof payload.warrantyOffered === "boolean") technician.warrantyOffered = payload.warrantyOffered;
      if (typeof payload.emergencyAvailable === "boolean") technician.emergencyAvailable = payload.emergencyAvailable;
      if (typeof payload.adminRecommended === "boolean") technician.adminRecommended = payload.adminRecommended;
      if (typeof payload.backgroundChecked === "boolean") technician.backgroundChecked = payload.backgroundChecked;
      if (typeof payload.premiumProfessional === "boolean") technician.premiumProfessional = payload.premiumProfessional;
      if (payload.adminQualityScore !== undefined) {
        technician.adminQualityScore = Math.max(0, Math.min(100, Number(payload.adminQualityScore || 0)));
      }
      if (payload.trustScoreAdjustment !== undefined) {
        technician.trustScoreAdjustment = Math.max(-20, Math.min(20, Number(payload.trustScoreAdjustment || 0)));
      }
      if (payload.complaintCount !== undefined) technician.complaintCount = Math.max(0, Number(payload.complaintCount || 0));
      if (payload.completedJobs !== undefined) technician.completedJobs = Math.max(0, Number(payload.completedJobs || 0));
      if (payload.profileViews !== undefined) technician.profileViews = Math.max(0, Number(payload.profileViews || 0));
      if (payload.repeatCustomerRate !== undefined) {
        technician.repeatCustomerRate = Math.max(0, Math.min(100, Number(payload.repeatCustomerRate || 0)));
      }
      if (payload.rating !== undefined) technician.rating = Math.max(0, Math.min(5, Number(payload.rating || 0)));
      if (payload.pricingMethod !== undefined) technician.pricingMethod = String(payload.pricingMethod || "");
      if (payload.verificationNotes !== undefined) technician.verificationNotes = String(payload.verificationNotes || "");
      if (payload.internalNotes !== undefined) technician.internalNotes = String(payload.internalNotes || "");
      if (payload.informationRequest !== undefined) technician.informationRequest = String(payload.informationRequest || "");
      if (payload.documents && typeof payload.documents === "object") technician.documents = payload.documents;
      if (typeof payload.suspended === "boolean") {
        technician.suspended = payload.suspended;
        if (payload.suspended) technician.verificationStatus = "Suspended";
      }
      if (!Array.isArray(technician.trustHistory)) technician.trustHistory = [];
      if (payload.verificationStatus === "Approved") {
        technician.trustHistory.unshift({ title: "Admin approved", detail: "Technician verification approved by admin.", at: new Date().toISOString().slice(0, 10) });
      }
      if (payload.adminRecommended === true) {
        technician.trustHistory.unshift({ title: "Admin recommendation", detail: "Admin recommended this technician for stronger marketplace trust.", at: new Date().toISOString().slice(0, 10) });
      }
      if (payload.complaintCount === 0) {
        technician.trustHistory.unshift({ title: "Complaint resolved", detail: "Complaint record updated to zero open complaints.", at: new Date().toISOString().slice(0, 10) });
      }
      technician.trustHistory = technician.trustHistory.slice(0, 12);
      return sendJson(res, 200, publicTechnician(technician));
    }

    if (req.method === "GET" && url.pathname === "/api/customers") {
      return sendJson(res, 200, customers);
    }

    if (req.method === "GET" && url.pathname === "/api/bookings") {
      return sendJson(res, 200, bookings.map(bookingView));
    }

    if (req.method === "GET" && url.pathname === "/api/payments") {
      const method = url.searchParams.get("method") || "";
      const status = url.searchParams.get("status") || "";
      const technicianId = url.searchParams.get("technicianId") || "";
      const visible = payments
        .filter((payment) => !method || payment.method === method)
        .filter((payment) => !status || payment.status === status || payment.verificationStatus === status)
        .filter((payment) => !technicianId || Number(payment.technicianId) === Number(technicianId))
        .map(paymentView);
      return sendJson(res, 200, visible);
    }

    const bookingPaymentMatch = url.pathname.match(/^\/api\/bookings\/(\d+)\/payment$/);
    if (req.method === "POST" && bookingPaymentMatch) {
      const booking = bookings.find((item) => item.id === Number(bookingPaymentMatch[1]));
      if (!booking) return sendJson(res, 404, { error: "Booking not found." });
      if (!["Completed", "Customer Confirmed", "Closed"].includes(booking.status)) {
        return sendJson(res, 400, { error: "Payments can be submitted after the job is completed." });
      }
      const payload = await parseBody(req);
      const existing = paymentByBookingId(booking.id);
      const payment = existing || createPaymentFromBooking(booking, payload);
      if (existing) {
        if (payload.method && PAYMENT_METHODS.includes(payload.method)) payment.method = payload.method;
        if (payload.amount !== undefined) payment.amount = Number(payload.amount || 0);
        if (payload.reference !== undefined || payload.transactionReference !== undefined) payment.reference = String(payload.reference || payload.transactionReference || "");
        if (payload.phoneNumber !== undefined) payment.phoneNumber = String(payload.phoneNumber || "");
        if (payload.proofOfPayment !== undefined) payment.proofOfPayment = String(payload.proofOfPayment || "");
        if (payload.cashReceived !== undefined) payment.cashReceived = Boolean(payload.cashReceived);
        if (payload.customerConfirmed !== undefined) payment.customerConfirmed = Boolean(payload.customerConfirmed);
        if (payload.notes !== undefined) payment.notes = String(payload.notes || "");
        payment.status = "Awaiting Verification";
        payment.verificationStatus = payment.reference || payment.proofOfPayment || payment.cashReceived ? "Submitted" : "Pending";
        payment.updatedAt = new Date().toISOString();
        booking.paymentMethod = payment.method;
        booking.paymentStatus = payment.status;
      }
      notifyBooking(booking, "customer", `Payment submitted by ${payment.method}. Admin verification pending.`);
      return sendJson(res, 200, paymentView(payment));
    }

    const paymentAdminMatch = url.pathname.match(/^\/api\/payments\/(\d+)$/);
    if (req.method === "PATCH" && paymentAdminMatch) {
      const payment = paymentById(paymentAdminMatch[1]);
      if (!payment) return sendJson(res, 404, { error: "Payment not found." });
      const payload = await parseBody(req);
      if (payload.status && PAYMENT_STATUSES.includes(payload.status)) payment.status = payload.status;
      if (payload.verificationStatus && METHOD_VERIFICATION_STATUSES.includes(payload.verificationStatus)) payment.verificationStatus = payload.verificationStatus;
      if (payload.action === "approve") {
        payment.status = "Paid";
        payment.verificationStatus = "Verified";
        payment.adminVerified = true;
      }
      if (payload.action === "reject") {
        payment.status = "Rejected";
        payment.verificationStatus = "Rejected";
        payment.adminVerified = false;
      }
      if (payload.action === "more-info") {
        payment.status = "Awaiting Verification";
        payment.verificationStatus = "Pending";
      }
      if (payload.notes !== undefined) payment.notes = String(payload.notes || "");
      payment.updatedAt = new Date().toISOString();
      const booking = bookings.find((item) => item.id === payment.bookingId);
      if (booking) {
        booking.paymentMethod = payment.method;
        booking.paymentStatus = payment.status;
        notifyBooking(booking, "customer", `Payment status updated: ${payment.status}.`);
      }
      return sendJson(res, 200, paymentView(payment));
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
      const transportEstimate = calculateTransportEstimate({
        technicianId: requestedTechnician?.id || null,
        area: payload.area,
        category: payload.category,
        urgency: payload.urgency,
        customerLatitude: payload.customerLatitude,
        customerLongitude: payload.customerLongitude,
        afterHours: payload.afterHours === true,
      });
      const bookingId = Date.now();
      const initialStatus = requestedTechnician ? "Waiting for Technician" : "Submitted";
      const booking = {
        id: bookingId,
        bookingCode: makeBookingCode(bookingId),
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
        paymentMethod: payload.paymentMethod || "Not captured",
        paymentStatus: "Payment Pending",
        status: initialStatus,
        statusHistory: makeStatusHistory(initialStatus, requestedTechnician ? "Booking sent to selected technician." : "Customer submitted request."),
        jobNotes: "",
        diagnosis: "",
        workPerformed: "",
        partsUsed: "",
        beforePhoto: payload.customerImage?.name || "",
        afterPhoto: "",
        estimatedArrival: transportEstimate.estimatedArrival,
        estimatedArrivalAt: requestedTechnician ? etaIsoFromMinutes(transportEstimate.travelTimeMinutes) : "",
        estimatedArrivalSource: "Placeholder ETA calculation - ready for Google Maps or Mapbox route ETA.",
        distanceKm: transportEstimate.distanceKm,
        travelTimeMinutes: transportEstimate.travelTimeMinutes,
        mapProvider: "Placeholder map ready for Google Maps, Mapbox or OpenStreetMap",
        technicianLocation: null,
        customerLocation: null,
        locationHistory: [],
        journeyHistory: [],
        jobStartedAt: "",
        jobFinishedAt: "",
        jobPausedAt: "",
        totalPausedMs: 0,
        customerImage: payload.customerImage || null,
        notifications: [],
        dispute: null,
        customerConfirmedComplete: false,
        review: null,
        createdAt: new Date().toISOString(),
      };
      applyTransportEstimateToBooking(booking, transportEstimate, true, "Customer approved transport fee before booking submission.");
      bookings.unshift(booking);
      return sendJson(res, 201, bookingView(booking));
    }

    const bookingStatusMatch = url.pathname.match(/^\/api\/bookings\/(\d+)\/status$/);
    if (req.method === "PATCH" && bookingStatusMatch) {
      const booking = bookings.find((item) => item.id === Number(bookingStatusMatch[1]));
      if (!booking) return sendJson(res, 404, { error: "Booking not found." });
      const payload = await parseBody(req);
      if (payload.estimatedArrival !== undefined) booking.estimatedArrival = String(payload.estimatedArrival || "");
      if (payload.diagnosis !== undefined) booking.diagnosis = String(payload.diagnosis || "");
      if (payload.workPerformed !== undefined) booking.workPerformed = String(payload.workPerformed || "");
      if (payload.partsUsed !== undefined) booking.partsUsed = String(payload.partsUsed || "");
      if (payload.beforePhoto !== undefined) booking.beforePhoto = String(payload.beforePhoto || "");
      if (payload.afterPhoto !== undefined) booking.afterPhoto = String(payload.afterPhoto || "");
      if (payload.distanceKm !== undefined) booking.distanceKm = Number(payload.distanceKm || 0);
      if (payload.travelTimeMinutes !== undefined) booking.travelTimeMinutes = Number(payload.travelTimeMinutes || 0);
      if (payload.mapProvider !== undefined) booking.mapProvider = String(payload.mapProvider || "Placeholder map ready for Google Maps, Mapbox or OpenStreetMap");
      if (payload.locationNote !== undefined) booking.locationNote = String(payload.locationNote || "");
      if (payload.status && BOOKING_STATUSES.includes(payload.status)) {
        const permissionError = requireLocationPermission(booking, payload, payload.status);
        if (permissionError) return sendJson(res, 403, { error: permissionError, booking: bookingView(booking) });
        if (payload.status === booking.status) {
          updateEtaForecast(booking, payload.status, payload);
          updateLiveLocation(booking, payload.status, payload);
          notifyBooking(booking, "customer", payload.note || `${journeyLabelForStatus(payload.status)} update shared.`);
        } else {
          const statusError = setBookingStatus(booking, payload.status, payload.note || "Status updated.", payload);
          if (statusError) return sendJson(res, 403, { error: statusError, booking: bookingView(booking) });
        }
      } else if (payload.simulateLocation === true || payload.distanceKm !== undefined || payload.travelTimeMinutes !== undefined || payload.locationNote) {
        const permissionError = requireLocationPermission(booking, payload, booking.status);
        if (permissionError) return sendJson(res, 403, { error: permissionError, booking: bookingView(booking) });
        updateEtaForecast(booking, booking.status, payload);
        updateLiveLocation(booking, booking.status, payload);
        notifyBooking(booking, "customer", payload.note || "Technician shared a live location update.");
      }
      if (payload.paymentStatus && PAYMENT_STATUSES.includes(payload.paymentStatus)) booking.paymentStatus = payload.paymentStatus;
      if (payload.paymentMethod && PAYMENT_METHODS.includes(payload.paymentMethod)) booking.paymentMethod = payload.paymentMethod;
      if (payload.technicianId !== undefined) {
        const technician = technicianById(payload.technicianId);
        booking.technicianId = technician ? technician.id : null;
        if (technician && ["Submitted", "Waiting for Technician"].includes(booking.status)) {
          setBookingStatus(booking, "Waiting for Technician", `Assigned to ${technician.fullName}.`, payload);
        }
        if (technician) {
          const estimate = calculateTransportEstimate({
            technicianId: technician.id,
            area: booking.area,
            category: booking.category,
            urgency: booking.urgency,
            customerLatitude: booking.transport?.customerLocation?.lat,
            customerLongitude: booking.transport?.customerLocation?.lng,
          });
          applyTransportEstimateToBooking(booking, estimate, false, `Transport fee recalculated after assignment to ${technician.fullName}.`);
          notifyBooking(booking, "customer", "Transport fee was recalculated after technician assignment. Admin can confirm any revised amount.");
        }
      }
      if (payload.jobNotes !== undefined) booking.jobNotes = String(payload.jobNotes || "");
      if (payload.customerConfirmedComplete === true) {
        booking.customerConfirmedComplete = true;
        if (booking.serviceReport) booking.serviceReport.customerConfirmation = true;
        setBookingStatus(booking, "Customer Confirmed", "Customer confirmed completion.", payload);
        notifyBooking(booking, "technician", `${booking.customerName} confirmed job completion.`);
      }
      if (payload.cancelReason) {
        booking.cancellationReason = String(payload.cancelReason);
        setBookingStatus(booking, "Cancelled", booking.cancellationReason, payload);
      }
      if (payload.disputeReason) {
        booking.dispute = { reason: String(payload.disputeReason), resolved: false };
        booking.paymentStatus = "Rejected";
        notifyBooking(booking, "technician", `${booking.customerName} reported an issue: ${booking.dispute.reason}`);
      }
      if (payload.resolveDispute === true && booking.dispute) {
        booking.dispute.resolved = true;
      }
      return sendJson(res, 200, bookingView(booking));
    }

    const bookingTransportMatch = url.pathname.match(/^\/api\/bookings\/(\d+)\/transport$/);
    if (req.method === "PATCH" && bookingTransportMatch) {
      const booking = bookings.find((item) => item.id === Number(bookingTransportMatch[1]));
      if (!booking) return sendJson(res, 404, { error: "Booking not found." });
      if (!platformSettings.transportPricing.allowAdminOverride) return sendJson(res, 403, { error: "Admin transport overrides are disabled." });
      const payload = await parseBody(req);
      const fee = clampNumber(payload.transportFee, booking.transportFee || 0);
      if (!booking.transport) {
        applyTransportEstimateToBooking(
          booking,
          calculateTransportEstimate({
            technicianId: booking.technicianId,
            area: booking.area,
            category: booking.category,
            urgency: booking.urgency,
          }),
          false,
          "Transport fee restored before admin override."
        );
      }
      const previousFee = booking.transport.transportFee;
      booking.transport.transportFee = fee;
      booking.transport.estimatedTotalBeforeRepair = Number((Number(booking.transport.diagnosticFee || 0) + fee).toFixed(2));
      booking.transport.calculationMethod = "Admin manual override.";
      booking.transport.adminOverrideReason = String(payload.note || "Admin override");
      booking.transport.customerApproved = false;
      booking.transport.auditHistory.unshift(transportAuditEntry("admin-override", booking.transport, `Admin changed transport fee from ${previousFee} to ${fee}. ${payload.note || ""}`.trim()));
      booking.transport.auditHistory = booking.transport.auditHistory.slice(0, 20);
      booking.transportFee = booking.transport.transportFee;
      booking.estimatedTotalBeforeRepair = booking.transport.estimatedTotalBeforeRepair;
      notifyBooking(booking, "customer", "Transport fee was updated by admin. Please confirm the revised amount before final payment.");
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

    const serviceReportMatch = url.pathname.match(/^\/api\/bookings\/(\d+)\/service-report$/);
    if (req.method === "POST" && serviceReportMatch) {
      const booking = bookings.find((item) => item.id === Number(serviceReportMatch[1]));
      if (!booking) return sendJson(res, 404, { error: "Booking not found." });
      if (!booking.technicianId) return sendJson(res, 400, { error: "Assign a technician before creating a service report." });
      const payload = await parseBody(req);
      if (payload.diagnosis !== undefined) booking.diagnosis = String(payload.diagnosis || "");
      if (payload.workPerformed !== undefined) booking.workPerformed = String(payload.workPerformed || "");
      if (payload.partsUsed !== undefined) booking.partsUsed = String(payload.partsUsed || "");
      if (payload.beforePhoto !== undefined) booking.beforePhoto = String(payload.beforePhoto || "");
      if (payload.afterPhoto !== undefined) booking.afterPhoto = String(payload.afterPhoto || "");
      if (payload.technicianNotes !== undefined) booking.jobNotes = String(payload.technicianNotes || "");
      booking.serviceReport = buildServiceReport(booking, payload);
      notifyBooking(booking, "customer", "Service report is available for this job.");
      return sendJson(res, 200, bookingView(booking));
    }

    if (req.method === "GET" && url.pathname === "/api/admin/summary") {
      return sendJson(res, 200, platformSummary());
    }

    if (req.method === "GET" && url.pathname === "/api/reports/bookings.csv") {
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="service-market-bookings.csv"',
      });
      return res.end(bookingsCsv());
    }

    if (req.method === "GET" && url.pathname === "/api/reports/payments.csv") {
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="service-market-payments.csv"',
      });
      return res.end(paymentsCsv());
    }

    return sendJson(res, 404, { error: "API route not found." });
  } catch (error) {
    if (error.statusCode) return sendJson(res, error.statusCode, { error: error.message });
    if (error instanceof SyntaxError) return sendJson(res, 400, { error: "Invalid JSON body." });
    console.error(error);
    return sendJson(res, 500, { error: "Server error." });
  }
}

const server = http.createServer((req, res) => {
  if (!["GET", "POST", "PATCH", "HEAD"].includes(req.method)) {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }
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
