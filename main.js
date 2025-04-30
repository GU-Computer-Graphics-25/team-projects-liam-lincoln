// Import Three.js core
import * as THREE from 'three';
// GLTF/DRACO Loaders are still needed for models
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
// Import dat.GUI
import * as dat from 'dat.gui';
// Import Sky addon
import { Sky } from 'three/addons/objects/Sky.js';

// --- Configuration ---
const terrainScale = 10;
const WATER_LEVEL_Y = -17.0;
const patternScaleFactor = 1.0; // Initial pattern scale
const waterTimeScaleFactor = 1.2; // <<< SET FIXED WATER ANIMATION SPEED >>>
const waterAlpha = 0.85; // <<< Set desired base water transparency (0.0 to 1.0) >>>
// Camera
const chaseCameraOffset = new THREE.Vector3(0, 45, 15); // Still used for the 'Overhead' view logic
const cameraLerpFactor = 0.08;
const thirdPersonOffset = new THREE.Vector3(0, 15, 30); // Third-person camera offset
// Boat Physics
const boatScale = 2.0;
const maxSpeed = 15.0 * terrainScale / 10;
const accelerationRate = 10.0 * terrainScale / 10;
const decelerationRate = 8.0 * terrainScale / 10;
const turnRate = 1.0 * Math.PI / 180 * 60; // Radians per second
// Collision
const collisionCheckDistance = 5.0 * boatScale; // How far ahead to check for collision
const collisionDamping = 0.2; // Factor to reduce speed on collision (e.g., 0.2 = 80% reduction)
const collisionNudge = 0.01; // Tiny push away from wall to prevent sticking
// Animation
const rowingSpeedFactor = 8;
const maxRowingAngle = Math.PI / 3; // Increased angle for more dramatic motion
const baseArmAngle = Math.PI / 6;
const oarPivotYOffset = -0.6; // <<< Moved oar Y offset calculation here for clarity >>>
// Lighting (Only Day Mode now)
const dayAmbientIntensity = 0.6; // <<< Base ambient light, sky provides main lighting >>>
const daySunIntensity = 1.0;    // <<< Intensity for the DirectionalLight matching the Sky's sun >>>
// Fog
const fogColor = 0xacdbfc; // Low saturation bright blue (Fog blends *towards* this color)
const fogNear = 0 * terrainScale;
const fogFar = 80 * terrainScale;
// FPS Lock
const targetFrameRate = 30;
const targetFrameDuration = 1 / targetFrameRate; // Seconds
// Horizon/Background Color (Matches Fog)
const horizonColor = fogColor; // <<< Renamed for clarity, used for scene background >>>
// <<< Hardcoded Sky Values >>>
const skySettings = {
   turbidity: 0.1,
   rayleigh: 0.15,
   mieCoefficient: 0.1,
   mieDirectionalG: 0.953,
   elevation: 85, // degrees
   azimuth: 0, // degrees
   exposure: 1.0
};

// --- State Variables ---
// Boat
let currentSpeed = 0.0;
let isAccelerating = false;
let isTurningLeft = false;
let isTurningRight = false;
// General
let waterCenter = new THREE.Vector3();
let boat;
let waterMaterial; // Will hold the ShaderMaterial or fallback
let riverModel;
let boundaryMesh; // For collision detection
let waterMesh; // Reference to the loaded water mesh
let sky; // Reference to the Sky object
let sun; // Vector3 representing sun direction for Sky and DirectionalLight
// Animation Refs
let leftUpperArmRef, rightUpperArmRef;
let leftOarRef, rightOarRef;
// Collision Detection
const raycaster = new THREE.Raycaster();
const boatForward = new THREE.Vector3(0, 0, -1); // Local forward
const rayCheckPoints = [
    new THREE.Vector3(0, 0, -1.5 * boatScale),  // Front center
    new THREE.Vector3(0.8 * boatScale, 0, -1.2 * boatScale), // Front right
    new THREE.Vector3(-0.8 * boatScale, 0, -1.2 * boatScale) // Front left
];
// GUI State
const guiState = {
    cameraMode: 'Overhead',
};
// <<< REMOVED effectController >>>
// FPS Lock
let timeAccumulator = 0;

// Define camera parameters (placeholders, real values set after load)
var cameraParams = {
    near: 0.1, far: 500000, // <<< Increased Far plane significantly for large sky >>>
    fov: 75, aspectRatio: window.innerWidth / window.innerHeight,
    atX: 0, atY: WATER_LEVEL_Y, atZ: 0, eyeX: 0, eyeY: 50, eyeZ: 50,
    upX: 0, upY: 1, upZ: 0
};

// --- Setup Camera Function ---
function setupCamera(cameraParameters) {
    var cp = cameraParameters;
    var cam = new THREE.PerspectiveCamera(cp.fov, cp.aspectRatio, cp.near, cp.far);
    cam.position.set(cp.eyeX, cp.eyeY, cp.eyeZ);
    cam.up.set(cp.upX, cp.upY, cp.upZ);
    return cam;
}

// Create the scene
const scene = new THREE.Scene();
// <<< SET Scene background color - fog will blend towards this >>>
scene.background = new THREE.Color( horizonColor );
// Add Fog to the scene (using updated constants)
scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);

// --- Create Cameras ---
const camera = setupCamera(cameraParams);
const thirdPersonCamera = setupCamera(cameraParams);
let currentCamera = camera;

// --- Create Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
// <<< REMOVED setClearColor, using scene.background instead >>>
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping; // Keep tone mapping
renderer.toneMappingExposure = skySettings.exposure; // <<< Use hardcoded initial exposure >>>
document.body.appendChild(renderer.domElement);

// --- Sky Setup ---
sky = new Sky();
sky.scale.setScalar( 450000 ); // Keep sky dome large
scene.add( sky );
sky.renderOrder = -1; // <<< Render sky early >>>

// Sun direction vector (will be updated by updateSkyAndSun)
sun = new THREE.Vector3();

// --- Axes Helper ---
// var ah = new THREE.AxesHelper(50 * terrainScale);
// scene.add(ah);

// --- Boat Geometry Function (BufferGeometry version) ---
// (Function remains the same)
function createRaftBufferGeometry() {
    const geom = new THREE.BufferGeometry();
    const bottomVecs = [ new THREE.Vector3(-1.5, 0, 1), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1.5, 0, 1), new THREE.Vector3(-2, 0, 0), new THREE.Vector3(0, -0.22, 0), new THREE.Vector3(2, 0, 0), new THREE.Vector3(-1.5, 0, -1), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1.5, 0, -1) ];
    const topVecs = bottomVecs.map(v => new THREE.Vector3(v.x, v.y + 0.23, v.z));
    const shrinkIndicesTop = [0, 2, 6, 8]; const shrinkIndicesBottom = [0, 2, 6, 8]; const shrinkFactor = 0.8;
    shrinkIndicesTop.forEach((topIndex, idx) => { const bottomIndex = shrinkIndicesBottom[idx]; topVecs[topIndex].x *= shrinkFactor; topVecs[topIndex].z *= shrinkFactor; bottomVecs[bottomIndex].x *= shrinkFactor; bottomVecs[bottomIndex].z *= shrinkFactor; });
    const allVecs = [...bottomVecs, ...topVecs]; const positions = new Float32Array(allVecs.length * 3);
    for (let i = 0; i < allVecs.length; i++) { positions[i * 3] = allVecs[i].x; positions[i * 3 + 1] = allVecs[i].y; positions[i * 3 + 2] = allVecs[i].z; }
    const sideIndices = []; const topBottomIndices = []; const connections = [ { start: 0, end: 2, step: 1 }, { start: 6, end: 8, step: 1 }, { start: 0, end: 6, step: 3 }, { start: 2, end: 8, step: 3 } ];
    connections.forEach(({ start, end, step }) => { for (let i = start; i < end; i += step) { const i_b = i; const next_i_b = i + step; const i_t = i + 9; const next_i_t = i + step + 9; sideIndices.push(i_b, next_i_b, next_i_t); sideIndices.push(i_b, next_i_t, i_t); } });
    for (let row = 0; row < 2; row++) { for (let col = 0; col < 2; col++) { const i = row * 3 + col; const i_b = i; const i_t = i + 9; topBottomIndices.push(i_b, i_b + 1, i_b + 4); topBottomIndices.push(i_b, i_b + 4, i_b + 3); topBottomIndices.push(i_t, i_t + 1, i_t + 4); topBottomIndices.push(i_t, i_t + 4, i_t + 3); } }
    const indices = new Uint16Array([...sideIndices, ...topBottomIndices]);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.addGroup(0, sideIndices.length, 0); geom.addGroup(sideIndices.length, topBottomIndices.length, 1);
    geom.computeVertexNormals();
    return geom;
}


// -----------------------------
// Add Boat Object
// -----------------------------
// (Boat creation code remains the same)
boat = new THREE.Object3D(); boat.name = "boat";
const raftSideMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, metalness: 0.2, roughness: 0.8, side: THREE.DoubleSide });
const raftTopMaterial = new THREE.MeshStandardMaterial({ color: 0xCD853F, metalness: 0.2, roughness: 0.7, side: THREE.DoubleSide });
const raftMaterials = [raftSideMaterial, raftTopMaterial];
const raftGeometry = createRaftBufferGeometry();
const raftMesh = new THREE.Mesh(raftGeometry, raftMaterials); raftMesh.name = "raftMesh";
raftMesh.rotation.y = Math.PI / 2;
boat.add(raftMesh);
const person = new THREE.Object3D(); person.name = "person";
const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x0000FF }); const headMaterial = new THREE.MeshPhongMaterial({ color: 0xFFC0CB });
const bodyGeom = new THREE.SphereGeometry(0.6, 16, 16); const body = new THREE.Mesh(bodyGeom, bodyMaterial); body.scale.set(1, 1.8, 1); body.position.y = 0.6 * 1.8 / 2; person.add(body);
const headGeom = new THREE.SphereGeometry(0.4, 16, 16); const head = new THREE.Mesh(headGeom, headMaterial); head.position.y = (0.6 * 1.8) + 0.4; person.add(head);
const armGeomUpper = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8); const armGeomLower = new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8);
leftUpperArmRef = new THREE.Object3D(); leftUpperArmRef.name = "leftUpperArm"; const leftUpperArmMesh = new THREE.Mesh(armGeomUpper, bodyMaterial); leftUpperArmMesh.position.y = -0.4; leftUpperArmRef.add(leftUpperArmMesh); const leftLowerArm = new THREE.Object3D(); leftLowerArm.name = "leftLowerArm"; const leftLowerArmMesh = new THREE.Mesh(armGeomLower, bodyMaterial); leftLowerArmMesh.position.y = -0.3; leftLowerArm.add(leftLowerArmMesh); leftLowerArm.position.set(0, -0.8, 0); leftUpperArmRef.add(leftLowerArm); leftUpperArmRef.position.set(0.7, 0.6 * 1.8 * 0.7, 0); leftUpperArmRef.rotation.z = -Math.PI / 6; leftUpperArmRef.rotation.x = baseArmAngle; person.add(leftUpperArmRef);
rightUpperArmRef = new THREE.Object3D(); rightUpperArmRef.name = "rightUpperArm"; const rightUpperArmMesh = new THREE.Mesh(armGeomUpper, bodyMaterial); rightUpperArmMesh.position.y = -0.4; rightUpperArmRef.add(rightUpperArmMesh); const rightLowerArm = new THREE.Object3D(); rightLowerArm.name = "rightLowerArm"; const rightLowerArmMesh = new THREE.Mesh(armGeomLower, bodyMaterial); rightLowerArmMesh.position.y = -0.3; rightLowerArm.add(rightLowerArmMesh); rightLowerArm.position.set(0, -0.8, 0); rightUpperArmRef.add(rightLowerArm); rightUpperArmRef.position.set(-0.7, 0.6 * 1.8 * 0.7, 0); rightUpperArmRef.rotation.z = Math.PI / 6; rightUpperArmRef.rotation.x = baseArmAngle; person.add(rightUpperArmRef);
const oarGeometry = new THREE.CylinderGeometry(0.08, 0.08, 3.0, 8);
const oarMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
const oarBladeGeometry = new THREE.BoxGeometry(0.15, 0.4, 0.8);
const oarBladeMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
const oarPivotBaseY = 0.6 * 1.8 * 0.7;
leftOarRef = new THREE.Object3D();
const leftOar = new THREE.Mesh(oarGeometry, oarMaterial); leftOar.position.y = -1.5; leftOarRef.add(leftOar);
const leftBlade = new THREE.Mesh(oarBladeGeometry, oarBladeMaterial); leftBlade.position.set(0, -1.5 - 1.5/2, 0.4); leftBlade.rotation.x = Math.PI / 2; leftOarRef.add(leftBlade);
leftOarRef.position.set(0.7, oarPivotBaseY + oarPivotYOffset, 0); leftOarRef.rotation.z = -Math.PI / 6; leftOarRef.rotation.x = baseArmAngle; person.add(leftOarRef);
rightOarRef = new THREE.Object3D();
const rightOar = new THREE.Mesh(oarGeometry, oarMaterial); rightOar.position.y = -1.5; rightOarRef.add(rightOar);
const rightBlade = new THREE.Mesh(oarBladeGeometry, oarBladeMaterial); rightBlade.position.set(0, -1.5 - 1.5/2, 0.4); rightBlade.rotation.x = Math.PI / 2; rightOarRef.add(rightBlade);
rightOarRef.position.set(-0.7, oarPivotBaseY + oarPivotYOffset, 0); rightOarRef.rotation.z = Math.PI / 6; rightOarRef.rotation.x = baseArmAngle; person.add(rightOarRef);
boat.add(person);
boat.scale.set(boatScale, boatScale, boatScale);
scene.add(boat);


// --- Water Plane Shader Definition ---
// (Shaders remain the same)
const waterVertexShader = `
  varying vec2 vUv;
  varying vec2 vUv2;
  attribute vec2 uv1;

  void main() {
    vUv = uv;
    vUv2 = uv1;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;
const waterUniforms = {
    time: { value: 0.0 },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    patternScale: { value: patternScaleFactor },
    timeScale: { value: waterTimeScaleFactor },
    uAlpha: { value: waterAlpha }
};

// --- Async Asset Loading ---
// (Loading logic remains the same)
async function loadShaderFile(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load shader: ${response.status} ${response.statusText} @ ${url}`);
    }
    return response.text();
}

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath( 'https://www.gstatic.com/draco/v1/decoders/' );
gltfLoader.setDRACOLoader( dracoLoader );

const fragmentShaderPromise = loadShaderFile('assets/water_fragment.glsl');
const terrainModelPromise = new Promise((resolve, reject) => {
    gltfLoader.load('assets/river.glb', resolve, undefined, reject);
});
const waterMeshModelPromise = new Promise((resolve, reject) => {
    gltfLoader.load('assets/water_mesh.glb', resolve, undefined, reject);
});
const boundaryModelPromise = new Promise((resolve, reject) => {
    gltfLoader.load('assets/boundary_mesh.glb', resolve, undefined, reject);
});


// Tree creation function (remains the same)
function createTree(scale = 1) {
    const tree = new THREE.Object3D();
    const trunkGeometry = new THREE.CylinderGeometry(0.2 * scale, 0.2 * scale, 1.5 * scale, 8);
    const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = (1.5 * scale) / 2;
    tree.add(trunk);
    const foliageMaterial = new THREE.MeshPhongMaterial({ color: 0x228B22 });
    const numLayers = 6;
    const baseRadius = 2 * scale;
    const baseHeight = 0.8 * scale;
    for (let i = 0; i < numLayers; i++) {
        const layerScale = 1 - (i / numLayers);
        const coneGeometry = new THREE.ConeGeometry(baseRadius * layerScale, baseHeight, 8);
        const cone = new THREE.Mesh(coneGeometry, foliageMaterial);
        cone.position.y = 1.2 * scale + (numLayers - i) * (baseHeight * 0.5);
        tree.add(cone);
    }
    return tree;
}


// -----------------------------
// Add Lights to the Scene
// -----------------------------
var ambLight = new THREE.AmbientLight(0xffffff, dayAmbientIntensity); // Soft ambient fill light
scene.add(ambLight);
// Directional light to simulate the sun (position/target updated by updateSkyAndSun)
var sunLight = new THREE.DirectionalLight(0xffffff, daySunIntensity);
sunLight.castShadow = true;
scene.add(sunLight);
scene.add(sunLight.target); // Add target to scene explicitly

// Configure shadow properties
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 50;
sunLight.shadow.camera.far = fogFar * 1.5; // Adjusted far plane based on fog
const shadowCamSize = Math.max(terrainScale * 50, 300);
sunLight.shadow.camera.left = -shadowCamSize;
sunLight.shadow.camera.right = shadowCamSize;
sunLight.shadow.camera.top = shadowCamSize;
sunLight.shadow.camera.bottom = -shadowCamSize;
sunLight.shadow.bias = -0.0005;

// Wait for ALL assets to load
Promise.all([
    fragmentShaderPromise,
    terrainModelPromise,
    waterMeshModelPromise,
    boundaryModelPromise
]).then(([
    fragmentShaderText,
    terrainGltf,
    waterMeshGltf,
    boundaryGltf
]) => {
    console.log("Assets loaded");

    // --- Create Water Material ---
    try {
        waterMaterial = new THREE.ShaderMaterial({
            vertexShader: waterVertexShader,
            fragmentShader: fragmentShaderText,
            uniforms: waterUniforms,
            side: THREE.DoubleSide,
            transparent: true,
            fog: false // Rely on scene fog
        });
        console.log("Custom ShaderMaterial created for water.");
    } catch (error) {
        console.error("Error creating ShaderMaterial:", error);
        // Fallback material setup...
        waterMaterial = new THREE.MeshBasicMaterial({
            color: 0x0000FF, side: THREE.DoubleSide, transparent: true,
            opacity: waterAlpha, fog: true
        });
    }

    // --- Process Terrain ---
    riverModel = terrainGltf.scene;
    riverModel.scale.set(terrainScale, terrainScale, terrainScale);
    const box = new THREE.Box3().setFromObject(riverModel);
    const size = box.getSize(new THREE.Vector3());
    box.getCenter(waterCenter);
    console.log(`Terrain center: ${waterCenter.x.toFixed(2)}, ${waterCenter.y.toFixed(2)}, ${waterCenter.z.toFixed(2)}`);
    scene.add(riverModel);

    // --- Process Water Mesh ---
    try {
        waterMeshGltf.scene.traverse((child) => {
            if (child.isMesh) {
                waterMesh = child;
                if (!waterMesh.geometry.attributes.uv1 && waterMesh.geometry.attributes.uv) {
                    waterMesh.geometry.setAttribute('uv1', waterMesh.geometry.attributes.uv.clone());
                } else if (!waterMesh.geometry.attributes.uv1) {
                    console.error("Water mesh missing 'uv'/'uv1'!");
                }
            }
        });
        if (!waterMesh) throw new Error("No mesh found in water_mesh.glb");
        waterMesh.material = waterMaterial;
        waterMesh.name = "water";
        waterMesh.scale.copy(riverModel.scale);
        waterMesh.position.set(waterCenter.x, WATER_LEVEL_Y, waterCenter.z);
        waterMesh.renderOrder = 1;
        scene.add(waterMesh);
        console.log("Loaded water mesh added.");
    } catch (error) {
        console.error("Error processing water_mesh.glb:", error);
        // Fallback plane setup...
        const fallbackWaterGeometry = new THREE.PlaneGeometry(size.x, size.z, 100, 100);
        fallbackWaterGeometry.setAttribute('uv1', fallbackWaterGeometry.attributes.uv.clone());
        const fallbackMaterial = waterMaterial.isShaderMaterial ? waterMaterial : new THREE.MeshBasicMaterial({
            color: 0x0000FF, side: THREE.DoubleSide, transparent: true,
            opacity: waterAlpha, fog: true
        });
        waterMesh = new THREE.Mesh(fallbackWaterGeometry, fallbackMaterial);
        waterMesh.rotation.x = -Math.PI / 2;
        waterMesh.position.set(waterCenter.x, WATER_LEVEL_Y, waterCenter.z);
        waterMesh.name = "water_fallback_plane";
        waterMesh.renderOrder = 1;
        scene.add(waterMesh);
    }

    // --- Process Boundary Mesh ---
    try {
        let boundaryModel = boundaryGltf.scene;
        boundaryModel.scale.copy(riverModel.scale);
        boundaryModel.position.set(waterCenter.x, waterCenter.y, waterCenter.z);
        boundaryModel.traverse((child) => {
            if (child.isMesh) {
                boundaryMesh = child;
                boundaryMesh.visible = false;
            }
        });
        if (!boundaryMesh) throw new Error("No mesh found in boundary_mesh.glb");
        scene.add(boundaryModel);
        console.log("Loaded boundary mesh added.");
    } catch (error) {
        console.error("Error processing boundary_mesh.glb:", error);
        boundaryMesh = null;
    }

    // --- Final Setup ---
    const startZ = waterCenter.z + size.z * 0.25;
    boat.position.set(waterCenter.x, WATER_LEVEL_Y + 0.1, startZ);
    console.log(`Boat initial position set.`);

    camera.position.copy(boat.position).add(chaseCameraOffset);
    camera.lookAt(boat.position);
    thirdPersonCamera.position.copy(boat.position).add(thirdPersonOffset);
    thirdPersonCamera.lookAt(boat.position);

    // --- Add Trees ---
    const numTrees = 100;
    const treeScale = terrainScale * 0.15;
    const minDistance = 10 * terrainScale;
    const placedTrees = [];
    function isTooClose(position, trees) { /* ... (same as before) ... */ return trees.some(tree => { const dx = tree.position.x - position.x; const dz = tree.position.z - position.z; return Math.sqrt(dx * dx + dz * dz) < minDistance; }); }
    for (let i = 0; i < numTrees; i++) { /* ... (tree placement logic same as before) ... */
        const tree = createTree(treeScale * (0.8 + Math.random() * 0.4));
        let position; let attempts = 0; const maxAttempts = 100;
        do { position = new THREE.Vector3( waterCenter.x + (Math.random() - 0.5) * size.x * 0.9, WATER_LEVEL_Y, waterCenter.z + (Math.random() - 0.5) * size.z * 0.9 ); attempts++; } while (attempts < maxAttempts && isTooClose(position, placedTrees));
        if (attempts < maxAttempts) {
            const raycaster = new THREE.Raycaster(); raycaster.set( new THREE.Vector3(position.x, position.y + 100, position.z), new THREE.Vector3(0, -1, 0) );
            const intersects = raycaster.intersectObject(riverModel, true);
            if (intersects.length > 0 && intersects[0].point.y > WATER_LEVEL_Y + 0.5) {
                tree.position.copy(intersects[0].point); tree.rotation.y = Math.random() * Math.PI * 2;
                tree.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; if (child.material) child.material.fog = true; } });
                scene.add(tree); placedTrees.push(tree);
            }
        }
    }

    // --- Apply Fog/Shadows to Models ---
    riverModel.traverse(child => { if (child.isMesh) { child.receiveShadow = true; if (child.material) child.material.fog = true; } });
    boat.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; if (child.material) { if (Array.isArray(child.material)) { child.material.forEach(mat => mat.fog = true); } else { child.material.fog = true; } } } });

    // <<< Call initial Sky/Sun update AFTER assets are loaded >>>
    updateSkyAndSun();

}).catch(error => {
    console.error("Failed to load one or more assets:", error);
    // Fallback water plane if critical error...
    if (!scene.getObjectByName("water") && !scene.getObjectByName("water_fallback_plane") && !scene.getObjectByName("water_load_error_fallback")) { const fallbackMaterial = new THREE.MeshBasicMaterial({ color: 0x0000FF, side: THREE.DoubleSide, transparent: true, opacity: waterAlpha, fog: true }); const fallbackGeo = new THREE.PlaneGeometry(200, 200); const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMaterial); fallbackMesh.rotation.x = -Math.PI / 2; fallbackMesh.position.y = WATER_LEVEL_Y; fallbackMesh.name = "water_load_error_fallback"; scene.add(fallbackMesh); console.log("Added fallback water plane due to critical loading error."); }
    if (boat && waterCenter.lengthSq() === 0) { boat.position.set(0, WATER_LEVEL_Y + 0.1, 50); }
    // <<< Call initial Sky/Sun update even on error to set default sky/sun >>>
    updateSkyAndSun();
});


// -----------------------------
// dat.GUI Interface
// -----------------------------
const gui = new dat.GUI();

// Camera Mode GUI
gui.add(guiState, 'cameraMode', ['Overhead', 'Third Person'])
    .name('Camera Mode')
    .onChange((value) => {
        currentCamera = (value === 'Third Person') ? thirdPersonCamera : camera;
        currentCamera.aspect = window.innerWidth / window.innerHeight;
        currentCamera.updateProjectionMatrix();
    });

// <<< REMOVED Sky Settings GUI Folder and controls >>>
// const skyFolder = gui.addFolder('Sky Settings');
// skyFolder.add( effectController, ... ).onChange( guiChanged );
// ... etc ...

// --- Initial Sky and Sun Update Function ---
// Renamed from guiChanged - now only sets initial/hardcoded values
function updateSkyAndSun() {
   if (!sky || !sunLight || !sunLight.target) return; // Don't run if essential elements aren't ready

   const uniforms = sky.material.uniforms;
   // <<< Use hardcoded values from skySettings object >>>
   uniforms[ 'turbidity' ].value = skySettings.turbidity;
   uniforms[ 'rayleigh' ].value = skySettings.rayleigh;
   uniforms[ 'mieCoefficient' ].value = skySettings.mieCoefficient;
   uniforms[ 'mieDirectionalG' ].value = skySettings.mieDirectionalG;

   // Recalculate sun direction vector using hardcoded elevation/azimuth
   const phi = THREE.MathUtils.degToRad( 90 - skySettings.elevation );
   const theta = THREE.MathUtils.degToRad( skySettings.azimuth );
   sun.setFromSphericalCoords( 1, phi, theta );
   uniforms[ 'sunPosition' ].value.copy( sun );

   // Update renderer exposure using hardcoded value
   renderer.toneMappingExposure = skySettings.exposure;

   // Update DirectionalLight to match Sky's sun
   // Ensure waterCenter is valid before using it for positioning
   if (waterCenter.lengthSq() > 0) {
      const lightDistance = 1500; // Keep light distant for parallel rays
      // Position light source *opposite* to sun direction vector relative to target
      sunLight.position.copy( waterCenter ).addScaledVector( sun, -lightDistance );
      // Target remains the center of the scene
      sunLight.target.position.copy( waterCenter );
      sunLight.target.position.y = WATER_LEVEL_Y; // Aim towards water level
      sunLight.target.updateMatrixWorld(); // Update target matrix
   } else {
       // Fallback positioning if waterCenter isn't ready (e.g., during initial load errors)
       sunLight.position.copy(sun).multiplyScalar(-1500); // Position based on origin
       sunLight.target.position.set(0,0,0);
       sunLight.target.updateMatrixWorld();
       console.warn("waterCenter not ready, using fallback sunLight positioning.");
   }
}


// --- Render Loop Variables ---
const clock = new THREE.Clock();
const boatWorldPosition = new THREE.Vector3();
const boatWorldQuaternion = new THREE.Quaternion();
const desiredCamPos = new THREE.Vector3();
const worldRayOrigin = new THREE.Vector3();
const worldRayDirection = new THREE.Vector3();
const collisionNormal = new THREE.Vector3();

/**
 * Render loop: Handles updates and rendering
 */
function render() {
    const deltaTime = Math.min(clock.getDelta(), 0.05);
    timeAccumulator += deltaTime;

    // Use fixed timestep loop
    while (timeAccumulator >= targetFrameDuration) {
        const effectiveDeltaTime = targetFrameDuration;
        timeAccumulator -= targetFrameDuration;

        const elapsedTime = clock.getElapsedTime();

        // --- Update Logic ---
        if (waterMaterial && waterMaterial.isShaderMaterial) {
            waterMaterial.uniforms.time.value = elapsedTime;
        }

        // Boat Physics Update (remains the same)
        if (boat && boundaryMesh) {
            if (isTurningLeft) { boat.rotateY(turnRate * effectiveDeltaTime); }
            if (isTurningRight) { boat.rotateY(-turnRate * effectiveDeltaTime); }
            if (isAccelerating) { currentSpeed += accelerationRate * effectiveDeltaTime; }
            else if (currentSpeed > 0) { currentSpeed -= decelerationRate * effectiveDeltaTime; }
            currentSpeed = Math.max(0, Math.min(currentSpeed, maxSpeed));
            let proposedDisplacementZ = -currentSpeed * effectiveDeltaTime;
            if (currentSpeed > 0.01 && boundaryMesh.geometry) {
                boat.getWorldQuaternion(boatWorldQuaternion);
                const worldBoatForward = boatForward.clone().applyQuaternion(boatWorldQuaternion).normalize();
                for (const point of rayCheckPoints) {
                    worldRayOrigin.copy(point).applyMatrix4(boat.matrixWorld);
                    worldRayDirection.copy(worldBoatForward);
                    raycaster.set(worldRayOrigin, worldRayDirection); raycaster.far = collisionCheckDistance;
                    const intersects = raycaster.intersectObject(boundaryMesh, false);
                    if (intersects.length > 0 && intersects[0].distance < Math.abs(proposedDisplacementZ) + 0.1) {
                        const intersect = intersects[0];
                        if (intersect.face && intersect.face.normal) {
                            collisionNormal.copy(intersect.face.normal).transformDirection(boundaryMesh.matrixWorld).normalize();
                            proposedDisplacementZ = 0; currentSpeed *= collisionDamping; boat.position.addScaledVector(collisionNormal, collisionNudge);
                            break;
                        }
                    }
                }
            }
            if (Math.abs(proposedDisplacementZ) > 0.0001) { boat.translateZ(proposedDisplacementZ); }
            boat.position.y = WATER_LEVEL_Y + 0.1;

            // Arm and Oar Animation (remains the same)
            if (leftUpperArmRef && rightUpperArmRef && leftOarRef && rightOarRef) {
                const animIntensity = Math.min(1, currentSpeed / (maxSpeed * 0.75));
                const time = elapsedTime * rowingSpeedFactor;
                const pullPhase = Math.sin(time); const dipPhase = Math.cos(time);
                const rowingAngle = (pullPhase * 0.5 + 0.5) * maxRowingAngle * animIntensity;
                const forwardAngle = dipPhase * (Math.PI / 8) * animIntensity;
                const bladeAngle = Math.sin(time + Math.PI/4) * 0.6 * animIntensity;
                const currentOarPivotY = oarPivotBaseY + oarPivotYOffset;
                leftUpperArmRef.rotation.x = baseArmAngle + rowingAngle; leftUpperArmRef.rotation.z = Math.PI / 6 - forwardAngle;
                leftOarRef.rotation.x = baseArmAngle + rowingAngle; leftOarRef.rotation.z = Math.PI / 6 - forwardAngle; leftOarRef.rotation.y = -bladeAngle;
                leftOarRef.position.y = currentOarPivotY + Math.max(0, -dipPhase * 0.2 * animIntensity);
                rightUpperArmRef.rotation.x = baseArmAngle + rowingAngle; rightUpperArmRef.rotation.z = -Math.PI / 6 + forwardAngle;
                rightOarRef.rotation.x = baseArmAngle + rowingAngle; rightOarRef.rotation.z = -Math.PI / 6 + forwardAngle; rightOarRef.rotation.y = bladeAngle;
                rightOarRef.position.y = currentOarPivotY + Math.max(0, -dipPhase * 0.2 * animIntensity);
            }
        } // End boat physics update

        // Camera Updates (remains the same)
        if (currentCamera === camera && boat) {
            boat.getWorldPosition(boatWorldPosition);
            desiredCamPos.set( boatWorldPosition.x + chaseCameraOffset.x, Math.max(WATER_LEVEL_Y + 10, boatWorldPosition.y + chaseCameraOffset.y), boatWorldPosition.z + chaseCameraOffset.z );
            const lookAtTarget = new THREE.Vector3( boatWorldPosition.x, Math.max(WATER_LEVEL_Y - 5, boatWorldPosition.y - 5), boatWorldPosition.z );
            camera.position.lerp(desiredCamPos, cameraLerpFactor); camera.lookAt(lookAtTarget);
        }
        if (currentCamera === thirdPersonCamera && boat) {
            boat.getWorldPosition(boatWorldPosition); boat.getWorldQuaternion(boatWorldQuaternion);
            desiredCamPos.copy(thirdPersonOffset).applyQuaternion(boatWorldQuaternion).add(boatWorldPosition);
            desiredCamPos.y = Math.max(WATER_LEVEL_Y + 2, desiredCamPos.y);
            const lookAtTargetOffset = new THREE.Vector3(0, -1, -10);
            const lookAtTarget = lookAtTargetOffset.applyQuaternion(boatWorldQuaternion).add(boatWorldPosition);
            lookAtTarget.y = Math.max(WATER_LEVEL_Y - 2, lookAtTarget.y);
            thirdPersonCamera.position.lerp(desiredCamPos, cameraLerpFactor); thirdPersonCamera.lookAt(lookAtTarget);
        }

    } // End fixed timestep loop

    // Render Scene
    renderer.render(scene, currentCamera);
}

// Start render loop
renderer.setAnimationLoop(render);

// --- Keyboard Event Listeners ---
// (Listeners remain the same)
document.addEventListener("keydown", (event) => { if (event.target.tagName === 'INPUT') return; const key = event.key.toLowerCase(); switch (key) { case 'w': case 'arrowup': isAccelerating = true; break; case 'a': case 'arrowleft': isTurningLeft = true; isTurningRight = false; break; case 'd': case 'arrowright': isTurningRight = true; isTurningLeft = false; break; default: break; } });
document.addEventListener("keyup", (event) => { if (event.target.tagName === 'INPUT') return; const key = event.key.toLowerCase(); switch (key) { case 'w': case 'arrowup': isAccelerating = false; break; case 'a': case 'arrowleft': isTurningLeft = false; break; case 'd': case 'arrowright': isTurningRight = false; break; } });


// --- Window Resize Handler ---
// (Handler remains the same)
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect; camera.updateProjectionMatrix();
    thirdPersonCamera.aspect = aspect; thirdPersonCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (waterMaterial && waterMaterial.isShaderMaterial && waterMaterial.uniforms.resolution) {
        waterMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }
}