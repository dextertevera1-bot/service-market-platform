// Harare suburbs with approximate centre points (good enough for matching and travel
// estimates; the customer's shared WhatsApp location is used when we have it).
export const SUBURBS = {
  "Arcadia": [-17.840, 31.055], "Avondale": [-17.795, 31.040], "Belgravia": [-17.805, 31.045],
  "Belvedere": [-17.832, 31.020], "Borrowdale": [-17.757, 31.095], "Budiriro": [-17.890, 30.930],
  "Chisipite": [-17.785, 31.120], "Dzivarasekwa": [-17.810, 30.910], "Eastlea": [-17.830, 31.075],
  "Epworth": [-17.890, 31.150], "Glen View": [-17.905, 30.955], "Greendale": [-17.810, 31.120],
  "Hatfield": [-17.880, 31.095], "Highfield": [-17.880, 30.995], "Highlands": [-17.795, 31.085],
  "Kuwadzana": [-17.830, 30.920], "Mabelreign": [-17.790, 31.000], "Mabvuku": [-17.805, 31.175],
  "Marlborough": [-17.750, 31.010], "Mbare": [-17.855, 31.040], "Milton Park": [-17.815, 31.030],
  "Mount Pleasant": [-17.770, 31.045], "Msasa": [-17.835, 31.125], "Mufakose": [-17.880, 30.910],
  "Southerton": [-17.860, 31.010], "Tafara": [-17.795, 31.160], "Warren Park": [-17.830, 30.975],
  "Waterfalls": [-17.895, 31.040],
};
export const CBD = [-17.8292, 31.0522];
export const LAUNCH_RADIUS_KM = 25; // outside this we take the request but tell the customer it's outside the launch area

export function findSuburb(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  return Object.keys(SUBURBS).find((s) => s.toLowerCase() === t) || Object.keys(SUBURBS).find((s) => t.includes(s.toLowerCase()) || s.toLowerCase().startsWith(t)) || null;
}

export function nearestSuburb(lat, lng) {
  let best = null, bd = Infinity;
  for (const [n, [a, b]] of Object.entries(SUBURBS)) { const d = haversine(lat, lng, a, b); if (d < bd) { bd = d; best = n; } }
  return best;
}

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
// Road distance is longer than a straight line; 1.3 is a common rule of thumb for cities.
export const roadKm = (lat1, lng1, lat2, lng2) => Math.round(haversine(lat1, lng1, lat2, lng2) * 1.3 * 10) / 10;
