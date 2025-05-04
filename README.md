# Interactive 3D River Scene

A dynamic 3D scene featuring an interactive river environment with a rowing boat, animated water, and realistic terrain.

## Live Demo
[View the Live Demo](https://gu-computer-graphics-25.github.io/team-projects-liam-lincoln/)

## Implemented Features

### Material, Lighting, and Shading
- Custom water shader with dynamic patterns
- Ambient and directional lighting system
- Proper material properties for all scene elements
- Sky box environment and Z buffer fog

### Camera System
- Overhead view: Provides top-down perspective
- Third-person view: Dynamic camera positioning
- Automatic camera adjustments based on boat movement

### Textures and Texture Mapping
- Dynamic shader-based water textures
- Imported terrain textures from Blender
- Proper UV mapping implementation
- Procedural texture generation for water effects
- texture mapped wood jpg texture onto boat object

### User Interaction
- WASD/Arrow key controls for boat navigation
- Realistic movement
- Collision detection system
- GUI controls for:
  - Camera view selection
- Responsive input handling

### Animation System
- Speed-synchronized rowing arm animations
- Dynamic water surface movement
- Smooth boat motion
- Frame-rate independent animations

### Modeling
- Procedurally generated models:
  - Water surface
- Basic THREE.js models:
  - trees
  - Boat structure
  - Character model
- Imported Blender models:
  - Terrain mesh
  - Water mesh
- Proper scaling and positioning
- Optimized model loading and rendering (GPU mesh instance)

## Technical Implementation

The project is built using:
- Three.js for 3D rendering
- GLTFLoader for model loading
- Custom shaders for water animation
- dat.GUI for interface controls
- Vite for development and building

## Resources

- [Three.js Documentation](https://threejs.org/docs/)
- [GLTFLoader Documentation](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- [dat.GUI Documentation](https://github.com/dataarts/dat.gui)
- [Vite Documentation](https://vitejs.dev/)

