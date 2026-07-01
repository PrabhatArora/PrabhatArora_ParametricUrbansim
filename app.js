const canvas = document.getElementById("cityCanvas");
const ctx = canvas.getContext("2d");
const controlsEl = document.getElementById("typologyControls");
const legendEl = document.getElementById("legend");
const avgHeightEl = document.getElementById("avgHeight");
const totalAreaEl = document.getElementById("totalArea");
const floorRatioEl = document.getElementById("floorRatio");
const buildingCountEl = document.getElementById("buildingCount");
const openSpaceShareEl = document.getElementById("openSpaceShare");
const siteScaleEl = document.getElementById("siteScale");
const zoomOutBtn = document.getElementById("zoomOut");
const zoomInBtn = document.getElementById("zoomIn");
const fitViewBtn = document.getElementById("fitView");
const panToggleBtn = document.getElementById("panToggle");
const autoSpinToggleBtn = document.getElementById("autoSpinToggle");
const renderPreviewBtn = document.getElementById("renderPreview");
const renderStatusEl = document.getElementById("renderStatus");
const exportPngBtn = document.getElementById("exportPng");
const exportObjBtn = document.getElementById("exportObj");
const exportStatusEl = document.getElementById("exportStatus");

const siteAreaSqM = 48000000;
const siteUnits = 14;
const siteSqMPerUnit = siteAreaSqM / (siteUnits * siteUnits);
const siteAreaSqKm = siteAreaSqM / 1000000;
const metersPerUnit = Math.sqrt(siteAreaSqM) / siteUnits;
const siteExtentM = metersPerUnit * siteUnits;

const typologies = {
  offices: {
    label: "Offices",
    color: "#2f5f98",
    roof: "#8fb0d2",
    min: 35,
    max: 240,
    value: 125,
    defaultValue: 125,
    base: 1.08,
    efficiency: 0.86,
    buildable: true,
  },
  residential: {
    label: "Residential",
    color: "#3f8b68",
    roof: "#99bd85",
    min: 18,
    max: 170,
    value: 78,
    defaultValue: 78,
    base: 1,
    efficiency: 0.82,
    buildable: true,
  },
  hotels: {
    label: "Hotels",
    color: "#a86c2d",
    roof: "#d1a15c",
    min: 25,
    max: 190,
    value: 92,
    defaultValue: 92,
    base: 0.96,
    efficiency: 0.8,
    buildable: true,
  },
  social: {
    label: "Social Gathering",
    color: "#ae436f",
    roof: "#dc8aaa",
    min: 8,
    max: 70,
    value: 28,
    defaultValue: 28,
    base: 0.82,
    efficiency: 0.72,
    buildable: true,
  },
  retail: {
    label: "Retail / Active Edge",
    color: "#cf5a42",
    roof: "#ee9874",
    min: 6,
    max: 45,
    value: 18,
    defaultValue: 18,
    base: 0.72,
    efficiency: 0.88,
    buildable: true,
  },
  logistics: {
    label: "Port / Logistics",
    color: "#66727a",
    roof: "#a7b1b6",
    min: 8,
    max: 42,
    value: 24,
    defaultValue: 24,
    base: 0.8,
    efficiency: 0.9,
    buildable: true,
  },
  industry: {
    label: "Clean Industry",
    color: "#6e7f3f",
    roof: "#a7ba73",
    min: 12,
    max: 75,
    value: 38,
    defaultValue: 38,
    base: 0.86,
    efficiency: 0.78,
    buildable: true,
  },
  data: {
    label: "AI / Data Campus",
    color: "#5367a8",
    roof: "#9aa9df",
    min: 18,
    max: 95,
    value: 46,
    defaultValue: 46,
    base: 0.88,
    efficiency: 0.82,
    buildable: true,
  },
  plaza: {
    label: "Public Plazas",
    color: "#d9c067",
    buildable: false,
  },
  park: {
    label: "Parks / Green Space",
    color: "#8fb367",
    buildable: false,
  },
  water: {
    label: "Waterbodies",
    color: "#68a9bd",
    buildable: false,
  },
};

const allTypologyKeys = Object.keys(typologies);
const buildingKeys = allTypologyKeys.filter((key) => typologies[key].buildable);
let parcels = [];
let roads = [];
let transitStops = [];
let siteBoundary = [];
let planSeed = Date.now();
let viewScale = 1;
let viewOffset = { x: 0, y: 0 };
let viewRotation = -Math.PI / 10;
let autoSpinEnabled = false;
let autoSpinFrame = null;
let lastSpinTime = 0;
let panEnabled = false;
let isDragging = false;
let isOrbiting = false;
let dragStart = { x: 0, y: 0 };
let dragOrigin = { x: 0, y: 0 };
let dragRotationOrigin = viewRotation;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(860, Math.floor(rect.width * scale));
  canvas.height = Math.max(560, Math.floor(rect.height * scale));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  draw();
}

function clampZoom(value) {
  return Math.max(0.58, Math.min(2.8, value));
}

function setZoom(nextZoom, anchor = null) {
  const previous = viewScale;
  viewScale = clampZoom(nextZoom);
  if (anchor) {
    viewOffset.x = anchor.x - ((anchor.x - viewOffset.x) * viewScale) / previous;
    viewOffset.y = anchor.y - ((anchor.y - viewOffset.y) * viewScale) / previous;
  }
  draw();
}

function fitView() {
  viewScale = 1;
  viewOffset = { x: 0, y: 0 };
  if (!autoSpinEnabled) viewRotation = -Math.PI / 10;
  draw();
}

function finishPan(pointerId = null) {
  if (!isDragging && !isOrbiting) return;
  isDragging = false;
  isOrbiting = false;
  if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  canvas.closest(".viewport").classList.remove("is-dragging");
  canvas.closest(".viewport").classList.remove("is-orbiting");
}

function animateSpin(timestamp) {
  if (!autoSpinEnabled) return;
  if (!lastSpinTime) lastSpinTime = timestamp;
  const elapsed = Math.min(40, timestamp - lastSpinTime);
  lastSpinTime = timestamp;
  viewRotation += elapsed * 0.00022;
  draw();
  autoSpinFrame = window.requestAnimationFrame(animateSpin);
}

function setAutoSpin(enabled) {
  autoSpinEnabled = enabled;
  autoSpinToggleBtn.setAttribute("aria-pressed", String(enabled));
  autoSpinToggleBtn.textContent = enabled ? "Stop" : "Spin";
  if (enabled) {
    lastSpinTime = 0;
    if (autoSpinFrame) window.cancelAnimationFrame(autoSpinFrame);
    autoSpinFrame = window.requestAnimationFrame(animateSpin);
  } else if (autoSpinFrame) {
    window.cancelAnimationFrame(autoSpinFrame);
    autoSpinFrame = null;
  }
}

function seededRandom(seed) {
  let value = Math.abs(seed) % 2147483647;
  if (value === 0) value = 1;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function pickWeighted(random, choices) {
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  let pick = random() * total;
  for (const choice of choices) {
    pick -= choice.weight;
    if (pick <= 0) return choice.type;
  }
  return choices[choices.length - 1].type;
}

function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 3000 ? 2 : 1)} km` : `${Math.round(meters)} m`;
}

function formatArea(sqm) {
  return sqm >= 1000000 ? `${(sqm / 1000000).toFixed(1)}M sqm` : `${(sqm / 10000).toFixed(1)} ha`;
}

function rotateSitePoint(x, y) {
  const center = siteUnits / 2;
  const dx = x - center;
  const dy = y - center;
  return {
    x: center + Math.cos(viewRotation) * dx - Math.sin(viewRotation) * dy,
    y: center + Math.sin(viewRotation) * dx + Math.cos(viewRotation) * dy,
  };
}

function iso(x, y, originX, originY, tileW, tileH) {
  const rotated = rotateSitePoint(x, y);
  return { x: originX + (rotated.x - rotated.y) * (tileW / 2), y: originY + (rotated.x + rotated.y) * (tileH / 2) };
}

function jitteredPoint(x, y, random, amount = 0.16) {
  return {
    x: Math.max(0, Math.min(siteUnits, x + (random() - 0.5) * amount)),
    y: Math.max(0, Math.min(siteUnits, y + (random() - 0.5) * amount)),
  };
}

function createOrganicBoundary(random) {
  const coast = [
    { x: 1.15, y: 1.05 },
    { x: 1.55, y: 2.15 },
    { x: 1.28, y: 3.15 },
    { x: 1.86, y: 4.15 },
    { x: 1.52, y: 5.1 },
    { x: 2.05, y: 6.05 },
    { x: 1.7, y: 7.05 },
    { x: 2.28, y: 8.05 },
    { x: 2.0, y: 9.05 },
    { x: 2.58, y: 10.05 },
    { x: 2.2, y: 11.05 },
    { x: 2.86, y: 12.05 },
    { x: 2.62, y: 13.0 },
  ].map((point, index) => ({
    x: point.x + (random() - 0.5) * 0.16,
    y: point.y + Math.sin(index * 1.4) * 0.08,
  }));

  const inland = [
    { x: 12.15, y: 13.05 },
    { x: 12.9, y: 11.55 },
    { x: 12.65, y: 9.9 },
    { x: 13.08, y: 8.1 },
    { x: 12.55, y: 6.4 },
    { x: 13.0, y: 4.65 },
    { x: 12.25, y: 2.7 },
    { x: 10.95, y: 1.0 },
    { x: 8.55, y: 0.55 },
    { x: 5.25, y: 0.7 },
    { x: 2.75, y: 0.72 },
  ].map((point, index) => ({
    x: point.x + (random() - 0.5) * 0.14,
    y: point.y + Math.cos(index * 1.2) * 0.08,
  }));

  return [...coast, ...inland];
}

function coastlineX(y) {
  return 1.55 + y * 0.075 + Math.sin(y * 1.35) * 0.24 + Math.sin(y * 0.42) * 0.16;
}

function influence(point, attractor) {
  const distance = Math.hypot(point.x - attractor.x, point.y - attractor.y);
  return Math.max(0, 1 - distance / attractor.radius);
}

function createCurvedRoad(points, width, kind) {
  return { points, width, kind };
}

function pointOnEllipse(center, rx, ry, angle, wobble = 0) {
  return {
    x: center.x + Math.cos(angle) * (rx + wobble),
    y: center.y + Math.sin(angle) * (ry + wobble * 0.55),
  };
}

function organicBlob(center, rx, ry, sides, random, rotation = 0) {
  const points = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (Math.PI * 2 * i) / sides;
    const wobble = 0.78 + random() * 0.42;
    points.push({
      x: center.x + Math.cos(angle) * rx * wobble,
      y: center.y + Math.sin(angle) * ry * wobble,
    });
  }
  return points;
}

function orientedFootprint(center, w, d, angle) {
  const ux = { x: Math.cos(angle) * w, y: Math.sin(angle) * w };
  const uy = { x: -Math.sin(angle) * d, y: Math.cos(angle) * d };
  return [
    { x: center.x - ux.x - uy.x, y: center.y - ux.y - uy.y },
    { x: center.x + ux.x - uy.x, y: center.y + ux.y - uy.y },
    { x: center.x + ux.x + uy.x, y: center.y + ux.y + uy.y },
    { x: center.x - ux.x + uy.x, y: center.y - ux.y + uy.y },
  ];
}

function localToWorld(center, x, y, angle) {
  return {
    x: center.x + Math.cos(angle) * x - Math.sin(angle) * y,
    y: center.y + Math.sin(angle) * x + Math.cos(angle) * y,
  };
}

function roundedFootprint(center, w, d, angle, sides = 12, wobble = 0) {
  const points = [];
  for (let i = 0; i < sides; i += 1) {
    const theta = (Math.PI * 2 * i) / sides;
    const cx = Math.cos(theta);
    const cy = Math.sin(theta);
    const superX = Math.sign(cx) * Math.abs(cx) ** 0.58 * w;
    const superY = Math.sign(cy) * Math.abs(cy) ** 0.58 * d;
    const pulse = 1 + Math.sin(theta * 3.2) * wobble;
    points.push(localToWorld(center, superX * pulse, superY * pulse, angle));
  }
  return points;
}

function taperedFootprint(center, w, d, angle, taper = 0.18) {
  return [
    localToWorld(center, -w * (1 - taper), -d, angle),
    localToWorld(center, w * (1 + taper), -d * 0.82, angle),
    localToWorld(center, w * (0.9 + taper), d, angle),
    localToWorld(center, -w * (1 + taper), d * 0.78, angle),
  ];
}

function plotFootprint(center, w, d, angle, random, chamfer = 0.08) {
  const c = Math.min(w, d) * chamfer;
  const points = [
    localToWorld(center, -w + c, -d, angle),
    localToWorld(center, w - c, -d, angle),
    localToWorld(center, w, -d + c, angle),
    localToWorld(center, w, d - c, angle),
    localToWorld(center, w - c, d, angle),
    localToWorld(center, -w + c, d, angle),
    localToWorld(center, -w, d - c, angle),
    localToWorld(center, -w, -d + c, angle),
  ];
  return points.map((point) => ({
    x: point.x + (random() - 0.5) * c * 0.22,
    y: point.y + (random() - 0.5) * c * 0.22,
  }));
}

function createMassingParts(center, parcelRx, parcelRy, rotation, type, random, ring) {
  const parts = [];
  const buildRx = parcelRx * 0.72;
  const buildRy = parcelRy * 0.7;
  const addPart = (name, offsetX, offsetY, w, d, angleOffset, heightFactor, options = {}) => {
    const dx = Math.cos(rotation) * offsetX - Math.sin(rotation) * offsetY;
    const dy = Math.sin(rotation) * offsetX + Math.cos(rotation) * offsetY;
    const partCenter = { x: center.x + dx, y: center.y + dy };
    const partAngle = rotation + angleOffset;
    parts.push({
      name,
      footprint:
        options.shape === "rounded"
          ? roundedFootprint(partCenter, w, d, partAngle, options.sides || 12, options.wobble || 0)
          : options.shape === "tapered"
            ? taperedFootprint(partCenter, w, d, partAngle, options.taper || 0.16)
            : orientedFootprint(partCenter, w, d, partAngle),
      heightFactor,
      facade: options.facade || "regular",
      terrace: options.terrace || false,
      roof: options.roof || "plant",
      tint: options.tint || 0,
    });
  };

  if (type === "offices") {
    addPart("innovation_podium", 0, 0, buildRx * 0.72, buildRy * 0.55, 0, 0.24, { facade: "lobby", roof: "amenity", tint: 18, shape: "rounded", sides: 14, wobble: 0.035 });
    addPart("research_hub", -buildRx * 0.2, -buildRy * 0.05, buildRx * 0.36, buildRy * 0.32, 0.14, 0.76, { facade: "curtain", roof: "plant", shape: "rounded", sides: 12 });
    addPart("maker_tower", buildRx * 0.18, buildRy * 0.12, buildRx * 0.26, buildRy * 0.28, -0.2, 0.96, { facade: "curtain", roof: "helipad", shape: "tapered", taper: 0.12 });
    if (random() > 0.42) addPart("venture_block", buildRx * 0.06, -buildRy * 0.2, buildRx * 0.24, buildRy * 0.2, 0.34, 0.62, { facade: "banded", roof: "green", shape: "rounded", sides: 10 });
    return parts;
  }

  if (type === "residential") {
    addPart("courtyard_north", 0, -buildRy * 0.3, buildRx * 0.48, buildRy * 0.15, 0.02, 0.64 + random() * 0.22, { facade: "balcony", terrace: true, roof: "green", shape: "rounded", sides: 10 });
    addPart("courtyard_south", 0, buildRy * 0.31, buildRx * 0.44, buildRy * 0.16, -0.06, 0.56 + random() * 0.2, { facade: "balcony", terrace: random() > 0.45, roof: "green", shape: "rounded", sides: 10 });
    addPart("courtyard_east", buildRx * 0.33, 0, buildRx * 0.14, buildRy * 0.34, 0.08, 0.52 + random() * 0.2, { facade: "balcony", roof: "green", shape: "tapered", taper: 0.1 });
    if (random() > 0.28) addPart("courtyard_west", -buildRx * 0.33, buildRy * 0.03, buildRx * 0.14, buildRy * 0.31, -0.1, 0.5 + random() * 0.18, { facade: "balcony", terrace: true, roof: "green", shape: "tapered", taper: 0.08 });
    if (random() > 0.52) addPart("residential_marker", buildRx * 0.19, -buildRy * 0.19, buildRx * 0.2, buildRy * 0.2, 0.25, 0.78, { facade: "balcony", roof: "plant", shape: "rounded", sides: 12 });
    return parts;
  }

  if (type === "hotels") {
    addPart("hotel_landscape_podium", 0, 0, buildRx * 0.64, buildRy * 0.48, 0.12, 0.32, { facade: "lobby", roof: "pool", tint: 12, shape: "rounded", sides: 14, wobble: 0.025 });
    addPart("hotel_crescent_wing", -buildRx * 0.16, buildRy * 0.11, buildRx * 0.38, buildRy * 0.17, 0.34, 0.54, { facade: "balcony", terrace: true, roof: "pool", shape: "tapered", taper: 0.2 });
    addPart("hotel_tower", buildRx * 0.17, -buildRy * 0.09, buildRx * 0.24, buildRy * 0.28, -0.12, 0.88, { facade: "vertical", roof: "plant", shape: "rounded", sides: 12 });
    return parts;
  }

  if (type === "social") {
    addPart("civic_forum", 0, 0, buildRx * 0.68, buildRy * 0.48, 0.18, 0.42, { facade: "large_glass", roof: "sawtooth", tint: 10, shape: "rounded", sides: 16, wobble: 0.04 });
    if (random() > 0.35) addPart("gallery_bar", buildRx * 0.18, buildRy * 0.04, buildRx * 0.3, buildRy * 0.18, -0.44, 0.34, { facade: "large_glass", roof: "green", shape: "tapered", taper: 0.18 });
    if (random() > 0.62) addPart("auditorium_volume", -buildRx * 0.18, -buildRy * 0.11, buildRx * 0.24, buildRy * 0.22, 0.36, 0.5, { facade: "solid", roof: "sawtooth", tint: -8, shape: "rounded", sides: 12 });
    return parts;
  }

  if (type === "retail") {
    addPart("active_edge_podium", 0, 0, buildRx * 0.62, buildRy * 0.34, random() * 0.14 - 0.07, 0.34 + random() * 0.12, { facade: "shopfront", roof: "amenity", shape: "rounded", sides: 12 });
    if (random() > 0.35) addPart("market_court", buildRx * 0.14, buildRy * 0.16, buildRx * 0.28, buildRy * 0.21, 0.34, 0.4, { facade: "shopfront", roof: "sawtooth", tint: 8, shape: "tapered", taper: 0.16 });
    return parts;
  }

  if (type === "logistics") {
    addPart("automated_warehouse", 0, 0, buildRx * 0.8, buildRy * 0.36, 0, 0.42, { facade: "banded", roof: "sawtooth", tint: 6, shape: "tapered", taper: 0.06 });
    addPart("quay_service_bar", 0, buildRy * 0.25, buildRx * 0.7, buildRy * 0.11, 0.02, 0.22, { facade: "shopfront", roof: "plant", shape: "tapered", taper: 0.04 });
    if (random() > 0.45) addPart("control_tower", buildRx * 0.3, -buildRy * 0.18, buildRx * 0.11, buildRy * 0.11, 0.1, 0.9, { facade: "vertical", roof: "plant", shape: "rounded", sides: 10 });
    return parts;
  }

  if (type === "industry") {
    addPart("clean_factory_hall", 0, 0, buildRx * 0.78, buildRy * 0.44, 0.04, 0.36, { facade: "banded", roof: "sawtooth", tint: 10, shape: "rounded", sides: 10 });
    addPart("process_spine", -buildRx * 0.16, -buildRy * 0.22, buildRx * 0.43, buildRy * 0.11, -0.08, 0.3, { facade: "solid", roof: "plant", shape: "tapered", taper: 0.08 });
    if (random() > 0.5) addPart("lab_office_head", buildRx * 0.27, buildRy * 0.09, buildRx * 0.19, buildRy * 0.18, 0.14, 0.58, { facade: "large_glass", roof: "green", shape: "rounded", sides: 12 });
    return parts;
  }

  if (type === "data") {
    addPart("data_center_plate", 0, 0, buildRx * 0.66, buildRy * 0.46, 0.02, 0.44, { facade: "banded", roof: "plant", tint: 8, shape: "rounded", sides: 12 });
    addPart("innovation_lab", -buildRx * 0.18, buildRy * 0.16, buildRx * 0.3, buildRy * 0.16, -0.28, 0.5, { facade: "curtain", roof: "green", shape: "rounded", sides: 10 });
    return parts;
  }

  addPart("block", 0, 0, parcelRx * 0.58, parcelRy * 0.52, 0, 0.72 + ring * 0.02);
  return parts;
}

function roadDistance(x, y, road) {
  return Math.min(
    ...road.points.slice(1).map((point, index) => {
      const start = road.points[index];
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      const lengthSq = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (y - start.y) * dy) / lengthSq));
      const px = start.x + dx * t;
      const py = start.y + dy * t;
      return Math.hypot(x - px, y - py);
    }),
  );
}

function createParcels(seed = Date.now()) {
  planSeed = seed;
  const random = seededRandom(seed);
  const center = { x: 7, y: 6.9 };
  const highDensityNodes = [
    { x: center.x, y: center.y, radius: 2.1, weight: 1.05 },
    { x: center.x + 2.55, y: center.y - 1.1, radius: 1.9, weight: 0.58 },
    { x: center.x - 1.8, y: center.y + 1.45, radius: 1.6, weight: 0.44 },
  ];
  const lowDensityReserves = [
    { x: center.x + 3.1, y: center.y + 2.3, radius: 1.9, weight: 0.58 },
    { x: center.x - 3.25, y: center.y - 1.6, radius: 1.85, weight: 0.44 },
  ];
  parcels = [];
  siteBoundary = createOrganicBoundary(random);
  roads = [
    createCurvedRoad(Array.from({ length: 13 }, (_, i) => ({ x: coastlineX(1.15 + i * 0.9) + 1.1 + Math.sin(i * 0.7) * 0.16, y: 1.15 + i * 0.9 })), 0.22, "arterial"),
    createCurvedRoad(Array.from({ length: 11 }, (_, i) => ({ x: 4.25 + i * 0.72, y: 2.4 + i * 0.72 + Math.sin(i * 0.9) * 0.32 })), 0.17, "collector"),
    createCurvedRoad(Array.from({ length: 10 }, (_, i) => ({ x: coastlineX(8.6) + 0.9 + i * 0.92, y: 8.6 + Math.sin(i * 0.65) * 0.18 })), 0.24, "arterial"),
    createCurvedRoad(Array.from({ length: 9 }, (_, i) => ({ x: coastlineX(4.5) + 1.25 + i * 0.94, y: 4.5 - Math.sin(i * 0.7) * 0.16 })), 0.16, "collector"),
    createCurvedRoad(Array.from({ length: 9 }, (_, i) => ({ x: 6.2 + (i - 4) * 0.95, y: center.y + Math.sin(i * 0.8) * 0.22 })), 0.16, "collector"),
    createCurvedRoad(Array.from({ length: 10 }, (_, i) => ({ x: 9.5 + Math.sin(i * 0.65) * 0.18, y: 2.0 + i * 1.0 })), 0.14, "local"),
    createCurvedRoad(Array.from({ length: 8 }, (_, i) => ({ x: 3.15 + i * 0.65, y: 2.75 + Math.sin(i * 0.8) * 0.08 })), 0.1, "local"),
    createCurvedRoad(Array.from({ length: 9 }, (_, i) => ({ x: 3.7 + i * 0.55, y: 4.85 + Math.sin(i * 0.7) * 0.07 })), 0.1, "local"),
    createCurvedRoad(Array.from({ length: 8 }, (_, i) => ({ x: 3.95 + i * 0.55, y: 6.2 + Math.sin(i * 0.55) * 0.08 })), 0.11, "local"),
    createCurvedRoad(Array.from({ length: 7 }, (_, i) => ({ x: 7.05 + i * 0.75, y: 3.85 + Math.sin(i * 0.8) * 0.09 })), 0.11, "local"),
    createCurvedRoad(Array.from({ length: 8 }, (_, i) => ({ x: 6.35 + i * 0.7, y: 8.15 + Math.sin(i * 0.55) * 0.1 })), 0.13, "local"),
  ];
  transitStops = [
    { x: center.x, y: center.y },
    { x: coastlineX(8.5) + 2.8, y: 8.55 },
    { x: center.x - 1.8, y: center.y + 1.2 },
    { x: center.x + 3.2, y: center.y + 1.8 },
  ];

  const addParcel = (type, x, y, rx, ry, rotation, densityScore = 1) => {
    const points = type === "water" || type === "park" || type === "plaza"
      ? organicBlob({ x, y }, rx, ry, 8, random, rotation)
      : plotFootprint({ x, y }, rx, ry, rotation, random, 0.16);
    const massingParts = typologies[type].buildable ? createMassingParts({ x, y }, rx, ry, rotation, type, random, 3) : [];
    parcels.push({
      type,
      points,
      footprintPoints: orientedFootprint({ x, y }, rx * 0.62, ry * 0.54, rotation),
      massingParts,
      center: { x, y },
      footprint: typologies[type].buildable ? Math.max(42000, rx * ry * siteSqMPerUnit * (1.2 + densityScore * 0.5)) : 0,
      jitter: 0.72 + densityScore * 0.28 + random() * 0.18,
      setback: 0.12,
      podium: typologies[type].buildable,
      roofRotation: random(),
      densityScore,
      plotWidthM: rx * 2 * metersPerUnit,
      plotDepthM: ry * 2 * metersPerUnit,
      plotAreaSqM: rx * ry * 4 * siteSqMPerUnit,
    });
  };

  const addDistrictGrid = ({ originX, originY, cols, rows, spacingX, spacingY, rotation, rx, ry, density, mix, stagger = 0.12 }) => {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const type = mix[(row * cols + col) % mix.length];
        const offset = (row % 2) * stagger;
        const x = originX + col * spacingX + offset + (random() - 0.5) * spacingX * 0.08;
        const y = originY + row * spacingY + (random() - 0.5) * spacingY * 0.08;
        const plotRx = rx * (0.86 + random() * 0.28);
        const plotRy = ry * (0.86 + random() * 0.26);
        addParcel(type, x, y, plotRx, plotRy, rotation + (random() - 0.5) * 0.12, density + random() * 0.22);
      }
    }
  };

  for (let i = 0; i < 11; i += 1) {
    const y = 2.1 + i * 0.92;
    addParcel("water", coastlineX(y) - 0.45, y, 0.48 + random() * 0.12, 0.3, random() * Math.PI);
  }
  for (let i = 0; i < 6; i += 1) addParcel("water", coastlineX(8.25) + 0.35 + i * 0.48, 8.2 + Math.sin(i * 0.8) * 0.18, 0.38, 0.24, random() * Math.PI);
  for (let i = 0; i < 8; i += 1) {
    const y = 6.2 + (i % 4) * 0.72;
    addParcel("logistics", coastlineX(y) + 1.65 + Math.floor(i / 4) * 0.8, y, 0.46, 0.22, 0.06, 0.72);
  }
  for (let i = 0; i < 8; i += 1) addParcel(i % 3 === 0 ? "industry" : "logistics", 6.9 + (i % 4) * 0.86, 8.75 + Math.floor(i / 4) * 0.74, 0.46, 0.28, 0.04, 0.82);
  for (let i = 0; i < 7; i += 1) addParcel(i % 2 === 0 ? "industry" : "data", 8.3 + (i % 3) * 0.9, 3.65 + Math.floor(i / 3) * 0.82, 0.44, 0.3, -0.08, 0.9);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const type = row === 0 ? (col % 2 === 0 ? "offices" : "data") : row === 1 ? (col === 2 ? "plaza" : "retail") : "social";
      addParcel(type, 4.65 + col * 0.72 + (row % 2) * 0.18, 5.65 + row * 0.66, 0.3, 0.24, 0.12 + (random() - 0.5) * 0.12, 1.15);
    }
  }
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const y = 2.35 + row * 0.76;
      const x = 4.1 + col * 0.82 + (row % 2) * 0.16;
      addParcel(col === 4 && row < 2 ? "hotels" : "residential", x, y, 0.31, 0.25, -0.08 + (random() - 0.5) * 0.14, 0.85);
    }
  }
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      addParcel(col % 2 === 0 ? "industry" : "data", 8.2 + col * 0.9, 6.15 + row * 0.82, 0.43, 0.29, 0.02 + (random() - 0.5) * 0.08, 0.92);
    }
  }

  addDistrictGrid({
    originX: 3.45,
    originY: 2.0,
    cols: 7,
    rows: 3,
    spacingX: 0.54,
    spacingY: 0.48,
    rotation: -0.08,
    rx: 0.22,
    ry: 0.18,
    density: 0.92,
    mix: ["residential", "residential", "hotels", "retail", "residential"],
    stagger: 0.16,
  });

  addDistrictGrid({
    originX: 3.95,
    originY: 4.55,
    cols: 8,
    rows: 4,
    spacingX: 0.5,
    spacingY: 0.44,
    rotation: 0.08,
    rx: 0.21,
    ry: 0.17,
    density: 1.25,
    mix: ["offices", "retail", "data", "social", "offices", "plaza"],
    stagger: 0.11,
  });

  addDistrictGrid({
    originX: 7.25,
    originY: 3.0,
    cols: 5,
    rows: 3,
    spacingX: 0.72,
    spacingY: 0.58,
    rotation: -0.06,
    rx: 0.3,
    ry: 0.22,
    density: 1.0,
    mix: ["industry", "data", "industry", "logistics", "data"],
    stagger: 0.08,
  });

  addDistrictGrid({
    originX: 6.35,
    originY: 7.7,
    cols: 7,
    rows: 3,
    spacingX: 0.64,
    spacingY: 0.54,
    rotation: 0.03,
    rx: 0.29,
    ry: 0.2,
    density: 0.88,
    mix: ["logistics", "industry", "logistics", "data", "industry"],
    stagger: 0.08,
  });

  addDistrictGrid({
    originX: coastlineX(5.5) + 1.35,
    originY: 5.35,
    cols: 3,
    rows: 5,
    spacingX: 0.62,
    spacingY: 0.55,
    rotation: 0.05,
    rx: 0.28,
    ry: 0.17,
    density: 0.76,
    mix: ["logistics", "logistics", "retail"],
    stagger: 0.05,
  });

  for (let ring = 0; ring < 0; ring += 1) {
    const count = 10 + ring * 5 + Math.floor(random() * 4);
    const radius = 0.85 + ring * (0.82 + random() * 0.1);
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * (i + random() * 0.55)) / count + ring * 0.23;
      const localWarp = 1 + Math.sin(angle * 3.4 + ring) * 0.12 + (random() - 0.5) * 0.16;
      const cx = center.x + Math.cos(angle) * radius * localWarp * (1.05 + random() * 0.14);
      const cy = center.y + Math.sin(angle) * radius * (0.78 + random() * 0.25 + Math.cos(angle * 2.2) * 0.08);
      if (cx < 0.8 || cx > siteUnits - 0.8 || cy < 0.8 || cy > siteUnits - 0.8) continue;
      const point = { x: cx, y: cy };
      const nearMajorRoad = roads.some((road) => road.kind !== "local" && roadDistance(cx, cy, road) < 0.55);
      const nearTransit = transitStops.some((stop) => Math.hypot(cx - stop.x, cy - stop.y) < 1.65);
      const densityBoost = highDensityNodes.reduce((sum, node) => sum + influence(point, node) * node.weight, 0);
      const reserveInfluence = lowDensityReserves.reduce((sum, node) => sum + influence(point, node) * node.weight, 0);
      const densityScore = Math.max(0.18, Math.min(1.85, 0.52 + densityBoost - reserveInfluence + (nearTransit ? 0.14 : 0)));
      const distanceToCenter = Math.hypot(cx - center.x, cy - center.y);
      const shoreDistance = cx - coastlineX(cy);
      const portEdge = shoreDistance > 0.65 && shoreDistance < 3.7 && cy > 5.2 && cy < 10.6;
      const waterSide = shoreDistance < 0.55;
      const industrialDistrict = (cx > 7.2 && cy > 3.0) || (cx > 6.4 && cy > 8.0);
      const civicCore = distanceToCenter < 1.55;
      if (waterSide && random() > 0.28) {
        parcels.push({
          type: "water",
          points: organicBlob({ x: cx, y: cy }, 0.46 + random() * 0.32, 0.28 + random() * 0.22, 8, random, random() * Math.PI),
          center: { x: cx, y: cy },
          footprint: 0,
          jitter: 1,
          setback: 0.12,
          podium: false,
          roofRotation: random(),
        });
        continue;
      }
      if (ring > 3 && densityScore < 0.38 && random() > 0.48) {
        parcels.push({
          type: random() > 0.5 ? "park" : "water",
          points: organicBlob({ x: cx, y: cy }, 0.5 + random() * 0.35, 0.28 + random() * 0.28, 8, random, random() * Math.PI),
          center: { x: cx, y: cy },
          footprint: 0,
          jitter: 1,
          setback: 0.12,
          podium: false,
          roofRotation: random(),
        });
        continue;
      }
      let type = pickWeighted(random, [
        { type: "logistics", weight: portEdge ? 44 : 4 },
        { type: "industry", weight: industrialDistrict ? 34 : 5 },
        { type: "data", weight: industrialDistrict || nearTransit ? 16 + densityScore * 5 : 4 },
        { type: "residential", weight: ring > 2 && !industrialDistrict && !portEdge ? 20 + (1 - densityScore) * 10 : 6 },
        { type: "offices", weight: nearTransit || ring < 3 ? 16 + densityScore * 18 : 5 + densityScore * 4 },
        { type: "hotels", weight: nearTransit && !industrialDistrict ? 8 + densityScore * 8 : 3 },
        { type: "retail", weight: nearMajorRoad && !industrialDistrict ? 12 + densityScore * 8 : 4 },
        { type: "social", weight: civicCore ? 24 : 5 + densityScore * 3 },
        { type: "park", weight: ring === 5 || densityScore < 0.45 ? 14 + reserveInfluence * 14 : 4 },
        { type: "plaza", weight: civicCore ? 22 : 4 },
      ]);

      if (portEdge && random() > 0.55) type = random() > 0.5 ? "logistics" : "water";
      if (industrialDistrict && random() > 0.45) type = random() > 0.42 ? "industry" : "data";
      if (civicCore && random() > 0.38) type = random() > 0.5 ? "plaza" : "social";
      if (type === "water" && random() > 0.7) type = "park";

      const industrialScale = type === "logistics" || type === "industry" || type === "data" ? 1.28 : 1;
      const parcelRx = (0.28 + random() * 0.3 + ring * 0.018) * (0.82 + densityScore * 0.36) * industrialScale;
      const parcelRy = (0.2 + random() * 0.24) * (0.82 + densityScore * 0.28) * (type === "logistics" ? 0.72 : industrialScale * 0.9);
      const rotation = industrialDistrict || portEdge ? (random() - 0.5) * 0.18 : angle + Math.PI / 2 + (random() - 0.5) * 0.72;
      const points =
        type === "logistics" || type === "industry" || type === "data"
          ? roundedFootprint({ x: cx, y: cy }, parcelRx, parcelRy, rotation, 10, 0.02)
          : organicBlob({ x: cx, y: cy }, parcelRx, parcelRy, 7 + Math.floor(random() * 3), random, rotation);
      const massingParts = typologies[type].buildable ? createMassingParts({ x: cx, y: cy }, parcelRx, parcelRy, rotation, type, random, ring) : [];
      parcels.push({
        type,
        points,
        footprintPoints: orientedFootprint({ x: cx, y: cy }, parcelRx * 0.58, parcelRy * 0.52, rotation),
        massingParts,
        center: { x: cx, y: cy },
        footprint: Math.max(28000, parcelRx * parcelRy * siteSqMPerUnit * (1.0 + densityScore * 0.55 + random() * 0.55)),
        jitter: 0.68 + random() * 0.38 + densityScore * 0.34 + (nearTransit ? 0.16 : 0) + (ring < 2 ? 0.1 : 0),
        setback: 0.14 + random() * 0.12 + (type === "offices" ? 0.03 : 0),
        podium: type === "offices" || type === "hotels" || type === "residential",
        roofRotation: random(),
        densityScore,
      });
    }
  }

  for (let i = 0; i < 9; i += 1) {
    const cx = 1.7 + i * 0.58 + random() * 0.24;
    const cy = 11.65 + Math.sin(i * 0.9) * 0.35;
    parcels.push({
      type: i % 3 === 0 ? "park" : "water",
      points: organicBlob({ x: cx, y: cy }, 0.42, 0.24, 8, random, random() * Math.PI),
      center: { x: cx, y: cy },
      footprint: 0,
      jitter: 1,
      setback: 0.12,
      podium: false,
      roofRotation: random(),
    });
  }
}

function makeControls() {
  controlsEl.innerHTML = "";
  legendEl.innerHTML = "";

  buildingKeys.forEach((key) => {
    const item = typologies[key];
    const control = document.createElement("label");
    control.className = "typology-control";
    control.innerHTML = `
      <div class="typology-header">
        <span class="typology-name"><span class="swatch" style="background:${item.color}"></span>${item.label}</span>
        <span class="height-value" id="${key}Value">${item.value} m</span>
      </div>
      <input type="range" min="${item.min}" max="${item.max}" value="${item.value}" data-type="${key}" aria-label="${item.label} height">
    `;
    controlsEl.appendChild(control);
  });

  allTypologyKeys.forEach((key) => {
    const item = typologies[key];
    const legendItem = document.createElement("div");
    legendItem.className = "legend-item";
    legendItem.innerHTML = `<span class="swatch" style="background:${item.color}"></span>${item.label}`;
    legendEl.appendChild(legendItem);
  });

  controlsEl.addEventListener("input", (event) => {
    const slider = event.target;
    if (slider.type !== "range") return;
    const type = slider.dataset.type;
    typologies[type].value = Number(slider.value);
    document.getElementById(`${type}Value`).textContent = `${slider.value} m`;
    draw();
  });
}

function syncControls() {
  document.querySelectorAll('input[type="range"]').forEach((slider) => {
    const type = slider.dataset.type;
    slider.value = typologies[type].value;
    document.getElementById(`${type}Value`).textContent = `${typologies[type].value} m`;
  });
}

function drawPolygon(points, fill, stroke = "rgba(31, 36, 40, 0.18)") {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function shade(hex, amount) {
  let r;
  let g;
  let b;
  if (hex.startsWith("rgb")) {
    [r, g, b] = hex.match(/\d+/g).slice(0, 3).map(Number);
  } else {
    const value = Number.parseInt(hex.slice(1), 16);
    r = value >> 16;
    g = (value >> 8) & 255;
    b = value & 255;
  }
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgba(hex, alpha) {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = value >> 16;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function strokePolyline(points, color, width = 1, close = false) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  if (close) ctx.closePath();
  ctx.stroke();
}

function drawModelText(text, point, options = {}) {
  ctx.save();
  ctx.font = options.font || "700 11px Inter, sans-serif";
  ctx.textAlign = options.align || "center";
  ctx.textBaseline = "middle";
  const paddingX = options.paddingX ?? 5;
  const paddingY = options.paddingY ?? 3;
  const metrics = ctx.measureText(text);
  const width = metrics.width + paddingX * 2;
  const height = 18 + paddingY;
  if (options.background !== false) {
    ctx.fillStyle = options.background || "rgba(8, 12, 15, 0.76)";
    ctx.fillRect(point.x - width / 2, point.y - height / 2, width, height);
  }
  ctx.fillStyle = options.color || "rgba(235, 246, 250, 0.92)";
  ctx.fillText(text, point.x, point.y + 0.5);
  ctx.restore();
}

function drawDimensionLine(start, end, label, offset = { x: 0, y: -14 }) {
  const a = { x: start.x + offset.x, y: start.y + offset.y };
  const b = { x: end.x + offset.x, y: end.y + offset.y };
  ctx.save();
  ctx.strokeStyle = "rgba(239, 215, 120, 0.82)";
  ctx.fillStyle = "rgba(239, 215, 120, 0.82)";
  ctx.lineWidth = 1.2;
  strokePolyline([a, b], ctx.strokeStyle, 1.2);
  [a, b].forEach((point, index) => {
    const source = index === 0 ? start : end;
    strokePolyline([source, point], "rgba(239, 215, 120, 0.45)", 1);
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });
  drawModelText(label, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, { color: "#f2dc8a", background: "rgba(7, 9, 10, 0.78)" });
  ctx.restore();
}

function drawWireframe(base, top, color = "rgba(188, 232, 255, 0.72)") {
  strokePolyline(base, "rgba(15, 22, 27, 0.58)", 1, true);
  strokePolyline(top, color, 1.25, true);
  for (let i = 0; i < base.length; i += 1) {
    strokePolyline([base[i], top[i]], color, 1);
  }
  const roofCenter = top.reduce((sum, point) => ({ x: sum.x + point.x / top.length, y: sum.y + point.y / top.length }), { x: 0, y: 0 });
  top.forEach((point) => strokePolyline([point, roofCenter], "rgba(255, 255, 255, 0.28)", 0.8));
}

function polygonGradient(points, colorA, colorB) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const gradient = ctx.createLinearGradient(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  gradient.addColorStop(0, colorA);
  gradient.addColorStop(1, colorB);
  return gradient;
}

function drawSoftShadow(base, height) {
  const stretch = Math.max(10, height * 0.18);
  const shadow = base.map((point) => ({ x: point.x + stretch, y: point.y + stretch * 0.58 }));
  drawPolygon(shadow, "rgba(0, 0, 0, 0.22)", "transparent");
}

function drawSolidExtrusion(base, height, type, options = {}) {
  const top = base.map((point) => ({ x: point.x, y: point.y - height }));
  const color = options.color || type.color;
  const roofColor = options.roofColor || type.roof || type.color;
  drawSoftShadow(base, height);
  drawPolygon([base[1], base[2], top[2], top[1]], polygonGradient([base[1], base[2], top[2], top[1]], shade(color, -48), shade(color, -24)), "rgba(5, 8, 10, 0.32)");
  drawPolygon([base[2], base[3], top[3], top[2]], polygonGradient([base[2], base[3], top[3], top[2]], shade(color, -26), shade(color, 6)), "rgba(5, 8, 10, 0.28)");
  drawPolygon([base[0], base[1], top[1], top[0]], polygonGradient([base[0], base[1], top[1], top[0]], shade(color, -12), shade(color, 18)), "rgba(255, 255, 255, 0.13)");
  drawPolygon(top, polygonGradient(top, shade(roofColor, 18), shade(roofColor, -10)), "rgba(255, 255, 255, 0.2)");
  strokePolyline(top, "rgba(255, 255, 255, 0.2)", 1, true);
  return top;
}

function projectPoints(points, originX, originY, tileW, tileH) {
  return points.map((point) => iso(point.x, point.y, originX, originY, tileW, tileH));
}

function insetPoints(points, amount) {
  const center = points.reduce((acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }), { x: 0, y: 0 });
  return points.map((point) => ({
    x: point.x + (center.x - point.x) * amount,
    y: point.y + (center.y - point.y) * amount,
  }));
}

function drawSite(originX, originY, tileW, tileH) {
  const boundary = projectPoints(siteBoundary, originX, originY, tileW, tileH);
  drawPolygon(boundary, "rgba(43, 53, 58, 0.72)", "rgba(143, 194, 214, 0.42)");
  const west = iso(0, siteUnits + 0.25, originX, originY, tileW, tileH);
  const east = iso(siteUnits, siteUnits + 0.25, originX, originY, tileW, tileH);
  const south = iso(siteUnits + 0.25, 0, originX, originY, tileW, tileH);
  const north = iso(siteUnits + 0.25, siteUnits, originX, originY, tileW, tileH);
  drawDimensionLine(west, east, `site width ${formatDistance(siteExtentM)}`, { x: 0, y: 18 });
  drawDimensionLine(south, north, `site depth ${formatDistance(siteExtentM)}`, { x: 18, y: 0 });
}

function drawParcelDimensionTags(originX, originY, tileW, tileH) {
  let labelCount = 0;
  parcels.forEach((parcel, index) => {
    if (!typologies[parcel.type].buildable || labelCount > 28) return;
    if (index % 5 !== 0 && parcel.type !== "logistics" && parcel.type !== "industry") return;
    const center = iso(parcel.center.x, parcel.center.y, originX, originY, tileW, tileH);
    const type = typologies[parcel.type];
    const height = Math.round(type.value * type.base * parcel.jitter);
    const label = `${formatDistance(parcel.plotWidthM)} x ${formatDistance(parcel.plotDepthM)} | H ${height}m`;
    drawModelText(label, { x: center.x, y: center.y - 14 }, { font: "600 8.5px Inter, sans-serif", color: "rgba(234, 242, 245, 0.82)", background: "rgba(8, 12, 15, 0.58)", paddingX: 4, paddingY: 2 });
    labelCount += 1;
  });
}

function drawWorldGrid(originX, originY, tileW, tileH) {
  const minorStart = -18;
  const minorEnd = siteUnits + 18;
  ctx.save();
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";

  for (let i = minorStart; i <= minorEnd; i += 0.5) {
    const isMajor = Math.abs(i % 2) < 0.001;
    const isAxis = Math.abs(i) < 0.001 || Math.abs(i - siteUnits) < 0.001;
    const width = isAxis ? 1.4 : isMajor ? 0.8 : 0.45;
    const alpha = isAxis ? 0.4 : isMajor ? 0.24 : 0.11;
    const color = isAxis ? `rgba(125, 196, 224, ${alpha})` : `rgba(155, 181, 194, ${alpha})`;
    const a = iso(i, minorStart, originX, originY, tileW, tileH);
    const b = iso(i, minorEnd, originX, originY, tileW, tileH);
    const c = iso(minorStart, i, originX, originY, tileW, tileH);
    const d = iso(minorEnd, i, originX, originY, tileW, tileH);
    strokePolyline([a, b], color, width);
    strokePolyline([c, d], color, width);
  }

  const xAxisStart = iso(0, 0, originX, originY, tileW, tileH);
  const xAxisEnd = iso(siteUnits + 3, 0, originX, originY, tileW, tileH);
  const yAxisEnd = iso(0, siteUnits + 3, originX, originY, tileW, tileH);
  strokePolyline([xAxisStart, xAxisEnd], "rgba(210, 75, 75, 0.72)", 1.6);
  strokePolyline([xAxisStart, yAxisEnd], "rgba(82, 190, 116, 0.72)", 1.6);
  drawModelText("X / Easting", xAxisEnd, { color: "rgba(255, 150, 150, 0.95)", background: "rgba(20, 5, 5, 0.72)" });
  drawModelText("Y / Northing", yAxisEnd, { color: "rgba(156, 238, 174, 0.95)", background: "rgba(5, 20, 8, 0.72)" });

  for (let i = 0; i <= siteUnits; i += 2) {
    const xLabel = iso(i, -0.42, originX, originY, tileW, tileH);
    const yLabel = iso(-0.42, i, originX, originY, tileW, tileH);
    drawModelText(formatDistance(i * metersPerUnit), xLabel, { font: "600 9px Inter, sans-serif", color: "rgba(198, 219, 226, 0.72)", background: false });
    drawModelText(formatDistance(i * metersPerUnit), yLabel, { font: "600 9px Inter, sans-serif", color: "rgba(198, 219, 226, 0.72)", background: false });
  }
  ctx.restore();
}

function drawRoads(originX, originY, tileW, tileH) {
  roads.forEach((road) => {
    const projected = projectPoints(road.points, originX, originY, tileW, tileH);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = road.kind === "arterial" ? "rgba(98, 110, 115, 0.82)" : "rgba(82, 96, 102, 0.72)";
    ctx.lineWidth = Math.max(5, tileW * road.width);
    ctx.beginPath();
    projected.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();

    ctx.strokeStyle = "rgba(144, 214, 235, 0.34)";
    ctx.lineWidth = Math.max(1, tileW * 0.012);
    ctx.stroke();
  });
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";

  transitStops.forEach((stop) => {
    const point = iso(stop.x, stop.y, originX, originY, tileW, tileH);
    ctx.fillStyle = "#f4f0da";
    ctx.strokeStyle = "rgba(32, 45, 54, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(3, tileW * 0.035), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function drawScaleBar(rect) {
  const x = 28;
  const y = rect.height - 86;
  const width = 1000 / metersPerUnit * (Math.min(rect.width / 12.5, rect.height / 7.4) / 2) * viewScale;
  const clampedWidth = Math.max(78, Math.min(180, width));
  ctx.save();
  ctx.strokeStyle = "rgba(188, 232, 255, 0.72)";
  ctx.fillStyle = "rgba(16, 21, 26, 0.88)";
  ctx.lineWidth = 2;
  ctx.fillRect(x - 8, y - 22, clampedWidth + 16, 48);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + clampedWidth, y);
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x, y + 6);
  ctx.moveTo(x + clampedWidth, y - 6);
  ctx.lineTo(x + clampedWidth, y + 6);
  ctx.stroke();
  ctx.font = "700 12px Inter, sans-serif";
  ctx.fillStyle = "rgba(218, 240, 250, 0.86)";
  ctx.fillText("1,000 m", x, y - 10);
  ctx.font = "600 10px Inter, sans-serif";
  ctx.fillText(`grid ${Math.round(metersPerUnit)} m/unit`, x, y + 18);
  ctx.restore();
}

function drawModelReadout(rect) {
  const lines = [
    `World units: meters`,
    `Extents: ${formatDistance(siteExtentM)} x ${formatDistance(siteExtentM)}`,
    `Area: ${siteAreaSqKm} sq km | 1 grid unit = ${Math.round(metersPerUnit)} m`,
  ];
  const x = rect.width - 268;
  const y = rect.height - 94;
  ctx.save();
  ctx.fillStyle = "rgba(10, 14, 16, 0.86)";
  ctx.strokeStyle = "rgba(176, 206, 216, 0.22)";
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, 244, 72);
  ctx.strokeRect(x, y, 244, 72);
  ctx.font = "700 11px Inter, sans-serif";
  ctx.fillStyle = "rgba(230, 239, 243, 0.88)";
  lines.forEach((line, index) => ctx.fillText(line, x + 12, y + 20 + index * 18));
  ctx.restore();
}

function drawParcelBase(parcel, originX, originY, tileW, tileH) {
  const points = projectPoints(parcel.points, originX, originY, tileW, tileH);
  const isBuildable = typologies[parcel.type].buildable;
  drawPolygon(points, isBuildable ? "rgba(58, 67, 70, 0.34)" : "rgba(52, 62, 67, 0.16)", isBuildable ? "rgba(205, 231, 236, 0.28)" : "rgba(146, 205, 225, 0.12)");
  if (!isBuildable) return;
  const inner = insetPoints(parcel.points, 0.16);
  const innerPoints = projectPoints(inner, originX, originY, tileW, tileH);
  strokePolyline(innerPoints, "rgba(255, 255, 255, 0.2)", 1, true);
}

function drawOpenSpace(parcel, originX, originY, tileW, tileH) {
  const type = typologies[parcel.type];
  const points = projectPoints(insetPoints(parcel.points, 0.04), originX, originY, tileW, tileH);
  drawPolygon(points, hexToRgba(type.color, 0.42), "rgba(188, 232, 255, 0.2)");

  if (parcel.type === "water") {
    const center = iso(parcel.center.x, parcel.center.y, originX, originY, tileW, tileH);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(center.x - tileW * 0.22, center.y + i * tileH * 0.16);
      ctx.lineTo(center.x + tileW * 0.22, center.y + i * tileH * 0.16);
      ctx.stroke();
    }
  }

  if (parcel.type === "park") {
    ctx.fillStyle = "rgba(44, 84, 50, 0.34)";
    [0.22, 0.38, 0.55, 0.72].forEach((offset, index) => {
      const a = parcel.points[0];
      const c = parcel.points[2];
      const point = iso(a.x + (c.x - a.x) * offset, a.y + (c.y - a.y) * (0.35 + (index % 2) * 0.25), originX, originY, tileW, tileH);
      ctx.beginPath();
      ctx.arc(point.x, point.y - tileH * 0.08, Math.max(3, tileW * 0.025), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  if (parcel.type === "plaza") {
    const center = iso(parcel.center.x, parcel.center.y, originX, originY, tileW, tileH);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, tileW * (0.08 + i * 0.045), tileH * (0.1 + i * 0.04), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawExtrusion(base, height, type, drawGroundShadow = true) {
  const top = base.map((point) => ({ x: point.x, y: point.y - height }));
  if (drawGroundShadow) {
    drawPolygon(
      base.map((point) => ({ x: point.x + 10, y: point.y + 8 })),
      "rgba(0, 0, 0, 0.18)",
      "transparent",
    );
  }
  drawPolygon([base[1], base[2], top[2], top[1]], hexToRgba(type.color, 0.58), "rgba(188, 232, 255, 0.18)");
  drawPolygon([base[2], base[3], top[3], top[2]], hexToRgba(type.roof || type.color, 0.52), "rgba(188, 232, 255, 0.18)");
  drawPolygon([base[0], base[1], top[1], top[0]], hexToRgba(type.color, 0.45), "rgba(188, 232, 255, 0.18)");
  drawPolygon(top, hexToRgba(type.roof || type.color, 0.62), "rgba(188, 232, 255, 0.34)");
  drawWireframe(base, top);
  return top;
}

function drawFacadeLines(base, height, typeKey, facade = "regular") {
  const floorCount = Math.min(16, Math.max(2, Math.floor(height / 11)));
  const verticals = facade === "curtain" || facade === "vertical" ? 4 : facade === "shopfront" ? 2 : 3;
  ctx.strokeStyle = typeKey === "retail" || facade === "shopfront" ? "rgba(255, 220, 150, 0.42)" : "rgba(224, 239, 245, 0.25)";
  ctx.lineWidth = 1;
  for (let i = 1; i < floorCount; i += 1) {
    const z = (height / floorCount) * i;
    ctx.beginPath();
    ctx.moveTo(base[2].x, base[2].y - z);
    ctx.lineTo(base[3].x, base[3].y - z);
    ctx.stroke();
    if (typeKey !== "retail") {
      ctx.beginPath();
      ctx.moveTo(base[1].x, base[1].y - z);
      ctx.lineTo(base[2].x, base[2].y - z);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = facade === "balcony" ? "rgba(255, 255, 255, 0.3)" : "rgba(180, 213, 225, 0.18)";
  for (let i = 1; i < verticals; i += 1) {
    const t = i / verticals;
    const a = {
      x: base[2].x * (1 - t) + base[3].x * t,
      y: base[2].y * (1 - t) + base[3].y * t,
    };
    const b = { x: a.x, y: a.y - height };
    strokePolyline([a, b], ctx.strokeStyle, 1);
  }
  if (facade === "shopfront" || facade === "large_glass" || facade === "lobby") {
    const glassHeight = Math.min(height * 0.28, 16);
    drawPolygon(
      [
        base[2],
        base[3],
        { x: base[3].x, y: base[3].y - glassHeight },
        { x: base[2].x, y: base[2].y - glassHeight },
      ],
      "rgba(190, 232, 245, 0.2)",
      "rgba(255, 255, 255, 0.18)",
    );
  }
}

function drawRoofDetails(top, parcel, tileW, roofStyle = "plant") {
  const centerX = top.reduce((sum, point) => sum + point.x, 0) / top.length;
  const centerY = top.reduce((sum, point) => sum + point.y, 0) / top.length;
  const unit = Math.max(3, tileW * 0.025);
  ctx.fillStyle = roofStyle === "green" ? "rgba(122, 164, 96, 0.55)" : "rgba(225, 226, 218, 0.3)";
  ctx.strokeStyle = "rgba(16, 20, 22, 0.24)";
  ctx.lineWidth = 1;
  ctx.fillRect(centerX - unit * 1.4, centerY - unit * 0.8, unit * 2.5, unit * 1.35);
  ctx.strokeRect(centerX - unit * 1.4, centerY - unit * 0.8, unit * 2.5, unit * 1.35);
  if (roofStyle === "pool") {
    ctx.fillStyle = "rgba(104, 176, 200, 0.72)";
    ctx.fillRect(centerX + unit * 0.5, centerY - unit * 1.4, unit * 2.3, unit * 0.9);
  }
  if (roofStyle === "sawtooth") {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.34)";
    for (let i = -1; i <= 1; i += 1) {
      strokePolyline(
        [
          { x: centerX - unit * 2.2, y: centerY + i * unit * 0.8 },
          { x: centerX + unit * 2.2, y: centerY + i * unit * 0.8 - unit * 0.7 },
        ],
        ctx.strokeStyle,
        1,
      );
    }
  }
  if (parcel.roofRotation > 0.55) {
    ctx.beginPath();
    ctx.moveTo(top[0].x * 0.7 + top[1].x * 0.3, top[0].y * 0.7 + top[1].y * 0.3);
    ctx.lineTo(top[3].x * 0.7 + top[2].x * 0.3, top[3].y * 0.7 + top[2].y * 0.3);
    ctx.stroke();
  }
}

function drawBuilding(parcel, originX, originY, tileW, tileH) {
  const type = typologies[parcel.type];
  const rawHeight = type.value * type.base * parcel.jitter;
  const parts = parcel.massingParts?.length
    ? parcel.massingParts
    : [{ name: "block", footprint: parcel.footprintPoints || insetPoints(parcel.points, parcel.setback), heightFactor: 1 }];

  parts.forEach((part, index) => {
    const base = projectPoints(part.footprint, originX, originY, tileW, tileH);
    const height = rawHeight * 0.3 * part.heightFactor;
    const partType =
      part.name.includes("podium") || part.name.includes("base")
        ? { ...type, color: shade(type.color, 14 + part.tint), roof: shade(type.roof, 8) }
        : type;
    const top = drawSolidExtrusion(base, height, partType);
    drawFacadeLines(base, height, parcel.type, part.facade);
    drawRoofDetails(top, parcel, tileW, part.roof);
    if (height > 30 && part.name.includes("tower")) {
      const upperFootprint = insetPoints(part.footprint, 0.08);
      const upperBase = projectPoints(upperFootprint, originX, originY, tileW, tileH).map((point) => ({ x: point.x, y: point.y - height * 0.55 }));
      const upperTop = drawSolidExtrusion(upperBase, height * 0.26, { ...partType, color: shade(partType.color, 8), roof: shade(partType.roof, 6) }, { roofColor: shade(partType.roof, 6) });
      drawFacadeLines(upperBase, height * 0.26, parcel.type, part.facade);
      drawRoofDetails(upperTop, parcel, tileW, part.roof);
    }
  });
}

function sanitizeObjName(name) {
  return name.replace(/[^a-z0-9_]+/gi, "_").replace(/^_+|_+$/g, "");
}

function toObjVertex(point, z = 0) {
  const x = (point.x - siteUnits / 2) * metersPerUnit;
  const y = (siteUnits / 2 - point.y) * metersPerUnit;
  return [x, y, z];
}

function addObjVertex(lines, vertex) {
  lines.vertexCount += 1;
  lines.lines.push(`v ${vertex.map((value) => value.toFixed(3)).join(" ")}`);
  return lines.vertexCount;
}

function addObjFace(lines, indices) {
  if (indices.length >= 3) lines.lines.push(`f ${indices.join(" ")}`);
}

function addFlatObjSurface(lines, name, points, materialName) {
  const safeName = sanitizeObjName(name);
  lines.lines.push(`o ${safeName}`);
  lines.lines.push(`g ${safeName}`);
  lines.lines.push(`usemtl ${materialName}`);
  const indices = points.map((point) => addObjVertex(lines, toObjVertex(point, 0)));
  addObjFace(lines, indices);
}

function addExtrudedObjSolid(lines, name, footprint, height, materialName) {
  const safeName = sanitizeObjName(name);
  lines.lines.push(`o ${safeName}`);
  lines.lines.push(`g ${safeName}`);
  lines.lines.push(`usemtl ${materialName}`);
  const bottom = footprint.map((point) => addObjVertex(lines, toObjVertex(point, 0)));
  const top = footprint.map((point) => addObjVertex(lines, toObjVertex(point, height)));
  addObjFace(lines, bottom.slice().reverse());
  addObjFace(lines, top);
  for (let i = 0; i < footprint.length; i += 1) {
    const next = (i + 1) % footprint.length;
    addObjFace(lines, [bottom[i], bottom[next], top[next], top[i]]);
  }
}

function roadRibbonPoints(road, width) {
  const left = [];
  const right = [];
  road.points.forEach((point, index) => {
    const previous = road.points[Math.max(0, index - 1)];
    const next = road.points[Math.min(road.points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    left.push({ x: point.x + nx * width, y: point.y + ny * width });
    right.unshift({ x: point.x - nx * width, y: point.y - ny * width });
  });
  return [...left, ...right];
}

function materialLibrary() {
  return [
    "newmtl site_ground\nKd 0.74 0.73 0.64",
    "newmtl road_asphalt\nKd 0.32 0.33 0.32",
    "newmtl offices\nKd 0.18 0.36 0.58",
    "newmtl residential\nKd 0.25 0.55 0.41",
    "newmtl hotels\nKd 0.66 0.42 0.18",
    "newmtl social\nKd 0.68 0.26 0.44",
    "newmtl retail\nKd 0.81 0.35 0.26",
    "newmtl logistics\nKd 0.40 0.45 0.48",
    "newmtl industry\nKd 0.43 0.50 0.25",
    "newmtl data\nKd 0.32 0.40 0.66",
    "newmtl plaza\nKd 0.85 0.75 0.40",
    "newmtl park\nKd 0.56 0.70 0.40",
    "newmtl water\nKd 0.41 0.66 0.74",
  ].join("\n\n");
}

function buildObjModel() {
  const model = {
    vertexCount: 0,
    lines: [
      "# 48 sq km Port of NEOM coastal industrial city study export",
      "# Units: meters",
      "# Import into Rhino with OBJ units set to meters.",
      "mtllib port_neom_coastal_48sqkm.mtl",
    ],
  };

  addFlatObjSurface(model, "site_boundary_48sqkm_red_sea_coast", siteBoundary, "site_ground");

  roads.forEach((road, index) => {
    addFlatObjSurface(model, `road_${index + 1}_${road.kind}`, roadRibbonPoints(road, road.width), "road_asphalt");
  });

  parcels.forEach((parcel, index) => {
    const type = typologies[parcel.type];
    const materialName = parcel.type;
    if (!type.buildable) {
      addFlatObjSurface(model, `${parcel.type}_${index + 1}`, insetPoints(parcel.points, 0.04), materialName);
      return;
    }

    const rawHeight = type.value * type.base * parcel.jitter;
    const parts = parcel.massingParts?.length
      ? parcel.massingParts
      : [{ name: "block", footprint: parcel.footprintPoints || insetPoints(parcel.points, parcel.setback), heightFactor: 1 }];
    parts.forEach((part, partIndex) => {
      addExtrudedObjSolid(
        model,
        `${parcel.type}_${part.name}_${index + 1}_${partIndex + 1}_${Math.round(rawHeight * part.heightFactor)}m`,
        part.footprint,
        rawHeight * part.heightFactor,
        materialName,
      );
    });
  });

  return model.lines.join("\n");
}

function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportViewportPng() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const exportCtx = exportCanvas.getContext("2d");
  exportCtx.fillStyle = "#050607";
  exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  exportCtx.drawImage(canvas, 0, 0);
  const link = document.createElement("a");
  link.href = exportCanvas.toDataURL("image/png");
  link.download = `oxagon_viewport_${Math.round(rect.width * scale)}x${Math.round(rect.height * scale)}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function updateMetrics() {
  const buildingParcels = parcels.filter((parcel) => typologies[parcel.type].buildable);
  const openSpaceParcels = parcels.filter((parcel) => !typologies[parcel.type].buildable);
  const totalHeight = buildingParcels.reduce((sum, parcel) => {
    const type = typologies[parcel.type];
    return sum + type.value * type.base * parcel.jitter;
  }, 0);
  const totalFloorArea = buildingParcels.reduce((sum, parcel) => {
    const type = typologies[parcel.type];
    const floors = Math.max(1, Math.round((type.value * type.base * parcel.jitter) / 3.7));
    return sum + parcel.footprint * floors * type.efficiency;
  }, 0);
  const explicitOpenSpaceArea = openSpaceParcels.reduce((sum, parcel) => {
    const rawArea = parcel.footprint || siteSqMPerUnit * 0.12;
    return sum + rawArea;
  }, 0);
  const publicRealmAllowance = siteAreaSqM * 0.18;
  const openSpaceArea = explicitOpenSpaceArea + publicRealmAllowance;

  avgHeightEl.textContent = `${Math.round(totalHeight / Math.max(1, buildingParcels.length))} m`;
  totalAreaEl.textContent = `${(totalFloorArea / 1000000).toFixed(1)}M sqm`;
  floorRatioEl.textContent = (totalFloorArea / siteAreaSqM).toFixed(1);
  buildingCountEl.textContent = buildingParcels.length;
  openSpaceShareEl.textContent = `${Math.min(100, Math.round((openSpaceArea / siteAreaSqM) * 100))}%`;
  siteScaleEl.textContent = `${siteAreaSqKm} sq km`;
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.save();
  ctx.translate(viewOffset.x, viewOffset.y);
  ctx.scale(viewScale, viewScale);
  const tileW = Math.min(rect.width / 12.5, rect.height / 7.4);
  const tileH = tileW * 0.52;
  const originX = rect.width / 2;
  const originY = Math.max(54, rect.height * 0.07);

  drawWorldGrid(originX, originY, tileW, tileH);
  drawSite(originX, originY, tileW, tileH);
  parcels.forEach((parcel) => drawParcelBase(parcel, originX, originY, tileW, tileH));
  parcels
    .filter((parcel) => !typologies[parcel.type].buildable)
    .forEach((parcel) => drawOpenSpace(parcel, originX, originY, tileW, tileH));
  drawRoads(originX, originY, tileW, tileH);
  parcels
    .filter((parcel) => typologies[parcel.type].buildable)
    .slice()
    .sort((a, b) => a.center.x + a.center.y - (b.center.x + b.center.y))
    .forEach((parcel) => drawBuilding(parcel, originX, originY, tileW, tileH));
  drawParcelDimensionTags(originX, originY, tileW, tileH);
  ctx.restore();
  drawScaleBar(rect);
  drawModelReadout(rect);
  updateMetrics();
}

document.getElementById("shuffleMix").addEventListener("click", () => {
  createParcels(planSeed + Math.floor(Math.random() * 100000));
  draw();
});

document.getElementById("resetModel").addEventListener("click", () => {
  buildingKeys.forEach((key) => {
    typologies[key].value = typologies[key].defaultValue;
  });
  syncControls();
  createParcels(Math.floor(Math.random() * 1000000));
  draw();
});

zoomOutBtn.addEventListener("click", () => {
  const rect = canvas.getBoundingClientRect();
  setZoom(viewScale * 0.82, { x: rect.width / 2, y: rect.height / 2 });
});

zoomInBtn.addEventListener("click", () => {
  const rect = canvas.getBoundingClientRect();
  setZoom(viewScale * 1.18, { x: rect.width / 2, y: rect.height / 2 });
});

fitViewBtn.addEventListener("click", fitView);

panToggleBtn.addEventListener("click", () => {
  panEnabled = !panEnabled;
  panToggleBtn.setAttribute("aria-pressed", String(panEnabled));
  canvas.closest(".viewport").classList.toggle("is-panning", panEnabled);
});

autoSpinToggleBtn.addEventListener("click", () => {
  setAutoSpin(!autoSpinEnabled);
});

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const zoomFactor = Math.exp(-event.deltaY * 0.0016);
    setZoom(viewScale * zoomFactor, anchor);
  },
  { passive: false },
);

canvas.addEventListener("pointerdown", (event) => {
  const shouldPan = panEnabled || event.button === 1 || event.shiftKey;
  const shouldOrbit = event.button === 0 && !shouldPan;
  event.preventDefault();
  isDragging = shouldPan;
  isOrbiting = shouldOrbit;
  dragStart = { x: event.clientX, y: event.clientY };
  dragOrigin = { ...viewOffset };
  dragRotationOrigin = viewRotation;
  canvas.setPointerCapture(event.pointerId);
  canvas.closest(".viewport").classList.toggle("is-dragging", shouldPan);
  canvas.closest(".viewport").classList.toggle("is-orbiting", shouldOrbit);
});

canvas.addEventListener("pointermove", (event) => {
  if (!isDragging && !isOrbiting) return;
  event.preventDefault();
  if (isOrbiting) {
    viewRotation = dragRotationOrigin - (event.clientX - dragStart.x) * 0.008;
    draw();
    return;
  }
  viewOffset = {
    x: dragOrigin.x + event.clientX - dragStart.x,
    y: dragOrigin.y + event.clientY - dragStart.y,
  };
  draw();
});

canvas.addEventListener("pointerup", (event) => {
  finishPan(event.pointerId);
});

canvas.addEventListener("pointercancel", (event) => finishPan(event.pointerId));
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

renderPreviewBtn.addEventListener("click", () => {
  const buildingParcels = parcels.filter((parcel) => typologies[parcel.type].buildable);
  const gfa = totalAreaEl.textContent;
  const far = floorRatioEl.textContent;
  renderStatusEl.textContent = `Render brief ready: photoreal aerial view of a ${siteAreaSqKm} sq km Port of NEOM/Duba coastal masterplan reference with irregular Red Sea shoreline, harbor basin, quay logistics, clean-industry campuses, civic plaza core, ${buildingParcels.length} massing blocks, ${gfa} GFA, FAR ${far}. Connect a Nano Banana Pro API endpoint to submit this brief.`;
});

exportPngBtn.addEventListener("click", () => {
  exportViewportPng();
  exportStatusEl.textContent = "Exported the current viewport as a PNG image.";
});

exportObjBtn.addEventListener("click", () => {
  const obj = buildObjModel();
  const mtl = materialLibrary();
  const buildingCount = parcels.filter((parcel) => typologies[parcel.type].buildable).length;
  downloadTextFile("port_neom_coastal_48sqkm.obj", obj, "text/plain");
  downloadTextFile("port_neom_coastal_48sqkm.mtl", mtl, "text/plain");
  exportStatusEl.textContent = `Exported ${buildingCount} building solids plus site, roads, plazas, parks, and water surfaces. Import the OBJ into Rhino using meters.`;
});

window.urbanDesignExport = {
  buildObjModel,
  materialLibrary,
};

createParcels(planSeed);
makeControls();
window.addEventListener("resize", resizeCanvas);
resizeCanvas();
