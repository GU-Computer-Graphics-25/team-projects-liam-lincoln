// Precision qualifier
precision highp float;
precision highp int;

// <<< Varyings passed from Vertex Shader >>>
in vec2 vUv;  // Original UV Map (UV0) - Used for EDGE EFFECTS ONLY
in vec2 vUv2; // <<< NEW: Second UV Map (UV1) - Used for MAIN PATTERNS >>>

// <<< Uniforms expected from JavaScript >>>
uniform vec2 resolution; // Viewport resolution (width, height)
uniform float time;      // Time elapsed
uniform float patternScale; // Overall scale factor for noise patterns <<< NOTE: Effect largely removed >>>
uniform float timeScale;    // Overall speed factor for animation
// <<< NOTE: uAlpha uniform was removed in the provided base version, keeping it removed >>>

// <<< Output Variable Declaration >>>
// Output color (implicitly vec4 pc_fragColor in Three.js r152+)
// If using older Three.js or a different framework, declare: out vec4 pc_fragColor;

#define PI 3.14159265359

// --- Simplex Noise 3D --- <<< Reverted to 3D Simplex Noise >>>
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; } // Keep vec4 version for permute
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
// --- End Simplex Noise 3D ---

// --- Worley Noise 3D (Voronoi) ---
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
mat2 rotate2d(float angle) { return mat2(cos(angle), -sin(angle), sin(angle), cos(angle)); }

// Helper: Calculate Advection Current Vector (using snoise3D)
vec2 calculate_main_current(vec2 st, float time_in, float freq, float strength) {
    vec3 currentNoiseCoord = vec3(st * freq, time_in); // Using vec3
    float currentX = snoise(currentNoiseCoord + vec3(1.0, 2.0, 3.0));
    float currentY = snoise(currentNoiseCoord + vec3(5.2, 1.3, -9.4)); // Offset 3rd dim seed
    return vec2(currentX, currentY) * strength;
}

// Helper: Calculate Advection Current Vector for Foam (using snoise3D)
vec2 calculate_foam_current(vec2 st, float time_in, float freq, float strength) {
    vec3 currentNoiseCoord = vec3(st * freq + vec2(10.0, -5.0), time_in); // Using vec3
    float currentX = snoise(currentNoiseCoord + vec3(-7.1, 8.5, 12.3));
    float currentY = snoise(currentNoiseCoord + vec3(3.9, -11.6, -1.7));
    return vec2(currentX, currentY) * strength;
}

// Helper: Calculate line intensity based on noise value crossing a threshold
float calculate_line_intensity(float noiseValue01, float threshold, float sharpness) {
    float fw = fwidth(noiseValue01) * sharpness;
    float intensity = 1.0 - smoothstep(threshold - fw, threshold + fw, noiseValue01);
    return clamp(intensity, 0.0, 1.0);
}

// Helper: Calculate intensity for a band between two thresholds
float calculate_band_intensity(float noiseValue01, float bandStart, float bandEnd, float sharpness) {
    float fw = fwidth(noiseValue01) * sharpness;
    float rampUp = smoothstep(bandStart - fw, bandStart + fw, noiseValue01);
    float rampDown = smoothstep(bandEnd - fw, bandEnd + fw, noiseValue01);
    return clamp(rampUp - rampDown, 0.0, 1.0);
}

// Helper: Calculate Flow Streaks Intensity (using snoise3D)
float calculate_streaks(vec2 sampling_st, vec2 currentVec, float time_in, float freq, float sharpThresh, float strength) {
    if (strength <= 0.0) return 0.0;
    float intensity = 0.0;
    float currentSpeed = length(currentVec);
    if (currentSpeed > 0.005) {
        float currentAngle = atan(currentVec.y, currentVec.x);
        vec2 streak_st = rotate2d(-currentAngle) * sampling_st;
        vec3 streakNoiseCoord = vec3(streak_st * freq, time_in); // Using vec3
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

    // --- Parameters --- [Only dark line noise coord calculation changed] ---
    // Colors
    vec3 colorBackground = vec3(0.15, 0.45, 0.80);
    vec3 colorDarkLine   = vec3(0.10, 0.375, 0.725);
    vec3 colorFoamLine   = vec3(0.95, 0.98, 1.00);
    vec3 colorStaticGlow = vec3(1.0, 1.0, 1.0);

    // Timing & Animation
    float masterTimeFactor = 0.35;
    float masterTime = time * masterTimeFactor * timeScale;

    // Currents
    float mainCurrentFrequency = 1.4;
    float mainCurrentSpeed = 0.15;
    float mainCurrentStrength = 0.025;

    // Foam Currents
    float foamCurrentFrequency = 0.22;
    float foamCurrentSpeed = 0.12;
    float foamCurrentStrength = 0.002;

    // Dark Lines
    float darkWaveFrequency = 12.0;
    float waveSpeedDark = 0.1;
    float darkLineThreshold = 0.5;
    float darkLineSharpness = 1.5;

    // Foam Band (Simplex Noise Waves)
    float foamBandFrequency = 33.0;
    float waveSpeedFoam = 0.154;
    float foamBandStart = 0.589;
    float foamBandEnd = 0.591;
    float foamBandSharpness = 5.0;
    float foamBandOpacity = 0.75;
    float foamBandDistortionFreq = 60.0;
    float foamBandDistortionStrength = 0.00025;

    // Breakup Mask (ONLY for Dark Lines now)
    float breakupNoiseFreq = 7.2;
    float breakupNoiseSpeed = 0.4;
    float breakupStrength = 1.0;
    float breakupThreshold = 0.60;
    float breakupSmoothness = 0.05;

    // Independent Mask for Foam Band
    float foamMaskFreq = 40.0;
    float foamMaskThreshold = 0.55;
    float foamMaskSmoothness = 0.1;
    float foamMaskSpeed = 0.3;

    // Dark Line Appearance
    float darkLineOpacity = 0.6;

    // Flow Streaks (Disabled)
    float streakStrength = 0.0;

    // Static Edge Glow
    float staticGlowAlpha = 0.5;
    float staticGlowDistance = 0.25;
    float staticGlowSharpness = 0.6;
    float staticGlowDarkBoost = 1.35;

    // Dynamic Edge Lapping Waves
    float lapWaveSpeed = 0.8;
    float lapWavePeakSharpness = 8.0;
    float lapWaveRadialFreq = 30.0;
    float lapWaveIntensityMultiplier = 1.0;
    float lapWaveDistortionFreq = 3.6;
    float lapWaveDistortionStrength = 0.09;
    float edgeWaveFadeDistance = 0.08;

    // Radial Wave Effect
    float radialWaveCenterX = 0.8;
    float radialWaveCenterY = 0.5;
    float radialWaveSpokeCount = 30.0;
    float radialWaveFreq = 0.1;
    float radialWaveSpeed = 0.3;
    float radialWaveRotationSpeed = 0.05;
    float radialWaveSharpness = 140.0;
    float radialWaveIntensity = 0.6;
    float radialWaveDistortionFreq = 18.75;
    float radialWaveDistortionStrength = 0.06;
    float radialWaveMaskFreq = 108.0;
    float radialWaveMaskSpeed = 0.1;
    float radialWaveMaskThreshold = 0.55;
    float radialWaveMaskSmoothness = 0.15;
    float radialWaveMask2Freq = 32.4;
    float radialWaveMask2Threshold = 0.5;
    float radialWaveMask2Smoothness = 0.1;
    float radialWaveMask2Speed = 0.08;


    // --- Calculations ---

    // 1. Calculate Distance to Edge
    float distToEdge = min(min(st_orig.x, 1.0 - st_orig.x), min(st_orig.y, 1.0 - st_orig.y));
    distToEdge = max(distToEdge, 0.0001);

    // 2. Calculate Edge Distortion Vector (using snoise3D)
    vec3 lapDistortNoiseCoord = vec3(st_orig * lapWaveDistortionFreq, masterTime * 0.2); // Using vec3
    vec2 edgeDistortion = vec2(
        snoise(lapDistortNoiseCoord),
        snoise(lapDistortNoiseCoord + vec3(17.8, -5.3, 29.1))
    ) * lapWaveDistortionStrength;

    // 3. Calculate Advection Currents (using snoise3D)
    vec2 mainCurrentVector = calculate_main_current(st, masterTime * mainCurrentSpeed, mainCurrentFrequency, mainCurrentStrength);
    vec2 foamCurrentVector = calculate_foam_current(st, masterTime * foamCurrentSpeed, foamCurrentFrequency, foamCurrentStrength);

    // 4. Determine Final Sampling Coords
    vec2 dark_final_st = st + mainCurrentVector;
    vec2 foam_final_st = st + foamCurrentVector;

    // 5. Calculate Breakup Mask (ONLY for Dark Lines now) (using snoise3D)
    vec3 breakNoiseCoord = vec3(st * breakupNoiseFreq, masterTime * breakupNoiseSpeed); // Using vec3
    float breakupMaskNoise = snoise(breakNoiseCoord);
    float breakupMask = smoothstep(
        breakupThreshold - breakupSmoothness * 0.5,
        breakupThreshold + breakupSmoothness * 0.5,
        breakupMaskNoise * 0.5 + 0.5
    );
    float lineVisibilityMask = 1.0 - breakupMask * breakupStrength;

    // Calculate Independent Foam Mask (using snoise3D)
    vec3 foamMaskCoord = vec3(st * foamMaskFreq + vec2(11.1, -22.2), masterTime * foamMaskSpeed); // Using vec3 & offset
    float foamMaskNoise = snoise(foamMaskCoord);
    float foamMask = smoothstep( // Inverted mask: 1.0 = visible, 0.0 = masked
        foamMaskThreshold + foamMaskSmoothness,
        foamMaskThreshold - foamMaskSmoothness,
        foamMaskNoise * 0.5 + 0.5
    );


    // --- Dark Lines (Simplex based) --- (using snoise3D)
    // <<< MODIFIED: Apply anisotropic scaling to counter stretching >>>
    vec2 scaled_dark_st = dark_final_st * darkWaveFrequency; // Base scaling
    scaled_dark_st.y *= 1.3; // Increase frequency only on Y-axis by 1.3x
    vec3 darkNoiseCoord = vec3(scaled_dark_st, masterTime * waveSpeedDark); // Use scaled coords

    float darkNoiseValue = snoise(darkNoiseCoord);
    float darkNoiseValue01 = darkNoiseValue * 0.5 + 0.5;
    float darkLineIntensity = calculate_line_intensity(darkNoiseValue01, darkLineThreshold, darkLineSharpness);
    darkLineIntensity *= darkLineOpacity;
    darkLineIntensity *= lineVisibilityMask; // Apply breakup mask


    // --- Foam Band (Simplex based) --- (using snoise3D)
    vec3 foamDistortionCoord1 = vec3(foam_final_st * foamBandDistortionFreq, masterTime * 0.5);
    vec3 foamDistortionCoord2 = vec3(foam_final_st * foamBandDistortionFreq + vec2(42.7), masterTime * 0.5 + 30.0);
    vec2 foamDistortionOffset = vec2(
        snoise(foamDistortionCoord1),
        snoise(foamDistortionCoord2)
    ) * foamBandDistortionStrength;
    vec3 foamSimplexCoord = vec3((foam_final_st + foamDistortionOffset) * foamBandFrequency, masterTime * waveSpeedFoam);
    float foamSimplexValue = snoise(foamSimplexCoord);
    float foamSimplexValue01 = foamSimplexValue * 0.5 + 0.5;
    float foamIntensity_base = calculate_band_intensity(foamSimplexValue01, foamBandStart, foamBandEnd, foamBandSharpness);
    float foamIntensity_masked = foamIntensity_base * foamMask * foamBandOpacity; // Apply independent foamMask


    // --- Streaks (Disabled) ---
    float streakIntensity = 0.0;


    // --- Static Edge Glow ---
    float staticGlowFactor = smoothstep(staticGlowDistance, 0.0, distToEdge);
    staticGlowFactor *= pow(staticGlowFactor, staticGlowSharpness);


    // --- Dynamic Edge Lapping Waves (Shoreline Foam) ---
    float distortedDistToEdge = distToEdge - dot(edgeDistortion, normalize(st_orig - 0.5)) * 0.5;
    distortedDistToEdge = max(distortedDistToEdge, 0.0001);
    float radialPhase = distortedDistToEdge * lapWaveRadialFreq - masterTime * lapWaveSpeed;
    float waveValue = sin(radialPhase * PI * 2.0) * 0.5 + 0.5;
    float sharpWave = pow(waveValue, lapWavePeakSharpness);
    float lapLineIntensity_base = sharpWave * lapWaveIntensityMultiplier;
    lapLineIntensity_base *= smoothstep(edgeWaveFadeDistance, 0.0, distortedDistToEdge);
    float lapLineIntensity_final = clamp(lapLineIntensity_base, 0.0, 1.0);


    // --- Radial Wave Effect --- (using snoise3D)
    vec2 center = vec2(radialWaveCenterX, radialWaveCenterY);
    vec2 dir = st - center;
    float distFromCenter = length(dir);
    float angle = atan(dir.y, dir.x);
    angle += masterTime * radialWaveRotationSpeed;
    vec3 radialDistortCoord = vec3(st * radialWaveDistortionFreq, masterTime * 0.8);
    float angleDistortion = snoise(radialDistortCoord) * radialWaveDistortionStrength;
    angle += angleDistortion;
    float radialWavePattern = sin(angle * radialWaveSpokeCount + distFromCenter * radialWaveFreq - masterTime * radialWaveSpeed) * 0.5 + 0.5;
    float radialWaveLines = pow(radialWavePattern, radialWaveSharpness);
    vec3 radialMaskCoord = vec3(st * radialWaveMaskFreq, masterTime * radialWaveMaskSpeed);
    float radialMaskNoise = snoise(radialMaskCoord);
    float radialMask = smoothstep(radialWaveMaskThreshold, radialWaveMaskThreshold + radialWaveMaskSmoothness, radialMaskNoise * 0.5 + 0.5);
    vec3 radialMask2Coord = vec3(st * radialWaveMask2Freq + vec2(5.5, -1.2), masterTime * radialWaveMask2Speed);
    float radialMask2Noise = snoise(radialMask2Coord);
    float radialMask2 = smoothstep(radialWaveMask2Threshold, radialWaveMask2Threshold + radialWaveMask2Smoothness, radialMask2Noise * 0.5 + 0.5);
    float radialWaveIntensity_final = radialWaveLines * radialWaveIntensity * radialMask * radialMask2;
    radialWaveIntensity_final = clamp(radialWaveIntensity_final, 0.0, 1.0);


    // --- Final Compositing ---
    vec3 baseColor = mix(colorBackground, colorDarkLine, clamp(darkLineIntensity, 0.0, 1.0));
    float glowBoost = mix(1.0, staticGlowDarkBoost, clamp(darkLineIntensity, 0.0, 1.0));
    vec3 colorWithGlow = baseColor + colorStaticGlow * staticGlowFactor * staticGlowAlpha * glowBoost;
    float totalFoamIntensity = clamp(foamIntensity_masked + lapLineIntensity_final + radialWaveIntensity_final, 0.0, 1.0);
    vec3 finalColor = mix(colorWithGlow, colorFoamLine, totalFoamIntensity);
    finalColor = clamp(finalColor, 0.0, 1.0);

    // --- Output ---
    gl_FragColor = vec4(finalColor, 1.0); // Use alpha 1.0
}