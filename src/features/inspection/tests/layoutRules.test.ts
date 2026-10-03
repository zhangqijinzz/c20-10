import { describe, expect, it } from 'vitest'
import { createPlan, createItem } from '../../../shared/models'
import { analyzeLayout, findFreePosition, getItemBounds, normalizeRotation } from '../../../shared/layoutRules'

describe('workspace rules', () => {
  it('normalizes rotation and calculates rotated bounds around the item center', () => {
    const item = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200, rotation: 90 }
    const bounds = getItemBounds(item)
    expect(normalizeRotation(-15)).toBe(345)
    expect(Math.round(bounds.width)).toBe(200)
    expect(Math.round(bounds.height)).toBe(400)
    expect(Math.round(bounds.left)).toBe(200)
  })

  it('detects overlap and out-of-bounds items', () => {
    const plan = createPlan('test', false)
    const first = { ...createItem('monitor'), x: 100, y: 100, widthMm: 400, heightMm: 200 }
    const second = { ...createItem('keyboard'), x: 300, y: 150, widthMm: 400, heightMm: 200 }
    const outside = { ...createItem('lamp'), x: 1500, y: 700 }
    const analysis = analyzeLayout({ ...plan, items: [first, second, outside] })
    expect(analysis.overlapIds).toEqual(expect.arrayContaining([first.id, second.id]))
    expect(analysis.outOfBoundsIds).toContain(outside.id)
    expect(analysis.status).toBe('attention')
  })

  it('returns a healthy state for separated items', () => {
    const plan = createPlan('test', false)
    const first = { ...createItem('monitor'), x: 100, y: 100 }
    const second = { ...createItem('keyboard'), x: 800, y: 500 }
    const analysis = analyzeLayout({ ...plan, items: [first, second] })
    expect(analysis.status).toBe('clear')
    expect(analysis.coveragePercent).toBeGreaterThan(0)
  })
})

describe('free position search', () => {
  const fits = (position: { x: number, y: number } | null, plan: ReturnType<typeof createPlan>, width: number, height: number) => {
    expect(position).not.toBeNull()
    const probe = { ...createItem('lamp'), x: position!.x, y: position!.y, widthMm: width, heightMm: height, rotation: 0 }
    const analysis = analyzeLayout({ ...plan, items: [...plan.items, probe] })
    expect(analysis.overlapIds).toHaveLength(0)
    expect(analysis.outOfBoundsIds).toHaveLength(0)
  }

  it('starts from the desk corner with a margin on an empty desk', () => {
    const plan = createPlan('test', false)
    const position = findFreePosition(plan.deskWidthMm, plan.deskHeightMm, [], 440, 150)
    expect(position).toEqual({ x: 16, y: 16 })
  })

  it('moves around existing items instead of landing on top of them', () => {
    const plan = createPlan('test', false)
    const blocker = { ...createItem('monitor'), x: 16, y: 16 }
    const position = findFreePosition(plan.deskWidthMm, plan.deskHeightMm, [blocker], 440, 150)
    fits(position, { ...plan, items: [blocker] }, 440, 150)
    expect(position!.x).toBeGreaterThan(16 + 540)
  })

  it('treats rotated items by their actual occupied bounds', () => {
    const plan = createPlan('test', false)
    // 旋转后的显示器实际占地 210 × 540（AABB），左上角取 (16,165) 使其本身在桌面内
    const rotated = { ...createItem('monitor'), x: 16, y: 165, rotation: 90 }
    expect(Math.round(getItemBounds(rotated).width)).toBe(210)
    expect(Math.round(getItemBounds(rotated).height)).toBe(540)
    const position = findFreePosition(plan.deskWidthMm, plan.deskHeightMm, [rotated], 440, 150)
    fits(position, { ...plan, items: [rotated] }, 440, 150)
    // 必须让开旋转后的实际宽度（约 210 + 间距）
    expect(position!.x).toBeGreaterThan(220)
  })

  it('falls back to flush placement when the desk is nearly full', () => {
    const plan = { ...createPlan('test', false), deskWidthMm: 600, deskHeightMm: 600 }
    // 留一条 100 mm 宽的竖向通道（无舒适间距可放 100 mm 的方块，但可以紧贴）
    const strip = { ...createItem('stand'), x: 0, y: 0, widthMm: 500, heightMm: 600, rotation: 0 }
    const position = findFreePosition(plan.deskWidthMm, plan.deskHeightMm, [strip], 100, 100)
    fits(position, plan, 100, 100)
    expect(position!.x).toBe(500)
  })

  it('returns null when the desk is actually full', () => {
    const plan = { ...createPlan('test', false), deskWidthMm: 600, deskHeightMm: 600 }
    const tiles = [
      { ...createItem('lamp'), x: 0, y: 0, widthMm: 300, heightMm: 300 },
      { ...createItem('lamp'), x: 300, y: 0, widthMm: 300, heightMm: 300 },
      { ...createItem('lamp'), x: 0, y: 300, widthMm: 300, heightMm: 300 },
      { ...createItem('lamp'), x: 300, y: 300, widthMm: 300, heightMm: 300 },
    ]
    expect(findFreePosition(plan.deskWidthMm, plan.deskHeightMm, tiles, 40, 40)).toBeNull()
  })

  it('returns null when a single device cannot physically fit a downsized desk', () => {
    // 自定义尺寸设备（检查面板允许 40..2000 mm）超过最小桌面边长
    expect(findFreePosition(600, 600, [], 800, 100)).toBeNull()
    expect(findFreePosition(600, 600, [], 100, 700)).toBeNull()
  })

  it('keeps placing devices conflict-free while the desk has room', () => {
    const plan = { ...createPlan('test', false), deskWidthMm: 1200, deskHeightMm: 600 }
    const items = [createItem('monitor'), createItem('keyboard'), createItem('lamp'), createItem('speaker'), createItem('stand')]
    let current = plan
    for (const template of items) {
      const position = findFreePosition(current.deskWidthMm, current.deskHeightMm, current.items, template.widthMm, template.heightMm)
      expect(position).not.toBeNull()
      current = { ...current, items: [...current.items, { ...template, x: position!.x, y: position!.y }] }
    }
    expect(analyzeLayout(current).status).toBe('clear')
  })
})
