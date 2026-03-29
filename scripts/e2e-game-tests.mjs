/**
 * E2E Game Simulation Tests
 *
 * Tests the complete match lifecycle by sending SQL queries through the same
 * API the app uses. Simulates real user flows without browser interaction.
 *
 * Runs against the current dev server (localhost:5173).
 *
 * Usage: node scripts/e2e-game-tests.mjs
 */

const API = 'http://localhost:5173/api/db'

// ============================================================
// Test Infrastructure
// ============================================================

let passed = 0
let failed = 0
const failures = []

async function api(body) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'darts-2024-local' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error)
  return json.data
}

async function sqlQuery(sql, params = []) { return api({ type: 'query', sql, params }) }
async function sqlQueryOne(sql, params = []) { return api({ type: 'queryOne', sql, params }) }
async function sqlExec(sql, params = []) { return api({ type: 'exec', sql, params }) }
async function sqlTransaction(statements) { return api({ type: 'transaction', statements }) }
async function sqlBatch(queries) { return api({ type: 'batch', queries }) }

async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  PASS: ${name}`)
  } catch (e) {
    failed++
    failures.push({ name, error: e.message })
    console.log(`  FAIL: ${name}`)
    console.log(`    -> ${e.message}`)
  }
}

function assert(condition, msg) { if (!condition) throw new Error(msg || 'Assertion failed') }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`) }
function assertGte(a, b, msg) { if (a < b) throw new Error(msg || `Expected >= ${b}, got ${a}`) }

function generateId() { return 'TEST_' + Math.random().toString(36).substring(2, 15) }
function timestamp() { return new Date().toISOString() }

// ============================================================
// Test Data
// ============================================================

const TEST_PLAYER_1 = 'TEST_PLAYER_A'
const TEST_PLAYER_2 = 'TEST_PLAYER_B'

// ============================================================
// Test Suites
// ============================================================

async function cleanupTestData() {
  console.log('\n--- Cleanup previous test data ---')
  const matchTables = ['x01', 'cricket', 'atb']
  for (const t of matchTables) {
    try { await sqlExec(`DELETE FROM ${t}_events WHERE match_id LIKE 'TEST_%'`) } catch {}
    try { await sqlExec(`DELETE FROM ${t}_match_players WHERE match_id LIKE 'TEST_%'`) } catch {}
    try { await sqlExec(`DELETE FROM ${t}_matches WHERE id LIKE 'TEST_%'`) } catch {}
  }
  try { await sqlExec("DELETE FROM x01_player_stats WHERE player_id LIKE 'TEST_%'") } catch {}
  try { await sqlExec("DELETE FROM x01_leaderboards WHERE player_id LIKE 'TEST_%'") } catch {}
  try { await sqlExec("DELETE FROM profiles WHERE id LIKE 'TEST_%'") } catch {}
  console.log('  Cleanup done.\n')
}

async function setupTestProfiles() {
  console.log('--- Setup test profiles ---')
  const ts = timestamp()
  await sqlExec(`INSERT INTO profiles (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`, [TEST_PLAYER_1, 'Test Player A', ts, ts])
  await sqlExec(`INSERT INTO profiles (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`, [TEST_PLAYER_2, 'Test Player B', ts, ts])
  console.log('  Created test profiles.\n')
}

async function testX01MatchLifecycle() {
  console.log('--- X01 Match Lifecycle ---')
  const matchId = generateId()
  const ts = timestamp()

  await test('Create X01 match (INSERT ON CONFLICT)', async () => {
    await sqlExec(`INSERT INTO x01_matches (id, title, match_name, notes, created_at, finished, finished_at, mode, starting_score, structure_kind, best_of_legs, legs_per_set, best_of_sets, in_rule, out_rule)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, match_name = EXCLUDED.match_name, notes = EXCLUDED.notes, created_at = EXCLUDED.created_at, finished = EXCLUDED.finished, finished_at = EXCLUDED.finished_at, mode = EXCLUDED.mode, starting_score = EXCLUDED.starting_score, structure_kind = EXCLUDED.structure_kind, best_of_legs = EXCLUDED.best_of_legs, legs_per_set = EXCLUDED.legs_per_set, best_of_sets = EXCLUDED.best_of_sets, in_rule = EXCLUDED.in_rule, out_rule = EXCLUDED.out_rule`,
      [matchId, 'Test 301 DO', null, null, ts, 0, null, 'x01', 301, 'legs', 3, 1, 1, 'straight-in', 'double-out'])
    const match = await sqlQueryOne('SELECT * FROM x01_matches WHERE id = ?', [matchId])
    assert(match, 'Match should exist')
    assertEqual(match.title, 'Test 301 DO')
    assertEqual(match.starting_score, 301)
    assertEqual(match.finished, 0)
  })

  await test('Add match players', async () => {
    await sqlExec('INSERT INTO x01_match_players (match_id, player_id, position, is_guest) VALUES (?, ?, ?, ?)', [matchId, TEST_PLAYER_1, 0, 0])
    await sqlExec('INSERT INTO x01_match_players (match_id, player_id, position, is_guest) VALUES (?, ?, ?, ?)', [matchId, TEST_PLAYER_2, 1, 0])
    const players = await sqlQuery('SELECT * FROM x01_match_players WHERE match_id = ? ORDER BY position', [matchId])
    assertEqual(players.length, 2)
    assertEqual(players[0].player_id, TEST_PLAYER_1)
  })

  await test('Add game events via transaction', async () => {
    const events = [
      { type: 'MatchStarted', data: { mode: 'x01', startingScore: 301, players: [{playerId: TEST_PLAYER_1}, {playerId: TEST_PLAYER_2}] } },
      { type: 'LegStarted', data: { legId: 'L1', setIndex: 0, legIndex: 0 } },
      { type: 'VisitAdded', data: { playerId: TEST_PLAYER_1, visitScore: 180, darts: [{score:60,mult:3,bed:'T20'},{score:60,mult:3,bed:'T20'},{score:60,mult:3,bed:'T20'}], remainingBefore: 301, bust: false } },
      { type: 'VisitAdded', data: { playerId: TEST_PLAYER_2, visitScore: 140, darts: [{score:60,mult:3,bed:'T20'},{score:60,mult:3,bed:'T20'},{score:20,mult:1,bed:'20'}], remainingBefore: 301, bust: false } },
      { type: 'VisitAdded', data: { playerId: TEST_PLAYER_1, visitScore: 81, darts: [{score:57,mult:3,bed:'T19'},{score:24,mult:2,bed:'D12'}], remainingBefore: 121, bust: false, finishingDartSeq: 2 } },
      { type: 'LegFinished', data: { legId: 'L1', winnerPlayerId: TEST_PLAYER_1 } },
      { type: 'MatchFinished', data: { winnerPlayerId: TEST_PLAYER_1 } },
    ]
    const stmts = events.map((ev, i) => ({
      sql: 'INSERT INTO x01_events (id, match_id, type, ts, seq, data) VALUES (?, ?, ?, ?, ?, ?)',
      params: [generateId(), matchId, ev.type, ts, i, JSON.stringify(ev.data)],
    }))
    await sqlTransaction(stmts)
    const count = await sqlQueryOne('SELECT COUNT(*) as c FROM x01_events WHERE match_id = ?', [matchId])
    assertEqual(count.c, 7)
  })

  await test('Batch load match + events + players', async () => {
    const results = await sqlBatch([
      { sql: 'SELECT * FROM x01_matches WHERE id = ?', params: [matchId], mode: 'one' },
      { sql: 'SELECT * FROM x01_events WHERE match_id = ? ORDER BY seq', params: [matchId], mode: 'all' },
      { sql: 'SELECT * FROM x01_match_players WHERE match_id = ? ORDER BY position', params: [matchId], mode: 'all' },
    ])
    assert(results[0].data, 'Match should exist')
    assertEqual(results[1].data.length, 7, 'Should have 7 events')
    assertEqual(results[2].data.length, 2, 'Should have 2 players')
  })

  await test('Finish match', async () => {
    await sqlExec('UPDATE x01_matches SET finished = 1, finished_at = ? WHERE id = ?', [ts, matchId])
    const match = await sqlQueryOne('SELECT finished, finished_at FROM x01_matches WHERE id = ?', [matchId])
    assertEqual(match.finished, 1)
    assert(match.finished_at, 'finished_at should be set')
  })

  await test('JSONB extraction on events', async () => {
    const visit180 = await sqlQueryOne(`
      SELECT COUNT(*) as c FROM x01_events
      WHERE match_id = ? AND type = 'VisitAdded'
        AND data::jsonb->>'visitScore' = '180'`, [matchId])
    assertEqual(visit180.c, 1, 'Should find 1x 180')

    const checkout = await sqlQueryOne(`
      SELECT (data::jsonb->>'remainingBefore')::integer as checkout
      FROM x01_events WHERE match_id = ? AND type = 'VisitAdded'
        AND data::jsonb->>'finishingDartSeq' IS NOT NULL`, [matchId])
    assertEqual(checkout.checkout, 121, 'Checkout should be 121')
  })

  await test('Upsert match (ON CONFLICT DO UPDATE)', async () => {
    await sqlExec(`INSERT INTO x01_matches (id, title, match_name, notes, created_at, finished, finished_at, mode, starting_score, structure_kind, best_of_legs, legs_per_set, best_of_sets, in_rule, out_rule)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, notes = EXCLUDED.notes`,
      [matchId, 'Updated Title', null, 'Test note', ts, 1, ts, 'x01', 301, 'legs', 3, 1, 1, 'straight-in', 'double-out'])
    const match = await sqlQueryOne('SELECT title, notes FROM x01_matches WHERE id = ?', [matchId])
    assertEqual(match.title, 'Updated Title')
    assertEqual(match.notes, 'Test note')
  })

  await test('Delete match cascade', async () => {
    await sqlExec('DELETE FROM x01_events WHERE match_id = ?', [matchId])
    await sqlExec('DELETE FROM x01_match_players WHERE match_id = ?', [matchId])
    await sqlExec('DELETE FROM x01_matches WHERE id = ?', [matchId])
    const match = await sqlQueryOne('SELECT * FROM x01_matches WHERE id = ?', [matchId])
    assert(!match, 'Match should be deleted')
  })
}

async function testCricketMatchLifecycle() {
  console.log('\n--- Cricket Match Lifecycle ---')
  const matchId = generateId()
  const ts = timestamp()

  await test('Create Cricket match', async () => {
    await sqlExec(`INSERT INTO cricket_matches (id, title, match_name, notes, created_at, finished, finished_at, range, style, best_of_games)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`,
      [matchId, 'Test Cricket', null, null, ts, 0, null, 'long', 'standard', 3])
    const match = await sqlQueryOne('SELECT * FROM cricket_matches WHERE id = ?', [matchId])
    assert(match, 'Cricket match should exist')
    assertEqual(match.range, 'long')
  })

  await test('Add Cricket events via transaction', async () => {
    await sqlExec('INSERT INTO cricket_match_players (match_id, player_id, position) VALUES (?, ?, ?)', [matchId, TEST_PLAYER_1, 0])
    await sqlTransaction([
      { sql: 'INSERT INTO cricket_events (id, match_id, type, ts, seq, data) VALUES (?, ?, ?, ?, ?, ?)',
        params: [generateId(), matchId, 'CricketMatchStarted', ts, 0, JSON.stringify({players:[{playerId:TEST_PLAYER_1}]})] },
      { sql: 'INSERT INTO cricket_events (id, match_id, type, ts, seq, data) VALUES (?, ?, ?, ?, ?, ?)',
        params: [generateId(), matchId, 'CricketTurnAdded', ts, 1, JSON.stringify({playerId:TEST_PLAYER_1, tripleCount:2, doubleCount:1, singleCount:0, dartCount:3})] },
    ])
    const count = await sqlQueryOne('SELECT COUNT(*) as c FROM cricket_events WHERE match_id = ?', [matchId])
    assertEqual(count.c, 2)
  })

  // Cleanup
  await sqlExec('DELETE FROM cricket_events WHERE match_id = ?', [matchId])
  await sqlExec('DELETE FROM cricket_match_players WHERE match_id = ?', [matchId])
  await sqlExec('DELETE FROM cricket_matches WHERE id = ?', [matchId])
}

async function testTransactionRollback() {
  console.log('\n--- Transaction Integrity ---')

  await test('Transaction rolls back on error', async () => {
    const matchId = generateId()
    try {
      await sqlTransaction([
        { sql: 'INSERT INTO x01_matches (id, title, created_at, mode) VALUES (?, ?, ?, ?)',
          params: [matchId, 'Should Rollback', timestamp(), 'x01'] },
        { sql: 'INSERT INTO nonexistent_table (id) VALUES (?)', params: ['fail'] },
      ])
    } catch {}
    const match = await sqlQueryOne('SELECT * FROM x01_matches WHERE id = ?', [matchId])
    assert(!match, 'Match should NOT exist after failed transaction (rollback)')
  })
}

async function testPlayerStatsUpsert() {
  console.log('\n--- Player Stats Upsert ---')

  await test('Upsert X01 player stats', async () => {
    await sqlExec(`INSERT INTO x01_player_stats (player_id, matches_played, matches_won, legs_won, darts_thrown, three_dart_avg, highest_checkout, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (player_id) DO UPDATE SET
        matches_played = EXCLUDED.matches_played, matches_won = EXCLUDED.matches_won,
        three_dart_avg = EXCLUDED.three_dart_avg, highest_checkout = EXCLUDED.highest_checkout,
        updated_at = EXCLUDED.updated_at`,
      [TEST_PLAYER_1, 10, 5, 8, 300, 45.5, 121, timestamp()])
    const stats = await sqlQueryOne('SELECT * FROM x01_player_stats WHERE player_id = ?', [TEST_PLAYER_1])
    assertEqual(stats.matches_played, 10)

    // Update via upsert
    await sqlExec(`INSERT INTO x01_player_stats (player_id, matches_played, matches_won, highest_checkout, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (player_id) DO UPDATE SET
        matches_played = EXCLUDED.matches_played, highest_checkout = EXCLUDED.highest_checkout`,
      [TEST_PLAYER_1, 15, 8, 170, timestamp()])
    const updated = await sqlQueryOne('SELECT matches_played, highest_checkout FROM x01_player_stats WHERE player_id = ?', [TEST_PLAYER_1])
    assertEqual(updated.matches_played, 15)
    assertEqual(updated.highest_checkout, 170)
  })

  await sqlExec("DELETE FROM x01_player_stats WHERE player_id LIKE 'TEST_%'")
}

async function testEdgeCases() {
  console.log('\n--- Edge Cases ---')

  await test('Empty jsonb field returns null', async () => {
    const matchId = generateId()
    await sqlExec('INSERT INTO x01_matches (id, title, created_at, mode) VALUES (?, ?, ?, ?)',
      [matchId, 'Edge Test', timestamp(), 'x01'])
    await sqlExec('INSERT INTO x01_events (id, match_id, type, ts, seq, data) VALUES (?, ?, ?, ?, ?, ?)',
      [generateId(), matchId, 'MatchStarted', timestamp(), 0, JSON.stringify({})])
    const event = await sqlQueryOne("SELECT data::jsonb->>'playerId' as pid FROM x01_events WHERE match_id = ?", [matchId])
    assertEqual(event.pid, null, 'Missing field should return null')
    await sqlExec('DELETE FROM x01_events WHERE match_id = ?', [matchId])
    await sqlExec('DELETE FROM x01_matches WHERE id = ?', [matchId])
  })

  await test('Concurrent upserts are idempotent', async () => {
    const matchId = generateId()
    const sql = `INSERT INTO x01_matches (id, title, created_at, mode) VALUES (?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`
    await Promise.all([
      sqlExec(sql, [matchId, 'Concurrent 1', timestamp(), 'x01']),
      sqlExec(sql, [matchId, 'Concurrent 2', timestamp(), 'x01']),
      sqlExec(sql, [matchId, 'Concurrent 3', timestamp(), 'x01']),
    ])
    const match = await sqlQueryOne('SELECT * FROM x01_matches WHERE id = ?', [matchId])
    assert(match, 'Match should exist after concurrent upserts')
    await sqlExec('DELETE FROM x01_matches WHERE id = ?', [matchId])
  })

  await test('Boolean bust field as text comparison', async () => {
    const matchId = generateId()
    await sqlExec('INSERT INTO x01_matches (id, title, created_at, mode) VALUES (?, ?, ?, ?)',
      [matchId, 'Bust Test', timestamp(), 'x01'])
    await sqlExec('INSERT INTO x01_events (id, match_id, type, ts, seq, data) VALUES (?, ?, ?, ?, ?, ?)',
      [generateId(), matchId, 'VisitAdded', timestamp(), 0, JSON.stringify({playerId: TEST_PLAYER_1, bust: true, visitScore: 0})])
    await sqlExec('INSERT INTO x01_events (id, match_id, type, ts, seq, data) VALUES (?, ?, ?, ?, ?, ?)',
      [generateId(), matchId, 'VisitAdded', timestamp(), 1, JSON.stringify({playerId: TEST_PLAYER_1, bust: false, visitScore: 60})])

    const busts = await sqlQueryOne(`SELECT COUNT(*) as c FROM x01_events
      WHERE match_id = ? AND type = 'VisitAdded' AND data::jsonb->>'bust' = 'true'`, [matchId])
    assertEqual(busts.c, 1, 'Should find 1 bust')

    const nonBusts = await sqlQueryOne(`SELECT COUNT(*) as c FROM x01_events
      WHERE match_id = ? AND type = 'VisitAdded' AND data::jsonb->>'bust' != 'true'`, [matchId])
    assertEqual(nonBusts.c, 1, 'Should find 1 non-bust')

    await sqlExec('DELETE FROM x01_events WHERE match_id = ?', [matchId])
    await sqlExec('DELETE FROM x01_matches WHERE id = ?', [matchId])
  })
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('==============================================')
  console.log('  DARTS APP - PROGRAMMATIC E2E GAME TESTS')
  console.log('  API: ' + API)
  console.log('==============================================')

  try { await sqlQueryOne('SELECT 1 as ok') }
  catch (e) { console.error('API not reachable:', e.message); process.exit(1) }

  await cleanupTestData()
  await setupTestProfiles()
  await testX01MatchLifecycle()
  await testCricketMatchLifecycle()
  await testTransactionRollback()
  await testPlayerStatsUpsert()
  await testEdgeCases()
  await cleanupTestData()

  console.log('\n==============================================')
  console.log(`  Results: ${passed} passed, ${failed} failed`)
  if (failures.length > 0) {
    console.log('\n  Failures:')
    for (const f of failures) console.log(`    FAIL: ${f.name}: ${f.error}`)
  }
  console.log('==============================================')

  process.exit(failed > 0 ? 1 : 0)
}

main()
