// Precision qualifier (Three.js might also provide defaults)
precision highp float;
precision highp int;

// <<< Varyings passed from Vertex Shader >>>
in vec2 vUv; // Receives UV coordinates

// <<< Uniforms expected from JavaScript >>>
uniform vec2 resolution;
uniform float time;
uniform float patternScale;
uniform float timeScale;

// <<< Output Variable Declaration >>>
// REMOVED explicit 'out' declaration for pc_fragColor - Use the one Three.js provides implicitly.

#define PI 3.14159265359

// --- Simplex Noise 3D ---
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
    float res = dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    return 105.0 * res;
}
// --- End Simplex Noise Functions ---

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
mat2 rotate2d(float angle) {
    return mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
}

// Helper: Calculate Advection Current Vector (using snoise)
vec2 calculate_current(vec2 st, float time_in, float freq, float strength) {
    vec3 currentNoiseCoord = vec3(st * freq * patternScale, time_in);
    float currentX = snoise(currentNoiseCoord);
    float currentY = snoise(currentNoiseCoord + vec3(5.2, 1.3, -9.4));
    return vec2(currentX, currentY) * strength;
}

// Updated Helper: Calculate line intensity (Outline) - Considers current speed
float calculate_line_intensity(float mappedNValue, float threshold, float sharpness, float fallbackThickness, vec2 currentVec, float maxCurrentStrength, float speedBoostScale) {
    float intensity = 0.0;
    float fw = fwidth(mappedNValue) * sharpness;
    intensity = 1.0 - smoothstep(0.0, fw * 1.5, abs(mappedNValue - threshold));
    intensity = clamp(intensity, 0.0, 1.0);
    float currentSpeedMag = length(currentVec);
    float speedFactor = smoothstep(maxCurrentStrength * 0.25, maxCurrentStrength * 0.75, currentSpeedMag);
    intensity *= (1.0 + speedFactor * speedBoostScale);
    return clamp(intensity, 0.0, 1.0);
}

// Helper: Calculate Flow Streaks Intensity (using snoise)
float calculate_streaks(vec2 sampling_st, vec2 currentVec, float time_in, float freq, float sharpThresh, float strength) {
    float intensity = 0.0;
    if (length(currentVec) > 0.005) {
        float currentAngle = atan(currentVec.y, currentVec.x);
        vec2 streak_st = rotate2d(-currentAngle) * sampling_st;
        float scaled_freq = freq * patternScale;
        vec3 streakNoiseCoord = vec3(streak_st.x * scaled_freq + time_in, streak_st.y * scaled_freq * 0.15, time_in * 0.4);
        float streakNoise = snoise(streakNoiseCoord) * 0.5 + 0.5;
        intensity = smoothstep(sharpThresh - 0.04, sharpThresh + 0.04, streakNoise);
        intensity *= strength;
    } return intensity;
}

// Helper: Calculate Lapping Wave Band Intensity
float calculate_lap_band_intensity(float lapGradient, float bandStart, float bandWidth, float sharpness) {
    float intensity = 0.0;
    float bandEnd = bandStart + bandWidth;
    float fw = fwidth(lapGradient) * sharpness;
    intensity = smoothstep(bandStart - fw, bandStart + fw, lapGradient) -
                smoothstep(bandEnd - fw, bandEnd + fw, lapGradient);
    return clamp(intensity, 0.0, 1.0);
}


// --- Main Shader ---
void main() {
    vec2 st_orig = vUv;
    vec2 st = st_orig * vec2(resolution.x / resolution.y, 1.0);

    // --- Parameters ---
    vec3 colorBackground = vec3(0.2, 0.5, 0.85);
    vec3 colorDarkLine   = vec3(0.18, 0.48, 0.83);
    vec3 colorFoamLine   = vec3(0.95, 0.98, 1.0);
    vec3 colorStreak     = vec3(0.17, 0.45, 0.80);
    // Timing & Animation
    float masterTimeFactor = 0.30;
    float masterTime = time * masterTimeFactor * timeScale;
    // Directional Straightening Gradient
    vec2 straighteningDirection = normalize(vec2(0.9, 0.4));
    float straighteningSpeed = 0.18;
    float straighteningStrength = 0.055;
    float straighteningFreqMultiplier = 5.5;
    float directionalPulsePower = 4.0;
    // Underlying Currents (Advection)
    float currentFrequency = 3.0;
    float currentSpeed = 0.14;
    float currentStrength = 0.035;
    // Dark Wave Noise Field (Simplex)
    float darkWaveFrequency = 2.5;
    float waveSpeedDark = 0.25;
    // Foam Pattern (Worley F2-F1) - THIN lines
    float foamWorleyFrequency = 5.5;
    float waveSpeedFoam = 0.18;
    float foamLineThicknessWorley = 0.010;
    float foamLineSharpness = 2.8;
    // Line Breaking Noise Mask (Simplex - Spots)
    float breakupNoiseFreq = 3.0;
    float breakupNoiseSpeed = 0.28;
    float breakupStrength = 0.80;
    float breakupSpotThreshold = 0.85;
    float breakupSpotSmoothness = 0.01;
    float breakupCoordInfluence = 1.0;
    // Coordinate Influence Scale for Straightening Gradient on Primary Noise
    float primaryCoordInfluence = 0.05;
    // Dark Line Thresholds & Appearance (Thick, Subtle)
    float darkLineThreshold = 0.45;
    float darkLineSharpness = 0.1;
    float darkLineFallbackThickness = 0.06;
    float darkLineSpeedBoost = 0.05;
    float darkLineOpacity = 0.95;
    // Foam Line Appearance (Worley)
    float foamLineSpeedBoost = 0.45;
    // Line Breaking Influence on Dark Lines
    float darkLineBreakupInfluence = 0.4;
    // Experimental: Flow Streaks
    float streakFrequency = 60.0;
    float streakSpeed = 3.0;
    float streakStrength = 0.15;
    float streakSharpness = 0.78;
    // Static Edge Glow SDF
    float staticGlowFreq = 7.0;
    float staticGlowAmplitude = 0.45;
    float staticGlowFadeDistance = 0.45;
    float staticGlowFaintness = 0.65;
    float staticGlowNoiseFreq = 1.2;
    float staticGlowNoiseSpeed = 0.03;
    float staticGlowNoiseStrength = 1.0;
    // Dynamic Edge Lapping Waves SDF (Using Band Method Again)
    float lapWaveFreq = 13.0;
    float lapWaveSpeed = 0.7;
    float lapWaveDistortionFreq = 6.5;
    float lapWaveDistortionStrength = 0.075;
    float lapBandStart = 0.1;
    float lapBandWidth = 0.20;
    float lapLineSharpness = 1.8;
    float lapClipDistance = 0.08;
    float lapBreakupInfluence = 0.3;
    float lapPhasePerturbStrength = 20.0;
    // Shared Edge Distortion (Influence scaling & Fade)
    float edgeDistortionInfluenceDark = 0.2;
    float edgeDistortionInfluenceFoam = 0.3;
    float edgeDistortionFadeStart = 0.25;
    float edgeDistortionFadeEnd = 0.10;

    // --- Calculations ---

    // 1. Calculate Distance to Edge
    float distToEdge = min(min(st_orig.x, 1.0 - st_orig.x), min(st_orig.y, 1.0 - st_orig.y));

    // 2. Calculate Edge Distortion Vector & Fade
    vec3 lapDistortNoiseCoord = vec3(st_orig * lapWaveDistortionFreq * patternScale, masterTime * 0.15);
    vec2 edgeDistortion = vec2(snoise(lapDistortNoiseCoord), snoise(lapDistortNoiseCoord + 17.8)) * lapWaveDistortionStrength;
    float edgeDistortionFade = smoothstep(edgeDistortionFadeEnd, edgeDistortionFadeStart, distToEdge);
    vec2 fadedEdgeDistortion = edgeDistortion * edgeDistortionFade;

    // 3. Directional Straightening Offset
    float movingGradientValue = fract(dot(st, straighteningDirection) * straighteningFreqMultiplier * patternScale - masterTime * straighteningSpeed);
    vec2 perpendicularDirection = vec2(straighteningDirection.y, -straighteningDirection.x);
    float shape = sin(movingGradientValue * PI * 2.0) * 0.5 + 0.5;
    float shapedPulse = pow(shape, directionalPulsePower);
    float offsetMagnitude = (shapedPulse * 2.0 - 1.0) * straighteningStrength;
    vec2 straighteningOffset = perpendicularDirection * offsetMagnitude;

    // 4. Advection Current
    vec2 currentVector = calculate_current(st, masterTime * currentSpeed, currentFrequency, currentStrength);

    // 5. Combine Offsets & Determine Final Sampling Coords
    vec2 base_final_st = st + currentVector + straighteningOffset * primaryCoordInfluence;
    vec2 dark_final_st = base_final_st + fadedEdgeDistortion * edgeDistortionInfluenceDark;
    vec2 foam_final_st = base_final_st + fadedEdgeDistortion * edgeDistortionInfluenceFoam;

    // 6. Calculate Breakup Mask (Spots)
    // <<< ENSURE Declaration is before usage >>>
    vec2 breakup_st_base = st + straighteningOffset * breakupCoordInfluence;
    vec3 breakNoiseCoord = vec3(breakup_st_base * breakupNoiseFreq * patternScale, masterTime * breakupNoiseSpeed);
    float breakupMaskIntensity = snoise(breakNoiseCoord) * 0.5 + 0.5;
    float spotMask = smoothstep(breakupSpotThreshold - breakupSpotSmoothness * 0.5,
                                breakupSpotThreshold + breakupSpotSmoothness * 0.5,
                                breakupMaskIntensity);

    // --- Dark Lines ---
    // 7. Sample & Calculate Intensity
    vec3 darkNoiseCoord = vec3(dark_final_st * darkWaveFrequency * patternScale, masterTime * waveSpeedDark);
    float darkNoiseValue = snoise(darkNoiseCoord) * 0.5 + 0.5;
    float darkLineIntensity = calculate_line_intensity(darkNoiseValue, darkLineThreshold, darkLineSharpness, 0.0, currentVector, currentStrength, darkLineSpeedBoost);
    darkLineIntensity *= darkLineOpacity;
    // 8. Apply Breakup Mask
    darkLineIntensity *= (1.0 - spotMask * breakupStrength * darkLineBreakupInfluence);

    // --- Foam Lines (Worley) ---
    // 9. Sample Worley Noise & Calculate Base Intensity
    vec3 foamWorleyCoord = vec3(foam_final_st * foamWorleyFrequency * patternScale, masterTime * waveSpeedFoam);
    vec2 worleyDist = worley(foamWorleyCoord);
    float foamWorleyValue = worleyDist.y - worleyDist.x;
    float foamLineIntensity_base = 0.0;
    float fw_foam = fwidth(foamWorleyValue) * foamLineSharpness;
    foamLineIntensity_base = smoothstep(foamLineThicknessWorley + fw_foam, foamLineThicknessWorley - fw_foam, foamWorleyValue);
    // 10. Apply Speed Boost
    float currentSpeedMag = length(currentVector);
    float speedFactorFoam = smoothstep(currentStrength * 0.25, currentStrength * 0.75, currentSpeedMag);
    foamLineIntensity_base *= (1.0 + speedFactorFoam * foamLineSpeedBoost);
    foamLineIntensity_base = clamp(foamLineIntensity_base, 0.0, 1.0);
    // 11. Apply Breakup Mask
    float foamLineIntensity_masked = foamLineIntensity_base * (1.0 - spotMask * breakupStrength);

    // --- Streaks ---
    // 12. Calculate Flow Streaks Intensity
    float streakIntensity = calculate_streaks(foam_final_st, currentVector, masterTime * streakSpeed, streakFrequency, streakSharpness, streakStrength);

    // --- Static Edge Glow ---
    // 13. Calculate Intensity
    float staticGlowPhase = (1.0 - distToEdge) * staticGlowFreq;
    float staticGlowRaw = sin(staticGlowPhase);
    float staticGlowAmplitudeActual = smoothstep(staticGlowFadeDistance, 0.0, distToEdge) * staticGlowAmplitude;
    float staticGlowBaseIntensity = smoothstep(0.1, 0.8, staticGlowRaw) * staticGlowAmplitudeActual;
    vec3 glowNoiseCoord = vec3(st_orig * staticGlowNoiseFreq * patternScale, masterTime * staticGlowNoiseSpeed);
    float glowNoiseMask = snoise(glowNoiseCoord) * 0.5 + 0.5;
    float finalStaticGlowIntensity = staticGlowBaseIntensity * mix(1.0 - staticGlowNoiseStrength, 1.0, glowNoiseMask);
    finalStaticGlowIntensity = clamp(finalStaticGlowIntensity, 0.0, 1.0);

    // --- Dynamic Edge Lapping Waves ---
    // 14. Calculate moving modulo gradient, perturbed by edge distortion
    // <<< ENSURE Declaration is before usage >>>
    float edgePerturbationScalar = length(fadedEdgeDistortion);
    float lapGradient = fract(distToEdge * lapWaveFreq - masterTime * lapWaveSpeed + edgePerturbationScalar * lapPhasePerturbStrength);
    // 15. Calculate line *band* intensity
    float lapLineIntensity_base = calculate_lap_band_intensity(lapGradient, lapBandStart, lapBandWidth, lapLineSharpness);
    // 16. Apply distance clipping & Breakup Mask
    lapLineIntensity_base *= smoothstep(lapClipDistance, 0.0, distToEdge);
    float lapLineIntensity_masked = lapLineIntensity_base * (1.0 - spotMask * breakupStrength * lapBreakupInfluence);
    lapLineIntensity_masked = clamp(lapLineIntensity_masked, 0.0, 1.0);

    // --- Final Compositing ---
    vec3 finalColor = colorBackground;
    finalColor = mix(finalColor, colorDarkLine, darkLineIntensity);
    finalColor = mix(finalColor, colorStreak, streakIntensity);
    float totalFoamIntensity = clamp(foamLineIntensity_masked + lapLineIntensity_masked, 0.0, 1.0);
    finalColor = mix(finalColor, colorFoamLine, totalFoamIntensity);
    finalColor += vec3(finalStaticGlowIntensity * staticGlowFaintness);
    finalColor = clamp(finalColor, 0.0, 1.0);

    // --- Output ---
    // Assign to Three.js's default output variable (implicitly declared at location 0)
    pc_fragColor = vec4(finalColor, 1.0);
}