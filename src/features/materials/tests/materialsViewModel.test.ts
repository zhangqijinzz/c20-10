import { describe, expect, it } from 'vitest'
import { createMaterialDraft, getMaterialRejectFeedback } from '../materialsViewModel'
import { analyzeLayout } from '../../../shared/layoutRules'
import { createItem, createPlan, DEVICE_DEFINITIONS, type DeviceType } from '../../../shared/models'

describe('materials module', () => {
  it('creates a device draft with catalog dimensions and feedback', () => {
    const plan = createPlan('test', false)
    const draft = createMaterialDraft('lamp', plan)
    expect(draft).not.toBeNull()
    expect(draft?.item.type).toBe('lamp')
    expect(draft?.item.widthMm).toBe(180)
    expect(draft?.feedback).toBe('桌面灯已添加')
  })

  it('places a newly added device inside the desk without overlapping existing items', () => {
    const plan = createPlan('test', false)
    const existing = { ...createItem('monitor'), x: 80, y: 90 }
    const draft = createMaterialDraft('lamp', { ...plan, items: [existing] })
    expect(draft).not.toBeNull()
    const analysis = analyzeLayout({ ...plan, items: [existing, draft!.item] })
    expect(analysis.status).toBe('clear')
    expect(analysis.overlapIds).toHaveLength(0)
    expect(analysis.outOfBoundsIds).toHaveLength(0)
  })

  it('does not reuse the index-based slot of a previously removed item', () => {
    const plan = createPlan('test', false)
    // 旧逻辑会把 index=0 的新设备放到 (80, 90)，这里让一件设备正好占住该位置
    const blocker = { ...createItem('lamp'), x: 80, y: 90, widthMm: 200, heightMm: 200 }
    const draft = createMaterialDraft('monitor', { ...plan, items: [blocker] })
    expect(draft).not.toBeNull()
    expect({ x: draft!.item.x, y: draft!.item.y }).not.toEqual({ x: 80, y: 90 })
    const analysis = analyzeLayout({ ...plan, items: [blocker, draft!.item] })
    expect(analysis.status).toBe('clear')
  })

  it('rejects a device when a downsized desk has no room and explains why', () => {
    const tinyPlan = { ...createPlan('test', false), deskWidthMm: 600, deskHeightMm: 600 }
    // 大件占掉上部 450 mm，剩余 150 mm 深的条带放不下 210 mm 深的显示器
    const blocker = { ...createItem('stand'), x: 0, y: 0, widthMm: 600, heightMm: 450 }
    expect(createMaterialDraft('monitor', { ...tinyPlan, items: [blocker] })).toBeNull()
    expect(getMaterialRejectFeedback('monitor')).toContain('显示器')
    expect(getMaterialRejectFeedback('monitor')).toContain('放不下')
  })

  it.each([...DEVICE_DEFINITIONS.map((device) => device.type)] as DeviceType[])(
    'always finds a conflict-free spot for %s on an empty default desk',
    (type) => {
      const plan = createPlan('test', false)
      const draft = createMaterialDraft(type, plan)
      expect(draft).not.toBeNull()
      const analysis = analyzeLayout({ ...plan, items: [draft!.item] })
      expect(analysis.status).toBe('clear')
    },
  )
})
