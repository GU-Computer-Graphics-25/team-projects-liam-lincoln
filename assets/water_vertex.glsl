// Varyings to pass to Fragment Shader
varying vec2 vUv;  // Original UV Map (from 'uv' attribute)
varying vec2 vUv2; // <<< Still passing as vUv2, but reading from 'uv1' attribute >>>

// Attributes from Geometry
attribute vec2 uv1; // <<< CHANGED: Expect 'uv1' attribute from BufferGeometry >>>

void main() {
  // Pass original UV map
  vUv = uv;

  // <<< CHANGED: Pass second UV map (read from uv1) as vUv2 >>>
  vUv2 = uv1;

  // Standard position calculation
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}