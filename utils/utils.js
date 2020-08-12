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

module.exports = {
  getMonthLetter,
  getBlockDate,
  getFutureBlockNumber
}
