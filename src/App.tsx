import { useEffect, useMemo, useState } from 'react'
import './App.css'

const MAX_NUMBER = 100_000
const SAVE_KEY = 'numeric-clicker-save-v1'

const COIN_MULTIPLIERS = [1, 2, 3, 5, 8, 12]
const MULTI_ROLL_COUNTS = [1, 3, 7, 15]
const COIN_MULTIPLIER_COSTS = [25, 80, 180, 360, 700]
const LUCK_COSTS = [40, 110, 240, 520, 1000]
const MULTI_ROLL_COSTS = [70, 220, 520]
const AUTO_CLICK_COSTS = [120, 320, 760, 1500]

type SortMode = 'lowest' | 'highest' | 'rarity' | 'recent'
type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

interface RollResult {
  value: number
  isNew: boolean
}

interface GameState {
  coins: number
  crystals: number
  totalRolls: number
  rollCost: number
  ownedNumbers: number[]
  obtainedOrder: Record<string, number>
  orderCounter: number
  coinMultiplierLevel: number
  luckLevel: number
  multiRollLevel: number
  autoClickLevel: number
  lastRollResults: RollResult[]
}

const formatter = new Intl.NumberFormat('en-US')

function formatValue(value: number): string {
  return formatter.format(Math.floor(value))
}

function highestValue(values: number[]): number {
  let max = 1
  for (const value of values) {
    if (value > max) {
      max = value
    }
  }
  return max
}

function calculateRollCost(totalRolls: number): number {
  return Math.floor(25 + totalRolls * 3 + Math.pow(totalRolls, 1.25))
}

function calculateRollBatchCost(totalRolls: number, rollCount: number): number {
  let total = 0
  for (let i = 0; i < rollCount; i += 1) {
    total += calculateRollCost(totalRolls + i)
  }
  return total
}

function rollExponent(luckLevel: number): number {
  return Math.max(1.8, 5.5 - luckLevel * 0.45)
}

function rollWithLuck(luckLevel: number): number {
  const exponent = rollExponent(luckLevel)
  const r = Math.random()
  const value = Math.floor(1 + MAX_NUMBER * Math.pow(r, exponent))
  return Math.max(1, Math.min(MAX_NUMBER, value))
}

function getRarity(value: number): Rarity {
  if (value <= 100) return 'common'
  if (value <= 1_000) return 'uncommon'
  if (value <= 10_000) return 'rare'
  if (value <= 50_000) return 'epic'
  return 'legendary'
}

function rarityLabel(rarity: Rarity): string {
  switch (rarity) {
    case 'common':
      return 'Common'
    case 'uncommon':
      return 'Uncommon'
    case 'rare':
      return 'Rare'
    case 'epic':
      return 'Epic'
    case 'legendary':
      return 'Legendary'
    default:
      return 'Common'
  }
}

function clampLevel(level: number, maxLevel: number): number {
  return Math.max(0, Math.min(level, maxLevel))
}

function initialState(): GameState {
  return {
    coins: 0,
    crystals: 0,
    totalRolls: 0,
    rollCost: calculateRollCost(0),
    ownedNumbers: [1],
    obtainedOrder: { '1': 1 },
    orderCounter: 1,
    coinMultiplierLevel: 0,
    luckLevel: 0,
    multiRollLevel: 0,
    autoClickLevel: 0,
    lastRollResults: [],
  }
}

function loadState(): GameState {
  const fallback = initialState()
  const raw = localStorage.getItem(SAVE_KEY)
  if (!raw) return fallback

  try {
    const parsed = JSON.parse(raw) as Partial<GameState>
    const owned = Array.isArray(parsed.ownedNumbers)
      ? Array.from(
          new Set(
            parsed.ownedNumbers
              .filter((n): n is number => Number.isFinite(n))
              .map((n) => Math.floor(n))
              .filter((n) => n >= 1 && n <= MAX_NUMBER),
          ),
        )
      : [1]

    if (!owned.includes(1)) {
      owned.push(1)
    }

    const obtainedOrder: Record<string, number> = {}
    const parsedOrder = parsed.obtainedOrder ?? {}
    let maxOrder = 0
    for (const number of owned) {
      const rank = Math.floor(
        Number((parsedOrder as Record<string, number>)[String(number)]),
      )
      const safeRank = Number.isFinite(rank) && rank > 0 ? rank : 0
      obtainedOrder[String(number)] = safeRank
      maxOrder = Math.max(maxOrder, safeRank)
    }

    let repairedOrder = maxOrder
    for (const number of owned) {
      const key = String(number)
      if (obtainedOrder[key] === 0) {
        repairedOrder += 1
        obtainedOrder[key] = repairedOrder
      }
    }

    const safeTotalRolls = Math.max(0, Math.floor(Number(parsed.totalRolls) || 0))
    const parsedRollCost = Math.floor(Number(parsed.rollCost))
    const safeRollCost =
      Number.isFinite(parsedRollCost) && parsedRollCost > 0
        ? parsedRollCost
        : calculateRollCost(safeTotalRolls)
    const safeLastRollResults = Array.isArray(parsed.lastRollResults)
      ? parsed.lastRollResults
          .filter(
            (result): result is RollResult =>
              !!result &&
              typeof result === 'object' &&
              Number.isFinite(Number(result.value)) &&
              typeof result.isNew === 'boolean',
          )
          .map((result) => ({
            value: Math.max(1, Math.min(MAX_NUMBER, Math.floor(Number(result.value)))),
            isNew: result.isNew,
          }))
      : []

    return {
      coins: Math.max(0, Math.floor(Number(parsed.coins) || 0)),
      crystals: Math.max(0, Math.floor(Number(parsed.crystals) || 0)),
      totalRolls: safeTotalRolls,
      rollCost: safeRollCost,
      ownedNumbers: owned,
      obtainedOrder,
      orderCounter: Math.max(
        repairedOrder,
        Math.floor(Number(parsed.orderCounter) || repairedOrder),
      ),
      coinMultiplierLevel: clampLevel(
        Math.floor(Number(parsed.coinMultiplierLevel) || 0),
        COIN_MULTIPLIERS.length - 1,
      ),
      luckLevel: clampLevel(
        Math.floor(Number(parsed.luckLevel) || 0),
        LUCK_COSTS.length,
      ),
      multiRollLevel: clampLevel(
        Math.floor(Number(parsed.multiRollLevel) || 0),
        MULTI_ROLL_COUNTS.length - 1,
      ),
      autoClickLevel: clampLevel(
        Math.floor(Number(parsed.autoClickLevel) || 0),
        AUTO_CLICK_COSTS.length,
      ),
      lastRollResults: safeLastRollResults,
    }
  } catch {
    return fallback
  }
}

function App() {
  const [game, setGame] = useState<GameState>(() => loadState())
  const [sortMode, setSortMode] = useState<SortMode>('lowest')
  const [search, setSearch] = useState('')
  const [resetArmed, setResetArmed] = useState(false)

  useEffect(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game))
  }, [game])

  useEffect(() => {
    if (!resetArmed) return
    const timeout = window.setTimeout(() => setResetArmed(false), 5000)
    return () => window.clearTimeout(timeout)
  }, [resetArmed])

  useEffect(() => {
    if (game.autoClickLevel === 0) return

    const interval = window.setInterval(() => {
      setGame((previous) => {
        if (previous.autoClickLevel === 0) return previous
        const highest = highestValue(previous.ownedNumbers)
        const multiplier = COIN_MULTIPLIERS[previous.coinMultiplierLevel] ?? 1
        const gain = highest * previous.autoClickLevel * multiplier
        return { ...previous, coins: previous.coins + gain }
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [game.autoClickLevel])

  const rollCount = MULTI_ROLL_COUNTS[game.multiRollLevel] ?? 1
  const baseRollCostTotal = game.rollCost * rollCount
  const actualRollBatchCost = calculateRollBatchCost(game.totalRolls, rollCount)
  const rollBias = rollExponent(game.luckLevel)
  const coinMultiplier = COIN_MULTIPLIERS[game.coinMultiplierLevel] ?? 1
  const highestOwned = useMemo(
    () => highestValue(game.ownedNumbers),
    [game.ownedNumbers],
  )
  const collectionPercent = (game.ownedNumbers.length / MAX_NUMBER) * 100

  const filteredAndSortedNumbers = useMemo(() => {
    const text = search.trim()
    const filtered = text
      ? game.ownedNumbers.filter((value) => String(value).includes(text))
      : game.ownedNumbers

    const sorted = [...filtered]
    sorted.sort((a, b) => {
      switch (sortMode) {
        case 'highest':
        case 'rarity':
          return b - a
        case 'recent':
          return (game.obtainedOrder[String(b)] ?? 0) - (game.obtainedOrder[String(a)] ?? 0)
        case 'lowest':
        default:
          return a - b
      }
    })
    return sorted
  }, [game.ownedNumbers, game.obtainedOrder, search, sortMode])

  const clickNumber = (value: number) => {
    setGame((previous) => ({
      ...previous,
      coins: previous.coins + value * (COIN_MULTIPLIERS[previous.coinMultiplierLevel] ?? 1),
    }))
  }

  const rollNumbers = () => {
    setGame((previous) => {
      const activeRollCount = MULTI_ROLL_COUNTS[previous.multiRollLevel] ?? 1
      const totalCost = calculateRollBatchCost(previous.totalRolls, activeRollCount)
      if (previous.coins < totalCost) return previous

      const nextCoins = previous.coins - totalCost
      let nextCrystals = previous.crystals
      let nextTotalRolls = previous.totalRolls
      let nextOrderCounter = previous.orderCounter
      const ownedSet = new Set(previous.ownedNumbers)
      const nextOwned = [...previous.ownedNumbers]
      const nextOrder = { ...previous.obtainedOrder }
      const rollResults: RollResult[] = []

      for (let i = 0; i < activeRollCount; i += 1) {
        const rolled = rollWithLuck(previous.luckLevel)
        nextTotalRolls += 1

        if (ownedSet.has(rolled)) {
          nextCrystals += rolled
          rollResults.push({ value: rolled, isNew: false })
        } else {
          ownedSet.add(rolled)
          nextOwned.push(rolled)
          nextOrderCounter += 1
          nextOrder[String(rolled)] = nextOrderCounter
          rollResults.push({ value: rolled, isNew: true })
        }
      }

      return {
        ...previous,
        coins: nextCoins,
        crystals: nextCrystals,
        totalRolls: nextTotalRolls,
        rollCost: calculateRollCost(nextTotalRolls),
        ownedNumbers: nextOwned,
        obtainedOrder: nextOrder,
        orderCounter: nextOrderCounter,
        lastRollResults: rollResults,
      }
    })
  }

  const buyCoinMultiplier = () => {
    setGame((previous) => {
      if (previous.coinMultiplierLevel >= COIN_MULTIPLIER_COSTS.length) return previous
      const price = COIN_MULTIPLIER_COSTS[previous.coinMultiplierLevel]
      if (previous.crystals < price) return previous
      return {
        ...previous,
        crystals: previous.crystals - price,
        coinMultiplierLevel: previous.coinMultiplierLevel + 1,
      }
    })
  }

  const buyLuck = () => {
    setGame((previous) => {
      if (previous.luckLevel >= LUCK_COSTS.length) return previous
      const price = LUCK_COSTS[previous.luckLevel]
      if (previous.crystals < price) return previous
      return {
        ...previous,
        crystals: previous.crystals - price,
        luckLevel: previous.luckLevel + 1,
      }
    })
  }

  const buyMultiRoll = () => {
    setGame((previous) => {
      if (previous.multiRollLevel >= MULTI_ROLL_COSTS.length) return previous
      const price = MULTI_ROLL_COSTS[previous.multiRollLevel]
      if (previous.crystals < price) return previous
      return {
        ...previous,
        crystals: previous.crystals - price,
        multiRollLevel: previous.multiRollLevel + 1,
      }
    })
  }

  const buyAutoClick = () => {
    setGame((previous) => {
      if (previous.autoClickLevel >= AUTO_CLICK_COSTS.length) return previous
      const price = AUTO_CLICK_COSTS[previous.autoClickLevel]
      if (previous.crystals < price) return previous
      return {
        ...previous,
        crystals: previous.crystals - price,
        autoClickLevel: previous.autoClickLevel + 1,
      }
    })
  }

  const resetSave = () => {
    if (!resetArmed) {
      setResetArmed(true)
      return
    }
    const reset = initialState()
    localStorage.setItem(SAVE_KEY, JSON.stringify(reset))
    setGame(reset)
    setResetArmed(false)
  }

  const nextCoinMultiplierCost =
    game.coinMultiplierLevel < COIN_MULTIPLIER_COSTS.length
      ? COIN_MULTIPLIER_COSTS[game.coinMultiplierLevel]
      : null
  const nextLuckCost = game.luckLevel < LUCK_COSTS.length ? LUCK_COSTS[game.luckLevel] : null
  const nextMultiRollCost =
    game.multiRollLevel < MULTI_ROLL_COSTS.length ? MULTI_ROLL_COSTS[game.multiRollLevel] : null
  const nextAutoClickCost =
    game.autoClickLevel < AUTO_CLICK_COSTS.length ? AUTO_CLICK_COSTS[game.autoClickLevel] : null

  return (
    <main className="app">
      <header className="title-block card">
        <h1>Numeric Clicker</h1>
        <p>Collect numbers from 1 to 100,000 and grow your economy.</p>
      </header>

      <section className="stats-grid">
        <article className="card stat">
          <span className="label">Coins</span>
          <strong>{formatValue(game.coins)}</strong>
        </article>
        <article className="card stat">
          <span className="label">Crystals</span>
          <strong>{formatValue(game.crystals)}</strong>
        </article>
        <article className="card stat">
          <span className="label">Total Rolls</span>
          <strong>{formatValue(game.totalRolls)}</strong>
        </article>
        <article className="card stat">
          <span className="label">Highest Number</span>
          <strong>{formatValue(highestOwned)}</strong>
        </article>
        <article className="card stat">
          <span className="label">Collection</span>
          <strong>{collectionPercent.toFixed(2)}%</strong>
        </article>
      </section>

      <section className="card controls">
        <div className="control-copy">
          <h2>Roll Numbers</h2>
          <p>Current roll cost: {formatValue(game.rollCost)} coins.</p>
          <p>
            Base total (current cost × rolls): {formatValue(baseRollCostTotal)} coins for {rollCount}{' '}
            {rollCount === 1 ? 'roll' : 'rolls'}.
          </p>
          {rollCount > 1 && (
            <p className="roll-meta">
              Actual total cost (scales per roll): {formatValue(actualRollBatchCost)} coins.
            </p>
          )}
          <p className="roll-meta">
            Luck Level: {game.luckLevel} · Roll Bias: {rollBias.toFixed(2)}
          </p>
          <p className="roll-meta">
            Higher numbers are rarer. Luck upgrades reduce low-number bias.
          </p>
        </div>
        <div className="control-actions">
          <button
            type="button"
            onClick={rollNumbers}
            disabled={game.coins < actualRollBatchCost}
          >
            Roll
          </button>
          <button type="button" className="danger" onClick={resetSave}>
            {resetArmed ? 'Click Again to Confirm Reset' : 'Reset Save'}
          </button>
        </div>
      </section>

      <section className="card roll-results">
        <h2>Last Roll Results</h2>
        {game.lastRollResults.length === 0 && (
          <p className="empty-state">Roll to see new unlocks and duplicates here.</p>
        )}

        {game.lastRollResults.length === 1 &&
          game.lastRollResults.map((result) => {
            const rarity = getRarity(result.value)
            return (
              <p
                key={`${result.value}-${result.isNew ? 'new' : 'dup'}`}
                className={`roll-result-line rarity-${rarity} ${
                  rarity === 'legendary' ? 'legendary-result' : ''
                }`}
              >
                {result.isNew
                  ? `New #${formatValue(result.value)} unlocked!`
                  : `Duplicate #${formatValue(result.value)} → +${formatValue(result.value)} crystals`}
              </p>
            )
          })}

        {game.lastRollResults.length > 1 && (
          <div className="roll-result-list">
            {game.lastRollResults.map((result, index) => {
              const rarity = getRarity(result.value)
              return (
                <p
                  key={`${index}-${result.value}-${result.isNew ? 'new' : 'dup'}`}
                  className={`roll-result-chip rarity-${rarity} ${
                    rarity === 'legendary' ? 'legendary-result' : ''
                  }`}
                >
                  {result.isNew
                    ? `New #${formatValue(result.value)} unlocked!`
                    : `Duplicate #${formatValue(result.value)} → +${formatValue(result.value)} crystals`}
                </p>
              )
            })}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Crystal Shop</h2>
        <div className="shop-grid">
          <article className="upgrade">
            <h3>Coin Multiplier</h3>
            <p>Current: x{coinMultiplier}</p>
            <button
              type="button"
              onClick={buyCoinMultiplier}
              disabled={nextCoinMultiplierCost === null || game.crystals < nextCoinMultiplierCost}
            >
              {nextCoinMultiplierCost === null
                ? 'Maxed'
                : `Upgrade (${formatValue(nextCoinMultiplierCost)} crystals)`}
            </button>
          </article>
          <article className="upgrade">
            <h3>Luck</h3>
            <p>Current: Lv. {game.luckLevel}</p>
            <button
              type="button"
              onClick={buyLuck}
              disabled={nextLuckCost === null || game.crystals < nextLuckCost}
            >
              {nextLuckCost === null
                ? 'Maxed'
                : `Upgrade (${formatValue(nextLuckCost)} crystals)`}
            </button>
          </article>
          <article className="upgrade">
            <h3>Multi-Roll</h3>
            <p>Current: {rollCount} rolls/use</p>
            <button
              type="button"
              onClick={buyMultiRoll}
              disabled={nextMultiRollCost === null || game.crystals < nextMultiRollCost}
            >
              {nextMultiRollCost === null
                ? 'Maxed'
                : `Upgrade (${formatValue(nextMultiRollCost)} crystals)`}
            </button>
          </article>
          <article className="upgrade">
            <h3>Auto-Click</h3>
            <p>Current: Lv. {game.autoClickLevel}</p>
            <button
              type="button"
              onClick={buyAutoClick}
              disabled={nextAutoClickCost === null || game.crystals < nextAutoClickCost}
            >
              {nextAutoClickCost === null
                ? 'Maxed'
                : `Upgrade (${formatValue(nextAutoClickCost)} crystals)`}
            </button>
          </article>
        </div>
      </section>

      <section className="card inventory-panel">
        <div className="inventory-header">
          <h2>Inventory ({formatValue(game.ownedNumbers.length)} owned)</h2>
          <div className="inventory-controls">
            <label>
              Sort
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
              >
                <option value="lowest">Lowest</option>
                <option value="highest">Highest</option>
                <option value="rarity">Rarity</option>
                <option value="recent">Recently Obtained</option>
              </select>
            </label>
            <label>
              Search
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="e.g. 100"
              />
            </label>
          </div>
        </div>

        <div className="inventory-grid">
          {filteredAndSortedNumbers.map((value) => {
            const rarity = getRarity(value)
            return (
              <button
                key={value}
                type="button"
                className={`number-tile rarity-${rarity}`}
                onClick={() => clickNumber(value)}
              >
                <span>#{formatValue(value)}</span>
                <small className="rarity-label">{rarityLabel(rarity)}</small>
                <small>+{formatValue(value * coinMultiplier)} coins</small>
              </button>
            )
          })}
          {filteredAndSortedNumbers.length === 0 && (
            <p className="empty-state">No owned numbers match this search.</p>
          )}
        </div>
      </section>
    </main>
  )
}

export default App
