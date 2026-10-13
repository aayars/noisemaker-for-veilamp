import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCollection } from '../scripts/build.mjs'

const program = { id: 'blaster:abc123', code: 'abc123', title: 'Noise', author: 'Alex Ayars', license: 'MIT', dslFile: 'programs/abc123/program.dsl', dslSha256: 'a'.repeat(64) }
const library = () => ({ version: 1, license: 'MIT', count: 1, programs: [{ ...program }] })
test('Curated acquisition rejects traversal and unverified program bytes', () => {
  const bad = library(); bad.programs[0].dslFile = '../../secret'
  assert.throws(() => validateCollection(bad), /metadata/)
  const missingHash = library(); delete missingHash.programs[0].dslSha256
  assert.throws(() => validateCollection(missingHash), /metadata/)
})
test('Curated acquisition rejects duplicate identities and wrong shader paths', () => {
  const duplicate = library(); duplicate.count = 2; duplicate.programs.push({ ...program })
  assert.throws(() => validateCollection(duplicate), /duplicate/)
  const bad = library(); bad.programs[0].effectsFile = 'programs/other/effects.json'; bad.programs[0].effectsSha256 = 'a'.repeat(64)
  assert.throws(() => validateCollection(bad), /shader/)
})
