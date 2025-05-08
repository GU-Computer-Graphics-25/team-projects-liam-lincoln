import * as THREE from 'three';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as dat from 'dat.gui';

import { Sky } from 'three/addons/objects/Sky.js';



// --- Configuration ---
const terrainScale = 10;
const WATER_LEVEL_Y = -17.0; // <<< Using level from Sky/Current version >>>
const patternScaleFactor = 1.0; // Initial pattern scale
const waterTimeScaleFactor = 1.2; // <<< SET FIXED WATER ANIMATION SPEED >>>
const waterAlpha = 0.85; // <<< Set desired base water transparency (0.0 to 1.0) >>>
// Camera
const chaseCameraOffset = new THREE.Vector3(0, 45, 15); // Still used for the 'Overhead' view logic
const cameraLerpFactor = 0.08;
const thirdPersonOffset = new THREE.Vector3(0, 15, 30); // Third-person camera offset
// Boat Physics
const boatScale = 2.0; // <<< REVERTED Boat scale back to original size >>>
const maxSpeed = 15.0 * terrainScale / 10;
const accelerationRate = 10.0 * terrainScale / 10;
const decelerationRate = 8.0 * terrainScale / 10;
const turnRate = 1.0 * Math.PI / 180 * 60; // Radians per second
// Collision
const collisionCheckDistance = 5.0 * boatScale; // How far ahead to check for collision (scales with boat)
const collisionDamping = 0.2; // Factor to reduce speed on collision (e.g., 0.2 = 80% reduction)
const collisionNudge = 0.01; // Tiny push away from wall to prevent sticking
// Animation
const rowingSpeedFactor = 8;
const maxRowingAngle = Math.PI / 3; // Increased angle for more dramatic motion
const baseArmAngle = Math.PI / 4;
// Lighting (Adjusted for Sky)
const dayAmbientIntensity = 1.2; // <<< Base ambient light, sky provides main lighting (Slightly Increased) >>>
const daySunIntensity = 10;    // <<< Intensity for the DirectionalLight matching the Sky's sun (Slightly Increased) >>>
// Fog
const fogColor = 0xacdbfc; // Low saturation bright blue (Fog blends *towards* this color) (from Sky snippet)
const fogNear = 0 * terrainScale;
const fogFar = 120 * terrainScale; // <<< INCREASED Fog Far Distance >>>
// FPS Lock
const targetFrameRate = 30;
const targetFrameDuration = 1 / targetFrameRate; // Seconds
// Horizon/Background Color (Matches Fog) <<< ADDED from Sky snippet >>>
const horizonColor = fogColor; // Used for scene background
// <<< Hardcoded Sky Values from Sky snippet >>>
const skySettings = {
   turbidity: 0.1,
   rayleigh: 0.15,
   mieCoefficient: 0.1,
   mieDirectionalG: 0.953,
   elevation: 80, // degrees (Adjusted slightly as requested, still high)
   azimuth: 0, // degrees
   exposure: 1.0 // Initial exposure
};

// Add texture loader
const textureLoader = new THREE.TextureLoader();
const woodTexture = textureLoader.load('assets/woodwall.jpg', 
    // Success callback
    (texture) => {
        console.log('Wood texture loaded successfully');
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        // Update materials if they exist
        if (raftSideMaterial) {
            raftSideMaterial.map = texture;
            raftSideMaterial.needsUpdate = true;
        } 
        if (raftTopMaterial) {
            raftTopMaterial.map = texture;
            raftTopMaterial.needsUpdate = true;
        }
    },
    // Progress callback
    undefined,
    // Error callback
    (error) => {
        console.error('Error loading wood texture:', error);
    }
);

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
let sky; // <<< ADDED Reference to the Sky object >>>
let sun; // <<< ADDED Vector3 representing sun direction for Sky and DirectionalLight >>>
// Animation Refs
let leftUpperArmRef, rightUpperArmRef;
let leftOarRef, rightOarRef;
// Collision Detection
const raycaster = new THREE.Raycaster();
const boatForward = new THREE.Vector3(0, 0, -1); // Local forward
const rayCheckPoints = [
     new THREE.Vector3(0, 0, -1.5 * boatScale),  // Front center (scaled with boat)
     new THREE.Vector3(0.8 * boatScale, 0, -1.2 * boatScale), // Front right (scaled with boat)
     new THREE.Vector3(-0.8 * boatScale, 0, -1.2 * boatScale) // Front left (scaled with boat)
];
// GUI State
const guiState = {
    cameraMode: 'Overhead', // Only camera mode control remains
};
// FPS Lock
let timeAccumulator = 0;

// Define camera parameters (placeholders, real values set after load)
var cameraParams = {
    near: 0.1, far: 500000, // <<< Increased Far plane significantly for large sky (from Sky snippet) >>>
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
// <<< SET Scene background color - fog will blend towards this (from Sky snippet) >>>
scene.background = new THREE.Color( horizonColor );
// Add Fog to the scene (using updated constants)
scene.fog = new THREE.Fog(fogColor, fogNear, fogFar); // Using updated fogFar

// --- Create Cameras ---
const camera = setupCamera(cameraParams); // Uses updated cameraParams ('Overhead' view is default 'camera')
const thirdPersonCamera = setupCamera(cameraParams); // Uses updated cameraParams
let currentCamera = camera; // Start with 'Overhead' view

// --- Create Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
// <<< REMOVED setClearColor, using scene.background instead (from Sky snippet) >>>
renderer.shadowMap.enabled = true;
// <<< ADDED Tone Mapping (from Sky snippet) >>>
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = skySettings.exposure; // Set initial exposure
document.body.appendChild(renderer.domElement);

// --- Sky Setup (from Sky snippet) ---
sky = new Sky();
sky.scale.setScalar( 450000 ); // Keep sky dome large
scene.add( sky );
sky.renderOrder = -1; // Render sky early

// Sun direction vector (will be updated by updateSkyAndSun)
sun = new THREE.Vector3();

// --- Axes Helper ---
// var ah = new THREE.AxesHelper(50 * terrainScale); // Removed axes helper
// scene.add(ah); // Removed axes helper

// --- Boat Geometry Function (BufferGeometry version) ---
// [2025-02-28] Keep all the comments that were there in the original files.
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
// [2025-02-28] Keep all the comments that were there in the original files.
boat = new THREE.Object3D(); boat.name = "boat";
const raftSideMaterial = new THREE.MeshStandardMaterial({ 
    map: woodTexture,
    metalness: 0.2, 
    roughness: 0.8, 
    side: THREE.DoubleSide,
    color: 0xffffff // Use white as base color to not interfere with texture
});
const raftTopMaterial = new THREE.MeshStandardMaterial({ 
    map: woodTexture,
    metalness: 0.2, 
    roughness: 0.7, 
    side: THREE.DoubleSide,
    color: 0xffffff // Use white as base color to not interfere with texture
});
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

// <<< Oar Creation using logic from Oar/Arm snippet >>>
const oarGeometry = new THREE.CylinderGeometry(0.08, 0.08, 3.0, 8);
const oarMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
const oarBladeGeometry = new THREE.BoxGeometry(0.15, 0.4, 0.8);
const oarBladeMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });

// <<< ADJUSTED Oar Y Position >>>
const oarPivotY = 0.6 * 1.8 * 0.7 - 0.3; // Adjusted Y position (higher than before)

// Left oar
leftOarRef = new THREE.Object3D(); // This is the pivot point
const leftOar = new THREE.Mesh(oarGeometry, oarMaterial);
leftOar.position.y = -1.5; // Center the oar shaft on the pivot
leftOarRef.add(leftOar);
const leftBlade = new THREE.Mesh(oarBladeGeometry, oarBladeMaterial);
leftBlade.position.set(0, -1.5, 0); // Position blade relative to shaft center
leftBlade.rotation.x = Math.PI / 2; // Rotate blade flat
leftOarRef.add(leftBlade);
// Position oar pivot relative to person/arm using adjusted Y
leftOarRef.position.set(0.7, oarPivotY, 0); // Position near hand level with adjusted Y
leftOarRef.rotation.z = -Math.PI / 6; // Initial outward angle
leftOarRef.rotation.x = baseArmAngle; // Initial downward angle
person.add(leftOarRef); // Add oar pivot to person

// Right oar
rightOarRef = new THREE.Object3D(); // This is the pivot point
const rightOar = new THREE.Mesh(oarGeometry, oarMaterial);
rightOar.position.y = -1.5; // Center the oar shaft on the pivot
rightOarRef.add(rightOar);
const rightBlade = new THREE.Mesh(oarBladeGeometry, oarBladeMaterial);
rightBlade.position.set(0, -1.5, 0); // Position blade relative to shaft center
rightBlade.rotation.x = Math.PI / 2; // Rotate blade flat
rightOarRef.add(rightBlade);
// Position oar pivot relative to person/arm using adjusted Y
rightOarRef.position.set(-0.7, oarPivotY, 0); // Position near hand level with adjusted Y
rightOarRef.rotation.z = Math.PI / 6; // Initial outward angle
rightOarRef.rotation.x = baseArmAngle; // Initial downward angle
person.add(rightOarRef); // Add oar pivot to person

boat.add(person);
// <<< Apply the final boat scale here (Reverted to 2.0) >>>
boat.scale.set(boatScale, boatScale, boatScale);
scene.add(boat);

// --- Water Plane Shader Definition ---
// [2025-02-28] Keep all the comments that were there in the original files.
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
const waterUniforms = {
    time: { value: 0.0 },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    patternScale: { value: patternScaleFactor }, // Use fixed constant
    timeScale: { value: waterTimeScaleFactor }, // Use fixed constant (1.2)
    uAlpha: { value: waterAlpha }                // Use fixed constant for transparency
};

// --- Async Asset Loading ---
// [2025-02-28] Keep all the comments that were there in the original files.
async function loadShaderFile(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load shader: ${response.status} ${response.statusText} @ ${url}`);
    }
    return response.text();
}

const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath( 'https://www.gstatic.com/draco/v1/decoders/' ); // Use the official path
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

// <<< Load Separate Rock and Tree Instance Models >>>
const rockInstancesPromise = new Promise((resolve, reject) => {
    gltfLoader.load('assets/rocks.glb', resolve, undefined, (err) => { // Use rocks.glb
        console.error("Error loading rocks.glb", err); reject(err);
    });
});
const treeInstancesPromise = new Promise((resolve, reject) => {
    gltfLoader.load('assets/trees.glb', resolve, undefined, (err) => { // Use trees.glb
        console.error("Error loading trees.glb", err); reject(err);
    });
});


// --- REMOVED Tree creation function ---
// function createTree(scale = 1) { ... }

// -----------------------------
// Add Lights to the Scene (Setup before Promise.all)
// -----------------------------
var ambLight = new THREE.AmbientLight(0xffffff, dayAmbientIntensity); // Soft ambient fill light (using constant from Sky snippet)
scene.add(ambLight);
// Directional light to simulate the sun (position/target updated by updateSkyAndSun)
var sunLight = new THREE.DirectionalLight(0xffffff, daySunIntensity); // Using constant from Sky snippet
sunLight.castShadow = true;
scene.add(sunLight);
scene.add(sunLight.target); // Add target to scene explicitly

// Configure shadow properties (using settings from Sky snippet)
sunLight.shadow.mapSize.width = 2048; // Higher res shadows
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 50; // Adjust near plane based on scene scale
sunLight.shadow.camera.far = fogFar * 1.5; // Adjusted far plane based on NEW fogFar
// Shadow camera bounds will be set later based on terrain size
sunLight.shadow.bias = -0.0005; // Adjust shadow bias to prevent artifacts


// Wait for ALL assets to load
Promise.all([
    fragmentShaderPromise, // <<< Load fragment shader text >>>
    terrainModelPromise,
    waterMeshModelPromise,
    boundaryModelPromise,
    rockInstancesPromise,  // <<< Load rock instances >>>
    treeInstancesPromise   // <<< Load tree instances >>>
]).then(([
    fragmentShaderText, // <<< Get fragment shader text >>>
    terrainGltf,
    waterMeshGltf,
    boundaryGltf,
    rockInstancesGltf, // <<< Get rock instances result >>>
    treeInstancesGltf  // <<< Get tree instances result >>>
]) => {
    console.log("Assets loaded (Fragment Shader, Terrain, Water Mesh, Boundary, Rock Instances, Tree Instances)");

    // --- Create Water Material using ShaderMaterial ---
    try {
        waterMaterial = new THREE.ShaderMaterial({
            vertexShader: waterVertexShader,     // Use our vertex shader
            fragmentShader: fragmentShaderText, // Use loaded fragment shader
            uniforms: waterUniforms,             // Use defined uniforms (with fixed values)
            side: THREE.DoubleSide,
            transparent: true,                   // <<< KEEP TRANSPARENT water >>>
            fog: false                           // <<< Rely on scene fog (from Sky snippet) >>>
        });
        console.log("Custom ShaderMaterial created for water (Transparent).");

    } catch (error) {
        console.error("Error creating ShaderMaterial:", error);
        console.log("Falling back to basic water material.");
        // Fallback keeps transparency
        waterMaterial = new THREE.MeshBasicMaterial({
            color: 0x0000FF, side: THREE.DoubleSide, transparent: true,
            opacity: waterAlpha, fog: true // Fallback uses scene fog
        });
    }

    // --- Process Loaded Terrain Model ---
    riverModel = terrainGltf.scene;
    riverModel.scale.set(terrainScale, terrainScale, terrainScale);
    const box = new THREE.Box3().setFromObject(riverModel);
    const size = box.getSize(new THREE.Vector3()); // Get scaled size
    box.getCenter(waterCenter); // Get scaled center
    console.log(`Terrain dimensions (scaled): X=${size.x.toFixed(2)}, Y=${size.y.toFixed(2)}, Z=${size.z.toFixed(2)}`);
    console.log(`Terrain center: X=${waterCenter.x.toFixed(2)}, Y=${waterCenter.y.toFixed(2)}, Z=${waterCenter.z.toFixed(2)}`);
    console.log(`Using fixed Water Level Y: ${WATER_LEVEL_Y}`);
    // Apply shadows and fog to terrain
    riverModel.traverse(child => {
        if (child.isMesh) {
            child.receiveShadow = true; // Terrain receives shadows
            if (child.material) child.material.fog = true; // Terrain affected by fog
        }
    });
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
             }
         });
         if (!waterMesh) throw new Error("No mesh found in water_mesh.glb");

         waterMesh.material = waterMaterial; // Apply the ShaderMaterial (or fallback)
         waterMesh.name = "water";
         waterMesh.scale.copy(riverModel.scale); // Match terrain scale
         waterMesh.position.set(waterCenter.x, WATER_LEVEL_Y, waterCenter.z); // Position at water level, centered with terrain
         waterMesh.renderOrder = 1; // Render after opaque objects if transparent
         scene.add(waterMesh);
         console.log("Loaded water mesh added to scene.");

    } catch(error) {
         console.error("Error processing water_mesh.glb:", error);
         console.log("Falling back to PlaneGeometry for water.");
         const fallbackWaterGeometry = new THREE.PlaneGeometry(size.x, size.z, 100, 100); // Use terrain size
         // Generate uv1 for the fallback plane (duplicating uv)
         fallbackWaterGeometry.setAttribute('uv1', fallbackWaterGeometry.attributes.uv.clone());
         const fallbackMaterial = waterMaterial.isShaderMaterial ? waterMaterial : new THREE.MeshBasicMaterial({
             color: 0x0000FF, side: THREE.DoubleSide, transparent: true,
             opacity: waterAlpha, fog: true
         });
         waterMesh = new THREE.Mesh(fallbackWaterGeometry, fallbackMaterial);
         waterMesh.rotation.x = -Math.PI / 2;
         waterMesh.position.set(waterCenter.x, WATER_LEVEL_Y, waterCenter.z); // Position at water level, centered with terrain
         waterMesh.name = "water_fallback_plane";
         waterMesh.renderOrder = 1; // Render after opaque
         scene.add(waterMesh);
     }

     // --- Process and Add Boundary Mesh ---
     try {
         let boundaryModel = boundaryGltf.scene;
         boundaryModel.scale.copy(riverModel.scale); // Match terrain scale
         boundaryModel.position.copy(waterCenter); // Center with terrain (assuming boundary was exported around origin)

         boundaryModel.traverse((child) => {
             if (child.isMesh) {
                 boundaryMesh = child;
                 boundaryMesh.visible = false; // <<< Hide the boundary mesh >>>
                 // <<< IMPORTANT: Ensure boundary mesh matrix is updated for raycasting >>>
                 boundaryMesh.updateMatrixWorld(true); // Update world matrix once after positioning/scaling
             }
         });
         if (!boundaryMesh) throw new Error("No mesh found in boundary_mesh.glb");

         scene.add(boundaryModel); // Add the parent object containing the mesh
         console.log("Loaded boundary mesh added for collision (hidden).");

     } catch (error) {
         console.error("Error processing boundary_mesh.glb:", error);
         boundaryMesh = null; // Ensure collision checks are skipped if loading fails
     }

    // --- Generic Function to Process and Add Instanced Models ---
    const processInstancedModel = (gltf, name) => {
        try {
            if (!gltf || !gltf.scene) {
                 console.error(`GLTF data is missing or invalid for ${name}`);
                 return;
            }
            const modelScene = gltf.scene; // This should contain the Empty and its InstancedMesh children

            // Apply scaling matching the terrain model
            modelScene.scale.copy(riverModel.scale);
            // Assuming instances were placed relative to the terrain in Blender,
            // their positions should be correct relative to the scaled terrain
            // when the modelScene (representing the exported Empty) is also scaled
            // and added at the origin (like the terrain model).
            // If terrain has offset `waterCenter`, and instances were at 0,0,0 in blender:
            // modelScene.position.copy(waterCenter);

            scene.add(modelScene); // Add the whole group (Empty containing InstancedMeshes)

            let instancedMeshCount = 0;
            // Apply fog/shadows and log info for all found InstancedMeshes within the loaded scene
            modelScene.traverse(child => {
                if (child.isInstancedMesh) {
                    instancedMeshCount++;
                    console.log(`Found InstancedMesh in ${name}: ${child.name || '(no name)'} with count: ${child.count}`);
                    child.castShadow = true; // Instances cast shadows
                    child.receiveShadow = true; // Instances receive shadows
                    // Apply fog to the material(s) of the InstancedMesh
                    if (child.material) {
                         if (Array.isArray(child.material)) {
                             child.material.forEach(mat => { if(mat) mat.fog = true; });
                         } else {
                             child.material.fog = true;
                         }
                    }
                }
                // Apply fog/shadows to any regular meshes within the group too
                else if (child.isMesh) {
                     console.warn(`Found regular mesh '${child.name || '(no name)'}' inside instance group ${name}. Applying fog/shadows.`);
                     child.castShadow = true;
                     child.receiveShadow = true;
                     if (child.material) {
                         if (Array.isArray(child.material)) {
                             child.material.forEach(mat => { if(mat) mat.fog = true; });
                         } else {
                             child.material.fog = true;
                         }
                     }
                }
            });

            if (instancedMeshCount > 0) {
                console.log(`Successfully added instanced models from ${name} (${instancedMeshCount} InstancedMesh group(s) found).`);
            } else {
                console.warn(`Could not find any InstancedMesh objects within ${name}. Check Blender export settings (EXT_mesh_gpu_instancing enabled? Objects parented correctly?). Rendering any regular meshes found.`);
            }

        } catch (error) {
            console.error(`Error processing instanced model ${name}:`, error);
        }
    };

    // --- Process the Loaded Rock and Tree Instance Files ---
    processInstancedModel(rockInstancesGltf, 'rocks.glb');
    processInstancedModel(treeInstancesGltf, 'trees.glb');
    // --- End Instance Processing ---


     // --- REMOVED Procedural Tree Placement Loop ---

     // --- Final Setup ---
     // Set Initial Boat Position (relative to terrain center/size)
     // <<< ADJUSTED Initial Boat Position >>>
     const initialOffsetZ = -60; // "North" offset
     const initialOffsetX = 25; // "East" offset
     const startZ = waterCenter.z + size.z * 0.25 + initialOffsetZ; // Original Z + offset
     const startX = waterCenter.x + initialOffsetX; // Original X + offset
     boat.position.set(startX, WATER_LEVEL_Y, startZ); // Set Y directly to water level
     console.log(`Boat initial position set to: ${boat.position.x.toFixed(2)}, ${boat.position.y.toFixed(2)}, ${boat.position.z.toFixed(2)}`);

     // Apply shadows to boat
     boat.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            // Apply fog to boat materials
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(mat => { if(mat) mat.fog = true; });
                } else {
                    child.material.fog = true;
                }
            }
        }
     });

     // Set Initial Camera State (for 'Overhead' view)
     camera.position.copy(boat.position).add(chaseCameraOffset);
     camera.lookAt(boat.position);

     // Setup Third Person Camera initial position
     const initialBoatQuaternion = boat.quaternion; // Get initial rotation (likely identity)
     const rotatedThirdPersonOffset = thirdPersonOffset.clone().applyQuaternion(initialBoatQuaternion);
     thirdPersonCamera.position.copy(boat.position).add(rotatedThirdPersonOffset);
     thirdPersonCamera.lookAt(boat.position);

     // <<< Call initial Sky/Sun update AFTER assets are loaded and waterCenter is known >>>
     updateSkyAndSun();

     // Update shadow camera bounds now that terrain size is known
     const shadowCamSize = Math.max(size.x, size.z) * 0.6; // Heuristic based on terrain dimensions
     sunLight.shadow.camera.left = -shadowCamSize;
     sunLight.shadow.camera.right = shadowCamSize;
     sunLight.shadow.camera.top = shadowCamSize;
     sunLight.shadow.camera.bottom = -shadowCamSize;
     sunLight.shadow.camera.updateProjectionMatrix(); // Apply changes


}).catch(error => {
    console.error("Failed to load one or more critical assets:", error);
    // Ensure basic fallback water plane if everything else fails
    if (!scene.getObjectByName("water") && !scene.getObjectByName("water_fallback_plane") && !scene.getObjectByName("water_load_error_fallback")) {
         const fallbackMaterial = new THREE.MeshBasicMaterial({
             color: 0x0000FF, side: THREE.DoubleSide, transparent: true,
             opacity: waterAlpha, fog: true
         });
         const fallbackGeo = new THREE.PlaneGeometry(200 * terrainScale / 10, 200 * terrainScale / 10); // Scaled fallback size
         const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMaterial);
         fallbackMesh.rotation.x = -Math.PI / 2;
         fallbackMesh.position.y = WATER_LEVEL_Y;
         fallbackMesh.name = "water_load_error_fallback";
         scene.add(fallbackMesh);
         console.log("Added fallback water plane due to critical loading error.");
     }
     // Fallback boat position if terrain didn't load
     if (boat && waterCenter.lengthSq() === 0) { // Check if waterCenter was never set
         boat.position.set(0, WATER_LEVEL_Y, 50 * terrainScale / 10); // Scaled fallback pos
     }
     // <<< Call initial Sky/Sun update even on error to set default sky/sun >>>
     updateSkyAndSun();
});


// -----------------------------
// dat.GUI Interface
// -----------------------------
const gui = new dat.GUI();

// Camera Mode GUI
gui.add(guiState, 'cameraMode', ['Overhead', 'Third Person']) // Using Overhead and Third Person
    .name('Camera Mode')
    .onChange((value) => {
        currentCamera = (value === 'Third Person') ? thirdPersonCamera : camera; // Assign correct camera
        currentCamera.aspect = window.innerWidth / window.innerHeight;
        currentCamera.updateProjectionMatrix();
    });

// <<< REMOVED Sky Settings GUI Folder and controls (using hardcoded) >>>
// <<< REMOVED Lighting Mode GUI (Sky handles this) >>>
// <<< REMOVED Water Speed GUI (using hardcoded) >>>
// <<< REMOVED Axes Helper GUI (helper removed) >>>


// --- Initial Sky and Sun Update Function (from Sky snippet) ---
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
    const deltaTime = Math.min(clock.getDelta(), 0.05); // Cap delta time
    timeAccumulator += deltaTime;

    // Use fixed timestep loop
    while (timeAccumulator >= targetFrameDuration) {
        const effectiveDeltaTime = targetFrameDuration;
        timeAccumulator -= targetFrameDuration;

        const elapsedTime = clock.elapsedTime; // Use property instead of method inside loop

        // --- Update Logic ---
        // Update water shader time uniform
        if (waterMaterial && waterMaterial.isShaderMaterial) {
            waterMaterial.uniforms.time.value = elapsedTime;
        }

        // Boat Physics Update
        if (boat && boundaryMesh && boundaryMesh.geometry) { // Check geometry existence
            // Apply rotation
            if (isTurningLeft) { boat.rotateY(turnRate * effectiveDeltaTime); }
            if (isTurningRight) { boat.rotateY(-turnRate * effectiveDeltaTime); }

            // Update speed
            if (isAccelerating) { currentSpeed += accelerationRate * effectiveDeltaTime; }
            else if (currentSpeed > 0) { currentSpeed -= decelerationRate * effectiveDeltaTime; }
            currentSpeed = Math.max(0, Math.min(currentSpeed, maxSpeed)); // Clamp speed

            // Collision Detection & Response
            let proposedDisplacementZ = -currentSpeed * effectiveDeltaTime;
            if (currentSpeed > 0.01) {
                boat.getWorldQuaternion(boatWorldQuaternion);
                const worldBoatForward = boatForward.clone().applyQuaternion(boatWorldQuaternion).normalize();
                let collisionDetected = false;

                for (const point of rayCheckPoints) {
                    worldRayOrigin.copy(point).applyMatrix4(boat.matrixWorld);
                    worldRayDirection.copy(worldBoatForward);
                    raycaster.set(worldRayOrigin, worldRayDirection);
                    raycaster.far = collisionCheckDistance;

                    // boundaryMesh.updateMatrixWorld(true); // Avoid in loop if boundary is static

                    const intersects = raycaster.intersectObject(boundaryMesh, false);

                    if (intersects.length > 0 && intersects[0].distance < Math.abs(proposedDisplacementZ) + 0.1) {
                        const intersect = intersects[0];
                        if (intersect.face && intersect.face.normal) { // Check face and normal exist
                             collisionNormal.copy(intersect.face.normal).transformDirection(boundaryMesh.matrixWorld).normalize();
                        } else {
                            collisionNormal.copy(worldBoatForward).multiplyScalar(-1); // Fallback normal
                        }
                        proposedDisplacementZ = 0; // Prevent penetration
                        currentSpeed *= collisionDamping; // Damp speed
                        boat.position.addScaledVector(collisionNormal, collisionNudge); // Nudge away
                        collisionDetected = true;
                        break; // Stop checking after first hit
                    }
                }
            }

            // Apply final displacement
            if (Math.abs(proposedDisplacementZ) > 0.0001) {
                boat.translateZ(proposedDisplacementZ);
            }
            // Keep boat slightly above water level if needed, or directly on it
            boat.position.y = WATER_LEVEL_Y; // Set Y directly to water level

            // <<< Arm and Oar Animation from Oar/Arm Snippet >>>
            if (leftUpperArmRef && rightUpperArmRef && leftOarRef && rightOarRef) {
                const animIntensity = Math.min(1, currentSpeed / (maxSpeed * 0.75));
                const time = elapsedTime * rowingSpeedFactor;

                // Create a more natural rowing motion with proper pull and dip
                const pullPhase = Math.sin(time);
                const dipPhase = Math.sin(time + Math.PI/2); // Use sin offset for smoother dip

                // Calculate angles based on phases
                const rowingAngle = (pullPhase * 0.5 + 0.5) * maxRowingAngle * animIntensity; // Back-and-forth swing (0 to max angle)
                const forwardAngle = dipPhase * (Math.PI / 4) * animIntensity; // Sideways twist for forward reach
                const bladeAngle = Math.abs(dipPhase) * 0.5 * animIntensity; // Oar blade rotation (feathering) - Use dipPhase

                // Left arm and oar
                leftUpperArmRef.rotation.x = baseArmAngle + rowingAngle;
                leftUpperArmRef.rotation.z = Math.PI / 6 - forwardAngle; // Base outward angle + forward reach twist
                // Oar follows arm with additional blade rotation
                leftOarRef.rotation.x = baseArmAngle + rowingAngle;
                leftOarRef.rotation.z = Math.PI / 6 - forwardAngle;
                leftOarRef.rotation.y = -bladeAngle; // Feathering rotation
                // Adjust oar Y position dynamically based on hand movement (simplified) using the corrected base Y
                leftOarRef.position.y = oarPivotY + Math.sin(time) * 0.1 * animIntensity; // Use oarPivotY + vertical oscillation

                // Right arm and oar
                rightUpperArmRef.rotation.x = baseArmAngle + rowingAngle;
                rightUpperArmRef.rotation.z = -Math.PI / 6 + forwardAngle; // Base outward angle + forward reach twist
                // Oar follows arm with additional blade rotation
                rightOarRef.rotation.x = baseArmAngle + rowingAngle;
                rightOarRef.rotation.z = -Math.PI / 6 + forwardAngle;
                rightOarRef.rotation.y = bladeAngle; // Feathering rotation
                // Adjust oar Y position dynamically based on hand movement (simplified) using the corrected base Y
                rightOarRef.position.y = oarPivotY + Math.sin(time) * 0.1 * animIntensity; // Use oarPivotY + vertical oscillation
            }
            // <<< End Oar/Arm Animation Block >>>

        } // End boat physics update

        // Update Cameras
        if (boat) { // Only update cameras if boat exists
             if (currentCamera === camera) { // 'Overhead' view
                 boat.getWorldPosition(boatWorldPosition);
                 // Keep camera position relative to boat, ensure minimum height above water
                 desiredCamPos.copy(boatWorldPosition).add(chaseCameraOffset);
                 desiredCamPos.y = Math.max(WATER_LEVEL_Y + 10, desiredCamPos.y); // Ensure minimum height
                 // Look slightly below boat
                 const lookAtTarget = new THREE.Vector3(boatWorldPosition.x, Math.max(WATER_LEVEL_Y - 5, boatWorldPosition.y - 5), boatWorldPosition.z);
                 camera.position.lerp(desiredCamPos, cameraLerpFactor);
                 camera.lookAt(lookAtTarget);
             } else if (currentCamera === thirdPersonCamera) { // Third person view
                 boat.getWorldPosition(boatWorldPosition);
                 boat.getWorldQuaternion(boatWorldQuaternion);
                 // Calculate position behind boat, ensure minimum height
                 desiredCamPos.copy(thirdPersonOffset).applyQuaternion(boatWorldQuaternion).add(boatWorldPosition);
                 desiredCamPos.y = Math.max(WATER_LEVEL_Y + 2, desiredCamPos.y); // Ensure minimum height
                 // Look slightly ahead and below boat
                 const lookAtOffset = new THREE.Vector3(0, -1, -10); // Look slightly down
                 const lookAtTarget = lookAtOffset.applyQuaternion(boatWorldQuaternion).add(boatWorldPosition);
                 lookAtTarget.y = Math.max(WATER_LEVEL_Y - 2, lookAtTarget.y); // Ensure look target isn't too low
                 thirdPersonCamera.position.lerp(desiredCamPos, cameraLerpFactor);
                 thirdPersonCamera.lookAt(lookAtTarget);
             }
         }

    } // End fixed timestep loop

    // Render Scene
    renderer.render(scene, currentCamera);
}

// <<< MOVED setAnimationLoop call AFTER clock is defined and render is defined >>>
renderer.setAnimationLoop(render);


// --- Keyboard Event Listeners ---
// [2025-02-28] Keep all the comments that were there in the original files.
document.addEventListener("keydown", (event) => {
    if (event.target.tagName === 'INPUT' || event.target.isContentEditable) return;
    const key = event.key.toLowerCase();
    switch (key) {
        case 'w': case 'arrowup': isAccelerating = true; break;
        case 'a': case 'arrowleft': isTurningLeft = true; isTurningRight = false; break;
        case 'd': case 'arrowright': isTurningRight = true; isTurningLeft = false; break;
        // <<< REMOVED 'q' keybind for axes helper >>>
        default: break;
    }
});
document.addEventListener("keyup", (event) => {
    // [2025-02-28] Keep all the comments that were there in the original files.
    if (event.target.tagName === 'INPUT' || event.target.isContentEditable) return;
    const key = event.key.toLowerCase();
    switch (key) {
        case 'w': case 'arrowup': isAccelerating = false; break;
        case 'a': case 'arrowleft': isTurningLeft = false; break;
        case 'd': case 'arrowright': isTurningRight = false; break;
    }
});

// --- Window Resize Handler ---
// [2025-02-28] Keep all the comments that were there in the original files.
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect; camera.updateProjectionMatrix(); // 'Overhead' camera
    thirdPersonCamera.aspect = aspect; thirdPersonCamera.updateProjectionMatrix(); // Third person
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (waterMaterial && waterMaterial.isShaderMaterial && waterMaterial.uniforms.resolution) {
        waterMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }
}

// --- Initial call to resize handler ---
onWindowResize();

console.log("Three.js scene setup complete. Waiting for assets...");
