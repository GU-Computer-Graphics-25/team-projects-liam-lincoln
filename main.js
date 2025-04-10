// Import Three.js core and OrbitControls utility
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// Import dat.GUI from node_modules (installed via npm)
import * as dat from 'dat.gui';
import { ThreeMFLoader } from 'three/examples/jsm/Addons.js';
// Import TW helper from local js directory
// import * as TW from './js/tw.js';

// Define camera parameters (position, orientation, and view settings)
var cameraParams = {
    near: 0.1, // closest rendering distance
    far: 1000, // farthest rendering distance
    fov: 75, // camera field of view (degrees)
    aspectRatio: window.innerWidth / window.innerHeight, // adjusts based on window size
    atX: 0, atY: 0, atZ: 0, // camera target (center point to look at)
    eyeX: 3, eyeY: 5, eyeZ: 5, // camera position
    upX: 0, upY: 1, upZ: 0 // which direction is "up" (Y-axis by default)
};

// Create the scene - the container for objects, lights, and cameras
const scene = new THREE.Scene();

// Create and configure the camera using custom parameters
const camera = setupCamera(cameraParams);

// Create the WebGL renderer and add it to the page
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight); // size based on window
renderer.setAnimationLoop(render); // continuously render frames (main loop)
renderer.setClearColor(0xdddddd, 1); // set background color (light gray)
document.body.appendChild(renderer.domElement); // append canvas to DOM

// Add OrbitControls to allow user interaction (zoom, rotate, pan)
const controls = new OrbitControls(camera, renderer.domElement);

// Add a visual reference for axes (X: red, Y: green, Z: blue)
var ah = new THREE.AxesHelper(50); // axis length of 50 units
scene.add(ah);

// -----------------------------
// Add 3D Objects to the Scene
// -----------------------------

var Loader = new THREE.TextureLoader();


let boat = new THREE.Object3D();
boat.name = "boat";
let boatSide= new THREE.Mesh(
    new THREE.PlaneGeometry(5,2),
    new THREE.MeshPhongMaterial({
        color: new THREE.Color("Brown"),
        side: THREE.DoubleSide
    })
);
let rightSide = boatSide.clone();
let leftSide = boatSide.clone();
rightSide.rotateX(-10);
leftSide.position.z+=1;
leftSide.rotateX(10);
boat.add(leftSide);
boat.add(rightSide);
boat.rotateY(Math.PI/2)
scene.add(boat);

let person = new THREE.Object3D();
person.name = "person";

// Create body (elongated sphere for sitting pose)
let body = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 16, 16),
    new THREE.MeshPhongMaterial({ color: new THREE.Color("Blue") })
);
body.scale.set(1, 1.8, 1); // Make body longer
body.position.y = 1.0; // Position body vertically
person.add(body);

// Create head
let head = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 16, 16),
    new THREE.MeshPhongMaterial({ color: new THREE.Color("Pink") })
);
head.position.y = 2.4; // Position head on top of longer body
person.add(head);

// Create left arm parts
let leftUpperArm = new THREE.Object3D();
leftUpperArm.name = "leftUpperArm";
leftUpperArm.position.set(0.6, 1.6, 0);
leftUpperArm.rotation.x = Math.PI / 4; // Initial rotation for rowing position
person.add(leftUpperArm);

let leftUpperArmMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8),
    new THREE.MeshPhongMaterial({ color: new THREE.Color("Blue") })
);
leftUpperArm.add(leftUpperArmMesh);

let leftLowerArm = new THREE.Object3D();
leftLowerArm.name = "leftLowerArm";
leftLowerArm.position.set(0, -0.4, 0); // Position relative to upper arm
leftUpperArm.add(leftLowerArm);

let leftLowerArmMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8),
    new THREE.MeshPhongMaterial({ color: new THREE.Color("Blue") })
);
leftLowerArm.add(leftLowerArmMesh);

// Create right arm parts
let rightUpperArm = new THREE.Object3D();
rightUpperArm.name = "rightUpperArm";
rightUpperArm.position.set(-0.6, 1.6, 0);
rightUpperArm.rotation.x = Math.PI / 4; // Match left arm's initial rotation
person.add(rightUpperArm);

let rightUpperArmMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8),
    new THREE.MeshPhongMaterial({ color: new THREE.Color("Blue") })
);
rightUpperArm.add(rightUpperArmMesh);

let rightLowerArm = new THREE.Object3D();
rightLowerArm.name = "rightLowerArm";
rightLowerArm.position.set(0, -0.4, 0); // Match left arm's position
rightUpperArm.add(rightLowerArm);

let rightLowerArmMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8),
    new THREE.MeshPhongMaterial({ color: new THREE.Color("Blue") })
);
rightLowerArm.add(rightLowerArmMesh);

// Position the person in the boat
person.position.set(0, 0.2, 0.5); // Slightly above the boat's surface
person.rotation.y = Math.PI / 2; // Rotate to face forward (z direction)
boat.add(person);

// -----------------------------
// Add Lights to the Scene
// -----------------------------

// Ambient light provides general illumination (soft, non-directional)
var ambLight = new THREE.AmbientLight(new THREE.Color("white"), 1);
scene.add(ambLight);

// Directional light simulates sunlight (cast from one direction)
var sunLight = new THREE.DirectionalLight(new THREE.Color("yellow"), 0.5);
sunLight.position.set(20, 50, -20); // position of the "sun"
sunLight.target.position.set(0, 0, 0); // light shines toward scene center
scene.add(sunLight);
scene.add(sunLight.target); // add the target for the directional light

// -----------------------------
// dat.GUI Interface
// -----------------------------

// Create GUI panel using dat.GUI (npm version)
const gui = new dat.GUI();

// Group light controls into a folder
const lightFolder = gui.addFolder('Lights');

// Define control states (on/off) for both lights
const lightControls = {
    ambientLight: true,
    sunLight: true
};

// Toggle ambient light visibility
lightFolder.add(lightControls, 'ambientLight')
    .name('Ambient Light')
    .onChange((value) => {
        ambLight.visible = value;
    });

// Toggle sun (directional) light visibility
lightFolder.add(lightControls, 'sunLight')
    .name('Sun Light')
    .onChange((value) => {
        sunLight.visible = value;
    });

// Open the folder by default
lightFolder.open();

/**
 * Render loop: called automatically every frame
 */
function render() {
    let boat = scene.getObjectByName("boat", true);
    if (boat) {
        // Get boat's world position and rotation
        let boatPosition = new THREE.Vector3();
        boat.getWorldPosition(boatPosition);
        
        // Calculate camera position based on boat's rotation
        let offset = new THREE.Vector3(5, 5, 0);
        offset.applyQuaternion(boat.quaternion);
        
        // Update camera position and target
        camera.position.set(
            boatPosition.x + offset.x,
            boatPosition.y + offset.y,
            boatPosition.z + offset.z
        );
        camera.lookAt(boatPosition);
    }
    renderer.render(scene, camera);
}

/**
 * Setup camera function using custom parameters
 * @param {Object} cameraParameters - configuration for camera setup
 */
function setupCamera(cameraParameters) {
    var cp = cameraParameters;
    var camera = new THREE.PerspectiveCamera(cp.fov, cp.aspectRatio, cp.near, cp.far);
    camera.position.set(cp.eyeX, cp.eyeY, cp.eyeZ); 
    camera.up.set(cp.upX, cp.upY, cp.upZ); 
    camera.lookAt(new THREE.Vector3(cp.atX, cp.atY, cp.atZ)); 
    return camera;
}
function updateCamera() {
    let boat = scene.getObjectByName("boat", true);
    if (boat) {
        // Get boat's world position and rotation
        let boatPosition = new THREE.Vector3();
        boat.getWorldPosition(boatPosition);
        
        // Calculate camera position based on boat's rotation
        let offset = new THREE.Vector3(-5, 3, 0);
        offset.applyQuaternion(boat.quaternion);
        
        // Update camera parameters
        cameraParams.atX = boatPosition.x;
        cameraParams.atY = boatPosition.y;
        cameraParams.atZ = boatPosition.z;
        
        // Set camera position relative to boat
        cameraParams.eyeX = boatPosition.x + offset.x;
        cameraParams.eyeY = boatPosition.y + offset.y;
        cameraParams.eyeZ = boatPosition.z + offset.z;
        
        // Update camera
        scene.remove(camera);
        camera = setupCamera(cameraParams);
        scene.add(camera);
        
        // Update orbit controls if enabled
        if (enableOrbitControls) {
            cameraControls = new THREE.OrbitControls(camera, canvas);
            setupCameraControls(cameraControls);
        }
    }
    render();
}
function moveBoatFowardZ() {
    let obj = scene.getObjectByName("boat", true);
    obj.translateX(-1);
    
    // Rotate arms for rowing motion
    let person = obj.getObjectByName("person", true);
    if (person) {
        let leftArm = person.getObjectByName("leftUpperArm", true);
        let rightArm = person.getObjectByName("rightUpperArm", true);
        if (leftArm) leftArm.rotation.x += Math.PI / 2; 
        if (rightArm) rightArm.rotation.x += Math.PI / 2; 
    }
    
    updateCamera();
}


function moveBoatBackwardZ() {
    let obj = scene.getObjectByName("boat", true);
    obj.translateX(1);
    
    // Rotate arms for rowing motion
    let person = obj.getObjectByName("person", true);
    if (person) {
        let leftArm = person.getObjectByName("leftUpperArm", true);
        let rightArm = person.getObjectByName("rightUpperArm", true);
        if (leftArm) leftArm.rotation.x -= Math.PI / 2; 
        if (rightArm) rightArm.rotation.x -= Math.PI / 2; 
    }
    
    updateCamera();
}


function turnBoatLeft() {
    let obj = scene.getObjectByName("boat", true);
    obj.rotation.y += 5 * Math.PI / 180;
    
    // Rotate arms for turning
    let person = obj.getObjectByName("person", true);
    if (person) {
        let leftArm = person.getObjectByName("leftUpperArm", true);
        let rightArm = person.getObjectByName("rightUpperArm", true);
        if (leftArm) leftArm.rotation.x += Math.PI / 3; 
        if (rightArm) rightArm.rotation.x += Math.PI / 3; 
    }
    
    updateCamera();
}


function turnBoatRight() {
    let obj = scene.getObjectByName("boat", true);
    obj.rotation.y -= 5 * Math.PI / 180;
    
    // Rotate arms for turning
    let person = obj.getObjectByName("person", true);
    if (person) {
        let leftArm = person.getObjectByName("leftUpperArm", true);
        let rightArm = person.getObjectByName("rightUpperArm", true);
        if (leftArm) leftArm.rotation.x -= Math.PI / 3; 
        if (rightArm) rightArm.rotation.x -= Math.PI / 3; 
    }
    
    updateCamera();
}
document.addEventListener("keypress", (event) => {
    const key = event.key;
    console.log("key pressed was " + key);
    switch (key) {
        case 'w':
            moveBoatFowardZ();
            break;
        case 's':
            moveBoatBackwardZ();
            break;
        case 'a':
            turnBoatLeft();
            break;
        case 'd':
            turnBoatRight();
            break;
        case "q":
            ah.visible = !ah.visible;
            render();
            break;
        default:
            break;
    }
});
