const fs = require('fs')
const path = require('path')
const util = require('util')

const writeFile = util.promisify(fs.writeFile)
const readFile = util.promisify(fs.readFile)

module.exports = async function saveJSON (filePath, values) {
  try {
    const _filePath = path.resolve(filePath)
    const content = await readFile(_filePath)
    const current = JSON.parse(content)
    const updated = Object.assign(current, values)

    await writeFile(_filePath, JSON.stringify(updated, null, 2))
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
