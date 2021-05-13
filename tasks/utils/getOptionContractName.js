
module.exports = function getOptionType (network, underlyingAsset, type) {
  if (network === 'mumbai' || network === 'matic') {
    if (type === 'PUT') {
      if (underlyingAsset === 'WMATIC') {
        return 'WPodPut'
      } else return 'PodPut'
    } else if (type === 'CALL') {
      if (underlyingAsset === 'WMATIC') {
        return 'WPodCall'
      } else return 'PodCall'
    }
  } else {
    if (type === 'PUT') {
      if (underlyingAsset === 'WETH') {
        return 'WPodPut'
      } else return 'PodPut'
    } else if (type === 'CALL') {
      if (underlyingAsset === 'WETH') {
        return 'WPodCall'
      } else return 'PodCall'
    }
  }
}
