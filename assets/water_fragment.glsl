// Precision qualifier
precision highp float;
precision highp int;

// <<< Varyings passed from Vertex Shader >>>
in vec2 vUv;  // Original UV Map (UV0) - Used for EDGE EFFECTS ONLY
in vec2 vUv2; // <<< NEW: Second UV Map (UV1) - Used for MAIN PATTERNS >>>

// <<< Uniforms expected from JavaScript >>>
uniform vec2 resolution; // Viewport resolution (width, height)
uniform float time;       // Time elapsed
uniform float patternScale; // Overall scale factor for noise patterns
uniform float timeScale;    // Overall speed factor for animation
// <<< NOTE: uAlpha uniform was removed in the provided base version, keeping it removed >>>

// <<< Output Variable Declaration >>>
// Output color (implicitly vec4 pc_fragColor in Three.js r152+)
// If using older Three.js or a different framework, declare: out vec4 pc_fragColor;

#define PI 3.14159265359

// --- Simplex Noise 3D ---
// Standard [-1, 1] output range
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0) ; const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy) ); vec3 x0 =   v - i + dot(i, C.xxx) ;
    vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min( g.xyz, l.zxy ); vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute( permute( permute( i.z + vec4(0.0, i1.z, i2.z, 1.0 )) + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ *ns.x + ns.yyyy; vec4 y = y_ *ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy ); vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0; vec4 s1 = floor(b1)*2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ; vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x); vec3 p1 = vec3(a0.zw,h.y); vec3 p2 = vec3(a1.xy,h.z); vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.51 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0); m = m * m;
    return 105.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}
// --- End Simplex Noise Functions ---

// --- Worley Noise 3D (Voronoi) ---
// (Standard implementation - unchanged, kept for potential future use)
vec3 hash3( vec3 p ) {
    p = vec3( dot(p,vec3(127.1,311.7, 74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
    return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}
vec2 worley( vec3 p ) {
    vec2 d = vec2( 1e10, 1e10 ); vec3 ip = floor(p);
    for( int k=-1; k<=1; k++ ) for( int j=-1; j<=1; j++ ) for( int i=-1; i<=1; i++ ) {
        vec3 dp = vec3(float(i),float(j),float(k)); vec3 cp = ip + dp; vec3 op = hash3( cp );
        vec3 fp_pos = dp + 0.5 + 0.5*op; vec3 diff = fp_pos - fract(p); float dist_sq = dot(diff, diff);
        if( dist_sq < d.x ) { d.y = d.x; d.x = dist_sq; } else if( dist_sq < d.y ) { d.y = dist_sq; }
    } return sqrt(d);
}
// --- End Worley Noise ---

// Helper to rotate coordinates
mat2 rotate2d(float angle) {
    return mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
}

// Helper: Calculate Advection Current Vector (using snoise)
// Uses aspect-corrected UV coordinates 'st' (derived from vUv2)
vec2 calculate_main_current(vec2 st, float time_in, float freq, float strength) {
    // Apply patternScale here to the base coordinate before frequency multiplier
    vec3 currentNoiseCoord = vec3(st * patternScale * freq, time_in);
    float currentX = snoise(currentNoiseCoord + vec3(1.0, 2.0, 3.0));
    float currentY = snoise(currentNoiseCoord + vec3(5.2, 1.3, -9.4));
    return vec2(currentX, currentY) * strength;
}

// Helper: Calculate Advection Current Vector for Foam
// Uses aspect-corrected UV coordinates 'st' (derived from vUv2)
vec2 calculate_foam_current(vec2 st, float time_in, float freq, float strength) {
    // Apply patternScale here to the base coordinate before frequency multiplier
    vec3 currentNoiseCoord = vec3(st * patternScale * freq + vec2(10.0, -5.0), time_in);
    float currentX = snoise(currentNoiseCoord + vec3(-7.1, 8.5, 12.3));
    float currentY = snoise(currentNoiseCoord + vec3(3.9, -11.6, -1.7));
    return vec2(currentX, currentY) * strength;
}


// Helper: Calculate line intensity based on noise value crossing a threshold
// Expects noiseValue in [0, 1] range
float calculate_line_intensity(float noiseValue01, float threshold, float sharpness) {
    float fw = fwidth(noiseValue01) * sharpness;
    float intensity = 1.0 - smoothstep(threshold - fw, threshold + fw, noiseValue01);
    return clamp(intensity, 0.0, 1.0);
}

// Helper: Calculate intensity for a band between two thresholds
// Expects noiseValue in [0, 1] range
float calculate_band_intensity(float noiseValue01, float bandStart, float bandEnd, float sharpness) {
    float fw = fwidth(noiseValue01) * sharpness;
    float rampUp = smoothstep(bandStart - fw, bandStart + fw, noiseValue01);
    float rampDown = smoothstep(bandEnd - fw, bandEnd + fw, noiseValue01);
    return clamp(rampUp - rampDown, 0.0, 1.0);
}


// Helper: Calculate Flow Streaks Intensity (using snoise)
// NOTE: Streaks still disabled via strength parameter
float calculate_streaks(vec2 sampling_st, vec2 currentVec, float time_in, float freq, float sharpThresh, float strength) {
    if (strength <= 0.0) return 0.0;
    float intensity = 0.0;
    float currentSpeed = length(currentVec);
    if (currentSpeed > 0.005) {
        float currentAngle = atan(currentVec.y, currentVec.x);
        vec2 streak_st = rotate2d(-currentAngle) * sampling_st;
        // Apply patternScale here if streaks were enabled
        vec3 streakNoiseCoord = vec3(streak_st * patternScale * freq, time_in);
        float streakNoise = snoise(streakNoiseCoord) * 0.5 + 0.5;
        intensity = smoothstep(sharpThresh - 0.04, sharpThresh + 0.04, streakNoise);
        intensity *= strength;
    }
    return clamp(intensity, 0.0, 1.0);
}


// --- Main Shader ---
void main() {
    // Original UV coordinates (0 to 1 range) - Used for EDGE effects
    vec2 st_orig = vUv;
    // Aspect-corrected UV coordinates from SECOND map for main pattern calculations
    vec2 st = vUv2 * vec2(resolution.x / resolution.y, 1.0); // <<< USING vUv2

    // --- Parameters --- [Adjusted] ---
    // Colors
    vec3 colorBackground = vec3(0.15, 0.45, 0.80);
    vec3 colorDarkLine   = vec3(0.12, 0.42, 0.75); // Lighter dark line color
    vec3 colorFoamLine   = vec3(0.95, 0.98, 1.00);
    vec3 colorStaticGlow = vec3(1.0, 1.0, 1.0); // Static glow color (white)

    // Timing & Animation
    float masterTimeFactor = 0.35;
    float masterTime = time * masterTimeFactor * timeScale;

    // Currents - Calculated using UV coords 'st' (from vUv2)
    float mainCurrentFrequency = 2.8;
    float mainCurrentSpeed = 0.15;
    float mainCurrentStrength = 0.025; // Keep main distortion reduced

    // Foam Currents - Calculated using UV coords 'st' (from vUv2)
    float foamCurrentFrequency = 2.2;
    float foamCurrentSpeed = 0.12;
    float foamCurrentStrength = 0.002; // Keep foam distortion minimal

    // Dark Lines - Sampled using UV coords 'st' (from vUv2)
    float darkWaveFrequency = 8.0; // Keep smaller scale
    float waveSpeedDark = 0.28;
    float darkLineThreshold = 0.5;
    float darkLineSharpness = 1.5;

    // Foam Band - Sampled using UV coords 'st' (from vUv2)
    float foamBandFrequency = 12.0; // Keep smaller scale
    float waveSpeedFoam = 0.22;
    float foamBandStart = 0.58;      // Keep band less visible
    float foamBandEnd = 0.59;        // Keep band less visible -> Width = 0.01
    float foamBandSharpness = 5.0;   // Keep sharp band edges

    // Breakup Mask - Calculated using UV coords 'st' (from vUv2)
    float breakupNoiseFreq = 1.5; // Keep larger blobs
    float breakupNoiseSpeed = 0.15;
    float breakupStrength = 1.0;
    float breakupThreshold = 0.65; // Keep blob mask threshold
    float breakupSmoothness = 0.05; // Keep softer blob edges

    // Dark Line Appearance
    float darkLineOpacity = 0.90;

    // Flow Streaks (Disabled)
    float streakStrength = 0.0;   // <<< STREAKS DISABLED

    // Static Edge Glow - Uses ORIGINAL UVs 'st_orig'
    float staticGlowAlpha = 0.5;
    float staticGlowDistance = 0.25; // <<< INCREASED distance (was 0.20)
    float staticGlowSharpness = 0.8;
    float staticGlowDarkBoost = 1.8;

    // Dynamic Edge Lapping Waves (Shoreline Foam) - Uses ORIGINAL UVs 'st_orig' (from vUv)
    float lapWaveSpeed = 0.8;
    float lapWavePeakSharpness = 8.0;
    float lapWaveRadialFreq = 30.0;
    float lapWaveIntensityMultiplier = 1.0;
    float lapWaveDistortionFreq = 15.0; // <<< INCREASED distortion frequency (was 12.0)
    float lapWaveDistortionStrength = 0.10; // <<< DECREASED distortion strength (was 0.18)
    float edgeWaveFadeDistance = 0.08;


    // Radial Wave Effect - Uses SECOND UV Coords 'st' (from vUv2)
    float radialWaveSpokeCount = 60.0; // <<< INCREASED spoke count (was 30.0)
    float radialWaveFreq = 8.0;
    float radialWaveSpeed = 0.3;
    float radialWaveRotationSpeed = 0.05;
    float radialWaveSharpness = 35.0; // <<< INCREASED sharpness for thinner lines (was 25.0)
    float radialWaveIntensity = 0.6;
    float radialWaveDistortionFreq = 25.0;
    float radialWaveDistortionStrength = 0.08; // Keep decreased distortion strength
    float radialWaveMaskFreq = 1.8;
    float radialWaveMaskSpeed = 0.1;
    float radialWaveMaskThreshold = 0.55;
    float radialWaveMaskSmoothness = 0.05;
    // Removed fade distance parameters for radial waves


    // --- Calculations ---

    // 1. Calculate Distance to Edge (Uses ORIGINAL UVs: st_orig)
    float distToEdge = min(min(st_orig.x, 1.0 - st_orig.x), min(st_orig.y, 1.0 - st_orig.y));
    distToEdge = max(distToEdge, 0.0001);

    // 2. Calculate Edge Distortion Vector (Uses ORIGINAL UVs: st_orig)
    // Apply patternScale here
    vec3 lapDistortNoiseCoord = vec3(st_orig * patternScale * lapWaveDistortionFreq, masterTime * 0.2); // Uses increased freq
    vec2 edgeDistortion = vec2(
        snoise(lapDistortNoiseCoord),
        snoise(lapDistortNoiseCoord + vec3(17.8, -5.3, 29.1))
    ) * lapWaveDistortionStrength; // <<< Uses decreased strength

    // 3. Calculate Advection Currents SEPARATELY (Uses SECOND UV Coords: st from vUv2)
    vec2 mainCurrentVector = calculate_main_current(st, masterTime * mainCurrentSpeed, mainCurrentFrequency, mainCurrentStrength);
    vec2 foamCurrentVector = calculate_foam_current(st, masterTime * foamCurrentSpeed, foamCurrentFrequency, foamCurrentStrength);

    // 4. Determine Final Sampling Coords (Based on SECOND UV Coords + Advection)
    vec2 dark_final_st = st + mainCurrentVector;
    vec2 foam_final_st = st + foamCurrentVector;

    // 5. Calculate Breakup Mask (Based on SECOND UV Coords: st from vUv2)
    // Apply patternScale and frequency multiplier here
    vec3 breakNoiseCoord = vec3(st * patternScale * breakupNoiseFreq, masterTime * breakupNoiseSpeed); // Uses decreased frequency for blobs
    float breakupMaskNoise = snoise(breakNoiseCoord) * 0.5 + 0.5; // Map snoise [-1,1] to [0,1]
    float breakupMask = smoothstep(
        breakupThreshold - breakupSmoothness * 0.5, // <<< Adjusted threshold/smoothness
        breakupThreshold + breakupSmoothness * 0.5,
        breakupMaskNoise
    );
    float lineVisibilityMask = 1.0 - breakupMask * breakupStrength;


    // --- Dark Lines (Simplex based) --- (Uses SECOND UV Coords: dark_final_st from vUv2)
    // Apply patternScale and frequency multiplier here
    vec3 darkNoiseCoord = vec3(dark_final_st * patternScale * darkWaveFrequency, masterTime * waveSpeedDark); // Uses smaller scale freq
    float darkNoiseValue = snoise(darkNoiseCoord); // Output is [-1, 1]
    float darkNoiseValue01 = darkNoiseValue * 0.5 + 0.5; // Map to [0, 1]
    float darkLineIntensity = calculate_line_intensity(darkNoiseValue01, darkLineThreshold, darkLineSharpness);
    darkLineIntensity *= darkLineOpacity;
    darkLineIntensity *= lineVisibilityMask; // Apply mask


    // --- Foam Band (Simplex based) --- (Uses SECOND UV Coords: foam_final_st from vUv2)
    // Apply patternScale and frequency multiplier here
    vec3 foamSimplexCoord = vec3(foam_final_st * patternScale * foamBandFrequency, masterTime * waveSpeedFoam); // Uses smaller scale freq
    float foamSimplexValue = snoise(foamSimplexCoord); // Output is [-1, 1]
    float foamSimplexValue01 = foamSimplexValue * 0.5 + 0.5; // Map to [0, 1]
    float foamIntensity_base = calculate_band_intensity(foamSimplexValue01, foamBandStart, foamBandEnd, foamBandSharpness); // <<< Adjusted band values for less visibility
    float foamIntensity_masked = foamIntensity_base * lineVisibilityMask; // Apply mask


    // --- Streaks (Disabled) ---
    float streakIntensity = 0.0; // Hardcoded 0


    // --- Static Edge Glow --- (Uses ORIGINAL UVs: st_orig, distToEdge)
    float staticGlowFactor = smoothstep(staticGlowDistance, 0.0, distToEdge); // Fade from edge (uses increased distance)
    staticGlowFactor *= pow(staticGlowFactor, staticGlowSharpness); // Adjust fade curve


    // --- Dynamic Edge Lapping Waves (Shoreline Foam) --- (Uses ORIGINAL UVs: st_orig, distToEdge)
    // <<< Using Sharpened Sine Wave + Distance Fade Approach >>>
    // Distort the distance slightly using the UV-based edge distortion
    float distortedDistToEdge = distToEdge - dot(edgeDistortion, normalize(st_orig - 0.5)) * 0.5; // <<< Apply adjusted distortion
    distortedDistToEdge = max(distortedDistToEdge, 0.0001);

    float radialPhase = distortedDistToEdge * lapWaveRadialFreq - masterTime * lapWaveSpeed; // Calculate phase with distorted dist & decreased freq

    // Calculate sine wave and map to [0, 1]
    float waveValue = sin(radialPhase * PI * 2.0) * 0.5 + 0.5;

    // Sharpen the peaks using pow() - higher power means thinner lines
    float sharpWave = pow(waveValue, lapWavePeakSharpness); // <<< Adjusted sharpness

    // Apply intensity multiplier for brightness
    float lapLineIntensity_base = sharpWave * lapWaveIntensityMultiplier; // <<< Adjusted brightness boost

    // Apply distance fade (allow extending slightly further)
    lapLineIntensity_base *= smoothstep(edgeWaveFadeDistance, 0.0, distortedDistToEdge); // <<< Increased fade distance

    // <<< DO NOT APPLY MASK HERE >>>
    float lapLineIntensity_final = clamp(lapLineIntensity_base, 0.0, 1.0); // Clamp final edge wave intensity


    // --- Radial Wave Effect --- (Uses SECOND UV Coords: st from vUv2)
    vec2 center = vec2(0.7, 0.5); // <<< Adjusted center point (was 0.5, 0.5)
    vec2 dir = st - center;
    float distFromCenter = length(dir);
    float angle = atan(dir.y, dir.x);

    // Add slow rotation
    angle += masterTime * radialWaveRotationSpeed;

    // Add high-frequency distortion to angle
    vec3 radialDistortCoord = vec3(st * patternScale * radialWaveDistortionFreq, masterTime * 0.8);
    float angleDistortion = snoise(radialDistortCoord) * radialWaveDistortionStrength; // <<< Uses decreased strength
    angle += angleDistortion;

    // Calculate base radial wave pattern (sine wave based on angle and distance/time)
    float radialWavePattern = sin(angle * radialWaveSpokeCount + distFromCenter * radialWaveFreq - masterTime * radialWaveSpeed) * 0.5 + 0.5; // <<< Uses increased spoke count

    // Sharpen into thin lines
    float radialWaveLines = pow(radialWavePattern, radialWaveSharpness); // <<< Uses increased sharpness

    // Create mask for radial waves
    vec3 radialMaskCoord = vec3(st * patternScale * radialWaveMaskFreq, masterTime * radialWaveMaskSpeed);
    float radialMaskNoise = snoise(radialMaskCoord) * 0.5 + 0.5;
    float radialMask = smoothstep(radialWaveMaskThreshold, radialWaveMaskThreshold + radialWaveMaskSmoothness, radialMaskNoise);

    // Calculate final radial wave intensity (apply intensity, mask) <<< REMOVED DISTANCE FADE
    float radialWaveIntensity_final = radialWaveLines * radialWaveIntensity * radialMask;
    // radialWaveIntensity_final *= smoothstep(radialWaveFadeEndDist, radialWaveFadeStartDist, distFromCenter); // Fade removed
    radialWaveIntensity_final = clamp(radialWaveIntensity_final, 0.0, 1.0);


    // --- Final Compositing ---
    vec3 baseColor = mix(colorBackground, colorDarkLine, clamp(darkLineIntensity, 0.0, 1.0));

    // Apply static glow additively, boosting effect over dark lines
    float glowBoost = mix(1.0, staticGlowDarkBoost, clamp(darkLineIntensity, 0.0, 1.0)); // Boost based on dark line presence
    vec3 colorWithGlow = baseColor + colorStaticGlow * staticGlowFactor * staticGlowAlpha * glowBoost; // <<< Increased alpha & boost & distance

    // Combine all foam intensities (masked band + unmasked edge wave + masked radial wave)
    float totalFoamIntensity = clamp(foamIntensity_masked + lapLineIntensity_final + radialWaveIntensity_final, 0.0, 1.0);

    // Mix foam color onto the glowed base color
    vec3 finalColor = mix(colorWithGlow, colorFoamLine, totalFoamIntensity);

    // Clamp final RGB
    finalColor = clamp(finalColor, 0.0, 1.0);

    // --- Output ---
    gl_FragColor = vec4(finalColor, 1.0); // Use alpha 1.0
}
