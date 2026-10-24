export type GardenCornerEffects = {
  lanternGlow: boolean
  gardenFireflies: boolean
  gardenGrowth: boolean
}

export function deriveGardenCornerEffects(
  lantern: { postLanternLit: boolean; workshopLanternLit: boolean },
  greenhouse: { plotOneWatered: boolean; plotTwoWatered: boolean },
): GardenCornerEffects {
  return {
    lanternGlow: lantern.postLanternLit || lantern.workshopLanternLit,
    gardenFireflies: greenhouse.plotOneWatered || greenhouse.plotTwoWatered,
    gardenGrowth: greenhouse.plotOneWatered || greenhouse.plotTwoWatered,
  }
}
