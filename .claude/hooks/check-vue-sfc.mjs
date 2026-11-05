#!/usr/bin/env node
// PostToolUse hook: after Claude edits or writes a .vue file, compile just that
// file with Vue's SFC compiler. Takes milliseconds, unlike a full `vite build`.
//
// Exit 0  -> fine (or not a .vue file, or deps not installed: never get in the way)
// Exit 2  -> stderr goes back to Claude, which then fixes the file in the same turn

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

let input = ''
for await (const chunk of process.stdin) input += chunk

const file = JSON.parse(input || '{}').tool_input?.file_path || ''
if (!file.endsWith('.vue') || !existsSync(file)) process.exit(0)

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const sfcPath = join(root, 'client', 'node_modules', 'vue', 'compiler-sfc')
if (!existsSync(sfcPath)) process.exit(0) // npm install not run yet: skip silently

const { parse, compileTemplate, compileScript } = createRequire(import.meta.url)(sfcPath)
const source = readFileSync(file, 'utf8')
const errors = []

const { descriptor, errors: parseErrors } = parse(source, { filename: file })
errors.push(...parseErrors)

if (errors.length === 0) {
  const id = 'hook'
  try {
    if (descriptor.script || descriptor.scriptSetup) compileScript(descriptor, { id })
  } catch (e) {
    errors.push(e)
  }
  if (descriptor.template) {
    const result = compileTemplate({ source: descriptor.template.content, filename: file, id })
    errors.push(...result.errors)
  }
}

if (errors.length) {
  const lines = errors.map(e => `- ${typeof e === 'string' ? e : e.message}${e.loc ? ` (Zeile ${e.loc.start.line})` : ''}`)
  console.error(`Vue-SFC-Check fehlgeschlagen für ${file}:\n${lines.join('\n')}`)
  process.exit(2)
}
