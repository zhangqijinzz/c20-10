import { createId, getDeviceDefinition, type DeskItem, type DeviceType, type WorkspacePlan } from '../../shared/models'
import { findAvailablePosition } from '../../shared/layoutRules'

export interface MaterialDraft {
  item: DeskItem | null
  feedback: string
  canPlace: boolean
}

/**
 * 为待添加设备在当前桌面里找一个放得下的位置：不越界、不与其它设备相交，
 * 已旋转的设备按实际包围盒避让。放不下时不创建设备，由界面明确告知用户。
 */
export function createMaterialDraft(type: DeviceType, plan: WorkspacePlan): MaterialDraft {
  const label = getDeviceDefinition(type).label
  const position = findAvailablePosition(plan, type)
  if (!position) {
    return {
      item: null,
      canPlace: false,
      feedback: `桌面剩余空间放不下${label}，请先调整或移除其它设备`,
    }
  }
  const definition = getDeviceDefinition(type)
  return {
    item: {
      id: createId('item'),
      type,
      widthMm: definition.widthMm,
      heightMm: definition.heightMm,
      x: position.x,
      y: position.y,
      rotation: 0,
    },
    canPlace: true,
    feedback: `${label}已添加`,
  }
}
