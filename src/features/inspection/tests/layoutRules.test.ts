import { describe, expect, it } from 'vitest'
import { createPlan, createItem, DEVICE_DEFINITIONS } from '../../../shared/models'
import { analyzeLayout, findAvailablePosition, getItemBounds, normalizeRotation, rectanglesOverlap } from '../../../shared/layoutRules'

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

  describe('findAvailablePosition', () => {
    it('places the first device at the top-left of an empty desk', () => {
      const plan = createPlan('test', false)
      expect(findAvailablePosition(plan, 'lamp')).toEqual({ x: 20, y: 20 })
    })

    it('avoids the rotated footprint of existing items', () => {
      const plan = createPlan('test', false)
      const rotated = { ...createItem('stand'), x: 560, y: 230, rotation: 45 }
      const occupied = getItemBounds(rotated)
      expect(occupied.left).toBeGreaterThan(0)
      expect(occupied.top).toBeGreaterThan(0)
      const position = findAvailablePosition({ ...plan, items: [rotated] }, 'speaker')
      expect(position).not.toBeNull()
      const candidate = {
        left: position!.x,
        top: position!.y,
        right: position!.x + 150,
        bottom: position!.y + 150,
        width: 150,
        height: 150,
      }
      expect(rectanglesOverlap(candidate, occupied)).toBe(false)
      expect(candidate.left).toBeGreaterThanOrEqual(20)
      expect(candidate.top).toBeGreaterThanOrEqual(20)
      expect(candidate.right).toBeLessThanOrEqual(plan.deskWidthMm - 20)
      expect(candidate.bottom).toBeLessThanOrEqual(plan.deskHeightMm - 20)
    })

    it('falls back to an edge-touching slot when no spaced slot exists', () => {
      // 540×210 的显示器放得进 560×250 的桌面，但四周不可能再留出 20mm 间距。
      const plan = { ...createPlan('test', false), deskWidthMm: 560, deskHeightMm: 250 }
      const position = findAvailablePosition(plan, 'monitor')
      expect(position).not.toBeNull()
      expect(position!.x).toBeGreaterThanOrEqual(0)
      expect(position!.y).toBeGreaterThanOrEqual(0)
      expect(position!.x + 540).toBeLessThanOrEqual(560 + 0.5)
      expect(position!.y + 210).toBeLessThanOrEqual(250 + 0.5)
    })

    it('returns null when the device is larger than the (shrunk) desk', () => {
      const plan = { ...createPlan('test', false), deskWidthMm: 200, deskHeightMm: 200 }
      expect(findAvailablePosition(plan, 'monitor')).toBeNull()
    })

    it('eventually reports no space when the desk is full, without producing overlaps', () => {
      let plan = { ...createPlan('test', false), deskWidthMm: 600, deskHeightMm: 600 }
      let added = 0
      while (added < 100) {
        const position = findAvailablePosition(plan, 'monitor')
        if (!position) break
        plan = { ...plan, items: [...plan.items, { ...createItem('monitor'), x: position.x, y: position.y }] }
        added += 1
      }
      expect(added).toBeGreaterThan(0)
      expect(analyzeLayout(plan).overlapIds).toHaveLength(0)
      const maxByArea = Math.floor((600 * 600) / (540 * 210))
      expect(added).toBeLessThanOrEqual(maxByArea)
      expect(findAvailablePosition(plan, 'monitor')).toBeNull()
    })

    it('can always place every catalog device somewhere on a fresh default desk', () => {
      const plan = createPlan('test', false)
      for (const device of DEVICE_DEFINITIONS) {
        expect(findAvailablePosition(plan, device.type)).not.toBeNull()
      }
    })
  })
})
