import fs from 'fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { parse } from 'csv-parse'

// Parsing functions
const parseTradeQuantity = (row) => parseInt(row['Trade Quantity'], 10)
const parseEntryPrice = (row) => parseFloat(row['Entry Price'])
const parseExitPrice = (row) => parseFloat(row['Exit Price'])
const parseMaxOpenQuantity = (row) => parseInt(row['Max Open Quantity'], 10)
const pnl = (row) => parseFloat(row['Profit/Loss (P)'])
const parseTime = (dateTime) => new Date(dateTime.replace('  ', 'T').replace(/ EP|BP/, '').trim())

// returns time difference in seconds
const parseDuration = (row) => {
  const entryDateTime = parseTime(row['Entry DateTime'])
  const exitDateTime = parseTime(row['Exit DateTime'])

  return (exitDateTime.getTime() - entryDateTime.getTime()) / 1000
}

// Trade functions
const createTrade = (row) => ({
  tradeId: randomUUID(),
  symbol: row.Symbol,
  tradeType: row['Trade Type'],
  entryDateTime: parseTime(row['Entry DateTime']),
  entryPrice: parseEntryPrice(row),
  tradeQuantity: parseTradeQuantity(row),
  pnl: pnl(row),
  status: pnl(row) > 0 ? 'Win' : 'Lose',
  exitDateTime: null,
  exitPrice: null,
  maxOpenQuantity: parseMaxOpenQuantity(row),
  steps: [] // To store the additions or partial exits
})

const updateTrade = (trade, row) => {
  const newMaxOpenQuantity = parseMaxOpenQuantity(row)
  const action = newMaxOpenQuantity > trade.maxOpenQuantity ? 'Added to Trade' : 'Took Profits'

  trade.tradeQuantity += parseTradeQuantity(row)
  trade.maxOpenQuantity = newMaxOpenQuantity
  trade.steps.push({
    dateTime: parseTime(row['Exit DateTime']),
    price: parseExitPrice(row),
    quantity: parseTradeQuantity(row),
    action
  })

  return trade
}

const closeTrade = (trade, row) => {
  trade.exitDateTime = parseTime(row['Exit DateTime'])
  trade.exitPrice = parseExitPrice(row)
  trade.tradeQuantity += parseTradeQuantity(row)
  trade.duration = parseDuration(row)
  trade.steps.push({
    dateTime: parseTime(row['Exit DateTime']),
    price: parseExitPrice(row),
    quantity: parseTradeQuantity(row),
    action: 'Took Profits'
  })

  return trade
}

// Consolidation function
const consolidateTrades = (records) => {
  let currentTrade = null
  const consolidatedTrades = []

  for (const row of records) {
    if (row['Entry DateTime'].includes('BP')) {
      if (currentTrade) {
        consolidatedTrades.push(currentTrade)
      }
      currentTrade = createTrade(row)
    } else if (row['Exit DateTime'].includes('EP')) {
      currentTrade = closeTrade(currentTrade, row)
      consolidatedTrades.push(currentTrade)
      currentTrade = null
    } else if (currentTrade) {
      currentTrade = updateTrade(currentTrade, row)
    }
  }

  if (currentTrade) {
    consolidatedTrades.push(currentTrade)
  }

  return consolidatedTrades
}

// Main function
export const processTrades = async (filePath) => {
  const parser = fs.createReadStream(filePath).pipe(parse({
    columns: true,
    delimiter: '\t',
    relax_column_count: true
  }))

  const records = []
  for await (const record of parser) {
    records.push(record)
  }

  return consolidateTrades(records)
}

// Usage
const filePath = new URL('../data/demo.tsv', import.meta.url)
const absolutePath = fileURLToPath(filePath)

async function main () {
  try {
    const consolidatedTrades = await processTrades(absolutePath)
    console.log(JSON.stringify(consolidatedTrades, null, 2))
  } catch (error) {
    console.error(error)
  }
}

main()
