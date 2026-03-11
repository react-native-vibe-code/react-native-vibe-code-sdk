import { Template } from 'e2b'
import { readFileSync } from 'fs'
import { join, resolve } from 'path'

const dockerfile = readFileSync(
  join(__dirname, 'e2b.Dockerfile'),
  'utf-8'
)

// fileContextPath must point to packages/sandbox/ so COPY instructions
// can resolve local-creative-suite-app/ and templates/ relative paths.
// Without this, the SDK defaults to __dirname (the template subfolder).
export const template = Template({
  fileContextPath: resolve(__dirname, '../..'),
  fileIgnorePatterns: [
    'local-creative-suite-app/node_modules/**',
    'local-creative-suite-app/.git/**',
    'local-creative-suite-app/ios/**',
    'local-creative-suite-app/android/**',
    'local-creative-suite-app/.expo/**',
  ],
}).fromDockerfile(dockerfile)
