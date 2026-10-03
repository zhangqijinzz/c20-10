import type { DeskItem, ItemBounds, LayoutAnalysis, WorkspacePlan } from './models'

export function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

export function getItemBounds(item: DeskItem): ItemBounds {
  const radians = (normalizeRotation(item.rotation) * Math.PI) / 180
  const width = Math.abs(item.widthMm * Math.cos(radians)) + Math.abs(item.heightMm * Math.sin(radians))
  const height = Math.abs(item.widthMm * Math.sin(radians)) + Math.abs(item.heightMm * Math.cos(radians))
  const centerX = item.x + item.widthMm / 2
  const centerY = item.y + item.heightMm / 2
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
    width,
    height,
  }
}

export function rectanglesOverlap(first: ItemBounds, second: ItemBounds): boolean {
  const horizontal = Math.min(first.right, second.right) - Math.max(first.left, second.left)
  const vertical = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)
  return horizontal > 1 && vertical > 1
}

/** 新增设备时与其他设备、桌面边缘保留的舒适间距（mm）；紧凑回退搜索时间距为 0 */
export const PLACEMENT_GAP_MM = 16

const POSITION_EPSILON = 1e-6

export interface FreePosition {
  x: number
  y: number
}

function collectEdgeCandidates(edges: number[], margin: number, max: number): number[] {
  const candidates = new Set<number>([margin, max])
  edges.forEach((edge) => {
    if (edge >= margin - POSITION_EPSILON && edge <= max + POSITION_EPSILON) {
      candidates.add(Math.min(max, Math.max(margin, edge)))
    }
  })
  return [...candidates].filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
}

/**
 * 在桌面内寻找一个放得下指定尺寸设备的位置：不越界、不与任何已有设备相交。
 * 已有设备按其旋转后的实际包围盒（AABB）参与计算。
 * 先按 PLACEMENT_GAP_MM 的舒适间距搜索，找不到再允许紧贴摆放；
 * 只有桌面真的没有任何可容纳空间时才返回 null。
 */
export function findFreePosition(
  deskWidthMm: number,
  deskHeightMm: number,
  items: DeskItem[],
  widthMm: number,
  heightMm: number,
): FreePosition | null {
  if (![deskWidthMm, deskHeightMm, widthMm, heightMm].every(Number.isFinite)) return null
  if (widthMm <= 0 || heightMm <= 0) return null
  // 设备本身就比桌面大（例如桌面被改小），任何位置都放不下
  if (widthMm > deskWidthMm + POSITION_EPSILON || heightMm > deskHeightMm + POSITION_EPSILON) return null

  const occupied = items.map((item) => getItemBounds(item))

  const search = (gap: number): FreePosition | null => {
    const margin = gap
    const maxX = deskWidthMm - widthMm - margin
    const maxY = deskHeightMm - heightMm - margin
    if (maxX < -POSITION_EPSILON || maxY < -POSITION_EPSILON) return null

    const blocked: ItemBounds[] = occupied.map((bounds) => ({
      left: bounds.left - gap,
      top: bounds.top - gap,
      right: bounds.right + gap,
      bottom: bounds.bottom + gap,
      width: bounds.width + gap * 2,
      height: bounds.height + gap * 2,
    }))
    const xCandidates = collectEdgeCandidates(occupied.map((bounds) => bounds.right + gap), margin, maxX)
    const yCandidates = collectEdgeCandidates(occupied.map((bounds) => bounds.bottom + gap), margin, maxY)

    for (const y of yCandidates) {
      for (const x of xCandidates) {
        const candidate: ItemBounds = {
          left: x,
          top: y,
          right: x + widthMm,
          bottom: y + heightMm,
          width: widthMm,
          height: heightMm,
        }
        const withinDesk = candidate.left >= margin - POSITION_EPSILON
          && candidate.top >= margin - POSITION_EPSILON
          && candidate.right <= deskWidthMm - margin + POSITION_EPSILON
          && candidate.bottom <= deskHeightMm - margin + POSITION_EPSILON
        if (!withinDesk) continue
        if (!blocked.some((bounds) => rectanglesOverlap(candidate, bounds))) {
          return { x, y }
        }
      }
    }
    return null
  }

  const position = search(PLACEMENT_GAP_MM) ?? search(0)
  if (!position) return null

  // 坐标取整后再按真实规则复核一次，避免四舍五入引入越界或相交
  const rounded = { x: Math.round(position.x), y: Math.round(position.y) }
  const roundedBounds: ItemBounds = {
    left: rounded.x,
    top: rounded.y,
    right: rounded.x + widthMm,
    bottom: rounded.y + heightMm,
    width: widthMm,
    height: heightMm,
  }
  const stillValid = roundedBounds.left >= -POSITION_EPSILON
    && roundedBounds.top >= -POSITION_EPSILON
    && roundedBounds.right <= deskWidthMm + POSITION_EPSILON
    && roundedBounds.bottom <= deskHeightMm + POSITION_EPSILON
    && !occupied.some((bounds) => rectanglesOverlap(roundedBounds, bounds))
  return stillValid ? rounded : position
}

export function analyzeLayout(plan: WorkspacePlan): LayoutAnalysis {
  const overlapIds = new Set<string>()
  const outOfBoundsIds = new Set<string>()
  const bounds = new Map(plan.items.map((item) => [item.id, getItemBounds(item)]))

  plan.items.forEach((item) => {
    const itemBounds = bounds.get(item.id)
    if (!itemBounds) return
    if (itemBounds.left < 0 || itemBounds.top < 0 || itemBounds.right > plan.deskWidthMm || itemBounds.bottom > plan.deskHeightMm) {
      outOfBoundsIds.add(item.id)
    }
  })

  for (let index = 0; index < plan.items.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < plan.items.length; nextIndex += 1) {
      const first = plan.items[index]
      const second = plan.items[nextIndex]
      const firstBounds = bounds.get(first.id)
      const secondBounds = bounds.get(second.id)
      if (firstBounds && secondBounds && rectanglesOverlap(firstBounds, secondBounds)) {
        overlapIds.add(first.id)
        overlapIds.add(second.id)
      }
    }
  }

  const occupiedArea = plan.items.reduce((total, item) => total + item.widthMm * item.heightMm, 0)
  const deskArea = plan.deskWidthMm * plan.deskHeightMm
  const coveragePercent = Math.min(100, Math.round((occupiedArea / deskArea) * 100))
  const hasIssue = overlapIds.size > 0 || outOfBoundsIds.size > 0
  return {
    overlapIds: [...overlapIds],
    outOfBoundsIds: [...outOfBoundsIds],
    coveragePercent,
    status: hasIssue ? 'attention' : 'clear',
  }
}

export function clampDeskSize(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(4000, Math.max(600, Math.round(value)))
}

export function clampItemDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(2000, Math.max(40, Math.round(value)))
}
