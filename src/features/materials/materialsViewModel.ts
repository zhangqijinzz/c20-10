import { findFreePosition } from '../../shared/layoutRules'
import { createItem, getDeviceDefinition, type DeskItem, type DeviceType, type WorkspacePlan } from '../../shared/models'

export interface MaterialDraft {
  item: DeskItem
  feedback: string
}

/**
 * 基于当前桌面真实布局创建设备草稿：
 * 新设备会被放到桌内一个不越界、不与其他设备（含旋转后的实际占地）相交的位置；
 * 桌面确实放不下时不构建设备，由调用方向用户明确说明。
 */
export function createMaterialDraft(type: DeviceType, plan: WorkspacePlan): MaterialDraft | null {
  const definition = getDeviceDefinition(type)
  const position = findFreePosition(
    plan.deskWidthMm,
    plan.deskHeightMm,
    plan.items,
    definition.widthMm,
    definition.heightMm,
  )
  if (!position) return null
  const item: DeskItem = {
    ...createItem(type),
    x: position.x,
    y: position.y,
  }
  return {
    item,
    feedback: `${definition.label}已添加`,
  }
}

export function getMaterialRejectFeedback(type: DeviceType): string {
  const definition = getDeviceDefinition(type)
  return `桌面已经放不下${definition.label}（${definition.widthMm} × ${definition.heightMm} mm），请先移开或移除其他设备，或调大桌面`
}
