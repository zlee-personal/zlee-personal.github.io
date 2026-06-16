import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const datasetMeta = document.querySelector("#datasetMeta");
const statusEl = document.querySelector("#status");
const frameSlider = document.querySelector("#frameSlider");
const frameLabel = document.querySelector("#frameLabel");
const playButton = document.querySelector("#playButton");
const meshToggle = document.querySelector("#meshToggle");
const fieldToggle = document.querySelector("#fieldToggle");
const fieldModeEl = document.querySelector("#fieldMode");
const cameraModeEl = document.querySelector("#cameraMode");
const experimentTabs = document.querySelector("#experimentTabs");
const fieldDescription = document.querySelector("#fieldDescription");
const appEl = document.querySelector("#app");
const panelEl = document.querySelector(".panel");
const panelToggle = document.querySelector("#panelToggle");
const viewerGridEl = document.querySelector("#viewerGrid");
const primaryLoadingEl = document.querySelector("#primaryLoading");
const compareLoadingEl = document.querySelector("#compareLoading");

const loader = new GLTFLoader();
const DEFAULT_CAMERA_PRESET = {
  view: new THREE.Vector3(1.7, 1.1, 1.6),
  distance: 2.6,
};
const FIELD_OPACITY = 0.75;
const RHO_POINT_SIZE = 0.08;
const VELOCITY_LINE_SCALE = 0.15;

const state = {
  manifest: null,
  experiment: "b2",
  fieldMode: "rho",
  cameraMode: "side",
  frame: 0,
  playing: true,
  lastFrameAt: 0,
  loadToken: 0,
};
const mobilePanelQuery = window.matchMedia("(max-width: 680px)");
let panelChoiceTouched = false;
let syncingCameras = false;
let resizeFrame = 0;

function setStatus(message) {
  statusEl.textContent = message;
}

function setViewerLoading(viewer, loading, message = "Loading", error = false) {
  if (!viewer.loadingEl) return;
  const popup = viewer.loadingEl.querySelector(".loading-popup");
  if (popup) {
    popup.textContent = message;
  }
  viewer.loadingEl.classList.toggle("error", error);
  viewer.loadingEl.hidden = !loading;
}

function setComparisonLoading(loading, message = "Loading", error = false) {
  viewers.forEach((viewer) => {
    setViewerLoading(viewer, loading, message, error);
  });
}

function setComparisonError(message) {
  setComparisonLoading(true, message, true);
}

function updatePanelToggleContent(collapsed) {
  panelToggle.replaceChildren();

  if (collapsed) {
    const icon = document.createElement("span");
    icon.className = "help-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "?";

    const text = document.createElement("span");
    text.className = "help-text";
    text.textContent = "Help";

    panelToggle.append(icon, text);
    return;
  }

  const icon = document.createElement("span");
  icon.className = "help-icon close-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "x";

  const text = document.createElement("span");
  text.className = "help-text";
  text.textContent = "Help";

  panelToggle.append(icon, text);
}

function setPanelCollapsed(collapsed, userInitiated = false) {
  if (userInitiated) {
    panelChoiceTouched = true;
  }
  appEl.classList.toggle("controls-collapsed", collapsed);
  panelEl.classList.toggle("collapsed", collapsed);
  panelToggle.classList.toggle("active", !collapsed);
  panelToggle.setAttribute("aria-expanded", String(!collapsed));
  panelToggle.setAttribute("aria-label", collapsed ? "Expand help" : "Collapse help");
  updatePanelToggleContent(collapsed);
  resize();
  scheduleViewerResize();
  window.setTimeout(scheduleViewerResize, 60);
}

function assetUrl(path) {
  return `assets/${path}`;
}

function makeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101214);

  const contentRoot = new THREE.Group();
  contentRoot.rotation.x = -Math.PI / 2;
  scene.add(contentRoot);

  scene.add(new THREE.HemisphereLight(0xf4f8fb, 0x15191c, 1.25));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.9);
  keyLight.position.set(0.2, -8, 0.6);
  scene.add(keyLight);

  const grid = new THREE.GridHelper(4.2, 14, 0x3f4a50, 0x252d31);
  grid.material.transparent = true;
  grid.material.opacity = 0.32;
  scene.add(grid);

  return { scene, contentRoot };
}

function createViewer({ pane, canvas, labelEl, loadingEl }) {
  const { scene, contentRoot } = makeScene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(4.2, 2.8, 4.2);
  camera.up.set(0, 1, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  const viewer = {
    pane,
    canvas,
    labelEl,
    loadingEl,
    scene,
    contentRoot,
    camera,
    renderer,
    controls,
    dataset: null,
    field: null,
    meshRoots: [],
    fieldObject: null,
  };

  controls.addEventListener("change", () => {
    syncCompareCameras(viewer);
  });

  return viewer;
}

const viewers = [
  createViewer({
    pane: document.querySelector("#panePrimary"),
    canvas: document.querySelector("#scene"),
    labelEl: document.querySelector("#primaryPaneLabel"),
    loadingEl: primaryLoadingEl,
  }),
  createViewer({
    pane: document.querySelector("#paneCompare"),
    canvas: document.querySelector("#sceneCompare"),
    labelEl: document.querySelector("#comparePaneLabel"),
    loadingEl: compareLoadingEl,
  }),
];

if (window.ResizeObserver) {
  const viewerResizeObserver = new ResizeObserver(scheduleViewerResize);
  viewerResizeObserver.observe(viewerGridEl);
  viewers.forEach((viewer) => viewerResizeObserver.observe(viewer.pane));
}

function activeViewers() {
  return viewers;
}

function resizeViewer(viewer) {
  if (viewer.pane.hidden) return;
  const rect = viewer.pane.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  viewer.camera.aspect = width / height;
  viewer.camera.updateProjectionMatrix();
  viewer.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  viewer.renderer.setSize(width, height, false);
}

function resize() {
  activeViewers().forEach(resizeViewer);
}

function scheduleViewerResize() {
  window.cancelAnimationFrame(resizeFrame);
  resizeFrame = window.requestAnimationFrame(() => {
    resize();
    window.requestAnimationFrame(resize);
  });
}

function datasetMethod(entry) {
  const id = entry?.id || "";
  if (id.includes("pg3dgs")) {
    return {
      key: "ours",
      badgeLines: ["Ours", "(PG-3DGS)"],
      label: "PG-3DGS (ours)",
      badgeClass: "ours",
      meshColor: 0xd8d0bd,
    };
  }
  if (id.includes("3dgs")) {
    return {
      key: "baseline",
      badgeLines: ["Baseline", "(3DGS)"],
      label: "3DGS baseline",
      badgeClass: "baseline",
      meshColor: 0xb9c4cf,
    };
  }
  return {
    key: "other",
    badgeLines: ["method"],
    label: "Method",
    badgeClass: "baseline",
    meshColor: 0xc4cad2,
  };
}

function datasetObjectKey(entry) {
  const id = entry?.id || "";
  if (id.startsWith("teapot")) return "teapot14";
  if (id.startsWith("b2_")) return "b2";
  return "unknown";
}

function datasetObjectLabel(entry) {
  const key = datasetObjectKey(entry);
  if (key === "teapot14") return "Teapot";
  if (key === "b2") return "B2 Plane";
  return entry?.label || "Experiment";
}

function labelOutcomeLines(entry, method) {
  const objectKey = datasetObjectKey(entry);
  if (objectKey === "teapot14") {
    return method.key === "ours"
      ? ["Can pour", "fluid"]
      : ["Cannot pour", "fluid"];
  }
  if (objectKey === "b2") {
    return method.key === "ours"
      ? ["Produces", "lift"]
      : ["Cannot produce", "lift"];
  }
  return [method.label];
}

function comparisonPairFor(entry) {
  const objectKey = datasetObjectKey(entry);
  const datasets = state.manifest?.datasets || [];
  const matches = datasets.filter((item) => datasetObjectKey(item) === objectKey);
  const baseline = matches.find((item) => datasetMethod(item).key === "baseline");
  const ours = matches.find((item) => datasetMethod(item).key === "ours");
  return baseline && ours ? [baseline, ours] : null;
}

function updatePaneLabel(viewer) {
  const entry = viewer.dataset;
  viewer.labelEl.replaceChildren();
  viewer.labelEl.classList.remove("baseline", "ours", "other");
  if (!entry) return;

  const method = datasetMethod(entry);
  viewer.labelEl.classList.add(method.key);

  const badge = document.createElement("span");
  badge.className = `method-badge ${method.badgeClass}`;
  const badgeLines = method.badgeLines || [method.label];
  badgeLines.forEach((line) => {
    const lineEl = document.createElement("span");
    lineEl.className = "badge-line";
    lineEl.textContent = line;
    badge.append(lineEl);
  });

  const labelBody = document.createElement("span");
  labelBody.className = "method-label-body";

  labelOutcomeLines(entry, method).forEach((line) => {
    const outcome = document.createElement("span");
    outcome.className = "method-outcome";
    outcome.textContent = line;
    labelBody.append(outcome);
  });

  viewer.labelEl.append(badge, labelBody);
}

function updateDatasetMeta() {
  const entry = viewers[0].dataset;
  if (!entry) {
    datasetMeta.textContent = "Comparison unavailable";
    return;
  }
  datasetMeta.textContent = `${datasetObjectLabel(entry)} | 3DGS vs PG-3DGS | ${frameCount()} frames`;
}

function colorRamp(value, range) {
  const [lo, hi] = range || [0, 1];
  const t = hi > lo ? THREE.MathUtils.clamp((value - lo) / (hi - lo), 0, 1) : 0;
  const blue = new THREE.Color(0x2454a6);
  const cyan = new THREE.Color(0x39c4c8);
  const amber = new THREE.Color(0xf2a65a);
  if (t < 0.55) {
    return blue.lerp(cyan, t / 0.55);
  }
  return cyan.lerp(amber, (t - 0.55) / 0.45);
}

function clearObject(object) {
  if (!object) return;
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
  object.parent?.remove(object);
}

function clearObjects(objects) {
  objects.forEach((object) => clearObject(object));
}

function clearViewer(viewer) {
  clearObjects(viewer.meshRoots);
  clearObject(viewer.fieldObject);
  viewer.dataset = null;
  viewer.field = null;
  viewer.meshRoots = [];
  viewer.fieldObject = null;
  updatePaneLabel(viewer);
}

function currentMeshRoot(viewer) {
  if (!viewer.meshRoots.length) return null;
  if (viewer.meshRoots.length === 1) return viewer.meshRoots[0];
  return viewer.meshRoots[Math.min(state.frame, viewer.meshRoots.length - 1)];
}

function updateMeshFrameVisibility(viewer) {
  viewer.meshRoots.forEach((meshRoot, index) => {
    meshRoot.visible =
      meshToggle.checked && (viewer.meshRoots.length === 1 || index === state.frame);
  });
}

function availableModes(field) {
  const modes = [];
  if (field?.rho) modes.push("rho");
  if (field?.velocity) modes.push("velocity");
  return modes;
}

function activeModes() {
  return availableModes(viewers[0].field);
}

function activeFrames(viewer = viewers[0]) {
  const field = viewer.field?.[state.fieldMode];
  return field?.frames || [];
}

function frameCount() {
  const counts = activeViewers()
    .map((viewer) => activeFrames(viewer).length)
    .filter((count) => count > 0);
  return counts.length ? Math.min(...counts) : 0;
}

function updateTimeline() {
  const count = frameCount();
  const max = Math.max(count - 1, 0);
  state.frame = THREE.MathUtils.clamp(state.frame, 0, max);
  frameSlider.max = String(max);
  frameSlider.value = String(state.frame);
  const rawIndex = activeFrames(viewers[0])[state.frame]?.index ?? 0;
  frameLabel.value = `${state.frame + (count ? 1 : 0)} / ${count}`;
  frameLabel.textContent = `${rawIndex}`;
  updateDatasetMeta();
}

function dataVectorToScene(vector) {
  return new THREE.Vector3(vector.x, vector.z, -vector.y);
}

function cameraPresetForDataset(entry, mode = state.cameraMode) {
  const id = entry?.id || "";
  if (mode === "iso") {
    return {
      view: new THREE.Vector3(1.2, -1.2, 0.72),
      distance: 2.6,
    };
  }
  if (id.startsWith("b2_")) {
    return {
      view:
        mode === "alt"
          ? new THREE.Vector3(0.08, -1.0, 0.18)
          : new THREE.Vector3(-1.0, 0.08, 0.18),
      distance: 2.25,
    };
  }
  if (id.startsWith("teapot")) {
    return {
      view:
        mode === "alt"
          ? new THREE.Vector3(0.0, 1.0, 0.12)
          : new THREE.Vector3(1.0, 0.0, 0.08),
      distance: 2.2,
    };
  }
  return DEFAULT_CAMERA_PRESET;
}

function updateCameraModeButtons() {
  cameraModeEl.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.cameraMode);
  });
}

function fieldDescriptionText(mode) {
  if (mode === "velocity") {
    return "Currently showing the velocity field: the direction the fluid is flowing.";
  }
  if (mode === "rho") {
    return "Currently showing the rho field: the density of a dye-like tracker used to show fluid pouring out of the teapot.";
  }
  return "Currently showing the selected fluid field.";
}

function updateFieldDescription() {
  fieldDescription.textContent = fieldDescriptionText(state.fieldMode);
}

function makeRhoObject(frame, rhoInfo) {
  const positions = new Float32Array(frame.positions);
  const values = frame.values || [];
  const count = positions.length / 3;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const color = colorRamp(values[i] ?? 0, rhoInfo.valueRange);
    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: RHO_POINT_SIZE,
    vertexColors: true,
    transparent: true,
    opacity: FIELD_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
}

function makeVelocityObject(frame, velocityInfo) {
  const starts = frame.positions || [];
  const vectors = frame.vectors || [];
  const values = frame.values || [];
  const count = starts.length / 3;
  const positions = new Float32Array(count * 6);
  const colors = new Float32Array(count * 6);
  const lengthScale = VELOCITY_LINE_SCALE;

  for (let i = 0; i < count; i += 1) {
    const sx = starts[i * 3 + 0];
    const sy = starts[i * 3 + 1];
    const sz = starts[i * 3 + 2];
    const vx = vectors[i * 3 + 0] * lengthScale;
    const vy = vectors[i * 3 + 1] * lengthScale;
    const vz = vectors[i * 3 + 2] * lengthScale;
    const offset = i * 6;
    positions[offset + 0] = sx;
    positions[offset + 1] = sy;
    positions[offset + 2] = sz;
    positions[offset + 3] = sx + vx;
    positions[offset + 4] = sy + vy;
    positions[offset + 5] = sz + vz;

    const color = colorRamp(values[i] ?? 0, velocityInfo.valueRange);
    colors[offset + 0] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
    colors[offset + 3] = color.r;
    colors[offset + 4] = color.g;
    colors[offset + 5] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: FIELD_OPACITY,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  return new THREE.LineSegments(geometry, material);
}

function renderViewerFrame(viewer) {
  clearObject(viewer.fieldObject);
  viewer.fieldObject = null;

  const frames = activeFrames(viewer);
  const frame = frames[state.frame];
  if (!frame) {
    updateMeshFrameVisibility(viewer);
    return;
  }

  if (!fieldToggle.checked) {
    updateMeshFrameVisibility(viewer);
    return;
  }

  if (state.fieldMode === "rho" && viewer.field?.rho) {
    viewer.fieldObject = makeRhoObject(frame, viewer.field.rho);
  } else if (state.fieldMode === "velocity" && viewer.field?.velocity) {
    viewer.fieldObject = makeVelocityObject(frame, viewer.field.velocity);
  }

  if (viewer.fieldObject) {
    viewer.contentRoot.add(viewer.fieldObject);
  }
  updateMeshFrameVisibility(viewer);
}

function renderAllFieldFrames() {
  activeViewers().forEach(renderViewerFrame);
  updateTimeline();
}

function setMode(mode, resetFrame = true) {
  const modes = activeModes();
  state.fieldMode = modes.includes(mode) ? mode : modes[0] || "rho";
  fieldModeEl.querySelectorAll("button").forEach((button) => {
    const buttonMode = button.dataset.mode;
    button.disabled = !modes.includes(buttonMode);
    button.classList.toggle("active", buttonMode === state.fieldMode);
  });
  updateFieldDescription();
  if (resetFrame) {
    state.frame = 0;
  }
  renderAllFieldFrames();
}

function fitViewerCamera(viewer) {
  const objects = [];
  if (viewer.meshRoots.length > 1) {
    objects.push(...viewer.meshRoots);
  } else {
    const meshRoot = currentMeshRoot(viewer);
    if (meshRoot) objects.push(meshRoot);
  }
  if (viewer.fieldObject) objects.push(viewer.fieldObject);
  if (!objects.length) return;

  const box = new THREE.Box3();
  viewer.contentRoot.updateWorldMatrix(true, true);
  objects.forEach((object) => box.expandByObject(object));
  if (box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 1) * 0.78;
  const preset = cameraPresetForDataset(viewer.dataset);
  const view = dataVectorToScene(preset.view).normalize();
  viewer.controls.target.copy(center);
  viewer.camera.up.set(0, 1, 0);
  viewer.camera.position.copy(center).add(view.multiplyScalar(radius * preset.distance));
  viewer.camera.near = Math.max(radius / 200, 0.01);
  viewer.camera.far = Math.max(radius * 20, 20);
  viewer.camera.updateProjectionMatrix();
  viewer.controls.update();
}

function syncCompareCameras(sourceViewer) {
  if (syncingCameras) return;
  syncingCameras = true;
  viewers.forEach((viewer) => {
    if (viewer === sourceViewer || viewer.pane.hidden) return;
    viewer.camera.position.copy(sourceViewer.camera.position);
    viewer.camera.quaternion.copy(sourceViewer.camera.quaternion);
    viewer.camera.up.copy(sourceViewer.camera.up);
    viewer.camera.zoom = sourceViewer.camera.zoom;
    viewer.camera.near = sourceViewer.camera.near;
    viewer.camera.far = sourceViewer.camera.far;
    viewer.camera.updateProjectionMatrix();
    viewer.controls.target.copy(sourceViewer.controls.target);
    viewer.controls.update();
  });
  syncingCameras = false;
}

function fitActiveCameras() {
  syncingCameras = true;
  activeViewers().forEach(fitViewerCamera);
  syncingCameras = false;
  syncCompareCameras(viewers[0]);
}

function disposeGltfs(gltfs) {
  gltfs.forEach((gltf) => {
    clearObject(gltf.scene);
  });
}

async function loadViewerDataset(viewer, entry, token) {
  clearViewer(viewer);
  viewer.dataset = entry;
  updatePaneLabel(viewer);
  setViewerLoading(viewer, true);

  const meshPaths = entry.meshFrames?.length
    ? entry.meshFrames.map((frame) => frame.path)
    : [entry.mesh];
  const [gltfs, field] = await Promise.all([
    Promise.all(meshPaths.map((path) => loader.loadAsync(assetUrl(path)))),
    fetch(assetUrl(entry.field)).then((response) => {
      if (!response.ok) throw new Error(`Failed to load ${entry.field}`);
      return response.json();
    }),
  ]);
  if (token !== state.loadToken) {
    disposeGltfs(gltfs);
    return false;
  }

  const method = datasetMethod(entry);
  viewer.meshRoots = gltfs.map((gltf) => gltf.scene);
  viewer.meshRoots.forEach((meshRoot) => {
    meshRoot.traverse((child) => {
      if (!child.isMesh) return;
      child.material = new THREE.MeshStandardMaterial({
        color: method.meshColor,
        metalness: 0.04,
        roughness: 0.72,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
      });
    });
    meshRoot.visible = false;
    viewer.contentRoot.add(meshRoot);
  });

  viewer.field = field;
  return true;
}

function selectedExperimentDataset() {
  const datasets = state.manifest?.datasets || [];
  return datasets.find((item) => datasetObjectKey(item) === state.experiment) || datasets[0] || null;
}

function defaultExperimentFor(datasets) {
  const planeDataset = datasets.find(
    (item) => datasetObjectKey(item) === "b2" && comparisonPairFor(item)
  );
  const defaultEntry = planeDataset || datasets[0] || null;
  return defaultEntry ? datasetObjectKey(defaultEntry) : "b2";
}

function defaultModeForEntry(entry) {
  return entry?.kind === "velocity" ? "velocity" : "rho";
}

function applyViewLayout() {
  viewerGridEl.classList.add("compare");
  viewers[1].pane.hidden = false;
  scheduleViewerResize();
}

async function loadComparison(entry, token) {
  const pair = comparisonPairFor(entry);
  if (!pair) {
    setStatus("No 3DGS/PG-3DGS pair was found for this experiment.");
    setComparisonError("Unavailable");
    return;
  }

  applyViewLayout();
  setComparisonLoading(true);
  setStatus("Loading 3DGS and PG-3DGS comparison...");
  const loaded = await Promise.all([
    loadViewerDataset(viewers[0], pair[0], token),
    loadViewerDataset(viewers[1], pair[1], token),
  ]);
  if (token !== state.loadToken || loaded.includes(false)) return;

  state.cameraMode = "side";
  updateCameraModeButtons();
  setMode(defaultModeForEntry(pair[0]), true);
  fitActiveCameras();
  setComparisonLoading(false);
  setStatus(`${datasetObjectLabel(pair[0])}: 3DGS baseline left, PG-3DGS ours right.`);
}

async function loadSelectedExperiment() {
  const entry = selectedExperimentDataset();
  if (!entry) {
    setStatus("No exported checkpoint assets are listed yet.");
    datasetMeta.textContent = "No experiments";
    setComparisonError("Unavailable");
    return;
  }

  const token = ++state.loadToken;
  try {
    await loadComparison(entry, token);
  } catch (error) {
    if (token === state.loadToken) {
      setStatus(error.message);
      setComparisonError("Unable to load");
    }
  }
}

function updateExperimentTabs() {
  experimentTabs.querySelectorAll("button[data-experiment]").forEach((button) => {
    const active = button.dataset.experiment === state.experiment;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

async function loadManifest() {
  const response = await fetch("assets/manifest.json");
  if (!response.ok) {
    throw new Error("No assets/manifest.json found.");
  }
  state.manifest = await response.json();
  const datasets = state.manifest.datasets || [];

  if (!datasets.length) {
    datasetMeta.textContent = "No experiments";
    setStatus("No exported checkpoint assets are listed yet.");
    setComparisonError("Unavailable");
    return;
  }

  state.experiment = defaultExperimentFor(datasets);
  updateExperimentTabs();

  await loadSelectedExperiment();
}

experimentTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-experiment]");
  if (!button || button.dataset.experiment === state.experiment) return;
  state.experiment = button.dataset.experiment;
  updateExperimentTabs();
  loadSelectedExperiment();
});

fieldModeEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button || button.disabled) return;
  setMode(button.dataset.mode, true);
  fitActiveCameras();
});

cameraModeEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-view]");
  if (!button) return;
  state.cameraMode = button.dataset.view;
  updateCameraModeButtons();
  fitActiveCameras();
});

frameSlider.addEventListener("input", () => {
  state.frame = Number(frameSlider.value);
  renderAllFieldFrames();
});

playButton.addEventListener("click", () => {
  state.playing = !state.playing;
  playButton.textContent = state.playing ? "Pause" : "Play";
});

meshToggle.addEventListener("change", () => {
  activeViewers().forEach(updateMeshFrameVisibility);
});

fieldToggle.addEventListener("change", renderAllFieldFrames);

panelToggle.addEventListener("click", () => {
  setPanelCollapsed(!panelEl.classList.contains("collapsed"), true);
});
mobilePanelQuery.addEventListener("change", (event) => {
  if (!panelChoiceTouched) {
    setPanelCollapsed(event.matches);
  } else {
    setPanelCollapsed(panelEl.classList.contains("collapsed"));
  }
});
window.addEventListener("resize", scheduleViewerResize);

function tick(now) {
  requestAnimationFrame(tick);
  activeViewers().forEach((viewer) => viewer.controls.update());

  const count = frameCount();
  if (state.playing && count > 1 && now - state.lastFrameAt > 110) {
    state.frame = (state.frame + 1) % count;
    state.lastFrameAt = now;
    renderAllFieldFrames();
  }

  activeViewers().forEach((viewer) => {
    viewer.renderer.render(viewer.scene, viewer.camera);
  });
}

applyViewLayout();
resize();
setPanelCollapsed(mobilePanelQuery.matches);
loadManifest().catch((error) => {
  datasetMeta.textContent = "Assets unavailable";
  setStatus(error.message);
  setComparisonError("Unable to load");
});
requestAnimationFrame(tick);
