import { getDeviceDefinition, type DeskItem, type DeviceType, type ItemBounds, type LayoutAnalysis, type WorkspacePlan } from './models'

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

/** 新设备与桌面边缘 / 其它设备之间默认预留的空隙（mm） */
export const DEFAULT_PLACEMENT_GAP_MM = 20
const PLACEMENT_STEP_MM = 20
const TIGHT_PLACEMENT_STEP_MM = 10

export interface PlacementPoint {
  x: number
  y: number
}

/**
 * 在桌面内为一个新设备寻找放得下的位置：完全在桌面边界内，
 * 且不与任何已有设备（按旋转后的实际包围盒）相交。
 * 优先保留安全间距，实在放不下时退回到贴边扫描；物理上都放不下时返回 null。
 */
export function findAvailablePosition(
  plan: WorkspacePlan,
  type: DeviceType,
  gap: number = DEFAULT_PLACEMENT_GAP_MM,
): PlacementPoint | null {
  const definition = getDeviceDefinition(type)
  const width = definition.widthMm
  const height = definition.heightMm

  // 设备本身就比桌面大，任何位置都放不下。
  if (width > plan.deskWidthMm || height > plan.deskHeightMm) return null

  const existingBounds = plan.items.map((item) => getItemBounds(item))

  const fitsAt = (x: number, y: number, requiredGap: number): boolean => {
    const candidate = { left: x, top: y, right: x + width, bottom: y + height }
    if (candidate.left < requiredGap || candidate.top < requiredGap) return false
    if (candidate.right > plan.deskWidthMm - requiredGap || candidate.bottom > plan.deskHeightMm - requiredGap) return false
    // 0.5mm 容差抵消拖拽 / 三角函数带来的浮点误差，且小于冲突判定 1mm 的阈值。
    return existingBounds.every((other) => {
      const horizontal = Math.min(candidate.right, other.right) - Math.max(candidate.left, other.left)
      const vertical = Math.min(candidate.bottom, other.bottom) - Math.max(candidate.top, other.top)
      return horizontal < -requiredGap + 0.5 || vertical < -requiredGap + 0.5
    })
  }

  // 第一轮保留安全间距；找不到再贴边细扫，保证“物理上放得下”时总能落位。
  const passes = [
    { requiredGap: gap, step: PLACEMENT_STEP_MM },
    { requiredGap: 0, step: TIGHT_PLACEMENT_STEP_MM },
  ]
  for (const pass of passes) {
    for (let y = pass.requiredGap; y + height <= plan.deskHeightMm - pass.requiredGap; y += pass.step) {
      for (let x = pass.requiredGap; x + width <= plan.deskWidthMm - pass.requiredGap; x += pass.step) {
        if (fitsAt(x, y, pass.requiredGap)) return { x, y }
      }
    }
  }
  return null
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
