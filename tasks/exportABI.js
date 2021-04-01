const fs = require('fs')
const path = require('path')
const glob = require('glob')

const resolved = target => path.resolve(__dirname, target)

task('exportABI', 'Exports all ABI files')
  .setAction((a, hre) => {
    // Get all artifacts excluding mocks and build info
    const artifacts = glob.sync(resolved('../artifacts/contracts/!(interfaces|mocks|lib)/**/!(*.dbg).json'))

    // Saves them at `abi` directory
    artifacts
      .map(artifact => require(artifact))
      .forEach(artifact => {
        const content = JSON.stringify(artifact.abi, null, 2)
        fs.writeFileSync(resolved(`../abi/${artifact.contractName}.json`), content)
      })
  })
