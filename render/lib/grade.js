// Finaler Look: Farbgrading, Vignette, Filmkorn, chromatische Aberration, Weichzeichnung, Blitz, Abblende
export const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: [1080, 1920] },
    uGrain: { value: 0.035 }, uVig: { value: 0.55 }, uDesat: { value: 0 }, uFade: { value: 0 },
    uFlash: { value: 0 }, uSoft: { value: 0 }, uCA: { value: 0.012 }, uWarm: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime,uGrain,uVig,uDesat,uFade,uFlash,uSoft,uCA,uWarm; uniform vec2 uRes;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 uv=vUv; vec2 c=uv-0.5; float ca=uCA*dot(c,c)*4.0;
      vec3 col=vec3(texture2D(tDiffuse,uv-c*ca).r, texture2D(tDiffuse,uv).g, texture2D(tDiffuse,uv+c*ca).b);
      if(uSoft>0.0){ vec3 b=vec3(0.0); vec2 px=1.0/uRes*uSoft*7.0;
        for(int i=0;i<12;i++){ float a=float(i)*0.5236; b+=texture2D(tDiffuse,uv+vec2(cos(a),sin(a))*px).rgb; }
        col=mix(col,b/12.0*1.08,0.7); }
      float l=dot(col,vec3(0.2126,0.7152,0.0722));
      col=mix(vec3(l),col,1.0-uDesat);
      // dezentes Teal/Orange-Grading
      col+=(1.0-smoothstep(0.0,0.45,l))*vec3(-0.012,0.004,0.018);
      col*=vec3(1.0+0.03*uWarm,1.0,1.0-0.04*uWarm);
      float v=smoothstep(1.05,0.3,length(c*vec2(1.0,0.78))*1.35); col*=mix(1.0,v,uVig);
      float n=h(uv*uRes+fract(uTime*7.13)*317.0)-0.5; col+=n*uGrain*(0.6+0.4*(1.0-l));
      col=mix(col,vec3(1.0,0.97,0.92),uFlash); col*=1.0-uFade;
      gl_FragColor=vec4(col,1.0);
    }`
};
