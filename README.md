KJ: web groovebox
=================

## Structure

- `web/` contains the browser UI (HTML, CSS, JS).
- `src/` contains the C++ DSP implementation that compiles to WebAssembly.
- `dist/` is where the WebAssembly build outputs (`kj_dsp.wasm`, `kj_dsp.js`) will be written.
- `web/dist/` is where the UI serves the compiled assets from; copy the build outputs here before running the browser app.

## Building the DSP module

The DSP layer is compiled with Emscripten. Once Emscripten is available in your shell, build the module with:

```
emcc src/*.cpp \
  -O3 \
  -std=c++17 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s ENVIRONMENT='web' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORTED_FUNCTIONS='[_malloc,_free,_kj_set_sample_rate,_kj_calculate_synth_samples,_kj_calculate_kick_samples,_kj_calculate_snare_samples,_kj_calculate_hat_samples,_kj_calculate_clap_samples,_kj_generate_synth,_kj_generate_kick,_kj_generate_snare,_kj_generate_hat,_kj_generate_clap]' \
  -o dist/kj_dsp.js
```

The command generates `dist/kj_dsp.js` and `dist/kj_dsp.wasm`. Copy both files into `web/dist/` so the UI can load them:

```
mkdir -p web/dist
cp dist/kj_dsp.js dist/kj_dsp.wasm web/dist/
```

## Running the UI

Serve the `web/` directory (which should now contain `web/dist/kj_dsp.js` and `web/dist/kj_dsp.wasm`) with any static file server. For example:

```
npx serve web
```

The UI expects the compiled WebAssembly files to be available at `web/dist/kj_dsp.js` and `web/dist/kj_dsp.wasm` relative to the `web/` directory root.
