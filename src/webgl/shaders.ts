export const terrainVertexShader = `#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
in vec3 aColor;
uniform mat4 uViewProj;
out vec3 vNormal;
out vec3 vColor;
out vec3 vWorld;
void main() {
  vNormal = normalize(aNormal);
  vColor = aColor;
  vWorld = aPosition;
  gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

export const terrainFragmentShader = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vColor;
in vec3 vWorld;
uniform vec3 uCamera;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uMist;
uniform float uMistBottom;
uniform float uMistTop;
uniform float uTime;
out vec4 outColor;

void main() {
  vec3 n = normalize(vNormal);
  float diffuse = max(dot(n, normalize(uSunDir)), 0.0);
  float sky = 0.34 + 0.22 * max(n.y, 0.0);
  vec3 color = vColor * (sky + diffuse * 0.72);

  float distanceToCamera = length(uCamera - vWorld);
  float fog = 1.0 - exp(-uFogDensity * distanceToCamera);
  float valley = uMist * (1.0 - smoothstep(uMistBottom, uMistTop, vWorld.y));
  float drift = sin(vWorld.x * 0.035 + uTime * 0.08) * cos(vWorld.z * 0.027 - uTime * 0.05);
  fog = clamp(fog + valley * (0.22 + 0.08 * drift), 0.0, 0.88);
  color = mix(color, uFogColor, fog);
  outColor = vec4(color, 1.0);
}
`;

export const lineVertexShader = `#version 300 es
precision highp float;
in vec3 aPosition;
in vec4 aColor;
uniform mat4 uViewProj;
out vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

export const lineFragmentShader = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 outColor;
void main() {
  outColor = vColor;
}
`;

export const plantVertexShader = `#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
in float aPart;
in vec3 iOffset;
in float iScale;
in float iRotation;
in float iHue;
uniform mat4 uViewProj;
out vec3 vNormal;
out float vPart;
out float vHue;
out vec3 vWorld;

void main() {
  float c = cos(iRotation);
  float s = sin(iRotation);
  vec3 p = aPosition * iScale;
  vec3 rotated = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  vec3 n = aNormal;
  vec3 rn = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);
  vec3 world = rotated + iOffset;
  vNormal = normalize(rn);
  vPart = aPart;
  vHue = iHue;
  vWorld = world;
  gl_Position = uViewProj * vec4(world, 1.0);
}
`;

export const plantFragmentShader = `#version 300 es
precision highp float;
in vec3 vNormal;
in float vPart;
in float vHue;
in vec3 vWorld;
uniform vec3 uCamera;
uniform vec3 uSunDir;
uniform vec3 uCanopyColor;
uniform vec3 uShootColor;
uniform vec3 uTrunkColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uMist;
uniform float uMistBottom;
uniform float uMistTop;
out vec4 outColor;

void main() {
  vec3 n = normalize(vNormal);
  float light = 0.42 + 0.62 * max(dot(n, normalize(uSunDir)), 0.0);
  vec3 base = vPart > 0.5 ? uTrunkColor : mix(uCanopyColor, uShootColor, clamp(vHue * 1.7 + 0.25, 0.0, 0.55));
  if (vPart < 0.5) {
    base *= 0.88 + 0.24 * clamp(vHue + 0.5, 0.0, 1.0);
  }
  vec3 color = base * light;
  float dist = length(uCamera - vWorld);
  float fog = clamp(1.0 - exp(-uFogDensity * dist) + uMist * 0.08 * (1.0 - smoothstep(uMistBottom, uMistTop, vWorld.y)), 0.0, 0.9);
  color = mix(color, uFogColor, fog);
  outColor = vec4(color, 1.0);
}
`;
