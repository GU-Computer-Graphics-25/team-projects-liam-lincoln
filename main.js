// Import Three.js core
import * as THREE from 'three';
// GLTF/DRACO Loaders are still needed for models
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
// Import dat.GUI
import * as dat from 'dat.gui';

// --- Configuration ---
const terrainScale = 10;
const WATER_LEVEL_Y = -17.0;
const patternScaleFactor = 1.0; // Initial pattern scale (can be adjusted via GUI)
const waterTimeScaleFactor = 1.0; // Default time scale (1.0 = normal speed)
const waterAlpha = 0.85; // <<< Set desired base water transparency (0.0 to 1.0) >>>
// const waterColor = 0x336699; // No longer needed for ShaderMaterial
// Camera
const chaseCameraOffset = new THREE.Vector3(0, 45, 15);
const cameraLerpFactor = 0.08;
const overheadCameraHeight = 600;
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
// Lighting
const dayAmbientIntensity = 0.6;
const daySunIntensity = 1.0;
const nightAmbientIntensity = 0.15;
const nightSunIntensity = 0.2;
// FPS Lock
const targetFrameRate = 30;
const targetFrameDuration = 1 / targetFrameRate; // Seconds

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
    axesHelper: true,
    cameraMode: 'Chase',
    lightingMode: 'Day',
    timeScale: waterTimeScaleFactor,
    patternScale: patternScaleFactor,
    waterAlpha: waterAlpha // <<< Keep alpha in GUI state >>>
};
// FPS Lock
let timeAccumulator = 0;

// Define camera parameters (placeholders, real values set after load)
var cameraParams = {
    near: 0.1, far: 3000, fov: 75, aspectRatio: window.innerWidth / window.innerHeight,
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

// --- Create Cameras ---
const camera = setupCamera(cameraParams); // Main chase camera
const overheadCamera = setupCamera(cameraParams); // Overhead camera instance
const thirdPersonCamera = setupCamera(cameraParams); // Third-person camera instance
let currentCamera = camera; // Start with the CHASE camera active

// --- Create Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x87CEEB, 1); // Day default
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// --- Axes Helper ---
var ah = new THREE.AxesHelper(50 * terrainScale);
scene.add(ah);

// --- Boat Geometry Function (BufferGeometry version) ---
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

// Create oars
const oarGeometry = new THREE.CylinderGeometry(0.08, 0.08, 3.0, 8);
const oarMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
const oarBladeGeometry = new THREE.BoxGeometry(0.15, 0.4, 0.8);
const oarBladeMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });

// Left oar
leftOarRef = new THREE.Object3D();
const leftOar = new THREE.Mesh(oarGeometry, oarMaterial);
leftOar.position.y = -1.5;
leftOarRef.add(leftOar);
const leftBlade = new THREE.Mesh(oarBladeGeometry, oarBladeMaterial);
leftBlade.position.set(0, -1.5, 0);
leftBlade.rotation.x = Math.PI / 2;
leftOarRef.add(leftBlade);
// Position oar at hand level
leftOarRef.position.set(0.7, 0.6 * 1.8 * 0.7 - 0.8, 0); // Moved down to hand level
leftOarRef.rotation.z = -Math.PI / 6;
leftOarRef.rotation.x = baseArmAngle;
person.add(leftOarRef);

// Right oar
rightOarRef = new THREE.Object3D();
const rightOar = new THREE.Mesh(oarGeometry, oarMaterial);
rightOar.position.y = -1.5;
rightOarRef.add(rightOar);
const rightBlade = new THREE.Mesh(oarBladeGeometry, oarBladeMaterial);
rightBlade.position.set(0, -1.5, 0);
rightBlade.rotation.x = Math.PI / 2;
rightOarRef.add(rightBlade);
// Position oar at hand level
rightOarRef.position.set(-0.7, 0.6 * 1.8 * 0.7 - 0.8, 0); // Moved down to hand level
rightOarRef.rotation.z = Math.PI / 6;
rightOarRef.rotation.x = baseArmAngle;
person.add(rightOarRef);

boat.add(person);
boat.add(leftOarRef);
boat.add(rightOarRef);
boat.scale.set(boatScale, boatScale, boatScale);
scene.add(boat);

// --- Water Plane Shader Definition ---
// <<< Vertex shader code using 'uv1' >>>
const waterVertexShader = `
  varying vec2 vUv;  // Original UV Map (from 'uv' attribute)
  varying vec2 vUv2; // Still passing as vUv2, but reading from 'uv1' attribute
  attribute vec2 uv1; // Expect 'uv1' attribute from BufferGeometry

  void main() {
    vUv = uv;
    vUv2 = uv1; // Pass uv1 as vUv2
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;
// <<< Uniforms for the ShaderMaterial >>>
const waterUniforms = {
    time: { value: 0.0 },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    patternScale: { value: guiState.patternScale },
    timeScale: { value: guiState.timeScale },
    uAlpha: { value: guiState.waterAlpha } // <<< Add alpha uniform >>>
};

// --- Async Asset Loading ---
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

// <<< Load the fragment shader >>>
const fragmentShaderPromise = loadShaderFile('assets/water_fragment.glsl'); // Make sure path is correct
const terrainModelPromise = new Promise((resolve, reject) => {
    gltfLoader.load('assets/river.glb', resolve, undefined, reject);
});
const waterMeshModelPromise = new Promise((resolve, reject) => {
    gltfLoader.load('assets/water_mesh.glb', resolve, undefined, reject);
});
const boundaryModelPromise = new Promise((resolve, reject) => {
    gltfLoader.load('assets/boundary_mesh.glb', resolve, undefined, reject);
});

// Tree creation function
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

// Wait for ALL assets to load
Promise.all([
    fragmentShaderPromise, // <<< Load fragment shader text >>>
    terrainModelPromise,
    waterMeshModelPromise,
    boundaryModelPromise
]).then(([
    fragmentShaderText, // <<< Get fragment shader text >>>
    terrainGltf,
    waterMeshGltf,
    boundaryGltf
]) => {
    console.log("Assets loaded (Fragment Shader, Terrain, Water Mesh, Boundary)");

    // --- Create Water Material using ShaderMaterial --- <<< REVERTED
    try {
        waterMaterial = new THREE.ShaderMaterial({
            vertexShader: waterVertexShader,    // Use our vertex shader
            fragmentShader: fragmentShaderText, // Use loaded fragment shader
            uniforms: waterUniforms,            // Use defined uniforms
            side: THREE.DoubleSide,
            transparent: true                   // <<< ENABLE TRANSPARENCY >>>
        });
        console.log("Custom ShaderMaterial created for water (Transparent).");

    } catch (error) {
        console.error("Error creating ShaderMaterial:", error);
        console.log("Falling back to basic water material.");
        waterMaterial = new THREE.MeshBasicMaterial({ // Fallback is Basic
            color: 0x0000FF,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: guiState.waterAlpha // Use opacity here too
        });
    }

    // --- Process Loaded Terrain Model ---
    riverModel = terrainGltf.scene;
    riverModel.scale.set(terrainScale, terrainScale, terrainScale);
    const box = new THREE.Box3().setFromObject(riverModel);
    const size = box.getSize(new THREE.Vector3());
    box.getCenter(waterCenter);
    console.log(`Terrain dimensions (scaled): X=${size.x.toFixed(2)}, Y=${size.y.toFixed(2)}, Z=${size.z.toFixed(2)}`);
    console.log(`Terrain center: X=${waterCenter.x.toFixed(2)}, Y=${waterCenter.y.toFixed(2)}, Z=${waterCenter.z.toFixed(2)}`);
    console.log(`Using fixed Water Level Y: ${WATER_LEVEL_Y}`);
    scene.add(riverModel);

    // --- Process and Add Water Mesh ---
    try {
        waterMeshGltf.scene.traverse((child) => {
            if (child.isMesh) {
                waterMesh = child;
                // Check for uv1 (needed by vertex shader)
                if (!waterMesh.geometry.attributes.uv1 && waterMesh.geometry.attributes.uv) {
                   console.warn("Water mesh geometry missing 'uv1', duplicating 'uv'.");
                   waterMesh.geometry.setAttribute('uv1', waterMesh.geometry.attributes.uv.clone());
                } else if (!waterMesh.geometry.attributes.uv1) {
                    console.error("Water mesh geometry missing 'uv' and 'uv1' attributes!");
                }
                console.log("Water Mesh Attributes:", waterMesh.geometry.attributes);
            }
        });
        if (!waterMesh) throw new Error("No mesh found in water_mesh.glb");

        waterMesh.material = waterMaterial; // Apply the ShaderMaterial
        waterMesh.name = "water";
        waterMesh.scale.copy(riverModel.scale);
        waterMesh.position.set(waterCenter.x, WATER_LEVEL_Y, waterCenter.z);
        // waterMesh.renderOrder = 1; // Optional: Adjust render order for transparency
        scene.add(waterMesh);
        console.log("Loaded water mesh added to scene.");

    } catch(error) {
        console.error("Error processing water_mesh.glb:", error);
        console.log("Falling back to PlaneGeometry for water.");
        const fallbackWaterGeometry = new THREE.PlaneGeometry(size.x, size.z, 100, 100);
        // Generate uv1 for the fallback plane (duplicating uv)
        fallbackWaterGeometry.setAttribute('uv1', fallbackWaterGeometry.attributes.uv.clone());
        const fallbackMaterial = waterMaterial.isShaderMaterial ? waterMaterial : new THREE.MeshBasicMaterial({ // Use Basic fallback
            color: 0x0000FF,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: guiState.waterAlpha
         });
        waterMesh = new THREE.Mesh(fallbackWaterGeometry, fallbackMaterial);
        waterMesh.rotation.x = -Math.PI / 2;
        waterMesh.position.set(waterCenter.x, WATER_LEVEL_Y, waterCenter.z);
        waterMesh.name = "water_fallback_plane";
        // fallbackMesh.renderOrder = 1; // Also set renderOrder for fallback if using
        scene.add(waterMesh);
    }

    // --- Process and Add Boundary Mesh ---
    try {
        let boundaryModel = boundaryGltf.scene;
        boundaryModel.scale.copy(riverModel.scale);
        boundaryModel.position.set(waterCenter.x, waterCenter.y, waterCenter.z);

        boundaryModel.traverse((child) => {
            if (child.isMesh) {
                boundaryMesh = child;
                boundaryMesh.visible = false; // <<< Hide the boundary mesh
            }
        });
        if (!boundaryMesh) throw new Error("No mesh found in boundary_mesh.glb");

        scene.add(boundaryModel);
        console.log("Loaded boundary mesh added for collision (hidden).");

    } catch (error) {
        console.error("Error processing boundary_mesh.glb:", error);
        boundaryMesh = null;
    }

    // --- Final Setup ---
    // Set Initial Boat Position
    const startZ = waterCenter.z + size.z * 0.25;
    boat.position.set(waterCenter.x, WATER_LEVEL_Y, startZ);
    console.log(`Boat initial position set to: ${boat.position.x.toFixed(2)}, ${boat.position.y.toFixed(2)}, ${boat.position.z.toFixed(2)}`);

    // Set Initial Camera State
    camera.position.copy(boat.position).add(chaseCameraOffset);
    camera.lookAt(boat.position);

    // Setup Overhead Camera
    overheadCamera.position.set(waterCenter.x, overheadCameraHeight, waterCenter.z);
    overheadCamera.lookAt(waterCenter.x, WATER_LEVEL_Y, waterCenter.z);
    overheadCamera.updateProjectionMatrix();

    // Setup Third Person Camera initial position
    thirdPersonCamera.position.copy(boat.position).add(thirdPersonOffset);
    thirdPersonCamera.lookAt(boat.position);

    // Update light positions/targets
    sunLight.position.set(waterCenter.x + size.x * 0.5, size.y > 0 ? size.y * 2 : 100, waterCenter.z - size.z * 0.3);
    sunLight.target.position.copy(waterCenter);
    sunLight.target.position.y = WATER_LEVEL_Y;
    if (!sunLight.target.parent) scene.add(sunLight.target);

    // After terrain is loaded and water center is calculated, add trees
    const numTrees = 100;
    const treeScale = terrainScale * 0.15;
    const minDistance = 10 * terrainScale;
    const placedTrees = [];

    function isTooClose(position, trees) {
        return trees.some(tree => {
            const dx = tree.position.x - position.x;
            const dz = tree.position.z - position.z;
            return Math.sqrt(dx * dx + dz * dz) < minDistance;
        });
    }

    for (let i = 0; i < numTrees; i++) {
        const tree = createTree(treeScale * (0.8 + Math.random() * 0.4));
        let position;
        let attempts = 0;
        const maxAttempts = 100;

        do {
            position = new THREE.Vector3(
                waterCenter.x + (Math.random() - 0.5) * size.x * 0.9,
                WATER_LEVEL_Y,
                waterCenter.z + (Math.random() - 0.5) * size.z * 0.9
            );
            attempts++;
        } while (attempts < maxAttempts && isTooClose(position, placedTrees));

        if (attempts < maxAttempts) {
            const raycaster = new THREE.Raycaster();
            raycaster.set(
                new THREE.Vector3(position.x, position.y + 100, position.z),
                new THREE.Vector3(0, -1, 0)
            );
            const intersects = raycaster.intersectObject(riverModel, true);

            if (intersects.length > 0 && intersects[0].point.y > WATER_LEVEL_Y + 0.5) {
                tree.position.copy(intersects[0].point);
                tree.rotation.y = Math.random() * Math.PI * 2;
                scene.add(tree);
                placedTrees.push(tree);
            }
        }
    }

}).catch(error => {
    console.error("Failed to load one or more assets:", error);
    if (!scene.getObjectByName("water") && !scene.getObjectByName("water_fallback_plane") && !scene.getObjectByName("water_load_error_fallback")) {
         const fallbackMaterial = new THREE.MeshBasicMaterial({ // Use Basic fallback
            color: 0x0000FF,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: guiState.waterAlpha // Use opacity here too
         });
         const fallbackGeo = new THREE.PlaneGeometry(200, 200);
         const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMaterial);
         fallbackMesh.rotation.x = -Math.PI / 2;
         fallbackMesh.position.y = WATER_LEVEL_Y;
         fallbackMesh.name = "water_load_error_fallback";
         scene.add(fallbackMesh);
         console.log("Added fallback water plane due to critical loading error.");
    }
    if (boat && waterCenter.lengthSq() === 0) {
         boat.position.set(0, WATER_LEVEL_Y, 50);
    }
});

// -----------------------------
// Add Lights to the Scene (Initial setup)
// -----------------------------
var ambLight = new THREE.AmbientLight(0xffffff, dayAmbientIntensity);
scene.add(ambLight);
var sunLight = new THREE.DirectionalLight(0xffffff, daySunIntensity);
sunLight.castShadow = true; // Enable shadows for sunlight
scene.add(sunLight);

// Configure shadow properties (optional, adjust for performance/quality)
sunLight.shadow.mapSize.width = 1024;
sunLight.shadow.mapSize.height = 1024;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 1500; // Adjust based on scene size

// -----------------------------
// dat.GUI Interface
// -----------------------------
const gui = new dat.GUI();

gui.add(guiState, 'cameraMode', ['Chase', 'Overhead', 'Third Person']) // Added Third Person
    .name('Camera Mode')
    .onChange((value) => {
        currentCamera = (value === 'Overhead') ? overheadCamera :
                       (value === 'Third Person') ? thirdPersonCamera : camera;
        currentCamera.aspect = window.innerWidth / window.innerHeight;
        currentCamera.updateProjectionMatrix();
    });

gui.add(guiState, 'lightingMode', ['Day', 'Night'])
    .name('Time of Day')
    .onChange((value) => {
        if (value === 'Night') {
            ambLight.intensity = nightAmbientIntensity;
            sunLight.intensity = nightSunIntensity;
            renderer.setClearColor(0x000020, 1);
        } else { // Day
            ambLight.intensity = dayAmbientIntensity;
            sunLight.intensity = daySunIntensity;
            renderer.setClearColor(0x87CEEB, 1);
        }
    });

gui.add(guiState, 'timeScale', 0.0, 5.0, 0.05) // <<< Keep GUI for shader uniform >>>
   .name('Water Anim Speed') // Renamed for clarity
   .onChange((value) => {
       if (waterMaterial && waterMaterial.isShaderMaterial) { // Check if shader material
           waterMaterial.uniforms.timeScale.value = value;
       }
   });

gui.add(guiState, 'patternScale', 0.1, 10.0, 0.1) // <<< Keep GUI for shader uniform >>>
   .name('Water Pattern Scale')
   .onChange((value) => {
       if (waterMaterial && waterMaterial.isShaderMaterial) { // Check if shader material
           waterMaterial.uniforms.patternScale.value = value;
       }
   });

gui.add(guiState, 'waterAlpha', 0.0, 1.0, 0.01) // <<< Keep GUI for alpha uniform >>>
   .name('Water Opacity')
   .onChange((value) => {
       if (waterMaterial && waterMaterial.isShaderMaterial) {
           waterMaterial.uniforms.uAlpha.value = value;
       } else if (waterMaterial) { // Handle fallback material
           waterMaterial.opacity = value;
       }
   });


gui.add(guiState, 'axesHelper').name('Show Axes').onChange((v) => ah.visible = v);

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
        // <<< Update uniforms for the ShaderMaterial >>>
        if (waterMaterial && waterMaterial.isShaderMaterial) {
            waterMaterial.uniforms.time.value = elapsedTime;
            waterMaterial.uniforms.timeScale.value = guiState.timeScale;
            waterMaterial.uniforms.patternScale.value = guiState.patternScale;
            waterMaterial.uniforms.uAlpha.value = guiState.waterAlpha; // Update alpha uniform
        }

        // Boat Physics Update
        if (boat && boundaryMesh) {
            // Apply rotation first
            if (isTurningLeft) { boat.rotateY(turnRate * effectiveDeltaTime); }
            if (isTurningRight) { boat.rotateY(-turnRate * effectiveDeltaTime); }

            // Update speed based on input
            if (isAccelerating) { currentSpeed += accelerationRate * effectiveDeltaTime; }
            else if (currentSpeed > 0) { currentSpeed -= decelerationRate * effectiveDeltaTime; }
            currentSpeed = Math.max(0, Math.min(currentSpeed, maxSpeed));

            // --- Collision Detection & Response ---
            let proposedDisplacementZ = -currentSpeed * effectiveDeltaTime; // Proposed local Z displacement

            if (currentSpeed > 0.01 && boundaryMesh.geometry) {
                 boat.getWorldQuaternion(boatWorldQuaternion);
                 const worldBoatForward = boatForward.clone().applyQuaternion(boatWorldQuaternion).normalize();

                for (const point of rayCheckPoints) {
                    worldRayOrigin.copy(point).applyMatrix4(boat.matrixWorld);
                    worldRayDirection.copy(worldBoatForward);
                    raycaster.set(worldRayOrigin, worldRayDirection);
                    raycaster.far = collisionCheckDistance;

                    const intersects = raycaster.intersectObject(boundaryMesh, false);

                    if (intersects.length > 0 && intersects[0].distance < Math.abs(proposedDisplacementZ)) {
                        const intersect = intersects[0];
                        collisionNormal.copy(intersect.face.normal).transformDirection(boundaryMesh.matrixWorld).normalize();

                        // Prevent Penetration
                        proposedDisplacementZ = 0;

                        // Damp Speed
                        currentSpeed *= collisionDamping;

                        // Nudge away from wall
                        boat.position.addScaledVector(collisionNormal, collisionNudge);

                        break; // One collision is enough
                    }
                }
            }

            // Apply final (potentially zeroed) displacement
            if (Math.abs(proposedDisplacementZ) > 0.0001) {
                 boat.translateZ(proposedDisplacementZ);
            }

            // --- Arm and Oar Animation ---
            if (leftUpperArmRef && rightUpperArmRef && leftOarRef && rightOarRef) {
                const animIntensity = Math.min(1, currentSpeed / (maxSpeed * 0.75));
                const time = elapsedTime * rowingSpeedFactor;

                // Create a more natural rowing motion with proper pull and dip
                const pullPhase = Math.sin(time);
                const dipPhase = Math.sin(time + Math.PI/2);

                // Calculate angles based on phases
                const rowingAngle = (pullPhase * 0.5 + 0.5) * maxRowingAngle * animIntensity;
                const forwardAngle = dipPhase * (Math.PI / 4) * animIntensity;
                const bladeAngle = Math.abs(dipPhase) * 0.5 * animIntensity;

                // Left arm and oar
                leftUpperArmRef.rotation.x = baseArmAngle + rowingAngle;
                leftUpperArmRef.rotation.z = Math.PI / 6 - forwardAngle;
                // Oar follows arm with additional blade rotation
                leftOarRef.rotation.x = baseArmAngle + rowingAngle;
                leftOarRef.rotation.z = Math.PI / 6 - forwardAngle;
                leftOarRef.rotation.y = -bladeAngle;
                // Adjust oar position to follow hand
                leftOarRef.position.y = 0.6 * 1.8 * 0.7 - 0.8 + Math.sin(time) * 0.1 * animIntensity;

                // Right arm and oar
                rightUpperArmRef.rotation.x = baseArmAngle + rowingAngle;
                rightUpperArmRef.rotation.z = -Math.PI / 6 + forwardAngle;
                // Oar follows arm with additional blade rotation
                rightOarRef.rotation.x = baseArmAngle + rowingAngle;
                rightOarRef.rotation.z = -Math.PI / 6 + forwardAngle;
                rightOarRef.rotation.y = bladeAngle;
                // Adjust oar position to follow hand
                rightOarRef.position.y = 0.6 * 1.8 * 0.7 - 0.8 + Math.sin(time) * 0.1 * animIntensity;
            }
        } // End boat physics update

        // Update Chase Camera
        if (currentCamera === camera && boat) {
            boat.getWorldPosition(boatWorldPosition);

            // Calculate camera position relative to boat without rotation
            desiredCamPos.set(
                boatWorldPosition.x + chaseCameraOffset.x,
                boatWorldPosition.y + chaseCameraOffset.y,
                boatWorldPosition.z + chaseCameraOffset.z
            );

            // Calculate look-at target without rotation
            const lookAtTarget = new THREE.Vector3(
                boatWorldPosition.x,
                Math.max(WATER_LEVEL_Y - 2, boatWorldPosition.y - 2),
                boatWorldPosition.z
            );

            const lerpSpeed = cameraLerpFactor;
            camera.position.lerp(desiredCamPos, lerpSpeed);
            camera.lookAt(lookAtTarget);
        }

        // Update Third-person Camera
        if (currentCamera === thirdPersonCamera && boat) {
            boat.getWorldPosition(boatWorldPosition);
            boat.getWorldQuaternion(boatWorldQuaternion);

            // Calculate camera position relative to boat with rotation
            desiredCamPos.copy(thirdPersonOffset).applyQuaternion(boatWorldQuaternion).add(boatWorldPosition);

            // Calculate look-at target slightly ahead of the boat
            const lookAtTarget = new THREE.Vector3(0, 0, -10).applyQuaternion(boatWorldQuaternion).add(boatWorldPosition);

            const lerpSpeed = cameraLerpFactor;
            thirdPersonCamera.position.lerp(desiredCamPos, lerpSpeed);
            thirdPersonCamera.lookAt(lookAtTarget);
        }

    } // End fixed timestep loop

    // Render Scene
    renderer.render(scene, currentCamera);
}

// <<< MOVED setAnimationLoop call AFTER clock is defined and render is defined >>>
renderer.setAnimationLoop(render);


// --- Keyboard Event Listeners ---
document.addEventListener("keydown", (event) => {
    if (event.target.tagName === 'INPUT') return;
    const key = event.key.toLowerCase();
    switch (key) {
        case 'w': case 'arrowup': isAccelerating = true; break;
        case 'a': case 'arrowleft': isTurningLeft = true; isTurningRight = false; break;
        case 'd': case 'arrowright': isTurningRight = true; isTurningLeft = false; break;
        case "q":
             ah.visible = !ah.visible;
             guiState.axesHelper = ah.visible;
             gui.__controllers.forEach(c => { if (c.property === 'axesHelper') c.updateDisplay(); });
             break;
        default: break;
    }
});
document.addEventListener("keyup", (event) => {
    if (event.target.tagName === 'INPUT') return;
    const key = event.key.toLowerCase();
    switch (key) {
        case 'w': case 'arrowup': isAccelerating = false; break;
        case 'a': case 'arrowleft': isTurningLeft = false; break;
        case 'd': case 'arrowright': isTurningRight = false; break;
    }
});

// --- Window Resize Handler ---
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    // Update cawaaaameras
    camera.aspect = aspect; camera.updateProjectionMatrix();
    overheadCamera.aspect = aspect; overheadCamera.updateProjectionMatrix();
    thirdPersonCamera.aspect = aspect; thirdPersonCamera.updateProjectionMatrix(); // Added third person
    // Update renderer
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Update water shader resolution uniform if material exists and is ShaderMaterial
    if (waterMaterial && waterMaterial.isShaderMaterial && waterMaterial.uniforms.resolution) {
        waterMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }
}
