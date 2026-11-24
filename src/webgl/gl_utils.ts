export function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('无法创建 WebGL Shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader 编译失败: ${log}`);
  }
  return shader;
}

export function createProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertex);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  if (!program) throw new Error('无法创建 WebGL Program');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Program 链接失败: ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

export function makeBuffer(gl: WebGL2RenderingContext, data: BufferSource, target = gl.ARRAY_BUFFER): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('无法创建 GPU Buffer');
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return buffer;
}

export function setAttribute(
  gl: WebGL2RenderingContext,
  location: number,
  size: number,
  buffer: WebGLBuffer,
  divisor = 0
) {
  if (location < 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(location, divisor);
}
