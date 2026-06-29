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
const renderPreviewBtn = document.getElementById("renderPreview");
const renderStatusEl = document.getElementById("renderStatus");
const exportObjBtn = document.getElementById("exportObj");
const exportStatusEl = document.getElementById("exportStatus");

const siteAreaSqM = 50000000;
const siteUnits = 14;
const siteSqMPerUnit = siteAreaSqM / (siteUnits * siteUnits);
const siteAreaSqKm = siteAreaSqM / 1000000;
const metersPerUnit = Math.sqrt(siteAreaSqM) / siteUnits;

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
let panEnabled = false;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let dragOrigin = { x: 0, y: 0 };

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
  draw();
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

function iso(x, y, originX, originY, tileW, tileH) {
  return { x: originX + (x - y) * (tileW / 2), y: originY + (x + y) * (tileH / 2) };
}

function jitteredPoint(x, y, random, amount = 0.16) {
  return {
    x: Math.max(0, Math.min(siteUnits, x + (random() - 0.5) * amount)),
    y: Math.max(0, Math.min(siteUnits, y + (random() - 0.5) * amount)),
  };
}

function createOrganicBoundary(random) {
  const center = { x: siteUnits / 2, y: siteUnits / 2 };
  const points = [];
  for (let i = 0; i < 24; i += 1) {
    const angle = (Math.PI * 2 * i) / 24;
    const radius = 6.05 + Math.sin(angle * 3.1) * 0.45 + (random() - 0.5) * 0.55;
    points.push({
      x: center.x + Math.cos(angle) * radius * 1.03,
      y: center.y + Math.sin(angle) * radius * 0.9,
    });
  }
  return points;
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
  const center = { x: 7 + (random() - 0.5) * 0.8, y: 6.8 + (random() - 0.5) * 0.8 };
  parcels = [];
  siteBoundary = createOrganicBoundary(random);
  roads = [
    createCurvedRoad(Array.from({ length: 22 }, (_, i) => pointOnEllipse(center, 4.25, 3.25, (Math.PI * 2 * i) / 21, Math.sin(i * 1.7) * 0.22)), 0.2, "arterial"),
    createCurvedRoad(Array.from({ length: 18 }, (_, i) => pointOnEllipse(center, 2.55, 1.85, (Math.PI * 2 * i) / 17 + 0.35, Math.cos(i * 1.9) * 0.16)), 0.15, "collector"),
    createCurvedRoad(Array.from({ length: 8 }, (_, i) => ({ x: 1.1 + i * 1.75, y: 3.2 + Math.sin(i * 0.9) * 1.15 })), 0.16, "collector"),
    createCurvedRoad(Array.from({ length: 8 }, (_, i) => ({ x: 2.2 + i * 1.45, y: 11.4 - Math.sin(i * 0.75) * 1.15 })), 0.13, "local"),
    createCurvedRoad(Array.from({ length: 9 }, (_, i) => ({ x: center.x + Math.cos(0.15) * (i - 4) * 1.45, y: center.y + Math.sin(0.15) * (i - 4) * 1.45 })), 0.18, "arterial"),
    createCurvedRoad(Array.from({ length: 9 }, (_, i) => ({ x: center.x + Math.cos(2.15) * (i - 4) * 1.35, y: center.y + Math.sin(2.15) * (i - 4) * 1.35 })), 0.13, "local"),
  ];
  transitStops = [
    pointOnEllipse(center, 4.25, 3.25, 0.2),
    pointOnEllipse(center, 4.25, 3.25, 1.9),
    pointOnEllipse(center, 2.55, 1.85, 3.15),
    pointOnEllipse(center, 4.25, 3.25, 5.25),
  ];

  for (let ring = 0; ring < 7; ring += 1) {
    const count = 12 + ring * 6;
    const radius = 0.9 + ring * 0.92;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * (i + random() * 0.55)) / count + ring * 0.23;
      const cx = center.x + Math.cos(angle) * radius * (1.05 + random() * 0.14);
      const cy = center.y + Math.sin(angle) * radius * (0.82 + random() * 0.2);
      if (cx < 0.8 || cx > siteUnits - 0.8 || cy < 0.8 || cy > siteUnits - 0.8) continue;
      const nearMajorRoad = roads.some((road) => road.kind !== "local" && roadDistance(cx, cy, road) < 0.55);
      const nearTransit = transitStops.some((stop) => Math.hypot(cx - stop.x, cy - stop.y) < 1.65);
      const distanceToCenter = Math.hypot(cx - center.x, cy - center.y);
      const waterBand = cy > 10.7 && cx < 6.3 + Math.sin(cx * 1.2) * 0.8;
      const civicCore = distanceToCenter < 1.7;
      let type = pickWeighted(random, [
        { type: "residential", weight: ring > 2 ? 36 : 16 },
        { type: "offices", weight: nearTransit || ring < 3 ? 34 : 10 },
        { type: "hotels", weight: nearTransit || waterBand ? 18 : 7 },
        { type: "retail", weight: nearMajorRoad ? 24 : 7 },
        { type: "social", weight: civicCore ? 26 : 7 },
        { type: "park", weight: waterBand || ring === 5 ? 18 : 6 },
        { type: "plaza", weight: civicCore ? 22 : 4 },
      ]);

      if (waterBand && random() > 0.42) type = "water";
      if (civicCore && random() > 0.38) type = random() > 0.5 ? "plaza" : "social";
      if (type === "water" && random() > 0.7) type = "park";

      const parcelRx = 0.34 + random() * 0.28 + ring * 0.02;
      const parcelRy = 0.26 + random() * 0.22;
      const rotation = angle + Math.PI / 2 + (random() - 0.5) * 0.9;
      const points = organicBlob({ x: cx, y: cy }, parcelRx, parcelRy, 7 + Math.floor(random() * 3), random, rotation);
      parcels.push({
        type,
        points,
        footprintPoints: orientedFootprint({ x: cx, y: cy }, parcelRx * 0.58, parcelRy * 0.52, rotation),
        center: { x: cx, y: cy },
        footprint: Math.max(36000, parcelRx * parcelRy * siteSqMPerUnit * (1.35 + random() * 0.75)),
        jitter: 0.82 + random() * 0.42 + (nearTransit ? 0.16 : 0) + (ring < 2 ? 0.1 : 0),
        setback: 0.14 + random() * 0.12 + (type === "offices" ? 0.03 : 0),
        podium: type === "offices" || type === "hotels" || type === "residential",
        roofRotation: random(),
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
  const value = Number.parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (value >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((value >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (value & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
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
  drawPolygon(boundary, "#d7d8c8", "rgba(31, 36, 40, 0.28)");
}

function drawRoads(originX, originY, tileW, tileH) {
  roads.forEach((road) => {
    const projected = projectPoints(road.points, originX, originY, tileW, tileH);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = road.kind === "arterial" ? "rgba(64, 68, 71, 0.7)" : "rgba(88, 91, 90, 0.56)";
    ctx.lineWidth = Math.max(5, tileW * road.width);
    ctx.beginPath();
    projected.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.36)";
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
  const width = 120;
  ctx.save();
  ctx.strokeStyle = "rgba(31, 36, 40, 0.72)";
  ctx.fillStyle = "rgba(255, 253, 248, 0.88)";
  ctx.lineWidth = 2;
  ctx.fillRect(x - 8, y - 22, width + 16, 42);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + width, y);
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x, y + 6);
  ctx.moveTo(x + width, y - 6);
  ctx.lineTo(x + width, y + 6);
  ctx.stroke();
  ctx.font = "700 12px Inter, sans-serif";
  ctx.fillStyle = "rgba(31, 36, 40, 0.82)";
  ctx.fillText("approx. 1 km", x, y - 10);
  ctx.restore();
}

function drawParcelBase(parcel, originX, originY, tileW, tileH) {
  const points = projectPoints(parcel.points, originX, originY, tileW, tileH);
  drawPolygon(points, "#d9d7c7", "rgba(31, 36, 40, 0.1)");
}

function drawOpenSpace(parcel, originX, originY, tileW, tileH) {
  const type = typologies[parcel.type];
  const points = projectPoints(insetPoints(parcel.points, 0.04), originX, originY, tileW, tileH);
  drawPolygon(points, type.color, "rgba(31, 36, 40, 0.11)");

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
      "rgba(29, 34, 38, 0.08)",
      "transparent",
    );
  }
  drawPolygon([base[1], base[2], top[2], top[1]], shade(type.color, -30));
  drawPolygon([base[2], base[3], top[3], top[2]], shade(type.color, -12));
  drawPolygon([base[0], base[1], top[1], top[0]], shade(type.color, -22));
  drawPolygon(top, type.roof, "rgba(31, 36, 40, 0.18)");
  return top;
}

function drawFacadeLines(base, height, typeKey) {
  const floorCount = Math.min(12, Math.max(2, Math.floor(height / 13)));
  ctx.strokeStyle = typeKey === "retail" ? "rgba(255, 245, 210, 0.48)" : "rgba(235, 245, 250, 0.34)";
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
}

function drawRoofDetails(top, parcel, tileW) {
  const centerX = top.reduce((sum, point) => sum + point.x, 0) / top.length;
  const centerY = top.reduce((sum, point) => sum + point.y, 0) / top.length;
  const unit = Math.max(3, tileW * 0.025);
  ctx.fillStyle = "rgba(255, 255, 255, 0.32)";
  ctx.strokeStyle = "rgba(31, 36, 40, 0.14)";
  ctx.lineWidth = 1;
  ctx.fillRect(centerX - unit * 1.4, centerY - unit * 0.8, unit * 2.5, unit * 1.35);
  ctx.strokeRect(centerX - unit * 1.4, centerY - unit * 0.8, unit * 2.5, unit * 1.35);
  if (parcel.roofRotation > 0.55) {
    ctx.beginPath();
    ctx.moveTo(top[0].x * 0.7 + top[1].x * 0.3, top[0].y * 0.7 + top[1].y * 0.3);
    ctx.lineTo(top[3].x * 0.7 + top[2].x * 0.3, top[3].y * 0.7 + top[2].y * 0.3);
    ctx.stroke();
  }
}

function drawBuilding(parcel, originX, originY, tileW, tileH) {
  const type = typologies[parcel.type];
  const footprint = parcel.footprintPoints || insetPoints(parcel.points, parcel.setback);
  const base = projectPoints(footprint, originX, originY, tileW, tileH);
  const rawHeight = type.value * type.base * parcel.jitter;
  const height = rawHeight * 0.4;

  if (parcel.podium && rawHeight > 55) {
    const podiumHeight = Math.min(height * 0.36, 26);
    const podiumTop = drawExtrusion(base, podiumHeight, { ...type, color: shade(type.color, 16), roof: shade(type.roof, 10) });
    const towerBase = insetPoints(footprint, parcel.type === "residential" ? 0.22 : 0.16);
    const towerProjected = projectPoints(towerBase, originX, originY, tileW, tileH).map((point) => ({ x: point.x, y: point.y - podiumHeight }));
    const towerTop = drawExtrusion(towerProjected, height - podiumHeight, type, false);
    drawFacadeLines(towerProjected, height - podiumHeight, parcel.type);
    drawRoofDetails(towerTop, parcel, tileW);
    drawPolygon(podiumTop, "rgba(255, 255, 255, 0.08)", "rgba(31, 36, 40, 0.08)");
    return;
  }

  const top = drawExtrusion(base, height, type);
  drawFacadeLines(base, height, parcel.type);
  drawRoofDetails(top, parcel, tileW);
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
    "newmtl plaza\nKd 0.85 0.75 0.40",
    "newmtl park\nKd 0.56 0.70 0.40",
    "newmtl water\nKd 0.41 0.66 0.74",
  ].join("\n\n");
}

function buildObjModel() {
  const model = {
    vertexCount: 0,
    lines: [
      "# 50 sq km organic urban design export",
      "# Units: meters",
      "# Import into Rhino with OBJ units set to meters.",
      "mtllib urban_design_50sqkm.mtl",
    ],
  };

  addFlatObjSurface(model, "site_boundary_50sqkm", siteBoundary, "site_ground");

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
    const footprint = parcel.footprintPoints || insetPoints(parcel.points, parcel.setback);
    addExtrudedObjSolid(model, `${parcel.type}_massing_${index + 1}_${Math.round(rawHeight)}m`, footprint, rawHeight, materialName);
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
  ctx.restore();
  drawScaleBar(rect);
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

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setZoom(viewScale * (event.deltaY > 0 ? 0.9 : 1.1), anchor);
  },
  { passive: false },
);

canvas.addEventListener("pointerdown", (event) => {
  if (!panEnabled) return;
  isDragging = true;
  dragStart = { x: event.clientX, y: event.clientY };
  dragOrigin = { ...viewOffset };
  canvas.setPointerCapture(event.pointerId);
  canvas.closest(".viewport").classList.add("is-dragging");
});

canvas.addEventListener("pointermove", (event) => {
  if (!isDragging) return;
  viewOffset = {
    x: dragOrigin.x + event.clientX - dragStart.x,
    y: dragOrigin.y + event.clientY - dragStart.y,
  };
  draw();
});

canvas.addEventListener("pointerup", (event) => {
  if (!isDragging) return;
  isDragging = false;
  canvas.releasePointerCapture(event.pointerId);
  canvas.closest(".viewport").classList.remove("is-dragging");
});

renderPreviewBtn.addEventListener("click", () => {
  const buildingParcels = parcels.filter((parcel) => typologies[parcel.type].buildable);
  const gfa = totalAreaEl.textContent;
  const far = floorRatioEl.textContent;
  renderStatusEl.textContent = `Render brief ready: photoreal aerial view of a ${siteAreaSqKm} sq km organic mixed-use district, ${buildingParcels.length} massing blocks, ${gfa} GFA, FAR ${far}. Connect a Nano Banana Pro API endpoint to submit this brief.`;
});

exportObjBtn.addEventListener("click", () => {
  const obj = buildObjModel();
  const mtl = materialLibrary();
  const buildingCount = parcels.filter((parcel) => typologies[parcel.type].buildable).length;
  downloadTextFile("urban_design_50sqkm.obj", obj, "text/plain");
  downloadTextFile("urban_design_50sqkm.mtl", mtl, "text/plain");
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
