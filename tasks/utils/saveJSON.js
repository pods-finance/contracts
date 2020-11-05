const fs = require('fs')
const path = require('path')
const util = require('util')

const writeFile = util.promisify(fs.writeFile)
const readFile = util.promisify(fs.readFile)

module.exports = async function saveJSON (filePath, key, value) {
  try {
    const _filePath = path.resolve(filePath)
    const content = await readFile(_filePath)
    const json = JSON.parse(content)

    json[key] = value

    await writeFile(_filePath, JSON.stringify(json, null, 2))
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
