const fs = require('fs')
const path = require('path')
const fsPromises = fs.promises

module.exports = async function saveJSON (filePath, values, erase = false) {
  try {
    const _filePath = path.join(__dirname, filePath)
    const content = await fsPromises.readFile(_filePath)
    const current = JSON.parse(content)
    const updated = erase ? {} : Object.assign(current, values)

    await fsPromises.writeFile(_filePath, JSON.stringify(updated, null, 2))
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}
