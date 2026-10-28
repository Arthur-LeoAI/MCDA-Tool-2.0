// Prepare public/pyodide/ for the browser engine (docs/design/browser-engine.md):
// - the Pyodide runtime from the pinned `pyodide` npm package;
// - the package wheels the backend needs, downloaded once into .pyodide-cache/ and checked by SHA-256;
// - our Python code (backend/src) as one JSON file.
// Nothing here is committed; run before `vite build` for the static (browser engine) build.
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtime = join(frontend, 'node_modules', 'pyodide')
const out = join(frontend, 'public', 'pyodide')
const cache = join(frontend, '.pyodide-cache')
const backendSrc = resolve(frontend, '..', 'backend', 'src')

const lock = JSON.parse(readFileSync(join(runtime, 'pyodide-lock.json'), 'utf8'))
const version = JSON.parse(readFileSync(join(runtime, 'package.json'), 'utf8')).version
const CDN = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`

// The backend's runtime dependencies (backend/pyproject.toml), without uvicorn.
// Built into Pyodide: taken from its lock file, with their dependencies.
const PYODIDE_PACKAGES = ['numpy', 'pydantic', 'fastapi']
// Pure-Python wheels from PyPI (not part of Pyodide), pinned with the SHA-256 that PyPI publishes.
const PYPI_WHEELS = [
  {
    file: 'openpyxl-3.1.5-py2.py3-none-any.whl',
    sha256: '5282c12b107bffeef825f4617dc029afaf41d0ea60823bbb665ef3079dc79de2',
  },
  {
    file: 'et_xmlfile-2.0.0-py3-none-any.whl',
    sha256: '7a91720bc756843502c3b7504c77b8fe44217c85c537d85037f0f536151b2caa',
  },
  {
    file: 'python_multipart-0.0.32-py3-none-any.whl',
    sha256: 'ff6d3f776f16878c894e52e107296ffc890e913c611b1a4ec6c44e2821fe2e23',
  },
]

const normalize = (name) => name.toLowerCase().replace(/[-_.]+/g, '-')
const packages = Object.fromEntries(Object.entries(lock.packages).map(([k, v]) => [normalize(k), v]))

function closure(names) {
  const seen = new Set()
  const stack = names.map(normalize)
  while (stack.length) {
    const name = normalize(stack.pop())
    if (seen.has(name)) continue
    if (!packages[name]) throw new Error(`${name} is not in pyodide-lock.json`)
    seen.add(name)
    stack.push(...packages[name].depends)
  }
  return [...seen].sort()
}

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

async function cached(file, url, expected) {
  const path = join(cache, file)
  if (!existsSync(path)) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    writeFileSync(path, Buffer.from(await response.arrayBuffer()))
  }
  const actual = sha256(readFileSync(path))
  if (actual !== expected) {
    rmSync(path)
    throw new Error(`${file}: SHA-256 ${actual}, expected ${expected}`)
  }
  return path
}

/** Download URL of a wheel on PyPI (the file is then checked against the pinned hash). */
async function pypiUrl(file) {
  const [name, release] = file.split('-')
  const info = await (await fetch(`https://pypi.org/pypi/${name}/${release}/json`)).json()
  const entry = info.urls.find((u) => u.filename === file)
  if (!entry) throw new Error(`${file} not found on PyPI`)
  return entry.url
}

function sourcesJson() {
  const files = {}
  for (const pkg of ['mcda_core', 'mcda_api']) {
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (name === '__pycache__') continue
        if (statSync(path).isDirectory()) walk(path)
        else files[relative(backendSrc, path).replaceAll('\\', '/')] = readFileSync(path, 'utf8')
      }
    }
    walk(join(backendSrc, pkg))
  }
  return files
}

mkdirSync(cache, { recursive: true })
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

for (const file of ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
  copyFileSync(join(runtime, file), join(out, file))
}

const names = closure(PYODIDE_PACKAGES)
for (const name of names) {
  const { file_name: file, sha256: expected } = packages[name]
  const path = await cached(file, CDN + file, expected)
  copyFileSync(path, join(out, file))
}

const wheels = []
for (const wheel of PYPI_WHEELS) {
  const cachedPath = join(cache, wheel.file)
  const url = existsSync(cachedPath) ? null : await pypiUrl(wheel.file)
  const path = await cached(wheel.file, url, wheel.sha256)
  copyFileSync(path, join(out, wheel.file))
  wheels.push(wheel.file)
}

writeFileSync(join(out, 'mcda-src.json'), JSON.stringify(sourcesJson()))
// What the worker loads, so it needs no package names of its own.
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ version, packages: names, wheels }, null, 2))

const size = readdirSync(out).reduce((sum, f) => sum + statSync(join(out, f)).size, 0)
console.log(
  `public/pyodide: Pyodide ${version}, ${names.length} packages, ${wheels.length} wheels, ${(size / 2 ** 20).toFixed(1)} MiB`,
)
