export const oneTimeProducts = [] as const

export type ProductId = (typeof oneTimeProducts)[number] extends never
  ? string
  : (typeof oneTimeProducts)[number]['productId']
