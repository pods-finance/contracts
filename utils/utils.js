function getMonthLetter (month) {
  switch (month) {
    case 'Jan': return 'A'
    case 'Feb': return 'B'
    case 'Mar': return 'C'
    case 'Apr': return 'D'
    case 'May': return 'E'
    case 'Jun': return 'F'
    case 'Jul': return 'G'
    case 'Aug': return 'H'
    case 'Sep': return 'I'
    case 'Oct': return 'J'
    case 'Nov': return 'K'
    case 'Dez': return 'L'
    default: return 'A'
  }
}

const avgBlocktime = {
  1: 15,
  42: 4
}

/**
 * Returns the date of block in the Ethereum network
 * @param {number} currentBlockNumber
 * @param {number} targetBlockNumber
 * @returns {Date}
 */
function getBlockDate (currentBlockNumber, targetBlockNumber, networkVersion) {
  const diffBetweenBlocksInMilliseconds = (targetBlockNumber - currentBlockNumber) * avgBlocktime[networkVersion] * 1000
  const now = new Date().valueOf()
  const targetDate = new Date(now + diffBetweenBlocksInMilliseconds)

  return targetDate
}

/**
 * Returns the future block number given a date
 * @param {number} currentBlockNumber
 * @param {Date} targetDate in utc (milliseconds)
 * @returns {number} futureBlockNumber
 */
function getFutureBlockNumber (currentBlockNumber, targetDate, networkVersion) {
  const now = new Date().valueOf()
  const diffBetweenDatesInMilliseconds = targetDate - now
  const blocksPassed = diffBetweenDatesInMilliseconds / (avgBlocktime[networkVersion] * 1000)

  const futureBlockNumber = currentBlockNumber + blocksPassed

  return futureBlockNumber
}

/**
 * Returns a bool if matche the condition of the value been in a acceptable range
 * @param {BigNumber} expected
 * @param {BigNumber} value
 * @param {Number} range
 * @returns {Bool} is close enought to the range
 */
function approximately (expected, value, range = 10) {
  const lowerBound = expected.sub(expected.div(Math.floor(100 / range)))
  const higherBound = expected.add(expected.div(Math.floor(100 / range)))

  return value.gte(lowerBound) && value.lte(higherBound)
}
/**
 * Returns an ethers BigNumber
 * @param {number} number
 * @returns {BigNumber} futureBlockNumber
 */
function toBigNumber (value) {
  return ethers.BigNumber.from(value.toLocaleString('fullwide', { useGrouping: false }))
}

module.exports = {
  getMonthLetter,
  getBlockDate,
  getFutureBlockNumber,
  toBigNumber,
  approximately
}
