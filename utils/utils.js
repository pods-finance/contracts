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

module.exports = getMonthLetter
