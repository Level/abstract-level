export interface RangeOptions<K> {
  gt?: K
  gte?: K
  lt?: K
  lte?: K
  reverse?: boolean | undefined
  limit?: number | undefined
}
