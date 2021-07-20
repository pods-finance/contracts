module.exports = function getOptionType (network, underlyingAsset, type, rewards = false) {
  if (network === 'mumbai' || network === 'matic') {
    if (type === 'PUT') {
      if (underlyingAsset === 'WMATIC') {
        return 'WPodPut'
      } else if (rewards) {
        return 'AavePodPut'
      } else {
        return 'PodPut'
      }
    } else if (type === 'CALL') {
      if (underlyingAsset === 'WMATIC') {
        return 'WPodCall'
      } else if (rewards) {
        return 'AavePodCall'
      } else {
        return 'PodCall'
      }
    }
  } else {
    if (type === 'PUT') {
      if (underlyingAsset === 'WETH') {
        return 'WPodPut'
      } else {
        return 'PodPut'
      }
    } else if (type === 'CALL') {
      if (underlyingAsset === 'WETH') {
        return 'WPodCall'
      } else {
        return 'PodCall'
      }
    }
  }
}
