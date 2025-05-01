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
const patternScaleFactor = 1.0; // Initial pattern scale
const waterTimeScaleFactor = 1.2; // <<< SET FIXED WATER ANIMATION SPEED >>>
const waterAlpha = 0.85; // <<< Set desired base water transparency (0.0 to 1.0) >>>
// const waterColor = 0x336699; // No longer needed for ShaderMaterial
// Camera
const chaseCameraOffset = new THREE.Vector3(0, 45, 15); // Still used for the 'Overhead' view logic
const cameraLerpFactor = 0.08;
// const overheadCameraHeight = 600; // Removed overhead camera concept, reused 'camera'
const thirdPersonOffset = new THREE.Vector3(0, 15, 30); // Third-person camera offset
// Boat Physics
const boatScale = 4.0; // <<< MODIFIED: Doubled boat size >>>
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
const baseArmAngle = Math.PI / 6;
// Lighting (Only Day Mode now)
const dayAmbientIntensity = 0.8; // <<< MODIFIED: Increased ambient light >>>
const daySunIntensity = 2.0;    // <<< MODIFIED: Increased sun intensity >>>
// const nightAmbientIntensity = 0.15; // Removed night mode
// const nightSunIntensity = 0.2;   // Removed night mode
// Fog
const fogColor = 0xa3dfff; // Low saturation bright blue (Fog blends *towards* this color)
const fogNear = 0 * terrainScale;  // <<< DECREASED fogNear for stronger effect >>>
const fogFar = 80 * terrainScale; // <<< DECREASED fogFar for stronger effect >>>
// FPS Lock
const targetFrameRate = 30;
const targetFrameDuration = 1 / targetFrameRate; // Seconds
// Sky Color
const skyColor = 0x87CEEB; // <<< ADDED distinct sky color >>>

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
     new THREE.Vector3(0, 0, -1.5 * boatScale),  // Front center (scaled with boat)
     new THREE.Vector3(0.8 * boatScale, 0, -1.2 * boatScale), // Front right (scaled with boat)
     new THREE.Vector3(-0.8 * boatScale, 0, -1.2 * boatScale) // Front left (scaled with boat)
];
// GUI State
const guiState = {
    // axesHelper: true, // Removed axes helper
    cameraMode: 'Overhead', // <<< CHANGED default label to match GUI >>>
    // lightingMode: 'Day', // Removed lighting mode toggle (always Day)
    // timeScale: waterTimeScaleFactor, // Removed from GUI control
    // patternScale: patternScaleFactor, // Removed from GUI control
    // waterAlpha: waterAlpha // Removed from GUI control
};
// FPS Lock
let timeAccumulator = 0;

// Define camera parameters (placeholders, real values set after load)
var cameraParams = {
    near: 0.1, far: fogFar * 1.1, fov: 75, aspectRatio: window.innerWidth / window.innerHeight, // Adjusted far plane for new fogFar
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
// Add Fog to the scene <<< Fog settings remain >>>
scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);

// --- Create Cameras ---
const camera = setupCamera(cameraParams); // Main camera (now labeled 'Overhead')
// const overheadCamera = setupCamera(cameraParams); // Removed overhead camera instance
const thirdPersonCamera = setupCamera(cameraParams); // Third-person camera instance
let currentCamera = camera; // Start with the 'Overhead' (formerly chase) camera active

// --- Create Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(skyColor, 1); // <<< SET CLEAR COLOR TO SKY BLUE >>>
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// --- Axes Helper ---
// var ah = new THREE.AxesHelper(50 * terrainScale); // Removed axes helper
// scene.add(ah); // Removed axes helper

// --- Boat Geometry Function (BufferGeometry version) ---
function createRaftBufferGeometry() {
    // [2025-02-28] Keep all the comments that were there in the original files.
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
// (Boat creation code remains the same, scaling applied later)
// [2025-02-28] Keep all the comments that were there in the original files.
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
// person.add(leftOarRef); // <<< Oars are added directly to boat now below >>>

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
// person.add(rightOarRef); // <<< Oars are added directly to boat now below >>>

boat.add(person);
// <<< Add oars directly to the boat object, not the person, so they scale with the boat correctly >>>
boat.add(leftOarRef);
boat.add(rightOarRef);
// <<< Apply the final boat scale here >>>
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
// <<< Uniforms for the ShaderMaterial - USING FIXED VALUES >>>
const waterUniforms = {
    time: { value: 0.0 },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    patternScale: { value: patternScaleFactor }, // Use fixed constant
    timeScale: { value: waterTimeScaleFactor }, // Use fixed constant (1.2)
    uAlpha: { value: waterAlpha }                // Use fixed constant
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
            transparent: true,                   // <<< ENABLE TRANSPARENCY >>>
            // fog: true // <<< REMOVED fog: true from ShaderMaterial to prevent error >>>
        });
        console.log("Custom ShaderMaterial created for water (Transparent).");

    } catch (error) {
        console.error("Error creating ShaderMaterial:", error);
        console.log("Falling back to basic water material.");
        waterMaterial = new THREE.MeshBasicMaterial({ // Fallback is Basic
            color: 0x0000FF, // Fallback color if shader fails
            side: THREE.DoubleSide,
            transparent: true,
            opacity: waterAlpha, // Use fixed constant
            fog: true // <<< Keep fog enabled on fallback material >>>
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
                 // console.log("Water Mesh Attributes:", waterMesh.geometry.attributes); // Less verbose logging
             }
         });
         if (!waterMesh) throw new Error("No mesh found in water_mesh.glb");

         waterMesh.material = waterMaterial; // Apply the ShaderMaterial (or fallback)
         waterMesh.name = "water";
         waterMesh.scale.copy(riverModel.scale); // Match terrain scale
         waterMesh.position.set(waterCenter.x, WATER_LEVEL_Y, waterCenter.z); // Position at water level, centered with terrain
         // waterMesh.renderOrder = 1; // Optional: Adjust render order for transparency
         scene.add(waterMesh);
         console.log("Loaded water mesh added to scene.");

    } catch(error) {
         console.error("Error processing water_mesh.glb:", error);
         console.log("Falling back to PlaneGeometry for water.");
         const fallbackWaterGeometry = new THREE.PlaneGeometry(size.x, size.z, 100, 100); // Use terrain size
         // Generate uv1 for the fallback plane (duplicating uv)
         fallbackWaterGeometry.setAttribute('uv1', fallbackWaterGeometry.attributes.uv.clone());
         const fallbackMaterial = waterMaterial.isShaderMaterial ? waterMaterial : new THREE.MeshBasicMaterial({ // Use Basic fallback
             color: 0x0000FF,
             side: THREE.DoubleSide,
             transparent: true,
             opacity: waterAlpha, // Use fixed constant
             fog: true // <<< Enable fog on fallback plane material >>>
         });
         waterMesh = new THREE.Mesh(fallbackWaterGeometry, fallbackMaterial);
         waterMesh.rotation.x = -Math.PI / 2;
         waterMesh.position.set(waterCenter.x, WATER_LEVEL_Y, waterCenter.z); // Position at water level, centered with terrain
         waterMesh.name = "water_fallback_plane";
         // fallbackMesh.renderOrder = 1; // Also set renderOrder for fallback if using
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
                 boundaryMesh.visible = false; // <<< Hide the boundary mesh
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
            // Apply fog and log info for all found InstancedMeshes within the loaded scene
            modelScene.traverse(child => {
                if (child.isInstancedMesh) {
                    instancedMeshCount++;
                    console.log(`Found InstancedMesh in ${name}: ${child.name || '(no name)'} with count: ${child.count}`);
                    // Apply fog to the material(s) of the InstancedMesh
                    if (child.material) {
                         if (Array.isArray(child.material)) {
                             child.material.forEach(mat => { if(mat) mat.fog = true; });
                         } else {
                             child.material.fog = true;
                         }
                    }
                }
                // Apply fog to any regular meshes within the group too (e.g., if export failed partially)
                else if (child.isMesh && child.material) {
                     console.warn(`Found regular mesh '${child.name || '(no name)'}' inside instance group ${name}. Applying fog.`);
                     if (Array.isArray(child.material)) {
                         child.material.forEach(mat => { if(mat) mat.fog = true; });
                     } else {
                         child.material.fog = true;
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
     const startZ = waterCenter.z + size.z * 0.25;
     boat.position.set(waterCenter.x, WATER_LEVEL_Y, startZ);
     console.log(`Boat initial position set to: ${boat.position.x.toFixed(2)}, ${boat.position.y.toFixed(2)}, ${boat.position.z.toFixed(2)}`);

     // Set Initial Camera State (for 'Overhead' view)
     camera.position.copy(boat.position).add(chaseCameraOffset);
     camera.lookAt(boat.position);

     // Setup Third Person Camera initial position
     const initialBoatQuaternion = boat.quaternion; // Get initial rotation (likely identity)
     const rotatedThirdPersonOffset = thirdPersonOffset.clone().applyQuaternion(initialBoatQuaternion);
     thirdPersonCamera.position.copy(boat.position).add(rotatedThirdPersonOffset);
     thirdPersonCamera.lookAt(boat.position);

     // Update light positions/targets (relative to terrain center/size)
     sunLight.position.set(waterCenter.x + size.x * 0.5, waterCenter.y + (size.y > 0 ? size.y * 2 : 100), waterCenter.z - size.z * 0.3);
     sunLight.target.position.copy(waterCenter);
     sunLight.target.position.y = WATER_LEVEL_Y; // Target the water level plane
     if (!sunLight.target.parent) scene.add(sunLight.target); // Ensure target is in scene
     sunLight.target.updateMatrixWorld(); // Update target matrix

    // <<< Make terrain material react to fog >>>
    riverModel.traverse(child => {
        if (child.isMesh && child.material) {
             if (Array.isArray(child.material)) {
                 child.material.forEach(mat => { if(mat) mat.fog = true; });
             } else {
                 child.material.fog = true;
             }
        }
    });
    // <<< Make boat materials react to fog >>>
    boat.traverse(child => {
        if (child.isMesh && child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(mat => { if(mat) mat.fog = true; });
            } else {
                child.material.fog = true;
            }
        }
    });

    // Initial shadow camera update after size is known
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
             color: 0x0000FF, side: THREE.DoubleSide, transparent: true, opacity: waterAlpha, fog: true
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
});

// -----------------------------
// Add Lights to the Scene (Initial setup - Day only)
// -----------------------------
// [2025-02-28] Keep all the comments that were there in the original files.
var ambLight = new THREE.AmbientLight(0xffffff, dayAmbientIntensity); // Uses updated constant
scene.add(ambLight);
var sunLight = new THREE.DirectionalLight(0xffffff, daySunIntensity); // Uses updated constant
sunLight.castShadow = true; // Enable shadows for sunlight
sunLight.target = new THREE.Object3D(); // Create target object
scene.add(sunLight.target); // Add target to scene
scene.add(sunLight); // Add light itself


// Configure shadow properties (adjust for performance/quality)
sunLight.shadow.mapSize.width = 1024; // Default 512
sunLight.shadow.mapSize.height = 1024; // Default 512
sunLight.shadow.camera.near = 0.5 * terrainScale / 10; // Scale near plane
sunLight.shadow.camera.far = fogFar * 1.1; // Adjust shadow camera far plane based on new fogFar
// Shadow camera bounds will be set properly within the Promise.all().then() once terrain size is known


// -----------------------------
// dat.GUI Interface
// -----------------------------
const gui = new dat.GUI();

// <<< RENAMED 'Chase' to 'Overhead' >>>
gui.add(guiState, 'cameraMode', ['Overhead', 'Third Person']) // Renamed option
    .name('Camera Mode')
    .onChange((value) => {
        // <<< ADJUSTED logic to check for 'Overhead' >>>
        currentCamera = (value === 'Third Person') ? thirdPersonCamera : camera; // 'camera' is the 'Overhead' view
        currentCamera.aspect = window.innerWidth / window.innerHeight;
        currentCamera.updateProjectionMatrix();
    });

// <<< REMOVED Lighting Mode GUI control >>>
// <<< REMOVED Water Anim Speed GUI control >>>
// <<< REMOVED Water Pattern Scale GUI control >>>
// <<< REMOVED Water Opacity GUI control >>>
// <<< REMOVED Axes Helper GUI control >>>

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
                        if (intersect.face) {
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

            // Arm and Oar Animation
             if (leftUpperArmRef && rightUpperArmRef && leftOarRef && rightOarRef) {
                 const animIntensity = Math.min(1, currentSpeed / (maxSpeed * 0.75));
                 const time = elapsedTime * rowingSpeedFactor;
                 const pullPhase = Math.sin(time);
                 const dipPhase = Math.sin(time + Math.PI / 2);
                 const rowingAngle = (pullPhase * 0.5 + 0.5) * maxRowingAngle * animIntensity;
                 const forwardAngle = dipPhase * (Math.PI / 6) * animIntensity;
                 const bladeAngleY = Math.abs(dipPhase) * (Math.PI / 8) * animIntensity;
                 const verticalDip = -Math.max(0, dipPhase) * 0.15 * animIntensity;

                 // Left arm/oar
                 leftUpperArmRef.rotation.x = baseArmAngle + rowingAngle;
                 leftUpperArmRef.rotation.z = -Math.PI / 6 - forwardAngle;
                 leftOarRef.rotation.x = baseArmAngle + rowingAngle;
                 leftOarRef.rotation.z = -Math.PI / 6 - forwardAngle;
                 leftOarRef.rotation.y = -bladeAngleY;
                 leftOarRef.position.y = (0.6 * 1.8 * 0.7 - 0.8) + verticalDip;

                 // Right arm/oar
                 rightUpperArmRef.rotation.x = baseArmAngle + rowingAngle;
                 rightUpperArmRef.rotation.z = Math.PI / 6 + forwardAngle;
                 rightOarRef.rotation.x = baseArmAngle + rowingAngle;
                 rightOarRef.rotation.z = Math.PI / 6 + forwardAngle;
                 rightOarRef.rotation.y = bladeAngleY;
                 rightOarRef.position.y = (0.6 * 1.8 * 0.7 - 0.8) + verticalDip;
             }
        } // End boat physics update

        // Update Cameras
        if (boat) { // Only update cameras if boat exists
             if (currentCamera === camera) { // 'Overhead' view
                 boat.getWorldPosition(boatWorldPosition);
                 desiredCamPos.copy(boatWorldPosition).add(chaseCameraOffset);
                 const lookAtTarget = new THREE.Vector3(boatWorldPosition.x, Math.max(WATER_LEVEL_Y - 5, boatWorldPosition.y - 5), boatWorldPosition.z);
                 camera.position.lerp(desiredCamPos, cameraLerpFactor);
                 camera.lookAt(lookAtTarget);
             } else if (currentCamera === thirdPersonCamera) { // Third person view
                 boat.getWorldPosition(boatWorldPosition);
                 boat.getWorldQuaternion(boatWorldQuaternion);
                 desiredCamPos.copy(thirdPersonOffset).applyQuaternion(boatWorldQuaternion).add(boatWorldPosition);
                 const lookAtOffset = new THREE.Vector3(0, 2, -10);
                 const lookAtTarget = lookAtOffset.applyQuaternion(boatWorldQuaternion).add(boatWorldPosition);
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
document.addEventListener("keydown", (event) => {
    // [2025-02-28] Keep all the comments that were there in the original files.
    if (event.target.tagName === 'INPUT' || event.target.isContentEditable) return;
    const key = event.key.toLowerCase();
    switch (key) {
        case 'w': case 'arrowup': isAccelerating = true; break;
        case 'a': case 'arrowleft': isTurningLeft = true; isTurningRight = false; break;
        case 'd': case 'arrowright': isTurningRight = true; isTurningLeft = false; break;
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
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    // [2025-02-28] Keep all the comments that were there in the original files.
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

