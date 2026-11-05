#!/usr/bin/env node
// Mechanical pre-scan for the vue-component-analyzer skill.
//
// Usage: node .claude/skills/vue-component-analyzer/scripts/scan.mjs <file.vue> [more.vue ...]
//
// Finds the patterns a regex can find reliably (keys, listeners, timers,
// size, duplicated helpers across ALL components). It deliberately does not
// judge: every hit is a candidate that Claude verifies by reading the code.
// No dependencies, so it runs in any checkout without npm install.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'client', 'src')
const targets = process.argv.slice(2).map(p => resolve(p))
if (targets.length === 0) {
  console.error('Usage: scan.mjs <file.vue> [more.vue ...]')
  process.exit(1)
}

// Thresholds from client/CLAUDE.md ("When to extract component").
const SIZE = { template: 100, script: 150, style: 300 }

function listVue(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...listVue(p))
    else if (name.endsWith('.vue')) out.push(p)
  }
  return out
}

// Returns {content, startLine} of the first <tag ...>...</tag> block.
function block(src, tag) {
  const open = src.search(new RegExp(`<${tag}[\\s>]`))
  if (open < 0) return { content: '', startLine: 0, lines: 0 }
  const close = src.lastIndexOf(`</${tag}>`)
  const content = src.slice(open, close < 0 ? src.length : close)
  const startLine = src.slice(0, open).split('\n').length
  return { content, startLine, lines: content.split('\n').length }
}

function lineHits(text, startLine, re) {
  const hits = []
  text.split('\n').forEach((line, i) => {
    if (re.test(line)) hits.push({ line: startLine + i, text: line.trim().slice(0, 120) })
  })
  return hits
}

// Function names declared in <script> (arrow consts and function declarations).
function declaredFunctions(script) {
  const names = new Set()
  for (const m of script.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g)) names.add(m[1])
  for (const m of script.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1])
  return names
}

// Normalised CSS rule bodies, for spotting identical rules across files.
function cssRules(style) {
  const rules = []
  for (const m of style.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    const selector = m[1].trim().split('\n').pop().trim()
    const body = m[2].replace(/\s+/g, ' ').trim()
    if (body.split(';').filter(Boolean).length >= 3) rules.push({ selector, body })
  }
  return rules
}

function analyse(file) {
  const src = readFileSync(file, 'utf8')
  const tpl = block(src, 'template')
  const scr = block(src, 'script')
  const sty = block(src, 'style')
  const findings = []
  const add = (category, rule, hits, note) => {
    for (const h of hits) findings.push({ category, rule, line: h.line, text: h.text, note })
  }

  // --- Size / structure
  const total = src.split('\n').length
  const size = { total, template: tpl.lines, script: scr.lines, style: sty.lines }
  if (scr.lines > SIZE.script) findings.push({ category: 'Struktur', rule: 'size-script', line: scr.startLine, text: `<script> ${scr.lines} Zeilen (Schwelle ${SIZE.script})` })
  if (tpl.lines > SIZE.template) findings.push({ category: 'Struktur', rule: 'size-template', line: tpl.startLine, text: `<template> ${tpl.lines} Zeilen (Schwelle ${SIZE.template})` })
  if (sty.lines > SIZE.style) findings.push({ category: 'Wiederverwendung', rule: 'size-style', line: sty.startLine, text: `<style> ${sty.lines} Zeilen (Schwelle ${SIZE.style})`, note: 'gemeinsame Regeln nach App.vue oder in eine Basiskomponente?' })
  const api = /<script[^>]*\bsetup\b/.test(src) ? 'script setup' : (/setup\s*\(/.test(scr.content) ? 'Options-Objekt mit setup()' : 'Options API')
  if (api === 'Options API') findings.push({ category: 'Projektregel', rule: 'options-api', line: scr.startLine, text: 'data()/methods statt setup()', note: 'client/CLAUDE.md: durchgehend Composition API' })

  // --- Template / performance
  add('Projektregel', 'vfor-index-key', lineHits(tpl.content, tpl.startLine, /:key="\s*(index|idx|i)\s*"/), 'CLAUDE.md: stabile Keys (sku, month, ...) statt index')
  // An opening tag can span several lines, so check the whole tag for :key.
  const tplLines = tpl.content.split('\n')
  const noKey = []
  tplLines.forEach((line, i) => {
    if (!/v-for=/.test(line)) return
    let tag = line, j = i
    while (!/>/.test(tag.slice(tag.indexOf('v-for'))) && j < i + 15 && j + 1 < tplLines.length) tag += tplLines[++j]
    if (!/:key=|v-bind:key=/.test(tag)) noKey.push({ line: tpl.startLine + i, text: line.trim() })
  })
  add('Performance', 'vfor-no-key', noKey, 'v-for ohne :key')
  add('Performance', 'vif-with-vfor', lineHits(tpl.content, tpl.startLine, /v-for=.*v-if=|v-if=.*v-for=/), 'v-if und v-for auf demselben Element – vorher per computed filtern')
  add('Performance', 'array-op-in-template', lineHits(tpl.content, tpl.startLine, /\.(filter|sort|map|reduce|find)\(/), 'Array-Operation im Template läuft bei jedem Render – in computed verschieben')
  add('Performance', 'inline-style-object', lineHits(tpl.content, tpl.startLine, /:style="\{/), 'Inline-Style-Objekt wird bei jedem Render neu erzeugt (meist harmlos)')

  // --- Script / lifecycle
  const s = scr.content
  const count = re => (s.match(re) || []).length
  const pairs = [
    ['addEventListener', 'removeEventListener', 'listener-leak'],
    ['setInterval', 'clearInterval', 'interval-leak'],
    ['setTimeout', 'clearTimeout', 'timeout-not-cleared']
  ]
  for (const [on, off, rule] of pairs) {
    const a = count(new RegExp(`\\b${on}\\(`, 'g'))
    const b = count(new RegExp(`\\b${off}\\(`, 'g'))
    if (a > b) add('Performance', rule, lineHits(s, scr.startLine, new RegExp(`\\b${on}\\(`)), `${a}x ${on}, ${b}x ${off} – Aufräumen in onBeforeUnmount prüfen`)
  }
  add('Performance', 'deep-watch', lineHits(s, scr.startLine, /deep:\s*true/), 'deep-Watcher traversiert das ganze Objekt bei jeder Änderung')
  add('Performance', 'json-clone', lineHits(s, scr.startLine, /JSON\.parse\(JSON\.stringify/), 'Tiefe Kopie per JSON – teuer bei großen Daten')
  add('Projektregel', 'date-unvalidated', lineHits(s, scr.startLine, /\.get(Month|FullYear|Date)\(\)/), 'CLAUDE.md: Datum vor getMonth() validieren – Prüfung im Umfeld kontrollieren')
  add('Projektregel', 'direct-http', lineHits(s, scr.startLine, /axios\.(get|post|put|delete)\(|fetch\(\s*['"`]http/), 'API-Aufruf am zentralen client/src/api.js vorbei')
  add('Projektregel', 'console-log', lineHits(s, scr.startLine, /console\.log\(/), 'Debug-Ausgabe im Produktivcode')

  // --- i18n / content rules
  const usesI18n = /\bt\(/.test(tpl.content)
  if (!usesI18n && />\s*[A-Za-z][A-Za-z ,.'!?-]{3,}\s*</.test(tpl.content)) {
    findings.push({ category: 'Projektregel', rule: 'no-i18n', line: tpl.startLine, text: 'Template enthält Text, aber kein t()', note: 'andere Views nutzen useI18n – Texte übersetzbar machen' })
  }
  if (usesI18n) {
    // Text node between tags that is plain words, not {{ }}: likely untranslated.
    add('Projektregel', 'hardcoded-text', lineHits(tpl.content, tpl.startLine, />\s*[A-Za-z][A-Za-z ,.'!?-]{3,}\s*</), 'Komponente nutzt t(), dieser Text ist hart codiert')
  }
  add('Projektregel', 'emoji', lineHits(tpl.content, tpl.startLine, /\p{Extended_Pictographic}/u), 'CLAUDE.md: keine Emojis in der UI')

  return { file, size, api, findings, functions: declaredFunctions(s), css: cssRules(sty.content) }
}

// --- Cross-file reuse: compare targets against every component in client/src
const all = listVue(SRC).map(f => {
  const src = readFileSync(f, 'utf8')
  return { file: f, functions: declaredFunctions(block(src, 'script').content), css: cssRules(block(src, 'style').content) }
})

const rel = f => relative(ROOT, f)
const results = targets.map(analyse)

for (const r of results) {
  const reuse = []
  for (const fn of r.functions) {
    const others = all.filter(o => o.file !== r.file && o.functions.has(fn)).map(o => rel(o.file))
    if (others.length) reuse.push(`Funktion \`${fn}\` auch in: ${others.join(', ')}`)
  }
  for (const rule of r.css) {
    const others = all.filter(o => o.file !== r.file && o.css.some(c => c.body === rule.body)).map(o => rel(o.file))
    if (others.length) reuse.push(`CSS \`${rule.selector}\` identisch in: ${[...new Set(others)].join(', ')}`)
  }
  r.reuse = reuse
}

// --- Output: compact Markdown that Claude reads and then verifies
for (const r of results) {
  console.log(`## ${rel(r.file)}`)
  console.log(`Größe: ${r.size.total} Zeilen (template ${r.size.template}, script ${r.size.script}, style ${r.size.style}) · API: ${r.api}`)
  console.log()
  if (r.findings.length === 0) console.log('Keine mechanischen Treffer.')
  for (const f of r.findings) {
    console.log(`- [${f.category}] ${f.rule} @ L${f.line}: \`${f.text}\`${f.note ? ` — ${f.note}` : ''}`)
  }
  if (r.reuse.length) {
    console.log()
    console.log('Wiederverwendung (gleichnamig/identisch in anderen Komponenten):')
    for (const line of r.reuse) console.log(`- ${line}`)
  }
  console.log()
}
